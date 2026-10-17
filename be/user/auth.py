"""Authentication and the four audience gates.

`Authorization: Token <key>` → a `User` plus the `AuthToken` that proved it.
Same shape as allcoaching, with one addition that the two-sided model forces:
**the token carries the audience it was issued for**, and the permission class
checks it.

Why that matters. A person can legitimately be both a teacher and a school's
contact. If permission were decided only by "do they have a teacher profile",
then a token minted at the school sign-in would also open the teacher API, and a
staff token would open all three. The audience is chosen once, at sign-in, by
the switch the proposal describes — and re-checked here on every request.

THE CONTRACT: behind `IsTeacher`, `request.teacher` is set and is never None.
Behind `IsSchool`, `request.school` is. The permission class refuses the request
when it would be, so no view body has to check. This is allcoaching's `_stash`
pattern: the permission class is the one thing already on every view and it has
already had to load the profile to make its decision — publishing the answer
costs nothing and removes a second query from every view that needed it.
"""

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import HTTP_HEADER_ENCODING, exceptions
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission

from user.models import AuthToken


def get_authorization_header(request) -> bytes:
    auth = request.META.get("HTTP_AUTHORIZATION", b"")
    if isinstance(auth, str):
        auth = auth.encode(HTTP_HEADER_ENCODING)
    return auth


class CustomAuthentication(BaseAuthentication):
    """Token auth against `AuthToken`, which stores only a SHA256 digest."""

    keyword = "Token"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None
        if len(auth) == 1:
            raise exceptions.AuthenticationFailed(_("Invalid token header. No credentials provided."))
        if len(auth) > 2:
            raise exceptions.AuthenticationFailed(
                _("Invalid token header. Token string should not contain spaces.")
            )
        try:
            key = auth[1].decode()
        except UnicodeError:
            raise exceptions.AuthenticationFailed(
                _("Invalid token header. Token string should not contain invalid characters.")
            )
        return self.authenticate_credentials(key)

    def authenticate_credentials(self, key: str):
        token = AuthToken.lookup(key)
        if token is None:
            raise exceptions.AuthenticationFailed(_("Invalid token."))
        if not token.user.is_active:
            raise exceptions.AuthenticationFailed(_("This account has been deactivated."))
        # Cheap enough to be worth it: it is what makes "signed in on 2 devices"
        # in the teacher's own settings mean anything. Written with update_fields
        # so it never races another column.
        AuthToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return token.user, token

    def authenticate_header(self, request) -> str:
        return self.keyword


def _stash(request, **values) -> None:
    for key, value in values.items():
        setattr(request, key, value)
        underlying = getattr(request, "_request", None)
        if underlying is not None:
            setattr(underlying, key, value)


def _audience(request) -> str:
    token = getattr(request, "auth", None)
    return getattr(token, "role", "") or ""


class IsSignedIn(BasePermission):
    """Any audience. For the handful of endpoints that serve all three —
    changing your own password, registering a device for push."""

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(user and getattr(user, "is_authenticated", False))


class IsTeacherAudience(BasePermission):
    """A teacher token, with or without a profile yet.

    Exists for exactly one endpoint: creating the teacher profile. `IsTeacher`
    cannot guard it, because it requires the profile that this call is about to
    make — a signup wizard behind it would 403 every new teacher on the one
    request that matters.

    Everything else uses `IsTeacher`.
    """

    message = "Sign in as a teacher to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        return _audience(request) == "teacher"


class IsSchoolAudience(BasePermission):
    """A school token, with or without a profile yet. The school signup form,
    for the same reason as IsTeacherAudience."""

    message = "Sign in as an institution to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        return _audience(request) == "school"


class IsTeacher(BasePermission):
    """A teacher, on a teacher token. Sets `request.teacher`."""

    message = "This is the teacher area — sign in as a teacher to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        if _audience(request) != "teacher":
            return False
        profile = getattr(user, "teacher_profile", None)
        if profile is None:
            return False
        _stash(request, teacher=profile)
        return True


class IsSchool(BasePermission):
    """An institution, on a school token. Sets `request.school`.

    **Verification is NOT checked here.** It used to be — unverified schools were
    refused every write — and that made the verification queue a dead end: the
    school could not save a draft vacancy, could not fill in its own profile, and
    could not upload the very affiliation certificate it was being asked for. The
    product says the opposite: "A school registers, posts immediately, and its
    first vacancy waits in the panel until staff have seen the certificate."

    What verification actually gates is **publication**, and that check lives in
    `Vacancy.can_publish()` — one rule, on the model, which both the school's own
    publish button and the office's go through. Duplicating it in the permission
    class put it at the wrong level and at a different level from the thing it
    was protecting.

    Nothing else needs it. An unverified school can only ever reach its own rows,
    and since it has no live vacancies it has no applicants to act on.
    """

    message = "This is the institution area — sign in as an institution to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        if _audience(request) != "school":
            return False
        profile = getattr(user, "school_profile", None)
        if profile is None:
            return False
        _stash(request, school=profile)
        return True


class IsStaff(BasePermission):
    """The firm's office. The admin panel, and nothing else, runs behind this.

    `is_staff_member` is set from the Django admin or a management command and
    never from an API payload — an endpoint that can grant it is an endpoint that
    can hand over the panel.
    """

    message = "Staff only."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        if _audience(request) != "staff":
            return False
        return bool(user.is_staff_member)


class IsStudent(BasePermission):
    """A student or parent, on a student token. Sets `request.student`.

    Same shape as `IsTeacher` and `IsSchool`, and the same contract: behind
    this, `request.student` is set and is never None.

    Consent is deliberately **not** checked here. A minor whose guardian has
    not yet consented must be able to sign in, fill in their profile and ask
    their guardian to agree — refusing them the API is how the consent screen
    becomes unreachable. What consent gates is being *seen and contacted*, and
    that lives in `StudentProfile.contactable()` and `Interest.may_open()`,
    next to the data it protects. (Same reasoning as `IsSchool` and
    verification.)
    """

    message = "This is the student area — sign in as a student or parent to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        if _audience(request) != "student":
            return False
        profile = getattr(user, "student_profile", None)
        if profile is None:
            return False
        _stash(request, student=profile)
        return True


class IsStudentAudience(BasePermission):
    """A student token, profile or no profile.

    Exists for exactly one endpoint — creating the profile that `IsStudent`
    would otherwise require — mirroring `IsTeacherAudience`.
    """

    message = "Sign in as a student or parent to continue."

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not (user and getattr(user, "is_authenticated", False)):
            return False
        return _audience(request) == "student"

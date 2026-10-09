"""Django's own auth admin, restyled.

`django.contrib.auth` registers Group and User against the stock
`admin.ModelAdmin`, so without this they are the two screens in the whole admin
that render unstyled — which reads as a half-finished install rather than as a
deliberate exception.

They are re-registered rather than restyled in place because unregistering and
registering again is the only hook Django gives for an admin class another app
already claimed. `UserAdmin`/`GroupAdmin` are subclassed rather than replaced so
the password-change form, the permission widgets and the add-user two-step all
keep working.
"""

from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from unfold.admin import ModelAdmin
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

admin.site.unregister(User)
admin.site.unregister(Group)


@admin.register(User)
class AuthUserAdmin(UserAdmin, ModelAdmin):
    # Unfold ships its own versions of these three so the password widgets are
    # styled; the stock ones render as bare inputs inside a styled page.
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm


@admin.register(Group)
class AuthGroupAdmin(GroupAdmin, ModelAdmin):
    pass

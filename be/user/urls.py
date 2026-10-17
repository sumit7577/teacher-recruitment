from django.urls import path

from user import views

urlpatterns = [
    path("signup", views.SignUpView.as_view(), name="signup"),
    path("password", views.PasswordLoginView.as_view(), name="password-login"),
    path("password/set", views.PasswordSetView.as_view(), name="password-set"),
    # Forgotten password, without telephoning the office. Both anonymous — the
    # code mailed to a verified address is what stands in for being signed in.
    path("password/forgot", views.PasswordForgotView.as_view(), name="password-forgot"),
    path("password/reset", views.PasswordResetView.as_view(), name="password-reset"),
    # Proving an address you are claiming. Signed in, unlike the two above.
    path("email/code", views.EmailCodeRequestView.as_view(), name="email-code"),
    path("email/verify", views.EmailVerifyView.as_view(), name="email-verify"),
    path("google", views.GoogleLoginView.as_view(), name="google-login"),
    path("google/link", views.GoogleLinkView.as_view(), name="google-link"),
    path("me", views.MeView.as_view(), name="me"),
    path("logout", views.LogoutView.as_view(), name="logout"),
]

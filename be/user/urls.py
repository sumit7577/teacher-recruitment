from django.urls import path

from user import views

urlpatterns = [
    path("signup", views.SignUpView.as_view(), name="signup"),
    path("password", views.PasswordLoginView.as_view(), name="password-login"),
    path("password/set", views.PasswordSetView.as_view(), name="password-set"),
    path("google", views.GoogleLoginView.as_view(), name="google-login"),
    path("google/link", views.GoogleLinkView.as_view(), name="google-link"),
    path("me", views.MeView.as_view(), name="me"),
    path("logout", views.LogoutView.as_view(), name="logout"),
]

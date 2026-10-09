from django.urls import path

from panel import views

urlpatterns = [
    path("", views.DashboardView.as_view(), name="panel-dashboard"),
    path("staff/", views.StaffListView.as_view(), name="panel-staff"),
    path("password-reset/", views.PasswordResetView.as_view(), name="panel-password-reset"),
]

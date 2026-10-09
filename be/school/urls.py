from django.urls import path

from school import views

urlpatterns = [
    path("", views.SchoolProfileView.as_view(), name="school-profile"),
    path("dashboard/", views.SchoolDashboardView.as_view(), name="school-dashboard"),
]

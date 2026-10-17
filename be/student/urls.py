"""The family's own workspace."""

from django.urls import path

from student import views

urlpatterns = [
    path("profile/", views.StudentProfileView.as_view(), name="student-profile"),
    # Consent is its own endpoint, not a field on the profile PATCH — it is an
    # act by a named person at a recorded moment, not a column to be toggled
    # by any form that happens to include it.
    path("consent/", views.ConsentView.as_view(), name="student-consent"),
    path("requirements/", views.MyRequirementList.as_view(), name="student-requirements"),
    path("requirements/<pid:pk>/", views.MyRequirementDetail.as_view(), name="student-requirement"),
    # "Search nearby teachers" — section 6, and the only place a family
    # browses rather than posts.
    path("teachers/", views.NearbyTeacherList.as_view(), name="student-nearby-teachers"),
]

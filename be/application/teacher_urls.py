from django.urls import path

from application import views

urlpatterns = [
    path("", views.TeacherApplicationList.as_view(), name="teacher-application-list"),
    # The vacancy id, not an application id — there is no application yet.
    path("<pid:pk>/", views.TeacherApply.as_view(), name="teacher-apply"),
    path("detail/<pid:pk>/", views.TeacherApplicationDetail.as_view(), name="teacher-application-detail"),
]

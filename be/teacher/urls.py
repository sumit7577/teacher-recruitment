from django.urls import path

from teacher import views

urlpatterns = [
    path("", views.TeacherProfileView.as_view(), name="teacher-profile"),
    path("documents/", views.TeacherDocumentList.as_view(), name="teacher-documents"),
    path("documents/<pid:pk>/", views.TeacherDocumentDetail.as_view(), name="teacher-document"),
    path("experience/", views.TeacherExperienceList.as_view(), name="teacher-experience"),
    path("experience/<pid:pk>/", views.TeacherExperienceDetail.as_view(), name="teacher-experience-detail"),
]

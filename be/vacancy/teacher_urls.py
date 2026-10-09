from django.urls import path

from vacancy import views

urlpatterns = [
    path("", views.TeacherVacancyList.as_view(), name="teacher-vacancy-list"),
    path("<pid:pk>/", views.TeacherVacancyDetail.as_view(), name="teacher-vacancy-detail"),
]

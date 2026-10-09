from django.urls import path

from vacancy import views

urlpatterns = [
    path("", views.SchoolVacancyList.as_view(), name="school-vacancy-list"),
    path("<pid:pk>/", views.SchoolVacancyDetail.as_view(), name="school-vacancy-detail"),
    path("<pid:pk>/<str:action>", views.SchoolVacancyAction.as_view(), name="school-vacancy-action"),
]

from django.urls import path

from vacancy import views

urlpatterns = [
    path("", views.PanelVacancyList.as_view(), name="panel-vacancy-list"),
    path("<pid:pk>/", views.PanelVacancyDetail.as_view(), name="panel-vacancy-detail"),
    path("<pid:pk>/<str:action>", views.PanelVacancyAction.as_view(), name="panel-vacancy-action"),
]

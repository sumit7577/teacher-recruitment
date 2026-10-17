"""The moderation queue."""

from django.urls import path

from connect import views

urlpatterns = [
    path("", views.PanelReportList.as_view(), name="panel-reports"),
    path("<pid:pk>/", views.PanelReportAction.as_view(), name="panel-report-action"),
]

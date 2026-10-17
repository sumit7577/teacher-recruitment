"""The office. The one place that sees families still awaiting consent —
that queue is the work."""

from django.urls import path

from student import views

urlpatterns = [
    path("", views.PanelStudentList.as_view(), name="panel-students"),
    path("requirements/", views.PanelRequirementList.as_view(), name="panel-requirements"),
    path("<pid:pk>/", views.PanelStudentDetail.as_view(), name="panel-student"),
]

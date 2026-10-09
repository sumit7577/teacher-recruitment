from django.urls import path

from school import views

urlpatterns = [
    path("", views.PanelSchoolList.as_view(), name="panel-school-list"),
    path("<pid:pk>/", views.PanelSchoolDetail.as_view(), name="panel-school-detail"),
    path("<pid:pk>/verify", views.PanelSchoolVerify.as_view(), name="panel-school-verify"),
]

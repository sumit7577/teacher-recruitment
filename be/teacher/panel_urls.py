from django.urls import path

from teacher import views

urlpatterns = [
    path("", views.PanelTeacherList.as_view(), name="panel-teacher-list"),
    path("<pid:pk>/", views.PanelTeacherDetail.as_view(), name="panel-teacher-detail"),
    path("<pid:pk>/documents/<pid:document>/", views.PanelDocumentVerify.as_view(), name="panel-document-verify"),
]

from django.urls import path

from application import views

urlpatterns = [
    path("", views.SchoolApplicantList.as_view(), name="school-applicant-list"),
    path("<pid:pk>/", views.SchoolApplicantDetail.as_view(), name="school-applicant-detail"),
    path("<pid:pk>/stage", views.SchoolApplicantStage.as_view(), name="school-applicant-stage"),
    path("<pid:pk>/demo", views.SchoolDemoClass.as_view(), name="school-applicant-demo"),
    path("<pid:pk>/offer", views.SchoolOffer.as_view(), name="school-applicant-offer"),
]

from django.urls import path

from cms import views

urlpatterns = [
    path("", views.PanelEnquiryList.as_view(), name="panel-enquiry-list"),
    path("<pid:pk>/", views.PanelEnquiryDetail.as_view(), name="panel-enquiry-detail"),
]

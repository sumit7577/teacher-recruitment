from django.urls import path

from cms import views

urlpatterns = [
    path("", views.EnquiryCreateView.as_view(), name="public-enquiry"),
]

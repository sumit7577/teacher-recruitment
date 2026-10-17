"""The price list. Anonymous — a price must render before anyone signs up."""

from django.urls import path

from payments import views

urlpatterns = [
    path("", views.PlanListView.as_view(), name="public-plans"),
]

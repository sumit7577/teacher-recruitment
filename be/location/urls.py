"""Public location lookups. Anonymous — a registration form renders these
before anyone has an account."""

from django.urls import path

from location import views

urlpatterns = [
    path("states/", views.StateList.as_view(), name="states"),
    path("districts/", views.DistrictList.as_view(), name="districts"),
    path("blocks/", views.BlockList.as_view(), name="blocks"),
]

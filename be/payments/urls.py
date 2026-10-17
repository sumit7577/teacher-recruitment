"""Buying, for any signed-in account. Teachers and institutions both land here;
which plans they are shown is decided by the plan's `audience`, not the route."""

from django.urls import path

from payments import views

urlpatterns = [
    path("order", views.OrderCreateView.as_view(), name="pay-order"),
    path("verify", views.OrderVerifyView.as_view(), name="pay-verify"),
    path("orders", views.MyOrdersView.as_view(), name="pay-orders"),
]

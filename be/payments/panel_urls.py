"""The ledger and refunds. Staff only."""

from django.urls import path

from payments import views

urlpatterns = [
    path("", views.PanelOrderList.as_view(), name="panel-payments"),
    path("<pid:pk>/refund/", views.PanelRefundView.as_view(), name="panel-payment-refund"),
]

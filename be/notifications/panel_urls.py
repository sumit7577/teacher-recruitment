from django.urls import path

from notifications import views

urlpatterns = [
    path("", views.PanelCampaignList.as_view(), name="panel-campaign-list"),
    path("<pid:pk>/send", views.PanelCampaignSend.as_view(), name="panel-campaign-send"),
]

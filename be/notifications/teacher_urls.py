from django.urls import path

from notifications import views

urlpatterns = [
    path("", views.NotificationList.as_view(), name="notification-list"),
    path("seen", views.NotificationSeen.as_view(), name="notification-seen"),
    path("device", views.DeviceRegister.as_view(), name="device-register"),
]

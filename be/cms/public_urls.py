from django.urls import path

from cms import views

urlpatterns = [
    path("", views.PublicSiteView.as_view(), name="public-site"),
    path("pages/<slug:slug>/", views.PublicPageView.as_view(), name="public-page"),
]

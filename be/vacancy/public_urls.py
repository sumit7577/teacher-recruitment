from django.urls import path

from vacancy import views

urlpatterns = [
    path("", views.PublicVacancyList.as_view(), name="public-vacancy-list"),
    path("filters/", views.PublicVacancyFacets.as_view(), name="public-vacancy-filters"),
    path("<pid:pk>/", views.PublicVacancyDetail.as_view(), name="public-vacancy-detail"),
]

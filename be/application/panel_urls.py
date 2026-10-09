from django.urls import path

from application import views

urlpatterns = [
    path("", views.PanelApplicationList.as_view(), name="panel-application-list"),
    # Before `<pid:pk>/` — "demo" is not a public id, so the converter would not
    # match it, but keeping the literal first makes that independent of the
    # converter's regex.
    path("demo/", views.PanelDemoCalendar.as_view(), name="panel-demo-calendar"),
    path("demo/<pid:pk>/", views.PanelDemoClassUpdate.as_view(), name="panel-demo-update"),
    path("<pid:pk>/", views.PanelApplicationDetail.as_view(), name="panel-application-detail"),
    path("<pid:pk>/stage", views.PanelApplicationStage.as_view(), name="panel-application-stage"),
    path("<pid:pk>/demo", views.PanelDemoClass.as_view(), name="panel-application-demo"),
    path("<pid:pk>/offer", views.PanelOffer.as_view(), name="panel-application-offer"),
]

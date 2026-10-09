from django.urls import path

from cms import views

urlpatterns = [
    path("", views.PanelSiteSettingView.as_view(), name="panel-site"),
    path("pages/", views.PanelPageList.as_view(), name="panel-pages"),
    path("pages/<pid:pk>/", views.PanelPageDetail.as_view(), name="panel-page"),
    path("services/", views.PanelServiceList.as_view(), name="panel-services"),
    path("services/<pid:pk>/", views.PanelServiceDetail.as_view(), name="panel-service"),
    path("process/", views.PanelProcessList.as_view(), name="panel-process"),
    path("process/<pid:pk>/", views.PanelProcessDetail.as_view(), name="panel-process-step"),
    path("team/", views.PanelTeamList.as_view(), name="panel-team"),
    path("team/<pid:pk>/", views.PanelTeamDetail.as_view(), name="panel-team-member"),
    path("testimonials/", views.PanelTestimonialList.as_view(), name="panel-testimonials"),
    path("testimonials/<pid:pk>/", views.PanelTestimonialDetail.as_view(), name="panel-testimonial"),
]

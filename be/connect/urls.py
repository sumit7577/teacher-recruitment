"""Interest and chat — one mount for every signed-in audience.

Not split per audience, unlike the rest of the API. This feature is symmetric:
the same four endpoints with the two sides swapped. See connect/views.py.
"""

from django.urls import path

from connect import views

urlpatterns = [
    path("interests/", views.InterestListView.as_view(), name="interest-list"),
    path("interests/new/", views.InterestCreateView.as_view(), name="interest-create"),
    path("interests/seen/", views.SeenInterestsView.as_view(), name="interest-seen"),
    path("interests/<pid:pk>/<str:action>/", views.InterestRespondView.as_view(),
         name="interest-respond"),
    path("threads/", views.ThreadListView.as_view(), name="thread-list"),
    path("threads/<pid:pk>/messages/", views.MessageListView.as_view(), name="thread-messages"),
    path("block/", views.BlockView.as_view(), name="connect-block"),
    path("report/", views.ReportView.as_view(), name="connect-report"),
]

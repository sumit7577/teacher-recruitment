"""Tuition requirements, as a teacher sees them. The queryset goes through
`TuitionRequirement.objects.live()`, which is the consent gate — a minor
without a guardian's agreement is not on this board."""

from django.urls import path

from student import views

urlpatterns = [
    path("", views.OpenRequirementList.as_view(), name="teacher-tuition"),
]

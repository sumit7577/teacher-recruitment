"""Teacher search for an institution — sections 4 and 5.

Finding a teacher is not reaching one: the card carries no phone, no email and
no CV, and contact still goes through an accepted interest or the office.
"""

from django.urls import path

from teacher import school_views

urlpatterns = [
    path("", school_views.SchoolTeacherSearch.as_view(), name="school-teacher-search"),
]

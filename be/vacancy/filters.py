"""The board's filters, in one function.

Hand-written rather than a django-filter FilterSet because two of them are not
field lookups: `q` searches four columns at once, and `subject` has to match
loosely (a "Physics" search finds "Physical Science") while `post` must match
exactly. A FilterSet expressing that is longer than this and harder to read.

Used by all four audiences, so a filter fixed here is fixed on the website, in
the app and in the panel at once.
"""

from django.db.models import Q

SORTS = {
    "newest": ("-published_at", "-created_at"),
    "salary": ("-salary_max_lpa", "-published_at"),
    "salary_asc": ("salary_min_lpa", "-published_at"),
    "oldest": ("published_at",),
}


def apply_filters(queryset, params):
    """Narrow `queryset` by the query string. Unknown parameters are ignored —
    a typo'd filter must not silently return everything as though it matched."""
    city = (params.get("city") or "").strip()
    if city:
        queryset = queryset.filter(city__iexact=city)

    post = (params.get("post") or "").strip()
    if post:
        queryset = queryset.filter(post=post)

    institution = (params.get("institution_type") or "").strip()
    if institution:
        queryset = queryset.filter(institution_type=institution)

    board = (params.get("board") or "").strip()
    if board:
        queryset = queryset.filter(board=board)

    subject = (params.get("subject") or "").strip()
    if subject:
        queryset = queryset.filter(subject__icontains=subject)

    experience = (params.get("experience") or "").strip()
    if experience:
        queryset = queryset.filter(experience_band=experience)

    qualification = (params.get("qualification") or "").strip()
    if qualification:
        # The JSON list, matched as text. Postgres would do this properly with a
        # containment lookup; `icontains` is portable and the lists are four
        # items long, so the difference is unmeasurable here.
        queryset = queryset.filter(
            Q(qualification_codes__icontains=qualification) | Q(qualification__icontains=qualification)
        )

    salary_min = _number(params.get("salary_min"))
    if salary_min is not None:
        # A teacher asking for 5 LPA wants posts whose TOP is at least 5 — not
        # posts whose bottom is, which would hide every range that could pay it.
        queryset = queryset.filter(salary_max_lpa__gte=salary_min)

    query = (params.get("q") or "").strip()
    if query:
        queryset = queryset.filter(
            Q(title__icontains=query)
            | Q(subject__icontains=query)
            | Q(school_name__icontains=query)
            | Q(school__name__icontains=query)
            | Q(city__icontains=query)
        )

    only = (params.get("only") or "").strip()
    if only == "featured":
        queryset = queryset.filter(is_featured=True)
    elif only == "new":
        queryset = queryset.filter(published_at__isnull=False)

    sort = SORTS.get((params.get("sort") or "newest").strip(), SORTS["newest"])
    return queryset.order_by(*sort)


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

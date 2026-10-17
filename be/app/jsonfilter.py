"""Filtering "is this value in that JSON list?" on both database backends.

`subjects`, `classes_taught`, `teaching_preferences`, `exams` and `facilities`
are all JSON lists of short strings, and every one of them gets filtered on.
The obvious way:

    TeacherProfile.objects.filter(classes_taught__contains=["9"])

works on PostgreSQL and raises `NotSupportedError: contains lookup is not
supported on this database backend` on SQLite. Production is Postgres, so this
would never have failed there — but CLAUDE.md §1 says SQLite is the fallback
for a fresh clone, and a fresh clone that 500s on "find me a tutor" is a broken
clone. It is also exactly the kind of fault that gets discovered by a client.

So: branch on the backend, in one place.

## Why the SQLite branch is precise and not a sloppy substring match

It searches the JSON *text* for the value **with its quotes**: looking for
class "9" searches for `"9"`, not `9`. That matters because `["19"]`
serialises to `["19"]`, which contains `9"` but **not** `"9"` — the opening
quote is what stops class 9 matching class 19. A bare `icontains="9"` would
match both, and would also match a subject called "Class 9 Revision".

This is still a text search and it is not free. It is correct, it is only on
the SQLite path, and the SQLite path only ever holds a developer's handful of
rows. Production gets the indexed `@>` operator.
"""

import json

from django.db import connection


def json_list_has(queryset, field: str, value):
    """Rows whose JSON list `field` contains `value` exactly.

        json_list_has(teachers, "classes_taught", "9")

    `value` is compared as a string — these lists hold short strings, and the
    one place a number is natural (a class) is stored as `"9"` anyway.
    """
    value = str(value)
    if connection.vendor == "postgresql":
        # The real thing: a GIN-indexable containment test.
        return queryset.filter(**{f"{field}__contains": [value]})
    # json.dumps gives the quoted form — '"9"' — which is what makes this an
    # exact member test rather than a substring match. See the module docstring.
    return queryset.filter(**{f"{field}__icontains": json.dumps(value)})


def json_list_has_any(queryset, field: str, values) -> object:
    """Rows whose JSON list `field` contains at least one of `values`."""
    from django.db.models import Q

    values = [str(v) for v in values if str(v).strip()]
    if not values:
        return queryset
    if connection.vendor == "postgresql":
        query = Q()
        for value in values:
            query |= Q(**{f"{field}__contains": [value]})
        return queryset.filter(query)
    query = Q()
    for value in values:
        query |= Q(**{f"{field}__icontains": json.dumps(value)})
    return queryset.filter(query)

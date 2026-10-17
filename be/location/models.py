"""Where everybody is — State, District, Block, and the distance between them.

The requirements document asks for search by State/District/Tehsil/Block and
for "nearby" teachers and schools. Both need the same two things, and the
platform had neither: a hierarchy that everyone spells the same way, and
coordinates.

## Why this is a table and not three CharFields

It already was three CharFields — `city`, `state`, `locality` — typed by hand.
"Bengaluru", "Bangalore" and "banglore" are three cities in that design, and a
teacher in one cannot be found by a school searching another. A district is a
closed list of about 780 values; making it a foreign key is what makes the
filter a filter rather than a `LIKE`.

The free-text columns are deliberately left in place. They hold what people
have already typed, every existing row still reads correctly, and nothing has
to be migrated before this ships. The FK is additive; the day the data is
backfilled the old columns can go.

## On the dataset

India's official hierarchy is published by the Local Government Directory: 36
states and union territories, ~780 districts, ~7,000 blocks. `import_locations`
loads it from a CSV. The states ship seeded because they never change and
nothing should require a download to run; districts and blocks are imported.

## Distance

`latitude`/`longitude` on a row, and `near()` on the queryset. The maths is a
bounding box first and Haversine second — see the comment there, because the
order is the entire performance story.
"""

import math

from django.db import models

from app.public_id import PublicId


class State(models.Model):
    id = PublicId(prefix="st")
    # The Local Government Directory's own code. Stable across renames, which
    # is the point — Pondicherry became Puducherry and the code did not change.
    lgd_code = models.CharField(max_length=10, blank=True, default="", db_index=True)
    name = models.CharField(max_length=80, unique=True)
    is_union_territory = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name

    class Meta:
        managed = True
        db_table = "location_state"
        ordering = ("name",)


class District(models.Model):
    id = PublicId(prefix="dst")
    lgd_code = models.CharField(max_length=10, blank=True, default="", db_index=True)
    state = models.ForeignKey(State, on_delete=models.CASCADE, related_name="districts")
    name = models.CharField(max_length=80, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.name}, {self.state.name}"

    class Meta:
        managed = True
        db_table = "location_district"
        ordering = ("name",)
        # Two states may both have a "Aurangabad"; one state may not have two.
        constraints = [
            models.UniqueConstraint(fields=["state", "name"], name="uniq_district_in_state"),
        ]


class Block(models.Model):
    """Tehsil, taluk, mandal, block — one row, four words for it.

    The document says "tehsil/block" because the term varies by state and the
    thing does not. `kind` records which word the state uses so a form can
    print the one a person expects to see.
    """

    KIND_CHOICES = (
        ("block", "Block"),
        ("tehsil", "Tehsil"),
        ("taluk", "Taluk"),
        ("mandal", "Mandal"),
        ("subdivision", "Subdivision"),
    )

    id = PublicId(prefix="blk")
    lgd_code = models.CharField(max_length=10, blank=True, default="", db_index=True)
    district = models.ForeignKey(District, on_delete=models.CASCADE, related_name="blocks")
    name = models.CharField(max_length=80, db_index=True)
    kind = models.CharField(max_length=12, choices=KIND_CHOICES, default="block")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.name}, {self.district.name}"

    class Meta:
        managed = True
        db_table = "location_block"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(fields=["district", "name"], name="uniq_block_in_district"),
        ]


# ── distance ────────────────────────────────────────────────────────────────

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in kilometres.

    Used to sort and to label ("12 km away"), never to filter a large table —
    filtering is the bounding box in `NearbyQuerySet.near`, because this cannot
    use an index.
    """
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


class NearbyQuerySet(models.QuerySet):
    """Mixed into any queryset whose model has `latitude`/`longitude`."""

    def near(self, lat: float, lon: float, km: float = 25):
        """Rows within roughly `km` of a point.

        A **bounding box**, not a circle, and that is on purpose. The box is
        two indexed range comparisons on two float columns, so Postgres can use
        an index and the query stays flat as the table grows. A true radius
        needs Haversine inside the WHERE clause, which is a full scan and a
        trigonometric function call per row.

        The box over-selects at the corners — a point 1.41×km away diagonally
        is included. Callers that care sort by `haversine_km` afterwards and
        cut the tail; for "teachers near me" the corners are not worth a
        sequential scan over every teacher in India.

        One degree of latitude is ~111 km everywhere. One degree of longitude
        is 111 km only at the equator and shrinks by cos(latitude) — at Delhi's
        28.6°N it is about 97 km. Dropping that cosine makes the box 14% too
        narrow in the north, which silently hides people.
        """
        if lat is None or lon is None:
            return self.none()
        dlat = km / 111.0
        # Guard the pole: cos(90°) is 0 and the division explodes. Nobody is
        # teaching there, but a stray 90 in a query parameter should not 500.
        cos_lat = max(math.cos(math.radians(lat)), 0.01)
        dlon = km / (111.0 * cos_lat)
        return self.filter(
            latitude__gte=lat - dlat, latitude__lte=lat + dlat,
            longitude__gte=lon - dlon, longitude__lte=lon + dlon,
        )

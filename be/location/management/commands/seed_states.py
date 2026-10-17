"""Seed the 36 states and union territories.

Shipped as code rather than a CSV because the list is closed, changes about
once a decade, and nothing should need a download to boot. Districts and blocks
are a different matter — ~780 and ~7,000 rows — and come through
`import_locations` from the Local Government Directory's export.

Idempotent: run it as often as you like.
"""

from django.core.management.base import BaseCommand

from location.models import State

# (LGD code, name, is_union_territory)
STATES = [
    ("28", "Andhra Pradesh", False),
    ("12", "Arunachal Pradesh", False),
    ("18", "Assam", False),
    ("10", "Bihar", False),
    ("22", "Chhattisgarh", False),
    ("30", "Goa", False),
    ("24", "Gujarat", False),
    ("06", "Haryana", False),
    ("02", "Himachal Pradesh", False),
    ("20", "Jharkhand", False),
    ("29", "Karnataka", False),
    ("32", "Kerala", False),
    ("23", "Madhya Pradesh", False),
    ("27", "Maharashtra", False),
    ("14", "Manipur", False),
    ("17", "Meghalaya", False),
    ("15", "Mizoram", False),
    ("13", "Nagaland", False),
    ("21", "Odisha", False),
    ("03", "Punjab", False),
    ("08", "Rajasthan", False),
    ("11", "Sikkim", False),
    ("33", "Tamil Nadu", False),
    ("36", "Telangana", False),
    ("16", "Tripura", False),
    ("09", "Uttar Pradesh", False),
    ("05", "Uttarakhand", False),
    ("19", "West Bengal", False),
    ("35", "Andaman and Nicobar Islands", True),
    ("04", "Chandigarh", True),
    ("26", "Dadra and Nagar Haveli and Daman and Diu", True),
    ("07", "Delhi", True),
    ("01", "Jammu and Kashmir", True),
    ("37", "Ladakh", True),
    ("31", "Lakshadweep", True),
    ("34", "Puducherry", True),
]


class Command(BaseCommand):
    help = "Seed states and union territories. Safe to re-run."

    def handle(self, *args, **options):
        made = 0
        for code, name, ut in STATES:
            _, created = State.objects.update_or_create(
                name=name, defaults={"lgd_code": code, "is_union_territory": ut},
            )
            made += int(created)
        self.stdout.write(self.style.SUCCESS(
            f"{State.objects.count()} states present ({made} new)."
        ))

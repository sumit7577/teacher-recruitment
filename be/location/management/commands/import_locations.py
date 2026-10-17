"""Import districts and blocks from a CSV.

    manage.py import_locations districts.csv --kind=district
    manage.py import_locations blocks.csv    --kind=block

Expected columns (header row required, extra columns ignored):

    district:  state, name, lgd_code?, latitude?, longitude?
    block:     state, district, name, lgd_code?, kind?, latitude?, longitude?

The source is the Local Government Directory (lgdirectory.gov.in), whose
exports carry these fields under longer names; rename the header and feed it in.

Idempotent — matched on (parent, name), so re-importing a corrected file
updates rather than duplicates. A row whose state or district is not already
present is **skipped and reported**, never silently created: a typo in a state
name should not quietly mint a 37th state.
"""

import csv

from django.core.management.base import BaseCommand, CommandError

from location.models import Block, District, State


class Command(BaseCommand):
    help = "Import districts or blocks from a CSV."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--kind", choices=("district", "block"), required=True)

    def handle(self, *args, **options):
        path, kind = options["path"], options["kind"]
        try:
            handle = open(path, newline="", encoding="utf-8-sig")
        except OSError as exc:
            raise CommandError(f"Cannot read {path}: {exc}") from exc

        made = updated = skipped = 0
        missing: set[str] = set()

        with handle:
            for row in csv.DictReader(handle):
                row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
                name = row.get("name", "")
                if not name:
                    skipped += 1
                    continue

                if kind == "district":
                    parent = State.objects.filter(name__iexact=row.get("state", "")).first()
                    if parent is None:
                        missing.add(row.get("state", "?"))
                        skipped += 1
                        continue
                    obj, created = District.objects.update_or_create(
                        state=parent, name=name,
                        defaults=self._coords(row) | {"lgd_code": row.get("lgd_code", "")},
                    )
                else:
                    parent = District.objects.filter(
                        name__iexact=row.get("district", ""),
                        state__name__iexact=row.get("state", ""),
                    ).first()
                    if parent is None:
                        missing.add(f"{row.get('district', '?')}, {row.get('state', '?')}")
                        skipped += 1
                        continue
                    obj, created = Block.objects.update_or_create(
                        district=parent, name=name,
                        defaults=self._coords(row) | {
                            "lgd_code": row.get("lgd_code", ""),
                            "kind": row.get("kind") or "block",
                        },
                    )
                made += int(created)
                updated += int(not created)

        self.stdout.write(self.style.SUCCESS(f"{made} created, {updated} updated, {skipped} skipped."))
        if missing:
            shown = sorted(missing)[:10]
            self.stdout.write(self.style.WARNING(
                f"{len(missing)} parent(s) not found, e.g. {', '.join(shown)}. "
                "Import the level above first."
            ))

    @staticmethod
    def _coords(row: dict) -> dict:
        def num(key):
            try:
                return float(row[key])
            except (KeyError, TypeError, ValueError):
                return None
        return {"latitude": num("latitude"), "longitude": num("longitude")}

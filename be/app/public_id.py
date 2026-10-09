"""Public IDs — Stripe-style prefixed slugs backed by UUID v7.

Replaces auto-incrementing integer PKs across the data model. Goals:

  1. **Unguessable.** 74 bits of randomness inside the slug (the rest is a
     timestamp). Brute-forcing one valid id requires ~2^74 attempts; safely
     uncrackable for the lifetime of the universe.
  2. **Self-identifying.** Every id carries its type as a prefix
     (`vac_xxx` = Vacancy, `tch_xxx` = TeacherProfile). Logs, Slack pastes,
     support tickets are debuggable without table lookups, and routing
     a `cse_xxx` to a video endpoint 404s at the URL converter — never
     reaches the view.
  3. **Index-friendly.** UUID v7's leading bytes are a millisecond
     timestamp. Within one table all PKs share a prefix → lex sort of the
     slug equals time sort of the underlying UUID → Postgres B-tree gets
     monotonic inserts, no page splits, no fragmentation. Same write
     profile as a sequential BIGINT.

Storage shape: `VARCHAR(40)`. Format: `{prefix}_{base32-lowercase(uuid7.bytes)}`.
Example: `vac_5j7q4qkqmqkj4l5q4kq` — a Vacancy id.

Encoding choice: stdlib `base64.b32encode` gives 26 chars padded, 25–26
unpadded. Crockford base32 would dodge the 1/I/L confusion but adds 30
lines of code; not worth it pre-launch. base58 / nanoid require another
dep. Sticking with stdlib base32 keeps this module dep-free except for
`uuid_utils`.

Future-proofing: when Python 3.14 ships `uuid.uuid7()` in the stdlib, swap
the `uuid_utils.uuid7()` call here and drop the dep — wire format stays
identical, no migration needed.
"""

import base64
import re
from typing import Any

import uuid_utils
from django.core.exceptions import ValidationError
from django.db import models


# Slug regex shared by validation + URL converter. Matches `{prefix}_{slug}`
# where prefix is 2–6 lowercase letters and slug is 20–32 base32 chars.
# The width range allows the encoder to drop padding without breaking the
# regex, and tolerates future prefix renames within reason.
_SLUG_RE = re.compile(r"^[a-z]{2,6}_[a-z2-7]{20,32}$")


def generate_public_id(prefix: str) -> str:
    """Mint a fresh public id for `prefix`.

    Uses UUID v7 so the 16 bytes start with a millisecond timestamp;
    lex sort of the encoded slug therefore matches creation order
    within the table — Postgres' B-tree appends to the right edge.
    """
    if not prefix or not prefix.isalpha() or not prefix.islower():
        raise ValueError(f"PublicId prefix must be lowercase letters; got {prefix!r}")
    raw = uuid_utils.uuid7().bytes
    encoded = base64.b32encode(raw).decode("ascii").rstrip("=").lower()
    return f"{prefix}_{encoded}"


class PublicId(models.CharField):
    """Primary-key field that auto-fills with a typed slug on insert.

    Usage:

        class Vacancy(models.Model):
            id = PublicId(prefix="vac")

    The prefix is baked into the column default so callers never need to
    pass an id explicitly. `editable=False` keeps the field out of admin
    forms; `primary_key=True` makes Django route FKs and `pk` through it.

    Stored as `VARCHAR(40)` — comfortably larger than the 30-char slug
    (`{prefix:6}_{base32:26}`) leaves room for prefix renames without
    schema migrations.
    """

    description = "Stripe-style prefixed slug, UUID v7 inside"

    def __init__(self, *, prefix: str, **kwargs: Any) -> None:
        if not prefix or not prefix.isalpha() or not prefix.islower():
            raise ValueError(
                f"PublicId prefix must be lowercase letters; got {prefix!r}",
            )
        self.prefix = prefix
        # Sensible defaults — almost always what callers want, overridable
        # via kwargs for the odd case (e.g. a non-PK PublicId).
        kwargs.setdefault("primary_key", True)
        kwargs.setdefault("max_length", 40)
        kwargs.setdefault("editable", False)
        # Lambdas don't serialize cleanly into migrations; use a partial
        # via the module-level helper so `makemigrations` can pickle it.
        kwargs.setdefault("default", _DefaultForPrefix(prefix))
        super().__init__(**kwargs)

    def deconstruct(self):
        """Round-trip `prefix` through the migration writer."""
        name, path, args, kwargs = super().deconstruct()
        kwargs["prefix"] = self.prefix
        # Strip the auto-defaulted kwargs so migrations don't restate them.
        for k, v in {
            "primary_key": True, "max_length": 40, "editable": False,
        }.items():
            if kwargs.get(k) == v:
                kwargs.pop(k)
        # Drop the default — it's reconstructed from `prefix` in __init__
        # and serializing the callable bloats migration files.
        kwargs.pop("default", None)
        return name, path, args, kwargs


class _DefaultForPrefix:
    """Picklable default factory. Migrations serialize this as a dotted
    path + args; lambdas would inline the closure and break re-imports."""

    def __init__(self, prefix: str) -> None:
        self.prefix = prefix

    def __call__(self) -> str:
        return generate_public_id(self.prefix)

    def deconstruct(self):
        # Tell Django how to re-create this in a migration file.
        return ("app.public_id._DefaultForPrefix", [self.prefix], {})


# ─── URL converter ────────────────────────────────────────────────────────


class PublicIdConverter:
    """Matches `{prefix}_{slug}` in URL patterns.

    Registered as `pid` by `app.apps.AppConfig.ready()`. Use in routes:

        path("videos/<pid:pk>/encoding/", VideoEncodingView.as_view())

    A request to `/videos/vid_abc123.../encoding/` matches. A request to
    `/videos/cse_xyz/encoding/` *also* matches the converter (it's well-
    formed), then 404s in the view because no CourseVideos row exists
    with that id. Tightening this to per-route prefix validation would
    couple URL routing to model types; not worth the duplication.
    """

    # Matches any valid slug shape. Per-prefix validation happens at the
    # ORM lookup — that's where it belongs.
    regex = r"[a-z]{2,6}_[a-z2-7]{20,32}"

    def to_python(self, value: str) -> str:
        if not _SLUG_RE.match(value):
            raise ValidationError("invalid public id")
        return value

    def to_url(self, value: str) -> str:
        return value

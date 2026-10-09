"""Where uploaded files land, and what is allowed in.

Two rules, and both exist for a reason that bit somebody else first.

**Paths carry a random segment.** Uploads are served as static files by nginx,
so a path that can be guessed can be read by anyone — and the files here are a
teacher's CV, their degree certificate and their ID proof. `teacher/tch_abc/cv/
resume.pdf` is guessable the moment one teacher id leaks; `teacher/tch_abc/cv/
7f3a9c2e/resume.pdf` is not. This is obfuscation, not authorisation: the panel's
own download endpoints are the gated path, and anything genuinely sensitive
should go through them. But it costs one line and removes the easy enumeration.

**Extensions are allow-listed, not deny-listed.** A deny list is a list of the
attacks somebody already thought of. An `.svg` or `.html` uploaded as a
"certificate" and then opened from our own domain runs script in our origin.
"""

import os
import secrets

from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible
from django.utils.text import get_valid_filename

DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".svg"}


def _clean(filename: str, max_length: int = 60) -> str:
    """A filename safe to put on disk, keeping enough of the original that a
    staff member downloading three certificates can tell them apart."""
    base, ext = os.path.splitext(filename or "file")
    base = get_valid_filename(base)[:max_length] or "file"
    return f"{base}{ext.lower()}"


def _path(*parts: str) -> str:
    return "/".join(str(p).strip("/") for p in parts if p)


@deconstructible
class upload_to:
    """An `upload_to` for a FileField, rooted at `prefix`.

        cv = models.FileField(upload_to=upload_to("teacher", "cv"))

    A class and not a closure, because `makemigrations` has to serialise this
    into a migration file and a nested function cannot be written down — Django
    fails with "Could not find function inner in app.uploads". `@deconstructible`
    is what tells the migration writer how to reconstruct it from its arguments.

    The instance's own id goes in after the prefix, so one teacher's files sit
    together on disk and a stray file is traceable to a row.
    """

    def __init__(self, *prefix: str) -> None:
        self.prefix = tuple(prefix)

    def __call__(self, instance, filename: str) -> str:
        owner = getattr(instance, "pk", None) or "unassigned"
        return _path(*self.prefix, str(owner), secrets.token_hex(4), _clean(filename))

    def __eq__(self, other) -> bool:
        # Without this, every `makemigrations` sees a new object and writes an
        # AlterField for a field nobody touched.
        return isinstance(other, upload_to) and self.prefix == other.prefix


def validate_document(file) -> None:
    """A CV or a certificate: PDF or a photograph of one."""
    _validate(file, DOCUMENT_EXTENSIONS)


def validate_image(file) -> None:
    """A logo or a photograph."""
    _validate(file, IMAGE_EXTENSIONS)


def _validate(file, allowed: set) -> None:
    from django.conf import settings

    name = getattr(file, "name", "") or ""
    ext = os.path.splitext(name)[1].lower()
    if ext not in allowed:
        allowed_list = ", ".join(sorted(e.lstrip(".") for e in allowed))
        raise ValidationError(f"{ext or 'That file type'} is not allowed. Use: {allowed_list}.")

    size = getattr(file, "size", 0) or 0
    limit = getattr(settings, "MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
    if size > limit:
        raise ValidationError(f"That file is {size // (1024 * 1024)} MB. The limit is {limit // (1024 * 1024)} MB.")

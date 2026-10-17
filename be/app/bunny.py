"""Uploaded files, on a content delivery network instead of this disk.

Until now every CV, certificate and logo lived under `MEDIA_ROOT` on the
application server, served by the reverse proxy. That works until it doesn't:
the files die with the server, growing storage means resizing the VPS, and a
principal in Patna downloading six certificates pulls all six from one machine
in one datacentre.

This moves them to Bunny Storage, replicated and fronted by a CDN with Indian
edge locations. Nothing in any model changes — `upload_to=` and the validators
are untouched — because Django reaches storage through the `STORAGES["default"]`
backend and every serializer already asks the field for `.url`.

## The one thing that is different from a filesystem

`FileSystemStorage` stores a *relative path* in the column and builds a URL from
`MEDIA_URL` on the way out. This stores the **full CDN URL** in the column and
hands it back unchanged. That is deliberate — it means a row knows where its own
file actually is, so moving zones later cannot orphan the rows that were written
before the move.

It also means the database contains two shapes of value: full URLs for anything
written from now on, and the old relative paths for everything written before.
`url()` below handles both, which is the whole reason this migrates without a
backfill. See the comment there.

Configure with `BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_ACCESS_KEY` and
`BUNNY_STORAGE_PUBLIC_HOST`. With no access key set, `settings` leaves the
default backend as the filesystem and none of this is reached — which is what
keeps a fresh clone working with no account and no credentials.
"""

import logging
import os
from urllib.parse import unquote, urlparse

import requests
from django.conf import settings
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

logger = logging.getLogger(__name__)

# Bunny answers an upload with 201. Anything else is a failure worth raising.
_CREATED = 201
# A delete of something already gone is success as far as we are concerned.
_DELETE_OK = (200, 204, 404)


@deconstructible
class BunnyStorage(Storage):
    """Django storage over Bunny Edge Storage.

    `@deconstructible` is not optional: without it `makemigrations` cannot
    serialise a field whose `storage=` is an instance of this class and fails
    with "Cannot serialize". We do not currently pin storage per-field — it is
    set globally in `STORAGES` — but a future field that does would break the
    migration writer, and the decorator costs nothing.
    """

    def __init__(self, directory: str = "") -> None:
        # A prefix inside the zone, if a caller wants one. Normalised to either
        # "" or "something/" so joining is plain concatenation everywhere below.
        self.directory = f"{directory.strip('/')}/" if directory.strip("/") else ""
        self._session = None

    # Settings are read through properties rather than captured in __init__,
    # so `override_settings` in a test and a reload in development both work
    # without re-importing the class.

    @property
    def _zone(self) -> str:
        return getattr(settings, "BUNNY_STORAGE_ZONE_NAME", "") or ""

    @property
    def _key(self) -> str:
        return getattr(settings, "BUNNY_STORAGE_ACCESS_KEY", "") or ""

    @property
    def _host(self) -> str:
        """The public CDN hostname files are *read* from."""
        return (getattr(settings, "BUNNY_STORAGE_PUBLIC_HOST", "") or "").strip("/")

    @property
    def _api(self) -> str:
        """The storage API endpoint files are *written* to.

        Region-specific. The default Frankfurt zone is `storage.bunnycdn.com`;
        a Singapore zone — which is the right one for Indian traffic — is
        `sg.storage.bunnycdn.com`. Getting this wrong gives a 401 that reads
        like a bad access key, so it is configurable and documented in DEPLOY.md.
        """
        return getattr(settings, "BUNNY_STORAGE_API_HOST", "storage.bunnycdn.com")

    @property
    def session(self) -> requests.Session:
        # One pooled session per storage instance. Uploads arrive in bursts —
        # a teacher submits six certificates at once — and a fresh TCP plus TLS
        # handshake per file is most of the wall clock on that request.
        if self._session is None:
            self._session = requests.Session()
        return self._session

    # ── writing ─────────────────────────────────────────────────────────────

    def _save(self, name: str, content) -> str:
        """Upload, and return what goes in the column: the public URL.

        The seek(0) is not defensive padding. Django's `pre_save` runs before
        this — the size check, and on an ImageField a dimension probe that reads
        the header — and leaves the file pointer wherever it finished. Handing
        requests a file-like positioned at EOF uploads nothing at all and Bunny
        rejects the empty body with a 400 that says only "Unable to upload
        file:". allcoaching lost an afternoon to this one.
        """
        if hasattr(content, "seek"):
            try:
                content.seek(0)
            except (OSError, ValueError):
                # Genuinely streamed uploads cannot seek. Hand the file-like
                # straight over and let requests chunk it.
                pass

        data = content.read() if hasattr(content, "read") else content
        path = f"{self.directory}{name.lstrip('/')}"

        response = self.session.put(
            url=f"https://{self._api}/{self._zone}/{path}",
            headers={
                "AccessKey": self._key,
                "Content-Type": "application/octet-stream",
                "accept": "application/json",
            },
            data=data,
            timeout=60,
        )

        if response.status_code != _CREATED:
            # Bunny's error bodies are usually JSON but an upstream failure can
            # return plain text or nothing — don't fault inside the error path.
            try:
                detail = response.json()
            except ValueError:
                detail = {"HttpCode": response.status_code, "Message": response.text or ""}
            logger.error("bunny upload failed for %s → %s", path, detail)
            raise OSError(f"Upload failed: {detail}")

        return f"https://{self._host}/{path}"

    # ── reading ─────────────────────────────────────────────────────────────

    def url(self, name: str) -> str:
        """The URL for a stored value — and the reason no backfill is needed.

        Two shapes live in these columns:

          * written here       → "https://zone.b-cdn.net/teacher/tch_x/ab/cv.pdf"
          * written before     → "teacher/tch_x/ab/cv.pdf"

        An absolute URL is already the answer. A bare path is a file still
        sitting on the application server's disk from before the switch, and the
        proxy still serves `MEDIA_URL` — so prefixing it keeps every old CV,
        certificate and logo loading exactly as it did. Drop this branch and
        every file uploaded before the cutover 404s.
        """
        if not name:
            return ""
        if name.startswith(("http://", "https://", "//")):
            return name
        media = getattr(settings, "MEDIA_URL", "/media/") or "/media/"
        return f"{media.rstrip('/')}/{name.lstrip('/')}"

    def exists(self, name: str) -> bool:
        """Always False — do not probe the network to pick a filename.

        Django calls this in a loop from `get_available_name` to avoid clobbering
        an existing file. Over HTTP that is a request per upload to answer a
        question we already know the answer to: `app/uploads.py:upload_to` puts
        four random bytes in every path, so two uploads cannot collide. Returning
        False skips the round-trip and keeps the stored name the one we chose.
        """
        return False

    def size(self, name: str) -> int:
        """Bunny does not expose a cheap stat, and nothing in this codebase asks
        for the size of an already-stored file — validation reads `.size` off the
        upload before it is saved. Returning 0 rather than raising keeps the
        Django admin's file widget from erroring when it renders a row."""
        return 0

    # ── deleting ────────────────────────────────────────────────────────────

    def delete(self, name: str) -> None:
        """Remove an object. Tolerant of a value in either shape.

        Called by the admin and by any model that clears a FileField. Since the
        column holds a full URL, strip it back to the zone-relative path first.
        A bare path (a pre-cutover local file) has nothing in the zone to remove,
        so a 404 from Bunny is the expected, successful answer.
        """
        if not name:
            return

        parsed = urlparse(name)
        path = parsed.path if parsed.netloc else name
        path = unquote(path).lstrip("/")
        if not path:
            return

        response = self.session.delete(
            url=f"https://{self._api}/{self._zone}/{path}",
            headers={"AccessKey": self._key, "accept": "application/json"},
            # Short, because a staff member pressing delete in the panel is
            # waiting on this. A slow Bunny must not hang the request.
            timeout=10,
        )
        if response.status_code not in _DELETE_OK:
            try:
                detail = response.json()
            except ValueError:
                detail = {"HttpCode": response.status_code, "Message": response.text or ""}
            # Logged rather than raised: a file left behind in the zone costs a
            # fraction of a paisa, and failing the request would leave the row
            # pointing at a file the user just asked to be rid of.
            logger.warning("bunny delete failed for %s → %s", path, detail)

    # ── the rest of the Storage contract ────────────────────────────────────

    def get_available_name(self, name: str, max_length: int | None = None) -> str:
        """`upload_to` already guarantees uniqueness; Django's default would
        call `exists()` in a loop to discover the same thing. Truncate only if a
        field declares a `max_length` shorter than the path we built."""
        if max_length and len(name) > max_length:
            root, ext = os.path.splitext(name)
            name = root[: max_length - len(ext)] + ext
        return name

    def _open(self, name: str, mode: str = "rb"):
        """Read a stored file back. Only the Django admin's file widget and a
        would-be re-processing job need this; the API hands out URLs and lets the
        CDN serve them."""
        from django.core.files.base import ContentFile

        response = self.session.get(self.url(name), timeout=30)
        response.raise_for_status()
        return ContentFile(response.content, name=name)

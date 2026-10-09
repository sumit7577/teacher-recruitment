"""The response envelope, in one place.

Every non-generic endpoint answers in the same shape, because the frontend has
exactly one response handler:

    {"status": "true",  "message": "...", "data": {...}}
    {"status": "false", "message": "..."}

`status` is the STRING "true"/"false", not a boolean. That is allcoaching's wire
contract and the Android client parses it as a string; a real boolean here would
be a silent breaking change for anything that compares it.
"""

from rest_framework import status as http
from rest_framework.response import Response


def ok(message: str = "", data=None, **extra) -> Response:
    body = {"status": "true", "message": message}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return Response(body)


def fail(message: str, code: str = "", status_code: int = http.HTTP_400_BAD_REQUEST, **extra) -> Response:
    body = {"status": "false", "message": message}
    if code:
        body["code"] = code
    body.update(extra)
    return Response(body, status=status_code)

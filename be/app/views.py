from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Liveness + database reachability, for the deploy script and uptime ping.

    Touches the database on purpose. A process that answers 200 while Postgres
    is unreachable is the failure that looks like success, and it is the one
    that gets missed.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:  # pragma: no cover — only on a broken deploy
        return Response({"status": "false", "message": f"database unreachable: {exc}"}, status=503)
    return Response({"status": "true", "message": "ok"})

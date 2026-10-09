"""Gunicorn configuration.

Sized for the one server the proposal prices ("up to 10,000 visitors a month"),
which is a small VPS: 3 workers x 3 threads is nine concurrent requests, and the
binding constraint is Postgres connections rather than CPU — CONN_MAX_AGE means
every thread holds one, so 9 slots is ~9 connections out of the default 100.

`timeout` is 120s rather than the usual 30: this process also serves the Django
admin, where a bulk action or a CSV export legitimately runs long, and a timeout
that kills real work is a worse failure than the one it prevents. Anything that
genuinely needs longer belongs in a background job, not a request.
"""

bind = "0.0.0.0:8000"
workers = 3
worker_class = "gthread"
threads = 3
timeout = 120
# Uploads are CVs and certificates; the default 4094-byte header limit is fine,
# but the body limit lives in Django (MAX_UPLOAD_BYTES) so there is one answer.
forwarded_allow_ips = "*"
accesslog = "-"
errorlog = "-"

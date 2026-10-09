# Teacher recruitment — backend

Django + DRF API behind the website, the teacher app and the admin panel.
Architecture notes and the patterns to follow are in [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo
.venv/bin/python manage.py make_staff <your-mobile> --name "Office"
DJANGO_DEBUG=true .venv/bin/python manage.py runserver 8000
```

`http://localhost:8000/healthz/` should answer `{"status":"true","message":"ok"}`.

Signing in locally needs no SMS account: with `DJANGO_DEBUG=true` the one-time
code is printed to the server log.

## The API, by audience

| Prefix | Who | Token |
|---|---|---|
| `v1/public/` | the website | none |
| `v1/auth/` | signing in and up | none, then issues one |
| `v1/teacher/` | a teacher | `Token <key>`, role `teacher` |
| `v1/school/` | an institution | `Token <key>`, role `school` |
| `v1/panel/` | the firm's office | `Token <key>`, role `staff` |

## Deploying

One container, one Postgres, nginx in front serving `MEDIA_ROOT` at `/media/`.

```bash
docker build -t recruit-api .
docker run --env-file .env -p 8000:8000 -v /srv/recruit/media:/app/media recruit-api
```

Migrations are **not** run by the image — run them yourself before swapping the
container, or a deploy ships code ahead of its schema.

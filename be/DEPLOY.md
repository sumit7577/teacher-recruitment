# Deploying

One server, four containers: Postgres, Django, Next, and Caddy in front holding
the certificate. Everything is one origin — the browser calls `/v1/...` on the
same host it loaded the page from — so there is no CORS and one certificate.

Everything below runs from `be/deploy/`.

## Before anything

| | |
|---|---|
| **Server** | 2 GB RAM minimum. The Next build is the peak; add swap (below) or it is killed at 90%. 2 vCPU / 2 GB / 40 GB is right for the 10,000 visitors a month the proposal prices. |
| **Domain** | Pointed at the server before the first `up`. Caddy asks Let's Encrypt on boot and the request fails if DNS has not propagated. |
| **DNS** | `A @ <server-ip>` and `A www <server-ip>`. Nothing else. |

## 1. The server

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Swap — the Next build needs more than 2 GB for about ninety seconds and the
# OOM killer is otherwise the first thing you will meet.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Only 22, 80 and 443. Postgres is not exposed by compose; this is the second lock.
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. The code

Both repositories, side by side — the compose file reaches across with `../`.

```bash
mkdir -p /srv/jeewan && cd /srv/jeewan
git clone <be-repo>  be
git clone <web-repo> web
```

## 3. The settings

```bash
cd /srv/jeewan/be/deploy
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # DJANGO_SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # POSTGRES_PASSWORD
vi .env
```

`DOMAIN` and `SITE_ORIGIN` are the two that everything else follows from. Get
them wrong and Caddy requests a certificate for the wrong name.

## 4. Up

```bash
docker compose --env-file .env up -d --build     # first build: 5–10 minutes
docker compose logs -f caddy                     # watch the certificate arrive
```

Migrations run on boot — the `be` container runs `migrate` before gunicorn.

## 5. The first office account

```bash
docker compose exec be python manage.py make_staff 9845637278 --name "Office"
```

`make_staff` is the only way `is_staff_member` is ever set. There is no API that
grants it and no checkbox in the panel, which is deliberate.

Optional, to load the twelve demo vacancies and the editable website text:

```bash
docker compose exec be python manage.py seed_demo
```

It is idempotent and only fills empty settings fields, so it is safe to re-run.
**Do not run it after the client has written their own copy** — it will not
overwrite what they typed, but it will add vacancies back if they deleted them.

## 6. Backups

```bash
ln -s /srv/jeewan/be/deploy/backup.sh /etc/cron.daily/jeewan-backup
/srv/jeewan/be/deploy/backup.sh          # run it once now, and check the files
```

Fourteen days of database dumps and media archives in `/srv/jeewan/backups`.

**Restore — do this once before handover.** A backup nobody has restored is not
a backup, and finding out it was broken on the day you need it is the whole
failure mode:

```bash
docker compose exec -T db pg_restore -U recruit -d recruit --clean --if-exists \
    < /srv/jeewan/backups/db-YYYY-MM-DD.dump
docker run --rm -v jeewan_media:/media -v /srv/jeewan/backups:/in alpine \
    tar xzf /in/media-YYYY-MM-DD.tar.gz -C /media
```

## Shipping a change

```bash
cd /srv/jeewan/be  && git pull
cd /srv/jeewan/web && git pull
cd /srv/jeewan/be/deploy && docker compose --env-file .env up -d --build
```

A failed build leaves the running containers untouched, so attempting it is safe.

**The web container must be rebuilt, not restarted, when `SITE_ORIGIN` changes.**
`NEXT_PUBLIC_*` is inlined into the browser bundle at build time, so a restart
keeps serving the old value and the sitemap keeps pointing at the old domain.

## Two things worth knowing

**Uploaded files are protected by their addresses, not by a login.** Caddy serves
`/media/*` straight off the volume, which is what makes it fast. What keeps a
teacher's ID proof private is that `app/uploads.py` puts `secrets.token_hex(4)`
in every path, so the address cannot be guessed and the directory is never
listed. If the client ever asks for documents behind a permission check, that is
a real change: the file server comes out and the requests go through Django.

**Nobody can sign in until the SMS credentials are in.** `OTP_CONSOLE_FALLBACK`
defaults to `DEBUG`, which is false in production, so with no `SMS_API_KEY` the
OTP is never delivered and never printed. For a demo before DLT registration is
through, put the office number in `OTP_TEST_PHONES` — it skips the gateway and
accepts `OTP_TEST_CODE`. Clear it before handover.

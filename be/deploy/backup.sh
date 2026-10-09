#!/bin/sh
# Daily backup: the database and the uploaded files.
#
# "Daily backups configured" is a line in the proposal, so it is a deliverable
# and not a nicety. Install it on the server with:
#   sudo ln -s /srv/jeewan/be/deploy/backup.sh /etc/cron.daily/jeewan-backup
#
# A backup nobody has restored is not a backup. DEPLOY.md has the restore, and
# it is worth doing once before handover.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT=${BACKUP_DIR:-/srv/jeewan/backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d)

mkdir -p "$OUT"
cd "$DIR"

# --clean so the dump can be restored over a live database without dropping it
# first; -Fc because a custom-format dump can be restored selectively.
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-recruit}" -Fc --clean \
	"${POSTGRES_DB:-recruit}" > "$OUT/db-$STAMP.dump"

# Media is CVs and certificates — losing them is worse than losing the database,
# because the database can be rebuilt from the dump and a CV cannot be rebuilt
# from anything.
docker run --rm -v jeewan_media:/media:ro -v "$OUT":/out alpine \
	tar czf "/out/media-$STAMP.tar.gz" -C /media .

find "$OUT" -name 'db-*.dump'      -mtime +"$KEEP" -delete
find "$OUT" -name 'media-*.tar.gz' -mtime +"$KEEP" -delete

echo "backed up to $OUT: db-$STAMP.dump, media-$STAMP.tar.gz"

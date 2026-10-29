#!/bin/sh
set -eu
umask 077
backup_dir=/opt/pawworldcare/backups
mkdir -p "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || exit 0
archive="$backup_dir/pwc-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
trap 'rm -f "$archive.partial"' EXIT
docker exec pwc-mongo sh -c 'exec mongodump --host 127.0.0.1:27017 --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --oplog --gzip --archive' > "$archive.partial"
test -s "$archive.partial"
mv "$archive.partial" "$archive"
find "$backup_dir" -maxdepth 1 -type f -name 'pwc-*.archive.gz' -mtime +7 -delete
printf '%s\n' 'MongoDB archive created; restore must be tested separately.'

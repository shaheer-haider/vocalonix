#!/bin/sh
#
# Off-box Postgres backups to Cloudflare R2.
#
# The box's Postgres volume was the only copy of every booking, contact and
# transcript the product has ever produced. A destroyed server, a bad migration
# or a mistyped `docker compose down -v` took all of it, and none of those are
# hypothetical — this deployment was rebuilt from scratch precisely because the
# servers were destroyed on purpose.
#
# Runs as a compose service rather than a host cron or systemd timer, because
# the whole configuration of this box comes from Infisical through the deploy
# and nothing is edited on the server. A timer would be server state that no
# pipeline owns.

set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PREFIX="${BACKUP_PREFIX:-postgres}"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# Checked up front and loudly. A backup job that silently does nothing is worse
# than no backup job, because it reads as protection that is not there.
[ -n "${R2_ACCESS_KEY_ID:-}" ]     || fail "R2_ACCESS_KEY_ID is not set. Backups are NOT running."
[ -n "${R2_SECRET_ACCESS_KEY:-}" ] || fail "R2_SECRET_ACCESS_KEY is not set. Backups are NOT running."
[ -n "${R2_ENDPOINT:-}" ]          || fail "R2_ENDPOINT is not set. Backups are NOT running."
[ -n "${R2_BUCKET:-}" ]            || fail "R2_BUCKET is not set. Backups are NOT running."
[ -n "${PGPASSWORD:-}" ]           || fail "PGPASSWORD is not set. Backups are NOT running."

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
# R2 ignores regions but rclone's S3 backend insists on one.
export RCLONE_CONFIG_R2_REGION=auto
# R2 does not implement multipart ETags the way rclone expects, so leave the
# integrity check to the size comparison rather than a checksum it cannot match.
export RCLONE_S3_NO_CHECK_BUCKET=true

run_backup() {
  stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  file="/tmp/${PREFIX}-${stamp}.dump"

  # Custom format, not plain SQL: it restores with pg_restore, supports
  # selective restore, and compresses itself.
  if ! pg_dump -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -Fc -f "$file" 2>/tmp/dump.err; then
    log "pg_dump failed: $(tr '\n' ' ' < /tmp/dump.err)"
    rm -f "$file"
    return 1
  fi

  size=$(wc -c < "$file")
  # A dump small enough to be an empty file or a truncated header would upload
  # perfectly happily and be useless. pg_dump's custom-format header alone is
  # larger than this, so anything under it is broken by definition.
  if [ "$size" -lt 1024 ]; then
    log "dump is only ${size} bytes — refusing to upload a broken backup"
    rm -f "$file"
    return 1
  fi

  # Verified before upload rather than after: pg_restore --list parses the
  # archive's table of contents, so a corrupt or truncated dump fails here
  # instead of at the moment it is actually needed.
  if ! pg_restore --list "$file" >/dev/null 2>/tmp/verify.err; then
    log "dump failed verification: $(tr '\n' ' ' < /tmp/verify.err)"
    rm -f "$file"
    return 1
  fi

  if ! rclone copyto "$file" "r2:${R2_BUCKET}/${PREFIX}/${PREFIX}-${stamp}.dump" 2>/tmp/upload.err; then
    log "upload failed: $(tr '\n' ' ' < /tmp/upload.err)"
    rm -f "$file"
    return 1
  fi

  rm -f "$file"
  log "uploaded ${PREFIX}-${stamp}.dump (${size} bytes)"

  # Pruned only after a successful upload, so a run that cannot reach R2 never
  # deletes the history it failed to add to.
  if rclone delete --min-age "${RETENTION_DAYS}d" "r2:${R2_BUCKET}/${PREFIX}/" 2>/tmp/prune.err; then
    remaining=$(rclone lsf "r2:${R2_BUCKET}/${PREFIX}/" 2>/dev/null | wc -l)
    log "retention ${RETENTION_DAYS}d applied, ${remaining} backup(s) held"
  else
    log "prune failed (backup itself is safe): $(tr '\n' ' ' < /tmp/prune.err)"
  fi
  return 0
}

log "starting: every ${INTERVAL_HOURS}h, ${RETENTION_DAYS}d retention, bucket ${R2_BUCKET}"

while true; do
  # A failed run must not kill the loop: a transient network blip would
  # otherwise stop backups permanently and quietly.
  run_backup || log "run failed; retrying at the next interval"
  sleep "$((INTERVAL_HOURS * 3600))"
done

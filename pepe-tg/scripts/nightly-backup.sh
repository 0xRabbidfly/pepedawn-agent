#!/bin/bash
#
# Nightly backup of production: the PGlite database, and the state files in
# src/data that git does not hold (lore ledger, social memory, backlog, room
# history, ...). Runs from cron on the droplet at 02:00 UTC, installed by
# scripts/setup-backup-cron.sh.
#
#   ./scripts/nightly-backup.sh           # the job: stop, copy, start, compress, verify, prune
#   ./scripts/nightly-backup.sh --check   # preflight only: stops nothing, writes nothing
#
# Why it stops the bot. PGlite is one process's Postgres data directory. A copy
# taken file by file while it writes is not guaranteed to open, so the copy is
# made with the bot stopped and nothing holding the directory - verified, not
# assumed. It is copied uncompressed (16s for 1.2GB) and the bot restarted
# before anything slow happens; compression runs afterwards at low priority.
# About a minute of downtime a night. This stop replaces PM2's old blind
# cron_restart at the same hour, which restarted the bot and backed up nothing:
# until 2026-09-26 production had no automatic backup at all, the newest copy
# was 36 days old, and src/data had never been backed up.
#
# Silent on success. A failure DMs MAINTAINER_OWNER_CHAT_ID, and the result is
# written to src/data/maintainer/backup-status.json, which the maintainer digest
# reports daily - so a job that stops running at all is noticed too.
#
# Restore: stop the bot (pm2 stop pepe-tg), move .eliza/.elizadb aside, then
#   tar -xzf <backups>/elizadb-backup-nightly-<ts>.tar.gz -C .eliza/
# and start it. start-bot.sh clears the lock file PGlite leaves behind.
#
# Settings, from the environment or pepe-tg/.env (see .env.example):
#   BACKUP_DIR       where archives go            (default: ../backups)
#   BACKUP_KEEP      nightly archives to keep     (default: 3)
#   BACKUP_PM2_APP   the PM2 app to stop/start    (default: pepe-tg)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd -P)
# cron runs with PATH=/usr/bin:/bin; pm2 needs node, the bot needs bun.
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

envval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]\$//"; }
setting() { local v="${!1:-}"; if [ -n "$v" ]; then echo "$v"; else envval "$1"; fi; }

APP=$(setting BACKUP_PM2_APP); APP=${APP:-pepe-tg}
DEST=$(setting BACKUP_DIR); DEST=${DEST:-$ROOT/../backups}
KEEP=$(setting BACKUP_KEEP); KEEP=${KEEP:-3}
TOKEN=$(setting TELEGRAM_BOT_TOKEN)
OWNER=$(setting MAINTAINER_OWNER_CHAT_ID)
DB=.eliza/.elizadb
STATUS=$ROOT/src/data/maintainer/backup-status.json
TS=$(date -u +%Y%m%d_%H%M%S)
SNAP=
STOPPED=0
DOWN_SECS=
READY_SECS=
LOGLINES=()

log() { local l="[$(date -u +%FT%TZ)] $*"; echo "$l"; LOGLINES+=("$l"); }

alert() {
  if [ -z "$TOKEN" ] || [ -z "$OWNER" ]; then log "no alert sent: TELEGRAM_BOT_TOKEN or MAINTAINER_OWNER_CHAT_ID missing"; return; fi
  local tail resp; tail=$(printf '%s\n' "${LOGLINES[@]: -8}")
  resp=$(curl -s --max-time 15 "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${OWNER}" --data-urlencode "text=$1

$(hostname) · scripts/nightly-backup.sh
${tail}")
  # Telegram answers 200 with ok:false for a bad chat id; only ok:true is delivered.
  if printf '%s' "$resp" | grep -q '"ok":true'; then
    log "alert sent to MAINTAINER_OWNER_CHAT_ID"
  else
    log "alert NOT delivered: $(printf '%s' "$resp" | grep -o '"description":"[^"]*"' || echo 'no response')"
  fi
}

# The status the maintainer digest reads. lastSuccess survives a failed night.
write_status() { # ok reason [file bytes]
  mkdir -p "$(dirname "$STATUS")"
  python3 - "$STATUS" "$1" "$2" "${3:-}" "${4:-}" "${DOWN_SECS:-}" "${READY_SECS:-}" <<'PY' || log "could not write status file"
import json, sys, time, os
path, ok, reason, file, size, down, ready = sys.argv[1:8]
try:
    prev = json.load(open(path))
except Exception:
    prev = {}
now = int(time.time() * 1000)
num = lambda s: int(s) if s.isdigit() else None
out = {"lastAttemptAt": now, "ok": ok == "true", "reason": reason or None,
       "lastSuccess": prev.get("lastSuccess")}
if ok == "true":
    out["lastSuccess"] = {"at": now, "file": file, "bytes": num(size),
                          "downtimeSec": num(down), "readySec": num(ready)}
tmp = path + ".tmp"
json.dump(out, open(tmp, "w"), indent=1)
os.replace(tmp, path)
PY
}

ensure_started() {
  [ "$STOPPED" = 1 ] || return 0
  STOPPED=0
  log "starting $APP"
  pm2 start "$APP" >/dev/null 2>&1 || { log "pm2 start $APP FAILED"; return 1; }
}

fail() {
  trap - INT TERM HUP
  log "FAILED: $1"
  ensure_started || true
  [ -n "$SNAP" ] && rm -rf -- "$SNAP"
  rm -f -- "$DEST"/*-nightly-"$TS".tar.gz.partial 2>/dev/null
  $CHECK_ONLY && exit 1
  write_status false "$1"
  alert "❌ PEPEDAWN nightly backup failed: $1"
  exit 1
}
trap 'ensure_started' EXIT
trap 'fail "interrupted by a signal"' INT TERM HUP

app_field() { # field -> value for $APP from pm2 jlist
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
apps = [a for a in json.load(sys.stdin) if a.get('name') == sys.argv[1]]
if apps:
    a = apps[0]; e = a.get('pm2_env', {})
    print({'status': e.get('status', ''), 'pid': a.get('pid', 0), 'outlog': e.get('pm_out_log_path', '')}[sys.argv[2]])
" "$APP" "$1"
}
tree() { echo "$1"; local c; for c in $(pgrep -P "$1"); do tree "$c"; done; }
any_alive() { local p; for p in $1; do kill -0 "$p" 2>/dev/null && return 0; done; return 1; }
# Open files in the database directory, by any process. Exact path or inside
# it: ".elizadb OLD" next door is not the database.
open_handles() {
  ls -l /proc/[0-9]*/fd 2>/dev/null |
    awk -v p="$ROOT/$DB" '{ t = $NF } t == p || index(t, p "/") == 1 { n++ } END { print n + 0 }'
}
ready_count() { local n; n=$(grep -c "\[SmartRouter\] Service ready" "$1" 2>/dev/null) || true; echo "${n:-0}"; }

# ── Preflight: everything that can fail without costing downtime ────────────
command -v pm2 >/dev/null || fail "pm2 not found on PATH"
command -v python3 >/dev/null || fail "python3 not found on PATH"
[ -d "$DB" ] || fail "no database at $ROOT/$DB"
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || fail "BACKUP_KEEP must be a positive integer, got '$KEEP'"
mkdir -p "$DEST" 2>/dev/null && [ -w "$DEST" ] || fail "backup dir $DEST is not writable"
DEST=$(cd "$DEST" && pwd)

exec 9>"$DEST/.nightly-backup.lock"
flock -n 9 || fail "another backup is already running"

STATE=$(app_field status)
[ -n "$STATE" ] || fail "pm2 has no app named $APP"

DB_KB=$(du -sk "$DB" | cut -f1)
NEED_KB=$(( DB_KB * 18 / 10 + 512 * 1024 ))   # snapshot + archive (~0.65x) + margin
FREE_KB=$(df -Pk "$DEST" | awk 'NR==2 {print $4}')
if $CHECK_ONLY; then
  echo "app $APP: $STATE · database $((DB_KB / 1024))MB · free $((FREE_KB / 1024))MB, need $((NEED_KB / 1024))MB"
  echo "dest $DEST · keep $KEEP · alerts $([ -n "$TOKEN" ] && [ -n "$OWNER" ] && echo "to MAINTAINER_OWNER_CHAT_ID" || echo "NOT configured")"
  echo "nightly archives: $(ls -1 "$DEST"/elizadb-backup-nightly-*.tar.gz 2>/dev/null | wc -l)"
  [ "$FREE_KB" -ge "$NEED_KB" ] || fail "not enough disk space"
  case "$STATE" in online|stopped) echo "preflight ok" ;; *) fail "$APP is $STATE" ;; esac
  exit 0
fi
[ "$FREE_KB" -ge "$NEED_KB" ] || fail "not enough disk space: $((FREE_KB / 1024))MB free, need $((NEED_KB / 1024))MB"

for stale in "$DEST"/.snapshot-*; do
  [ -d "$stale" ] && rm -rf -- "$stale" && log "removed a snapshot left by an interrupted run: $(basename "$stale")"
done
rm -f -- "$DEST"/*.tar.gz.partial 2>/dev/null

# ── Stop, copy, start ────────────────────────────────────────────────────────
log "backup $TS: $APP is $STATE, database $((DB_KB / 1024))MB"
case "$STATE" in
  online)
    PM2_PID=$(app_field pid)
    [[ "$PM2_PID" =~ ^[1-9][0-9]*$ ]] || fail "pm2 reports $APP online but gives no pid"
    PIDS=$(tree "$PM2_PID")
    OUTLOG=$(app_field outlog)
    READY_BEFORE=$(ready_count "$OUTLOG")
    DOWN_AT=$(date +%s)
    STOPPED=1
    pm2 stop "$APP" >/dev/null 2>&1 || fail "pm2 stop $APP failed"
    for _ in $(seq 1 30); do any_alive "$PIDS" || break; sleep 1; done
    any_alive "$PIDS" && fail "bot processes still alive 30s after pm2 stop"
    for _ in $(seq 1 15); do [ "$(open_handles)" = 0 ] && break; sleep 1; done
    [ "$(open_handles)" = 0 ] || fail "files in $DB still open after the bot exited"
    log "stopped in $(( $(date +%s) - DOWN_AT ))s; nothing holds the database"
    ;;
  stopped)
    log "$APP was already stopped: backing up as found, and leaving it stopped"
    [ "$(open_handles)" = 0 ] || fail "$APP is stopped but files in $DB are open"
    ;;
  *) fail "$APP is $STATE; not touching it" ;;
esac

SNAP="$DEST/.snapshot-$TS"
mkdir -p "$SNAP" \
  && cp -a "$DB" "$SNAP/.elizadb" \
  && cp -a src/data "$SNAP/data" \
  && sync \
  || fail "copy failed"
SNAP_FILES=$(find "$SNAP/.elizadb" -type f | wc -l)
[ "$SNAP_FILES" = "$(find "$DB" -type f | wc -l)" ] || fail "copy incomplete: $SNAP_FILES files, source has $(find "$DB" -type f | wc -l)"

if [ "$STATE" = online ]; then
  ensure_started || fail "could not restart $APP after the copy"
  STARTED_AT=$(date +%s)
  DOWN_SECS=$(( STARTED_AT - DOWN_AT ))
  log "copied $SNAP_FILES files; restart issued after ${DOWN_SECS}s down"
  # Up is not the same as ready: wait for the router to report in.
  for _ in $(seq 1 90); do
    [ "$(ready_count "$OUTLOG")" -gt "$READY_BEFORE" ] && break
    sleep 2
  done
  if [ "$(ready_count "$OUTLOG")" -gt "$READY_BEFORE" ]; then
    READY_SECS=$(( $(date +%s) - DOWN_AT ))
    log "ready again ${READY_SECS}s after the stop"
  else
    log "bot did not report ready within 180s of the restart"
    alert "⚠️ PEPEDAWN did not report ready within 3 minutes of the nightly backup restart. Check pm2 status $APP. The backup itself continues."
  fi
fi

# ── Compress, verify, prune: the bot is back, so none of this is downtime ───
DB_ARC="elizadb-backup-nightly-$TS.tar.gz"
ST_ARC="state-backup-nightly-$TS.tar.gz"
nice -n 19 ionice -c3 tar -czf "$DEST/$DB_ARC.partial" -C "$SNAP" .elizadb || fail "compressing the database failed"
nice -n 19 ionice -c3 tar -czf "$DEST/$ST_ARC.partial" -C "$SNAP" data || fail "compressing src/data failed"
gzip -t "$DEST/$DB_ARC.partial" && gzip -t "$DEST/$ST_ARC.partial" || fail "archive failed gzip integrity check"
IN_ARC=$(tar -tzf "$DEST/$DB_ARC.partial" | grep -vc '/$')
[ "$IN_ARC" = "$SNAP_FILES" ] || fail "database archive holds $IN_ARC files, snapshot had $SNAP_FILES"
mv -- "$DEST/$DB_ARC.partial" "$DEST/$DB_ARC" && mv -- "$DEST/$ST_ARC.partial" "$DEST/$ST_ARC" || fail "could not finalise archives"
( cd "$DEST" && sha256sum "$DB_ARC" "$ST_ARC" > "SHA256SUMS-nightly-$TS" ) || fail "could not write checksums"
rm -rf -- "$SNAP"; SNAP=
BYTES=$(stat -c %s "$DEST/$DB_ARC")
log "archived $DB_ARC ($((BYTES / 1024 / 1024))MB) and $ST_ARC; verified"

# Only nightly archives are pruned. Hand-made backups are never touched.
ls -1t "$DEST"/elizadb-backup-nightly-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  ots=$(basename "$old" | sed -E 's/^elizadb-backup-nightly-(.*)\.tar\.gz$/\1/')
  rm -f -- "$DEST/elizadb-backup-nightly-$ots.tar.gz" "$DEST/state-backup-nightly-$ots.tar.gz" "$DEST/SHA256SUMS-nightly-$ots"
  echo "[$(date -u +%FT%TZ)] pruned nightly backup $ots"
done

write_status true "" "$DB_ARC" "$BYTES"
log "done; $(ls -1 "$DEST"/elizadb-backup-nightly-*.tar.gz | wc -l) nightly backup(s) kept, $(df -Ph "$DEST" | awk 'NR==2 {print $4}') free"

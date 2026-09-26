#!/bin/bash
#
# Install the nightly production backup, scripts/nightly-backup.sh, in root's
# crontab on the droplet: 02:00 UTC, logging to logs/backup.log. Idempotent -
# run it again and nothing changes - and every other crontab entry is kept.
#
#   ssh -i ~/.ssh/pepedawn root@134.122.45.20 \
#     'cd /root/pepedawn-agent/pepe-tg && ./scripts/setup-backup-cron.sh'
#
# The job's preflight runs first under cron's own bare environment, so a
# missing pm2 or python3 shows up now rather than at 02:00. It refuses while
# PM2 still restarts the app on its own cron_restart: the two would collide at
# the same minute. Deploy an ecosystem.config.cjs without it first.
#
# This used to install a weekly job that generated weekly-backup.sh with the
# dev machine's paths baked in; it never ran on the droplet.

set -e
cd "$(dirname "$0")/.."
PROJECT_DIR=$(pwd -P)
MARKER="# pepedawn nightly backup (scripts/setup-backup-cron.sh)"
LINE="0 2 * * * cd $PROJECT_DIR && ./scripts/nightly-backup.sh >> $PROJECT_DIR/logs/backup.log 2>&1"

CRON_RESTART=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
print(next((a['pm2_env'].get('cron_restart') or '' for a in json.load(sys.stdin) if a.get('name') == 'pepe-tg'), ''))
" 2>/dev/null || true)
if [ -n "$CRON_RESTART" ]; then
  echo "❌ PM2 still restarts pepe-tg on cron_restart '$CRON_RESTART'."
  echo "   Deploy the ecosystem.config.cjs that drops it, then run this again."
  exit 1
fi

echo "Preflight, in cron's environment:"
env -i HOME="$HOME" PATH=/usr/bin:/bin SHELL=/bin/sh ./scripts/nightly-backup.sh --check \
  || { echo "❌ Preflight failed - nothing installed."; exit 1; }

mkdir -p logs
CURRENT=$(crontab -l 2>/dev/null || true)
if printf '%s\n' "$CURRENT" | grep -qxF "$LINE"; then
  echo "✅ Already installed."
else
  # Replace any older line for this job (a moved project dir, say); keep the rest.
  { printf '%s\n' "$CURRENT" | grep -vF "$MARKER" | grep -vF "scripts/nightly-backup.sh" || true
    echo "$MARKER"
    echo "$LINE"
  } | crontab -
  echo "✅ Installed."
fi
echo
crontab -l

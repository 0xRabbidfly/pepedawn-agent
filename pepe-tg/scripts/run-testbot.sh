#!/bin/bash
#
# Run PEPEDAWN locally against the TEST bot with v5 active.
#
#   ./scripts/run-testbot.sh           # v5 ENFORCED — the governor gates replies
#   ./scripts/run-testbot.sh --shadow  # observe only, do not change behaviour
#
# Enforce is the default here on purpose. Shadow mode exists so a change can be
# measured against real users without affecting them — that matters for the
# production rollout, not for a test bot with one tester. Here you want to feel
# the behaviour, not read a log about it.
#
# ElizaOS resolves .env from its working directory and start-bot.sh forces that
# back to pepe-tg, so shell exports are ignored for anything read via
# runtime.getSetting(). This script therefore edits .env in place and restores
# it on exit, however the run ends.
#
set -e
cd "$(dirname "$0")/.."

ENFORCE=true
[ "$1" = "--shadow" ] && ENFORCE=false

TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
WHO=$(curl -s --max-time 15 "https://api.telegram.org/bot${TOKEN}/getMe" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['username'] if d.get('ok') else 'UNKNOWN')")

if [ "$WHO" != "pepedawntest_bot" ]; then
  echo "❌ .env points at @${WHO}, not @pepedawntest_bot."
  echo "   Refusing to start — swap the TELEGRAM_BOT_TOKEN lines in .env."
  exit 1
fi

BK=$(mktemp)
cp .env "$BK"
restore() { cp "$BK" .env; rm -f "$BK"; echo; echo "[.env restored]"; }
trap restore EXIT INT TERM

python3 - "$ENFORCE" <<'PY'
import sys
enforce = sys.argv[1] == 'true'
s = open('.env').read()
s = s.replace('PERIODIC_CONTENT_ENABLED=true', 'PERIODIC_CONTENT_ENABLED=false')
s = s.rstrip('\n') + '\nV5_SHADOW=true\n'
if enforce:
    s += 'V5_ENFORCE=true\n'
open('.env', 'w').write(s)
PY

echo "🧪 PEPEDAWN test bot — @${WHO}"
echo "   mode:            $([ "$ENFORCE" = true ] && echo 'ENFORCE — v5 gates replies' || echo 'SHADOW — observe only')"
echo "   periodic content: disabled"
echo "   shadow log:      src/data/shadow-logs.jsonl"
echo "   Ctrl-C to stop; .env is restored automatically."
echo

bun run start

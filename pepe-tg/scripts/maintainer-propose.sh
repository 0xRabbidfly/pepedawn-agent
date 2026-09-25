#!/usr/bin/env bash
#
# Stage 1 of the maintainer loop, the proposing half: take the latest digest
# from the droplet and have Claude Code turn each directive into a fix on a
# branch. It never touches master and never deploys; a human reviews the
# branch and says "deploy".
#
#   pepe-tg/scripts/maintainer-propose.sh              # latest digest from the droplet
#   pepe-tg/scripts/maintainer-propose.sh brief.json   # a digest already on disk
#   pepe-tg/scripts/maintainer-propose.sh --dry-run    # show what would run, run nothing
#
# Runs where Claude Code runs (the dev machine), by hand or from cron. The work
# happens in a git worktree so the checkout you are sitting in is never
# disturbed. Tools are allow-listed: the agent can read, edit, run tests and
# the type checker, and push only to maintainer/* branches. Deploying,
# touching .env, or pushing master is not on the list, so it cannot happen by
# accident. When it finishes, the owner gets a DM with the branch and the
# agent's own summary, sent through the local bot token (the test bot).
#
# See docs/MAINTAINER.md and docs/AGENT_CONSTITUTION.md.

set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PEPE="$ROOT/pepe-tg"
DROPLET="${MAINTAINER_DROPLET:-root@134.122.45.20}"
KEY="${MAINTAINER_SSH_KEY:-$HOME/.ssh/pepedawn}"
LOGDIR="$PEPE/logs"; mkdir -p "$LOGDIR"

DRY=0; BRIEF=""
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) BRIEF="$a" ;; esac; done

# The DM goes through whatever bot the local .env holds, to the owner.
TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$PEPE/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
OWNER="${MAINTAINER_OWNER_CHAT_ID:-$(grep -E '^MAINTAINER_OWNER_CHAT_ID=' "$PEPE/.env" 2>/dev/null | cut -d= -f2- || true)}"
OWNER="${OWNER:-1013723568}"
dm() {
  [ -n "$TOKEN" ] || { echo "(no local bot token; not sending the DM)"; return 0; }
  python3 - "$TOKEN" "$OWNER" "$1" <<'PY'
import json,sys,urllib.request
token,chat,text=sys.argv[1],sys.argv[2],sys.argv[3][:4000]
req=urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage",
  data=json.dumps({"chat_id":chat,"text":text,"disable_web_page_preview":True}).encode(),
  headers={"Content-Type":"application/json"})
try: urllib.request.urlopen(req,timeout=20).read()
except Exception as e: print("dm failed:",e)
PY
}

if [ -z "$BRIEF" ]; then
  BRIEF="$(mktemp -t maintainer-brief.XXXXXX.json)"
  scp -q -i "$KEY" "$DROPLET:/root/pepedawn-agent/pepe-tg/src/data/maintainer/latest.json" "$BRIEF"
fi
[ -s "$BRIEF" ] || { echo "No digest at $BRIEF"; exit 1; }

DIRECTIVES=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1])).get('directives',[])))" "$BRIEF")
# /fb tickets are the one community channel the proposer acts on (5.18.0).
TICKETS=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1])).get('buildRequests',[])))" "$BRIEF")
GENERATED=$(python3 -c "import json,sys,datetime;g=json.load(open(sys.argv[1])).get('generatedAt',0);print(datetime.datetime.utcfromtimestamp(g/1000).strftime('%d %b %H:%M UTC'))" "$BRIEF" 2>/dev/null || echo "?")
if [ "$DIRECTIVES" = "0" ] && [ "$TICKETS" = "0" ]; then
  echo "No directives and no tickets in the digest from $GENERATED; nothing to propose."
  [ "$DRY" = 1 ] || dm "🛠 Maintainer: digest from $GENERATED had no directives and no /fb tickets. Nothing proposed."
  exit 0
fi

# Do not propose the same digest twice: cron runs daily, digests may not.
STATE="$LOGDIR/maintainer-propose.state"
if [ "$DRY" = 0 ] && [ -f "$STATE" ] && grep -qx "$GENERATED" "$STATE"; then
  echo "Digest from $GENERATED was already proposed; nothing to do."
  exit 0
fi

command -v claude >/dev/null || { echo "claude (Claude Code CLI) is not on PATH"; exit 1; }

STAMP="$(date -u +%Y-%m-%d-%H%M)"
BRANCH="maintainer/$STAMP"
WT="$ROOT/.worktrees/maintainer-$STAMP"
PROMPT="$(cat "$PEPE/docs/MAINTAINER_PROMPT.md")

## The digest

$(cat "$BRIEF")
"

if [ "$DRY" = 1 ]; then
  echo "Would create branch $BRANCH from origin/master in $WT"
  echo "Digest from $GENERATED: $DIRECTIVES directive(s)"
  echo "Prompt: $(printf '%s' "$PROMPT" | wc -c) chars; first directive:"
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['directives'][0];print('  ',d['who'],'-',d['summary'] or d['turn']['text'][:100])" "$BRIEF"
  exit 0
fi

cd "$ROOT"
git fetch -q origin
git worktree add -q -B "$BRANCH" "$WT" origin/master
echo "Branch $BRANCH in $WT ($DIRECTIVES directive(s) from $GENERATED)"

RUNLOG="$LOGDIR/maintainer-propose-$STAMP.log"
cd "$WT/pepe-tg"
set +e
claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools \
    "Read" "Glob" "Grep" "Edit" "Write" \
    "Bash(bun test:*)" "Bash(npx tsc:*)" "Bash(bun -e:*)" "Bash(bun scripts/anniversary-preview.ts:*)" \
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git add:*)" "Bash(git commit:*)" \
    "Bash(git push origin maintainer/*)" \
  --output-format text > "$RUNLOG" 2>&1
CODE=$?
set -e
echo "$GENERATED" >> "$STATE"

COMMITS=$(git log --oneline "origin/master..$BRANCH" 2>/dev/null | wc -l | tr -d ' ')
SUMMARY="$(tail -c 2500 "$RUNLOG")"

# Tickets the branch carries move to "review" on the droplet, where the
# backlog lives. Status follows the work: this is the first of its two moves;
# the bot makes the second (shipped) when the commit is deployed.
MOVED=""
if [ "$COMMITS" != "0" ]; then
  for T in $(git log --format=%B "origin/master..$BRANCH" 2>/dev/null | grep -ioE '^\s*Ticket:\s*KEK-[0-9]+' | grep -ioE 'KEK-[0-9]+' | tr '[:lower:]' '[:upper:]' | sort -u); do
    if [ "$DRY" = 1 ]; then echo "(dry run) would mark $T review"; continue; fi
    if ssh -i "$KEY" -o BatchMode=yes "$DROPLET" "export PATH=\"\$HOME/.bun/bin:\$PATH\"; cd /root/pepedawn-agent/pepe-tg && bun scripts/backlog-status.ts $T review maintainer" >/dev/null 2>&1; then
      MOVED="$MOVED $T"
    else
      echo "could not mark $T review on the droplet"
    fi
  done
fi

if [ "$CODE" = 0 ] && [ "$COMMITS" != "0" ]; then
  MSG="🛠 Maintainer proposed $COMMITS commit(s) on $BRANCH for $DIRECTIVES directive(s) and $TICKETS ticket(s) (digest $GENERATED).${MOVED:+
Tickets now in review:$MOVED}

Review:  git log origin/master..$BRANCH --stat
Deploy:  git merge --ff-only $BRANCH && pepe-tg/scripts/deploy.sh

$SUMMARY"
else
  MSG="🛠 Maintainer ran on the digest from $GENERATED ($DIRECTIVES directive(s)) and proposed nothing (exit $CODE, $COMMITS commits). Log: $RUNLOG

$SUMMARY"
fi
echo "$MSG"
dm "$MSG"
echo
echo "Tidy with:  git worktree remove $WT"

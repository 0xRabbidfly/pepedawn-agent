#!/usr/bin/env bash
#
# Stage 1 of the maintainer loop, the proposing half: take the latest digest
# from the droplet and have Claude Code turn each directive into a fix on a
# branch. It never touches master and never deploys; a human reviews the
# branch and says "deploy".
#
#   pepe-tg/scripts/maintainer-propose.sh            # latest digest from the droplet
#   pepe-tg/scripts/maintainer-propose.sh brief.json # a digest already on disk
#
# Runs where Claude Code runs (the dev machine). The work happens in a git
# worktree so the checkout you are sitting in is never disturbed. Tools are
# allow-listed: the agent can read, edit, run tests and the type checker, and
# push only to maintainer/* branches. Deploying, touching .env, or pushing
# master is not on the list, so it cannot happen by accident.
#
# See docs/MAINTAINER.md and docs/AGENT_CONSTITUTION.md.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PEPE="$ROOT/pepe-tg"
DROPLET="${MAINTAINER_DROPLET:-root@134.122.45.20}"
KEY="${MAINTAINER_SSH_KEY:-$HOME/.ssh/pepedawn}"
BRIEF="${1:-}"

if [ -z "$BRIEF" ]; then
  BRIEF="$(mktemp -t maintainer-brief.XXXXXX.json)"
  scp -q -i "$KEY" "$DROPLET:/root/pepedawn-agent/pepe-tg/src/data/maintainer/latest.json" "$BRIEF"
fi
[ -s "$BRIEF" ] || { echo "No digest at $BRIEF"; exit 1; }

DIRECTIVES=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1])).get('directives',[])))" "$BRIEF")
if [ "$DIRECTIVES" = "0" ]; then
  echo "No directives in the digest; nothing to propose."
  exit 0
fi

command -v claude >/dev/null || { echo "claude (Claude Code CLI) is not on PATH"; exit 1; }

STAMP="$(date -u +%Y-%m-%d-%H%M)"
BRANCH="maintainer/$STAMP"
WT="$ROOT/.worktrees/maintainer-$STAMP"

cd "$ROOT"
git fetch -q origin
git worktree add -q -B "$BRANCH" "$WT" origin/master
cp "$BRIEF" "$WT/pepe-tg/.maintainer-brief.json"
echo "Branch $BRANCH in $WT ($DIRECTIVES directive(s))"

PROMPT="$(cat "$PEPE/docs/MAINTAINER_PROMPT.md")

## The digest

$(cat "$BRIEF")
"

cd "$WT/pepe-tg"
claude -p "$PROMPT" \
  --permission-mode acceptEdits \
  --allowedTools \
    "Read" "Glob" "Grep" "Edit" "Write" \
    "Bash(bun test:*)" "Bash(npx tsc:*)" "Bash(bun -e:*)" "Bash(bun scripts/anniversary-preview.ts:*)" \
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git add:*)" "Bash(git commit:*)" \
    "Bash(git push origin maintainer/*)" \
  --output-format text

rm -f "$WT/pepe-tg/.maintainer-brief.json"
echo
echo "Done. Review with:  git log origin/master..$BRANCH --stat"
echo "Tidy with:          git worktree remove $WT"

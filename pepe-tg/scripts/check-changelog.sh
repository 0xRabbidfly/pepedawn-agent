#!/bin/sh
# Every released version must be written down.
#
# Between 5.5.2 and 5.6.4, seven versions were tagged and shipped with no
# CHANGELOG entry at all, and nobody noticed until the file was read a week
# later. The constitution already required the entry; nothing enforced it, and
# a rule with no teeth is the one that gets skipped on the busy day.
#
# Two checks, both cheap enough to run on every commit:
#
#   1. The version in package.json has a `## [x.y.z]` heading. This fires on
#      the commit that bumps the version - the moment the entry is missing and
#      the moment the author still remembers why it changed.
#   2. Every git tag at or above FLOOR has a heading. That catches the other
#      shape: a release tagged from a commit whose entry was never written.
#      Tags below FLOOR predate the convention and are left alone.
#
# Usage: scripts/check-changelog.sh [--floor X.Y.Z]

set -e

FLOOR="5.5.3"
[ "$1" = "--floor" ] && FLOOR="$2"

DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHANGELOG="$DIR/CHANGELOG.md"
PACKAGE="$DIR/package.json"

[ -f "$CHANGELOG" ] || { echo "CHANGELOG.md not found at $CHANGELOG"; exit 1; }
[ -f "$PACKAGE" ]   || { echo "package.json not found at $PACKAGE"; exit 1; }

has_entry() {
  grep -q "^## \[$1\]" "$CHANGELOG"
}

# True when $1 >= $2, compared as version numbers.
at_least() {
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$2" ]
}

VERSION="$(grep -m1 '"version"' "$PACKAGE" | tr -d ' ",' | cut -d: -f2)"

if ! has_entry "$VERSION"; then
  echo ""
  echo "CHANGELOG.md has no entry for version $VERSION (from package.json)."
  echo ""
  echo "  Add one at the top of pepe-tg/CHANGELOG.md:"
  echo ""
  echo "      ## [$VERSION] - $(date +%F)"
  echo ""
  echo "      ### Fixed | Added | Changed"
  echo ""
  echo "      - **What was wrong, in one bold sentence.** Then why it happened,"
  echo "        and what the fix actually does."
  echo ""
  echo "  Constitution SS V. Skipping it is how 5.5.3 through 5.6.4 went"
  echo "  undocumented."
  echo ""
  exit 1
fi

# The tag sweep needs a git repo to ask; skip it where there is none.
if command -v git >/dev/null 2>&1 && git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
  MISSING=""
  for tag in $(git -C "$DIR" tag --merged HEAD 2>/dev/null); do
    v="${tag#v}"
    case "$v" in
      *[!0-9.]*) continue ;;
    esac
    at_least "$v" "$FLOOR" || continue
    has_entry "$v" || MISSING="$MISSING $tag"
  done

  if [ -n "$MISSING" ]; then
    echo ""
    echo "Released tags with no CHANGELOG entry:$MISSING"
    echo ""
    echo "  Each one shipped to the community. Write them up, or raise the"
    echo "  floor deliberately: scripts/check-changelog.sh --floor X.Y.Z"
    echo ""
    exit 1
  fi
fi

echo "CHANGELOG covers $VERSION and every tag since $FLOOR"
exit 0

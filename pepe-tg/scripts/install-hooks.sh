#!/bin/sh
# Install the repo's git hooks into .git/hooks.
#
# .git/hooks is not version-controlled, so a hook only exists on the machine
# that made it. The changelog gate is the reason this script exists: it was
# added after seven releases shipped undocumented, and a guard that lives on
# one laptop would have let exactly that happen again on any other.
#
# Idempotent: run it after cloning, and after any change to the hooks.

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"
MARKER="# --- changelog gate (installed by pepe-tg/scripts/install-hooks.sh) ---"

[ -d "$ROOT/.git" ] || { echo "Not a git repository: $ROOT"; exit 1; }

if [ ! -f "$HOOK" ]; then
  printf '#!/bin/sh\n' > "$HOOK"
  chmod +x "$HOOK"
  echo "Created $HOOK"
fi

if grep -qF "$MARKER" "$HOOK"; then
  echo "Changelog gate already installed."
else
  {
    echo ""
    echo "$MARKER"
    echo 'if [ -x pepe-tg/scripts/check-changelog.sh ]; then'
    echo '  pepe-tg/scripts/check-changelog.sh || exit 1'
    echo 'fi'
    echo "# --- end changelog gate ---"
  } >> "$HOOK"
  echo "Installed the changelog gate into $HOOK"
fi

chmod +x "$HOOK"
echo "Done. Verify with: pepe-tg/scripts/check-changelog.sh"

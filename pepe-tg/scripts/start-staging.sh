#!/bin/bash
#
# Run PEPEDAWN locally as a staging bot.
#
# Why local rather than a second process on the droplet: prod has ~287MB RAM
# free against a 1.3GB database, so a second instance there is not safe. Running
# on your machine also keeps staging fully isolated from the live community.
#
# One-time setup:
#   1. Open Telegram, message @BotFather, send /newbot, follow the prompts.
#   2. Copy the token it gives you.
#   3. cp .env .env.staging
#   4. Edit .env.staging and set TELEGRAM_BOT_TOKEN to the NEW token.
#   5. Add your test bot to a private test group.
#
# Then:
#   ./scripts/start-staging.sh
#
# Staging differs from prod in three ways, all set below:
#   - its own database directory, so it cannot touch prod data
#   - its own telemetry/shadow output directory
#   - V5_SHADOW=true, so the v5 axes record decisions while the existing
#     pipeline still drives actual replies
#
set -e

cd "$(dirname "$0")/.."

ENV_FILE=".env.staging"
STAGING_DIR=".staging"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found."
  echo
  echo "Create it with a SEPARATE bot token from @BotFather:"
  echo "    cp .env $ENV_FILE"
  echo "    \$EDITOR $ENV_FILE      # set TELEGRAM_BOT_TOKEN to the new token"
  echo
  exit 1
fi

# Refuse to run if staging is pointed at the production bot. Two processes on
# one token cause update-polling conflicts and duplicate replies to the live
# group — exactly the failure this script exists to avoid.
PROD_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
STAGE_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "$STAGE_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN is empty in $ENV_FILE"
  exit 1
fi

if [ "$PROD_TOKEN" = "$STAGE_TOKEN" ]; then
  echo "❌ $ENV_FILE uses the SAME bot token as .env (production)."
  echo "   Running both would double-reply to the live community group."
  echo "   Get a separate token from @BotFather and set it in $ENV_FILE."
  exit 1
fi

mkdir -p "$STAGING_DIR/data"

echo "🧪 Starting PEPEDAWN staging"
echo "   env:      $ENV_FILE"
echo "   database: $STAGING_DIR/elizadb   (isolated from production)"
echo "   shadow:   $STAGING_DIR/data      (V5_SHADOW=true)"
echo

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export PGLITE_DATA_DIR="$(pwd)/$STAGING_DIR/elizadb"
export V5_SHADOW=true
export V5_SHADOW_DIR="$(pwd)/$STAGING_DIR/data"
export NODE_ENV=development

exec bun run start

# Testing PEPEDAWN against the test bot

Local development is **already** wired to a separate Telegram bot. There is no
staging harness to set up.

| | Token id | Bot | Channel |
|---|---|---|---|
| **Local** (`pepe-tg/.env`) | `8216356616` | **@pepedawntest_bot** (PEPEDAWN-TEST) | `1013723568` — DM with @rabbidfly |
| **Production** (droplet) | `8462258734` | @pepedawn_bot (PEPEDAWN) | `-1001586933558` — official FAKERARE channel |

Both tokens are recorded in the comment above `TELEGRAM_BOT_TOKEN` in
`pepe-tg/.env`; swapping which line is commented switches environments.

Known channel ids:

| Id | What |
|---|---|
| `-1001586933558` | Official FAKERARE channel (production) |
| `-1003103978656` | Private PEPEDAWN group |
| `1013723568` | DM with @rabbidfly (local default) |
| `-811140105` | BG group |

## Confirming what a token or channel is, before trusting it

Both calls are read-only — they neither post nor consume updates.

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<ID>"
```

Run `getMe` before any local run that can send. A token beginning `8462…` is
production; `8216…` is the test bot.

## Do not poll getUpdates by hand

`getUpdates` **consumes** the bot's queue. Calling it while testing will eat the
very message you were about to send through the bot, and the bot will then see
nothing. Read results from the shadow log instead.

## Running with v5 shadow mode

Shadow mode observes and records; it never sends. Two settings matter, and both
must be in `pepe-tg/.env` — ElizaOS resolves `.env` from its working directory
and `scripts/start-bot.sh` forces the working directory back to `pepe-tg`, so
shell `export`s are ignored.

```bash
# in pepe-tg/.env
V5_SHADOW=true
PERIODIC_CONTENT_ENABLED=false   # otherwise the hourly showcase posts to the DM
```

Then `bun run start`, message the bot in Telegram, and read:

```
src/data/shadow-logs.jsonl   # what v5 would have decided, per message
src/data/room-history.json   # persisted conversation state
```

Compare against production behaviour with:

```bash
bun scripts/replay-cadence.ts <dir-with-telemetry-jsonl>
```

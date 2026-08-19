# PEPEDAWN — working notes

ElizaOS Telegram bot for the Fake Rares community. Source lives in `pepe-tg/`.
This file is the hard-won stuff: things that are wrong, non-obvious, or
dangerous, and that cost real time to discover.

---

## 🔴 Read before running anything that can send

**There are two bots. Check which one you have before you start a process.**

| | Token id | Bot | Channel |
|---|---|---|---|
| **Local** `pepe-tg/.env` | `8216356616` | **@pepedawntest_bot** | `1013723568` — DM with @rabbidfly |
| **Production** droplet | `8462258734` | @pepedawn_bot | `-1001586933558` — official FAKERARE channel |

Both are recorded in a comment directly above `TELEGRAM_BOT_TOKEN` in
`pepe-tg/.env`. Swapping which line is commented switches environments.

Confirm identity before trusting it — both calls are read-only:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<ID>"
```

Known channels: `-1001586933558` official FAKERARE · `-1003103978656` private
PEPEDAWN group · `1013723568` DM with @rabbidfly · `-811140105` BG group.

**Never call `getUpdates` by hand.** It consumes the bot's queue — a queued user
message was lost this way. Let the bot poll; read results from logs. (Telegram
queues updates ~24h, so a message sent while the bot is off is processed on the
next boot.)

**Testing is local.** Running `bun run start` locally against @pepedawntest_bot
is the full test loop. Deploying to DigitalOcean is *not* required to test.

---

## Environment gotchas

- **ElizaOS resolves `.env` from its working directory**, and
  `scripts/start-bot.sh` does `cd "$(dirname "$0")/.."` — forcing cwd back to
  `pepe-tg`. Shell `export`/`unset` are therefore **ignored**. Any config change
  must be written into `pepe-tg/.env` itself. This defeated an entire staging
  harness before it was understood.
- **`PERIODIC_CONTENT_ENABLED=true` in local `.env`.** Booting locally posts an
  hourly card showcase to whatever `TELEGRAM_CHANNEL_ID` points at. Set it
  `false` for test runs, or expect posts in the DM.
- **`periodicContent.sendToChannels()` swallows failures** — it logs
  `Failed to send to channel` at warn level and does not rethrow, so
  `Posted periodic …` appears whether or not the send worked. Absence of the
  warning is the only reliable success signal.
- **PGlite allows one process.** `scripts/query-db.js` refuses to run while the
  bot is up; its process check false-positives on unrelated processes
  (e.g. `openclaw-gateway`), so verify with `ps` before believing it.
- **Prod `/tmp` is a 984MB tmpfs.** Use `/root` for anything large. Disk is 24GB
  with ~9GB free against a 1.3GB database.

---

## Production

DigitalOcean droplet `134.122.45.20`, `ssh -i ~/.ssh/pepedawn root@…`,
project at `/root/pepedawn-agent/pepe-tg`, PM2 app `pepe-tg`, Bun runtime.
Deploy with `./scripts/deploy.sh`.

- **Nightly `cron_restart` at 02:00**, plus `pm2 delete` on every deploy. Any
  in-memory state is lost daily — this is why conversation history must persist.
- ~300 restarts ≈ one per day of uptime. Not a crash loop.
- `deploy.sh` deletes `bun.lockb`, but the real lockfile is `bun.lock` — so it
  survives and builds are reproducible **by accident**. Don't "fix" that line.
- No rollback path: `git reset --hard && git pull` only moves forward.
- ⚠️ **A GitHub PAT is stored in plaintext** in the droplet's `.git/config`
  remote URL. Rotate it and switch to a deploy key.

---

## Architecture notes

- **Message path:** Telegram → `packages/plugin-telegram-fakerares/messageManager.ts`
  → `EventType.MESSAGE_RECEIVED` → `src/plugins/fakeRaresPlugin.ts` → SmartRouter
  → KnowledgeOrchestrator. Bootstrap is the fallback, gated by the
  `message.metadata.__handledByCustom` sentinel (set in ~9 places).
- **`TelemetryService` writes JSONL** to `pepe-tg/src/data/`:
  `token-logs`, `conversation-logs`, `lore-query-logs`, `smart-router-logs`,
  `command-logs`. These are the only durable analytics — PM2 logs rotate and
  leave multi-month holes.
- **Corpus** is one PGlite store, `memories` + `embeddings`, all
  `text-embedding-3-small` @1536. Four logical sources: Telegram archive (frozen
  2025-10-11), card visual facts (877 cards × 5 blocks), wiki markdown, and user
  memories.
- **Provenance is lost at ingest** — every fragment is stamped
  `rag-service-fragment-sync`, so `loreRetrieval.ts` re-derives the source with
  content heuristics that are **22% wrong** (4,344 Telegram fragments labelled
  `wiki`, drawing 2.0 weight instead of 0.5).

See `pepe-tg/telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md` for the redesign and
the measurements behind it, and `pepe-tg/docs/TESTING_WITH_TEST_BOT.md` for the
test loop.

---

## Conventions

- `bun test src/__tests__/` — **11 failures are pre-existing** (scaffolding tests
  expecting `tsup.config.ts`, `dist/`, README strings). Compare against master
  before blaming your change.
- `npx tsc --noEmit` reports ~46 errors, also pre-existing. Same rule.
- Commits: `feature:` / `bug:` / `data:` / `design:` / `tests:` prefixes.
- Work on a branch; `master` is what prod pulls.

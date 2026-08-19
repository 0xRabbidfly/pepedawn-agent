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

**Testing is local.** `./scripts/run-testbot.sh` runs against @pepedawntest_bot
with v5 **enforced** and periodic content off, and restores `.env` on exit.
Deploying to DigitalOcean is *not* required to test.

`V5_ENFORCE=true` makes the cadence governor binding; `V5_SHADOW=true` only
records. Shadow exists for the production rollout — measuring a change against
real users without affecting them. On the test bot, enforce is the default,
because there you want to feel the behaviour rather than read a log.

---

## 🔴 Never kill the bot with pkill

The local PGlite database corrupts if the process is killed mid-shutdown or if
the lock file is removed while it is still releasing. Once broken, even
`CREATE SCHEMA IF NOT EXISTS migrations` aborts inside the WASM and the bot will
not start. This has happened more than once.

**Always:**

```bash
./scripts/kill-bot.sh       # SIGTERM, waits 10s, force-kills only as last resort
./scripts/safe-restart.sh   # stop + verify + start
```

**Never:**

- `pkill -f eliza` or `kill -9` on the bot
- `rm .eliza/.elizadb/postmaster.pid` while a process may still hold it
  (`start-bot.sh` clears genuinely stale locks on its own)
- opening PGlite directly while the bot runs — use `scripts/query-db.js`, which
  refuses when it detects a running bot

**Recovery** (also in README.md "Database corruption"):

```bash
./scripts/kill-bot.sh
mv .eliza/.elizadb .eliza/.elizadb.broken-$(date +%F)   # keep it, do not delete
tar -xzf ../backups/elizadb-backup-*.tar.gz -C .eliza/
./scripts/start-bot.sh
```

Restorable copies live in `pepe-tg/.eliza/` (`.elizadb OLD`,
`.elizadb post embedding`) and `backups/elizadb-backup-*.tar.gz`. Production is
a separate database on the droplet and is unaffected by local corruption — it
can also be pulled down as a last resort.

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

## Project rules (these already exist — follow them)

Two files predate this one and remain authoritative:

- **`.cursor/rules/production-prep.mdc`** — the release checklist, invoked as
  `@production-prep [major|minor|patch]`.
- **`.specify/memory/constitution.md`** — project principles, v1.0.0.

The parts that bite most often:

- ✅ **Git commands may be run directly** — commits, branches, tags. (The old
  "never execute git commands" rule was lifted 2026-08-19.) Pushing to `master`
  is what production pulls, so say so when you do it.
- **`.env.example` is mandatory upkeep.** Any new environment variable must be
  documented there in the same change.
- **`CHANGELOG.md` accompanies every behavioural change** (constitution §V,
  Keep a Changelog format). Version bumps follow SemVer.
- **`.git/hooks/pre-commit` enumerates test files explicitly.** New test files
  must be added or they never run in the hook.
- **Deprecations need a migration note and a grace window** (constitution §III) —
  chat commands are a public contract. See `src/config/deprecatedCommands.ts`.
- **Secrets never in the repo** (constitution §II); avoid logging secrets or PII.
- New command? Update the `/help` handler *and* add a tip to `periodicContent.ts`.

## Conventions

- `bun test src/__tests__/` — **11 failures are pre-existing** (scaffolding tests
  expecting `tsup.config.ts`, `dist/`, README strings). Compare against master
  before blaming your change.
- `npx tsc --noEmit` reports ~46 errors, also pre-existing. Same rule.
- Commits: `feature:` / `bug:` / `data:` / `design:` / `tests:` prefixes.
- Work on a branch; `master` is what prod pulls.
- Automated tests are *optional* per the constitution, but verification of
  critical chat flows is expected.

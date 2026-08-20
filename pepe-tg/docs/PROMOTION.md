# Promotion — local → master → production

The path a change takes to reach the community, and the things about it that
are not obvious. Everything here has been verified against the live system;
where a step has bitten us, the reason is recorded rather than just the rule.

Production is DigitalOcean droplet `134.122.45.20`, project at
`/root/pepedawn-agent/pepe-tg`, PM2 app `pepe-tg`, Bun runtime.

---

## 0. Before you start: which bot am I holding?

`pepe-tg/.env` decides this, and getting it wrong posts to the real channel.

| | Token id | Bot | Channel |
|---|---|---|---|
| Local | `8216356616` | @pepedawntest_bot | `1013723568` (DM with @rabbidfly) |
| Production | `8462258734` | @pepedawn_bot | `-1001586933558` (official FAKERARE) |

Confirm rather than assume — both calls are read-only:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
curl -s "https://api.telegram.org/bot<TOKEN>/getChat?chat_id=<ID>"
```

---

## 1. Prepare the change

Mandatory upkeep, per `.specify/memory/constitution.md`:

- [ ] **`CHANGELOG.md`** — every behavioural change, Keep a Changelog format.
- [ ] **`pepe-tg/.env.example`** — every new environment variable, documented
      in the same change.
- [ ] **`package.json` version** — SemVer.
- [ ] **`.git/hooks/pre-commit`** — new test files must be added by name. The
      hook enumerates tests explicitly, so a file that is not listed **never
      runs in the hook** and can rot silently.
- [ ] `/help` handler and a `periodicContent.ts` tip, if you added a command.

## 2. Verify locally

```bash
bun test src/__tests__/          # expect 0 fail
npx tsc --noEmit | grep -c "error TS"
```

**Both are now zero, as of 5.4.0.** They used to be a baseline you compared
against — 11 test failures and 37 type errors, all "pre-existing" — and that
baseline hid three live bugs, including a provider whose output never reached a
prompt. Do not let it grow back:

| Check | Expected |
|---|---|
| `bun test src/__tests__/` | **0 fail** (670 pass, 7 skip) |
| `npx tsc --noEmit` | **0 errors** |
| `.git/hooks/pre-commit` | **0 fail** (the curated list) |

If a number is not zero, it is your change — not the baseline.

## 3. Commit and tag

Prefixes: `feature:` / `bug:` / `data:` / `design:` / `tests:`.

```bash
git add -A
git commit                       # pre-commit hook runs the curated suite
git tag -a vX.Y.Z -m "vX.Y.Z - short summary"
```

Git commands may be run directly; the old "never execute git" rule was lifted
2026-08-19.

## 4. Push to master

> **`master` is what production pulls.** Pushing it is the act of publishing.
> Say so out loud when you do it.

```bash
git push origin master --follow-tags
```

### Credentials

The dev machine pushes over **SSH**, using a dedicated key:

```
remote      git@github.com:0xRabbidfly/pepedawn-agent.git
key         ~/.ssh/github_pepedawn        (ed25519, registered on GitHub)
ssh config  Host github.com → IdentityFile ~/.ssh/github_pepedawn, IdentitiesOnly yes
```

`IdentitiesOnly yes` matters: without it ssh also offers `~/.ssh/pepedawn`, the
droplet key, which GitHub rejects. Verify with `ssh -T git@github.com` — it
should greet you by username.

Two things that cost time before this was set up, worth keeping in mind:

- **Reads are anonymous.** The repo is public, so `git fetch` works with no
  credentials at all. Only writes need auth, so a machine with no credential
  looks healthy until the first push. A stale `origin/master` also reads as
  divergence when it is only an unfetched ref — **always `git fetch` before
  concluding anything about remote state.**
- The droplet holds a **plaintext PAT in its `.git/config` remote URL**, which
  is how it pulls. Do not copy it to another machine to work around a missing
  credential; it is already flagged for rotation and a deploy key.

If you are ever on a machine with no push credential and the change must ship,
you can bundle it and let the droplet push with the credential it already has,
which keeps the PAT where it is:

```bash
git bundle create /tmp/x.bundle master vX.Y.Z --not origin/master
scp -i ~/.ssh/pepedawn /tmp/x.bundle root@134.122.45.20:/root/
ssh -i ~/.ssh/pepedawn root@134.122.45.20 '
  cd /root/pepedawn-agent
  git fetch /root/x.bundle "refs/heads/master:refs/remotes/bundle/master" "refs/tags/vX.Y.Z:refs/tags/vX.Y.Z"
  git push origin refs/remotes/bundle/master:refs/heads/master
  git push origin refs/tags/vX.Y.Z
  git update-ref -d refs/remotes/bundle/master; rm -f /root/x.bundle'
```

## 5. Deploy

```bash
./scripts/deploy.sh
```

It SSHes in, `git reset --hard && git pull`, installs, rebuilds, restarts PM2.

**The script's last step used to hang forever.** It ended with `pm2 logs
--lines 10`, and `pm2 logs` tails by default — so the deploy never returned and
left an SSH session open until someone noticed and Ctrl-C'd it. Fixed in 5.3.1
with `--nostream`. If you see a deploy "still running" long after the release
landed, check for this shape of bug before assuming the deploy failed: verify
against the droplet, not against the script's exit.

- **There is no rollback.** `reset --hard && pull` only moves forward. To undo,
  revert on master and deploy again.
- `deploy.sh` deletes `bun.lockb`, but the real lockfile is `bun.lock` — so it
  survives and builds are reproducible **by accident**. Do not "fix" that line.
- **`.env` is NOT deployed.** Any new variable must be added to the droplet's
  `pepe-tg/.env` by hand, or the feature silently stays off. Adding it to
  `.env.example` does nothing for production.
- **Non-interactive SSH does not load the profile**, so `bun` is not on PATH.
  Prefix remote commands with `export PATH="$HOME/.bun/bin:$PATH"`.

## 6. Verify production

```bash
ssh -i ~/.ssh/pepedawn root@134.122.45.20 \
  'export PATH="$HOME/.bun/bin:$PATH"; cd /root/pepedawn-agent && \
   git log --oneline -1 && git describe --tags && pm2 status pepe-tg'
```

Then confirm the bot answers in the real channel. ~300 restarts is roughly one
per day of uptime — a **nightly `cron_restart` at 02:00**, plus `pm2 delete` on
every deploy. It is not a crash loop. Any in-memory state is lost daily, which
is why conversation history must persist to disk.

---

## Database safety during promotion

Production runs its own PGlite database; local corruption cannot reach it. But
a deploy restarts the process, and **PGlite corrupts if killed mid-shutdown**.

- Never `pkill -f eliza` or `kill -9`. Use `./scripts/kill-bot.sh` and
  `./scripts/safe-restart.sh`.
- Never open the database with a tool resolved from outside the project. A
  script run from `/root` picked up pglite **0.5.5** from the global cache
  against a **0.3.12** data directory and failed to initialise. Use
  `scripts/query-db.js` from within `pepe-tg`, which resolves local
  `node_modules`.
- Back up before any destructive data work, and keep the archive:
  `tar -czf /root/elizadb-backup-$(date +%F-%H%M).tar.gz .eliza/.elizadb`.
  Prod `/tmp` is a 984MB tmpfs — write large files to `/root`.

## Never call `getUpdates` by hand

It consumes the bot's own update queue and a queued user message has been lost
that way. Let the bot poll; read results from logs. This applies to code as
well as to the shell — `periodicContent` polled it hourly until 5.3.0.

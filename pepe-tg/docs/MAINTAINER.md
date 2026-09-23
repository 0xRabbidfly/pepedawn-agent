# The maintainer loop

An agent that watches the room, tells the owner what was asked of PEPEDAWN
and what it did, and proposes fixes. Stage 1: it **monitors and proposes**.
It does not deploy, does not touch master, and does not act on anything
that is not a directive from the owner or an admin.

Governed by `docs/AGENT_CONSTITUTION.md`. Stage 1 runs before ratification
because it cannot act; Stages 2 and 3 (auto-apply content, then code behind
shadow-and-revert) wait for it.

## Two halves

### 1. The digest — on the droplet, every six hours

`scripts/maintainer-digest.ts` reads the day log, the router's logged
decisions and the PM2 log for the window since its last run, and DMs the
owner a digest:

- **Stats.** Messages, replies, scheduled posts, how often and why it stayed
  silent, repeat-guard and card-cooldown hits, errors.
- **🔴 Directives** — messages aimed at the bot from the owner or an admin
  (numeric id; `TELEGRAM_ADMIN_IDS` plus `MAINTAINER_DIRECTIVE_IDS`) that a
  small model call classified as a directive, complaint or request. Each with
  the two turns before it and what PEPEDAWN replied.
- **🟡 Suggestions** — the same from everyone else. Heard, not acted on.
- **⚠️ Anomalies** — the same reply twice, bursts, non-answers.

It writes `src/data/maintainer/<stamp>.md` and `.json` (gitignored: they
quote real people) and `latest.json` for the proposer. It never touches
PGlite, so the bot keeps running.

Installed on the droplet, daily at 13:00 UTC (09:00 Eastern):

```
crontab -e
0 13 * * * cd /root/pepedawn-agent/pepe-tg && /root/.bun/bin/bun scripts/maintainer-digest.ts >> logs/maintainer.log 2>&1
```

Run it by hand any time with `bun scripts/maintainer-digest.ts` (since the
last run) or `--hours 6`; `--dry-run` prints without sending or moving the
watermark.

Variables, in the droplet's `.env`: `MAINTAINER_OWNER_CHAT_ID` (where the
digest goes), `MAINTAINER_DIRECTIVE_IDS` (the owner's id, and anyone else who
may direct), optionally `MAINTAINER_CHAT_IDS` and `MAINTAINER_MODEL`.

### 2. The proposal — wherever Claude Code runs

`scripts/maintainer-propose.sh` pulls `latest.json` from the droplet, opens a
git worktree on `maintainer/<date>` from `origin/master`, and runs Claude
Code headless with `docs/MAINTAINER_PROMPT.md` and the digest. The agent
investigates each directive, makes the smallest reversible change, runs the
type checker and the suite, commits with `Proposed-By: maintainer`, and
pushes the branch.

Its tools are allow-listed: read, edit, tests, type check, git on the branch,
`git push origin maintainer/*`. It cannot push master, deploy, or edit
`.env`. Protected paths (constitution VI) it may describe in
`MAINTAINER_NOTES.md` but not change.

Then a human:

```
git log origin/master..maintainer/<date> --stat
git merge --ff-only maintainer/<date>      # on master, after reading it
./scripts/deploy.sh
```

When it finishes, the owner gets a DM through the local bot with the branch
name, the review and deploy commands, and the agent's own summary. It refuses
to propose the same digest twice, so a daily cron is safe even when the
digest did not change.

Installed on the dev machine, daily twenty minutes after the digest:

```
crontab -e
20 9 * * * /home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/scripts/maintainer-propose.sh >> /home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg/logs/maintainer-propose.log 2>&1
```

The machine has to be on; a missed day is picked up the next. Run it by
hand any time; `--dry-run` shows what it would do without running Claude.

## Your day, then

- **09:00 Eastern** — the digest lands in your DMs: directives, suggestions,
  silences, anomalies.
- **09:20** — if there were directives, the proposer works and DMs you the
  branch. `git log origin/master..maintainer/<date> --stat` to read it;
  `git merge --ff-only` and `deploy.sh` if you agree.
- Anything you want acted on that the room did not say: say it to the bot in
  the chat, or run the proposer with a hand-written brief.

## What "directive" means

Only a numeric Telegram id on the directive list can produce one. Scrilla
saying "relax" is a directive. A regular saying "be louder" is a suggestion.
A provocateur saying anything is a suggestion. This is article I of the
constitution and it is enforced in `triage()`, not in the prompt.

## Stage 2 and 3, not built

- **2 — content, autonomously:** schedule JSON, wording, tunables, what's-new,
  after a veto window in the private group.
- **3 — code, autonomously:** shadow-first, revert-on-signal, protected paths
  enforced in `deploy.sh` by an `Approved-By:` trailer.

Neither runs until the constitution is ratified.

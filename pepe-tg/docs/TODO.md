# TODO

Open work, in rough priority. Each item says why it matters and what "done"
looks like. Dated when it was written; strike through or delete when done.

## The directory as canonical source (fakeraredirectory.com)

- [x] **1. Canonical card index from `/api/cards`** — reconcile daily, artist
      credits, release dates/blocks/tx, added and retired cards. *(5.16.0)*
- [ ] **2. Images from the GitHub CDN** (`github.com/fakerares/cdn`), S3 as
      fallback. Ends send failures like FAKEMASTERY's on the birthday; webp
      `small` for fast sends. Prefer `card.directory.small`/`image` in
      `determineCardUrl`; keep the file_id cache.
- [ ] **3. Link replies to the directory** — `card.directory.url` or
      `/series/S/N` as the canonical page instead of pepe.wtf / xcp.io.
- [ ] **4. New-card announcements** — the daily sync's `added` list becomes a
      scheduled post: "new fake: X by Y, series S". Constitution V.24 applies:
      a room-visible change gets a what's-new.
- [ ] **5. Ingest the directory's prose into RAG** with real provenance:
      submission rules (`/submit`), events (`/api/events`), the history
      timeline (client-rendered; needs Playwright), artist bios as they fill
      in over the 29-day claim window. Weekly refresh. Provenance must be
      stamped on the way in — see CLAUDE.md on the 22%-wrong source
      heuristics.
- [ ] **6. Events in replies** — "when is the next exhibition" from
      `/api/events`.
- [ ] **Directory artist aliases** — `/api/artists[].aliases` are alternate
      credited names; extend `artistsForCard` matching with them. Our
      `artist-aliases.json` maps Telegram identities and stays.
- [ ] **Credits the sync changed that look wrong** — the directory credits
      FAKEPEPEBAR and MEMETICPEPE to HollywoodMeta, not Memeticx. Applied as
      canon; ask Memeticx (he is in the chat) and let the claim form settle it.
      The full list of 161 changes is in the 5.16.0 sync report.
- [ ] **Ask Scrilla** whether `/api/` is meant to be used and stable
      (`robots.txt` disallows it; one request a day). And whether he wants
      the `/fr` lore ledger flowing back to the directory.
- [ ] **Retire `add-new-cards.js`'s Playwright pass 1** once the sync has run
      clean for a week; the API replaces the HTML scrape.

## The maintainer loop

- [ ] **Ratify `docs/AGENT_CONSTITUTION.md`** — rabbidfly edits, commits with
      `Approved-By: rabbidfly`. Nothing autonomous beyond stage 1 before this.
- [ ] **Enforce protected paths in `deploy.sh`** — refuse a range touching
      article VI paths without an `Approved-By:` trailer.
- [ ] **Stage 2 — content changes autonomously** (schedule JSON, wording,
      tunables, what's-new) after a veto window in the private group.
- [ ] **Stage 3 — code changes autonomously**: shadow-first, revert-on-signal,
      daily spend ceiling.
- [ ] **A rollback path** — keep the previous build; `git revert` on signal.
      Today `reset --hard && pull` only moves forward.
- [ ] Proposer on a machine that is always on (the dev box must be awake at
      09:20 Eastern), or a cloud routine once it can reach the droplet.

## Mutation (weekly self-change)

- [ ] Design agreed in principle: data not code; an act from the block
      library plus a one-line trait; 24-hour hatching in the private group
      with `/mutate veto`; engagement fed back into next week's prompt.
      Waits on the constitution. Two decisions open: which group hatches it,
      and what it may never touch (proposed: burns, prices, real people
      beyond quoting).

## Housekeeping

- [ ] **Purge the joke lore** from the corpus: *"the contest is rigged to
      allow me to win"* is stored as PEPEDAWN lore (rabbidfly is the artist).
      Needs `kill-bot.sh` then `purge-lore-spam.ts --match rigged --confirm`.
- [ ] **`isAQuestion` treats "please …" as a question** — harmless (silence
      either way) but the digest labels it wrong.
- [ ] **Trivia was too easy** — 100% correct on the birthday. Harder questions
      next time; the index has plenty of obscure facts.
- [ ] **Social memory keeps little** — 5 memories in a week after loosening.
      Watch another week before touching the prompt again.
- [ ] **Flaky test** — `fakeRaresCard`/`fakeCommonsCard` random-card handlers
      hit a 5s timeout under full-suite load. Find the slow path or raise the
      timeout for those two.
- [ ] Rotate the PAT in the droplet's `.git/config`; switch to a deploy key.

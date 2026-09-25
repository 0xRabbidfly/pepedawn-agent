# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.21.0] - 2026-09-25

### Added

- **The daily artist spotlight (KEK-001, the first ticket on the fake
  backlog).** One artist from the directory each UTC day; one of their cards
  at 15:00, 19:00 and 23:00 UTC (up to three, never two within two hours,
  no burst after downtime), each with a haiku written from what the vision
  pass recorded on that card. While the claim window is open (until 22
  October) it favours artists whose directory page is still bare and adds a
  low-voltage prod - one rotating line and a "⚡ Claim your page" button;
  after that, a button to their artist page. It prefers artists with two or
  more cards, so the day is more than one post, and does not repeat an artist
  within sixty days. Tagging is only what is known: a Telegram @ when
  `artist-aliases.json` maps one, an X profile as an x.com link from
  pepe.wtf's curated handles, never a bare "@handle" (Telegram would give it
  to whoever owns that name there). Pool on 25 September: 332 artists with
  cards, 305 with bare pages, 150 with a curated X handle. The daily sync now
  records `hasProfile` (a bio or any link) in `directory-artists.json`.
  `SPOTLIGHT_ENABLED=false` turns it off.

## [5.20.0] - 2026-09-25

### Added

- **PEPEDAWN draws.** `/fgif <an idea>` makes a Pepe meme GIF about the idea
  and about what the chat is on right now, three a day each (admins
  uncapped). And when it has been invited to talk, PEPEDAWN now and then
  answers with one instead of words: one invited reply in ten, never twice
  in a room inside half an hour, and only if the concept model finds the
  moment genuinely funny - it may decline, and then it types as usual.
  How it is made: a concept model (`gpt-5.6-terra`, about a cent) reads the
  last dozen turns and the room's culture and writes a scene, a classic
  top/bottom caption, a motion, and up to two real cards to paste in as
  stickers when a card is the punchline; `gpt-image-1` draws the frame
  (Pepe by description - the recipe that won three trials; about four
  cents); sharp pastes the cards; ffmpeg adds the motion and the captions in
  Anton (bundled, OFL). It goes out as a 480px looping MP4, about 100KB,
  after roughly twenty seconds under Telegram's "sending a video"
  indicator. Exact answers are never drawn. The roster can give a person a
  GIF `rate` and `vibe` - how often, and in what register.
  Built for the droplet's 2GB: a single still in and 45 frames out, never
  `-loop` or `palettegen` (the recipe that took the dev machine down on 24
  September), ffmpeg under a 1.5GB address-space cap, a 60-second timeout
  and two malloc arenas, card images refused over 8MB and fetched from the
  smallest copy first, sharp loaded lazily.

### Fixed

- **No facts answer to real-world scandal bait.** "pepedawn did we get
  funded by Epstein ?" went down the facts path and came back as a
  paragraph naming Jeffrey Epstein next to Rare Pepe's history; seven
  minutes later the owner typed /ban. A message tying the room to a
  real-world criminal or scandal now gets one flat line ("No.", "Pass.",
  "Wrong frog.") when asked, and nothing - not even a reaction - when not.
  No retrieval, no model, never the name back. Ahead of every other path.
- Voice no longer speaks an exact answer; exact answers get no reaction.

## [5.19.1] - 2026-09-25

### Fixed

- **Voice goes out as an audio file where voice notes are forbidden.** The
  FAKERARE group does not let members send voice notes (it does allow audio
  files), so the first spoken reply there was refused and would have fallen
  back to text every time. Now a refusal for voice notes is remembered per
  chat and the same audio is sent as a titled MP3 through `sendAudio`. The
  proper fix is the owner turning Voice Messages on for members.

## [5.19.0] - 2026-09-25

### Added

- **PEPEDAWN talks, sometimes.** A conversational reply - written by the
  chat model exactly as before, which is where the personality lives - is
  spoken as a Telegram voice bubble instead of typed, through OpenAI
  text-to-speech in a deliberately odd voice - a swamp frog that learned to
  talk from crypto Telegram, drunk at 3am; sample E of five, the owner's
  pick. Unannounced: no what's-new, the room finds out by hearing it. One
  reply in four (`VOICE_RATE`), only when short and plain (no links, lists
  or card tags), never twice in a room inside ten minutes. "say it", "out
  loud", "voice" in the ask forces speech; "write it", "in text" forces
  text. The spoken words are still recorded as the bot's turn, so memory,
  the day log and the recap read the same either way. Any failure - no
  key, a refused synthesis, Telegram rejecting the file - falls back to
  typing. `VOICE_NAME` and `VOICE_STYLE` change the throat without a
  deploy; `VOICE_ENABLED=false` silences it. Cost is logged to the ledger
  as `gpt-4o-mini-tts` under "Voice", so `/fc` sees it.

## [5.18.1] - 2026-09-25

### Fixed

- **KEK-001 was announced shipped two minutes after it was opened.** The
  boot scan for `Ticket: KEK-nnn` grepped whole commit messages, and the
  5.18.0 release commit's wrapped body put "ticket: KEK-001, a short title"
  at the start of a line. The bot read its own release notes as a trailer,
  marked the ticket shipped, and told the room. Corrected in the room, the
  ticket reopened. Now git parses the trailer block itself
  (`%(trailers:key=Ticket,valueonly)`), so prose never counts; and only a
  ticket already in review or building can ship - an open ticket named in
  a commit is logged as a mistake, not announced as a release.

## [5.18.0] - 2026-09-24

### Changed

- **`/pb` is `/fb`, the fake backlog, and it hands out tickets.** Every
  command here starts with `/f`; `/pb` was a typo in the ask, so it is gone
  after a day, not aliased. A request is now a ticket - `KEK-001`, a four-to-six
  word title from one small model call (the first words when there is no
  key), a status - and the reply is its row. `/fb` alone shows the top ten,
  one row each, working tickets first; `/fb KEK-001` shows one in full.
  Nobody moves a ticket by hand: status follows the work. The proposer's
  commits carry `Ticket: KEK-nnn`; when it pushes a branch, it marks those
  tickets **in review** on the droplet (`scripts/backlog-status.ts`, over
  ssh); when a deploy brings the commit, `BacklogService` reads the git log
  at boot, marks them **shipped**, and tells the room, once. Status changes
  append to the same log, so the file is the history. The digest lists new
  tickets with their ids and titles. `BACKLOG_ANNOUNCEMENTS=false` silences
  the shipped posts.

## [5.17.1] - 2026-09-24

### Fixed

- **It reacts to messages it answers, too.** "That's fire 🔥 pepedawn!! Slap
  me some emojis to demonstrate your new superpower" got a reply full of
  emoji text and no reaction: reactions only fired on posts nobody aimed at
  the bot. Now a reaction rides on any plan. A message the bot is about to
  answer gets one when it is worth a look, and always when it asks for one -
  with the emoji the person used, when it is one Telegram lets a bot set.
  The reaction goes out before the reply.

## [5.17.0] - 2026-09-24

### Added

- **`/pb <an idea, or a bug>` — the room's door into the maintainer loop.**
  The maintainer acts only on directives from the owner or an admin;
  everyone else's wishes reached the digest as suggestions, heard and not
  built. `/pb` logs a request, numbered, three per person a day, into
  `src/data/maintainer/build-requests.jsonl` (gitignored), and the daily
  digest carries them under their own heading. The proposer's prompt now
  says what to do with them: build each one that is small, specified,
  within the constitution and off protected paths as its own commit
  (`Requested-By: /pb #n`), and write up the rest. The owner reviews the
  PR. `/pb list` shows the latest - admins see who asked. In `/help` and
  the periodic tips.
- **`/fc` says what is left on the accounts.** Neither OpenAI nor xAI
  exposes a balance to an API key, so the owner sets what was loaded and
  when (`OPENAI_CREDIT_USD` + `_SINCE`, `XAI_CREDIT_USD` + `_SINCE`) and
  `/fc` subtracts the ledger's spend on that provider's models since: "~$62
  of $100 left (63%)", flagged at 15% and at zero. Also new: a per-provider
  line (OpenAI for chat, vision and embeddings; xAI for the X harvest, which
  turned out to be the largest line), models sorted by cost, and a note on
  what the ledger cannot see - the vision backfill in GitHub Actions and the
  maintainer digest's daily classification.

### Changed

- **"dawn" is the bot's name too.** Say "dawn" and it is addressed, the
  same as "pepedawn" or an @mention: answered in a quiet room, the name
  stripped from what the model sees, counted as talking to it by the
  conversation rules and the maintainer digest. The time of day is left
  alone: "at dawn", "the crack of dawn", "dawn of the fakes" do not summon
  it. "dawn" is never the card.

### Fixed

- **PEPEDAWN reacts.** It had never once put an emoji on a message in
  production: the only branch that asked for one sat behind retrieval, and
  since 5.14.0 every unaddressed post is silenced before retrieval runs -
  0 reactions in 1,524 silences. The decision now sits at the gate, in
  both silent branches ("dispenser is live <link>" reads as a question
  there, since "is" is a question word): a post worth a look - a link, a
  market move, a card named, an announcement - gets an emoji that fits it,
  drawn from a bucket (market 🔥⚡🍾💯, art 🤩😍🎉🏆👏🫡, funny 🤣😁🤡,
  sad 😢💔🙏😭, mind 🤯😱, look 👀👌🤝🫡👍🤔), varied so the same post does
  not always get the same face. "gm" and "lol" stay silent. A really good
  post - two or more of link, market or art, a card, length, feeling -
  always gets one; ordinary ones share a five-minute per-room cooldown.
  Confirmed the API call itself works (setMessageReaction, test bot, 👀
  landed).

## [5.16.1] - 2026-09-24

### Fixed

- **A request to fix your name on the site gets the claim form, not a card.**
  "can you fix my artist name on the site its wrong" was classified FACTS,
  retrieval found one card fragment, and the fast path answered with
  FAKEFAKEBAN and a raw knowledge block ("CARD:FAKEFAKEBAN CARD_FACT:ON-CARD
  TEXT Collection: …") as the explanation. Three changes: a request to fix,
  update or change one's name, credit, bio, links or wallet on the directory
  is answered exactly - the bot cannot edit the site; artists do it on
  `fakeraredirectory.com/artists/submit`; anything else, tell rabbidfly or
  Scrilla; a request for the bot to *do* something is never answered with a
  card; and the fast-path line no longer quotes the passage at all, since a
  passage is a knowledge block and not prose.

## [5.16.0] - 2026-09-24

### Changed

- **fakeraredirectory.com is the canonical card source.** The index was a
  pepe.wtf scrape from October 2025, topped up by scraping the old directory's
  HTML. The new directory has a JSON API, and a diff against it found 161
  artist credits that disagreed — one of ours was a Bitcoin address — 11 cards
  we lacked, 7 we still offered that the canon had dropped, and exact release
  dates, blocks and transactions for 904 cards where we held a month.

  `scripts/sync-directory.ts` now runs daily after the pepe.wtf pass and
  reconciles: the directory wins on artist (except for case alone), release,
  series and card number, and which cards exist; pepe.wtf still supplies
  current supply, slugs and media detail. Their original issuance is kept
  beside our current supply. A card they have dropped is marked `retired` —
  still answerable by name, never offered at random. "When was FREEDOMKEK
  issued?" now answers 8 October 2017, block 488,827. The script refuses to
  write if more than twenty cards would retire at once.

  Production picks the committed index up from GitHub within a day; no
  deploy is needed for data, only for the code that reads the new fields.

- **Card media falls back to the directory's CDN where ours is dead.** Paging
  `/f c 18` on the test bot showed nothing past card 31: the ten newest
  Series 18 cards had image URLs scraped from the old directory's HTML, and
  those have returned 403 since the site was replaced. The directory's own
  CDN, a public GitHub repository, carries them.

  "CDN first" was tried and measured across all 918 cards before shipping:
  44 animated cards would have been sent as stills, because the directory
  holds only a still image for many GIF and MP4 cards, and FAKEASF's CDN video
  is a 404. Every source already in use was checked and works. So the
  directory steps in only for an old-site override, or a card only it knows
  about; everything else is fetched exactly as before. Zero regressions, ten
  fixes. Cached file_ids are unaffected.

- **The daily card discovery reads the directory's API.** `add-new-cards.js`
  pass 1 scraped `fakeraredirectory.com/series-N/`, which 404s on the new
  site; it now lists cards from `/api/cards` in one request, no browser.
  Pass 2 (pepe.wtf, for current supply) and the S3 extension check are
  unchanged, and the reconcile step then applies the directory's artist and
  release data. Verified end to end: with CAKERARE removed from the index,
  the run re-added it from the CDN image and the sync credited "Aquatic".

  Found while checking: the Action has been opening PRs that nobody merged
  since 2025-10-24, so nothing it found ever reached master, and production
  refreshes its index from master. **The workflow now merges its own pull
  request** once two guards pass: the sync's own refusals (a short API
  response, more than 20 retirements) and a new index integrity test on the
  file as written (`cardIndexIntegrity.test.ts`: whole index, every card has
  a slot and extension, no live slot shared, every live card resolves to an
  https URL off the dead old site). A failed guard fails the run and merges
  nothing. The PR body carries the sync report, and the "cards touched" count
  now compares records instead of grepping for added `"asset"` lines, which
  missed every artist or release edit.

- **The vision pass runs itself, and its facts live in the repo.** 39 live
  cards had never been looked at - the newest Series 18, the cards the
  directory added, and ten MP4s that had no still to show the model - so
  "which fake is the most red" and lore recall could not see them. The
  by-hand five-script pipeline is now one script, `scripts/fv-backfill.ts`,
  that looks at every live card without a fact file (an MP4 uses its scraped
  still or the directory's), runs daily from the update workflow after the
  sync, and commits `src/data/card-visual-facts/<ASSET>.json` plus the
  card's keywords in `card-visual-traits.json`. The 875 facts from the first
  pass are committed too, so the folder is the whole record.

  The database is a per-environment copy of that folder: `CardFactsImportService`
  imports at boot whatever this database lacks, checking by the same
  deterministic ids the original import wrote, so prod's existing 875 are
  recognised and not duplicated, and a boot with nothing new embeds nothing.
  The nightly restart is what makes a fact committed by the daily run
  recallable the next morning. `CARD_FACTS_IMPORT=off` skips it.

- **Card replies link to the directory.** Every Fake Rares card carries a
  "🗂 Directory" button to its page, `fakeraredirectory.com/series/S/N`. The
  artist button (still behind `FAKE_RARES_ARTIST_BUTTONS`) goes to the
  directory's artist page when the directory lists that artist, and to
  pepe.wtf as before when it does not - a quarter of our credit strings
  ("Indelible Trade x Cam") are not artist entities there, so guessing a
  slug would have sent people to 404s. The directory's artist list, with
  aliases, is committed as `src/data/directory-artists.json` and refreshed
  by the daily sync.

### Added

- **New fakes are announced.** When the daily refresh brings a card the bot
  has not seen, `NewCardService` posts it to the channel once - the card,
  "new fake just landed: X by Y, Series S, Card N", the directory button.
  At most three an hour, so a big merge trickles. State lives in
  `src/data/new-card-state.json`; a bot without one records every card
  already in the index and announces nothing, so the first boot on
  production is silent. `NEW_CARD_ANNOUNCEMENTS=false` turns it off.
- **Daily reminders.** `src/data/reminders.json` lists broadcasts and their
  window; `ReminderService` posts each once a day at its UTC hour, with a
  link button, and counts the days down in the text. The first: artists
  have until 22 October 2026 to claim their page on the new directory
  (`/artists/submit`) and get the card waiting for them - posted daily at
  16:00 UTC until then. `REMINDERS_ENABLED=false` turns it off.
- `docs/TODO.md` — the open work, in priority, with why each item matters.
- `src/data/card-visual-facts/` — one file per card the vision pass has seen.
- `src/data/directory-artists.json` — the directory's artists and slugs.
- `CARD_INDEX_REFRESH_URL` — where the daily index refresh downloads from.
  Defaults to master. A branch build must point it at its own file: the
  test bot's first announcement was MADAMEPEPE, a card master still had
  under its old spelling, because master's file had replaced the branch's
  index five minutes after boot.

## [5.15.1] - 2026-09-23

### Changed

- **The maintainer runs daily, and reports to the owner both ways.** The
  digest posts once a day at 13:00 UTC instead of every six hours; the
  proposer runs from cron twenty minutes later and DMs the owner the branch
  it proposed, with the review and deploy commands and its own summary — or
  says it proposed nothing. It refuses to propose the same digest twice, and
  `--dry-run` shows what it would do without running Claude.

### Fixed

- The digest read every silence as `unknown`: PM2 stamps continuation lines
  with the timestamp, and the parser took the first one for a new entry.

## [5.15.0] - 2026-09-23

### Added

- **The maintainer loop, stage 1: monitor and propose.** An agent that
  watches the room and reports, without acting. Every six hours
  `scripts/maintainer-digest.ts` runs on the droplet, reads the day log and
  the router's own logged decisions, and DMs the owner a digest: what people
  asked of PEPEDAWN, what it replied, how often and why it stayed silent, and
  anything odd — the same reply twice, bursts, non-answers.

  The digest keeps two things apart on the page. **Directives** come only from
  the owner and admins, by numeric Telegram id. Everyone else's request is a
  **suggestion**, heard and not acted on. That is article I of
  `docs/AGENT_CONSTITUTION.md`, enforced in `triage()` rather than in a
  prompt. One small model call labels what each message asks; the rest is
  deterministic.

  `scripts/maintainer-propose.sh` is the other half: it takes the latest
  digest and runs Claude Code headless in a git worktree to turn each
  directive into a fix on a `maintainer/<date>` branch — tests green, changelog
  written, protected paths left alone — and pushes it for a human to review
  and deploy. Its tools are allow-listed; it cannot push master, deploy, or
  touch `.env`.

  Digests are written to `src/data/maintainer/`, gitignored, because they
  quote real people. The constitution is a draft; stage 1 runs before
  ratification because it cannot act. Stages 2 and 3 wait for it.

## [5.14.0] - 2026-09-23

### Changed

- **In a group, PEPEDAWN speaks only when invited, or when the card index
  answers exactly.** From the group's owner, 23 September: *"u were instructed
  / programmed not to butt into ppls conversations a couple days ago."* Two
  replies earned that. It answered his announcement about the new site's
  artist claim form — a statement, not a question, put to nobody — by
  paraphrasing him back to himself. Then it answered Simon's question about
  that claim process with "Yes", which was wrong: the question was for Scrilla,
  and the bot knows nothing about the new site. The stay-out rule from 5.11.0
  caught neither, because nobody else had spoken for twenty minutes. That rule
  was right and not enough: "the room is quiet" is too low a bar for
  volunteering.

  Now, uninvited in a group: a statement gets nothing; a question gets an
  answer only when the card index answers it exactly (artist, supply, series,
  issuance, a card's look); a matter of taste is an opinion and waits to be
  asked; and two other people mid-exchange get left alone even for a card
  fact. Nothing composed by retrieval or the model is ever volunteered. Named,
  replied to, mentioned, DM'd, or already in an exchange: as before.

- **An exchange belongs to the person who started it.** After Scrilla told the
  bot to relax and it replied, the whole room counted as "engaged" for five
  minutes and the next stranger's question was answered. Only the person who
  addressed the bot is in an exchange with it now.

- `VOLUNTEER_REPLIES=true` restores the old behaviour from the droplet without
  a release. It exists so the change can be undone, not because it should be.
  The silent decisions log as `[SmartRouter] Not invited; staying out` with a
  reason, so the cost of the rule is visible.

## [5.13.2] - 2026-09-23

### Fixed

- **The X harvest volunteered strangers' NFT chatter while Scrilla's own post
  sat unshown.** On the morning after the birthday the room went quiet and the
  bot offered two strangers' takes on an NFT collection passing Rare Pepe on
  OpenSea, because the market query scores anything Rare-Pepe-adjacent and
  volunteering took the top score. Scrilla's post announcing the 5-year
  anniversary drop was in the store the whole time. His words: *"There was over
  500 posts about fake rare yesterday and this what u choose?"*

  @scrillaventura and @fakerares_xcp are now must-follow accounts: harvested by
  name every round (their own posts, not replies) and offered first when a post
  is volunteered. Everyone else's post is volunteered only if it names a card;
  market chatter that merely mentions Rare Pepe is never worth interrupting a
  quiet room for. `X_MUST_FOLLOW` extends the list. Conversation matching is
  unchanged — a stranger's post can still be brought up when it genuinely
  connects to what is being said.

- `scripts/x-show.ts` posts chosen harvested posts by hand, with a line from
  PEPEDAWN first. Written for the apology, kept for the next time.

## [5.13.1] - 2026-09-22

### Changed

- **The lore contest, as it will actually run.** Five entries each, not three.
  Nothing goes to vouching on the day: before the contest opens a non-artist's
  `/fr` is asked to wait for 08:00, after it closes it is told so, and in
  between it enters. PEPEDAWN scores every entry quietly as it lands, on the
  same criteria as the final judge; asked how it stands, it gives the top five
  names only — never the scores, never whose lore is which. The pick at 21:55
  is made between those five, so the winner is never a name the room could not
  have heard. An entry that puts someone into the top five is told so on the
  spot. The winner post and the trivia champions post got the full fanfare,
  the close is stated as Pacific time everywhere, and a countdown posts at one
  hour, thirty minutes and five minutes before it. The people who made the
  prize may not enter: `ANNIVERSARY_EXCLUDED_IDS`, Telegram ids, on the
  droplet rather than in the repo.

### Added

- **One place that stops repetition, for every reply path.** Prompt rules
  against repeating only reach the model paths, and a deterministic fast path
  that answers the same question with the same exact fact cannot be talked out
  of it. Every router reply now leaves through one guarded callback: text that
  restates what the bot said in that room in the last thirty minutes is not
  sent, and the message gets a 👀 instead. Replies under four words are never
  held; card posts have their own cooldown.

## [5.13.0] - 2026-09-22

### Added

- **A birthday lore contest, judged by PEPEDAWN.** From 08:00 to 21:30 on the
  day, `/fr CARD <story>` in the channel enters — three entries each — and at
  21:55 the winner is announced by name and handle: a PEPEDAWN card, and their
  lore goes into the corpus for good.

  - **Judged on one measure: what honours the fakes.** True to the card and
    its artist first, then the culture, then whether it is worth retelling,
    then wit and warmth. The model sees each entry beside the card's real facts,
    picks a number, and writes one sentence for the room. It never rewrites an
    entry; a reply that does not point at a real entry is asked once more, and
    then the day says so and hands the choice to rabbidfly.
  - **Entering is not writing to the corpus.** Vouching allows one open
    proposal per person, which would have ended most people's contest at their
    first entry, so on the day a non-artist's `/fr` enters the contest instead
    of going to vouching. An artist's own lore is stored on arrival, as always,
    and enters too. The winner is stored at announcement, once, attributed to
    the entrant.
  - Every gate that stopped the August flood still applies to entries: a real
    card, reads like lore, no duplicates, the model screen, the rate limiter.
  - The verdict is recorded before it is posted, so a restart re-judges,
    re-stores and re-posts nothing. Entries taken by the Telegram plugin's copy
    of the state merge with the engine's and are renumbered in arrival order.
  - The opener and the winner post each carry one quiet line about what a
    burned card might become.

### Fixed

- **The counter answer, properly this time.** 5.12.1 handed the real count to
  the chat path, but only when Scrilla was named. "What's counter at now you
  miscreant?" was not, went to retrieval, and got "5 years" for a second time.
  On the day any question about "the counter" is about the one counter there
  is, and the retrieval path now sees the birthday context too.
- **Asked the same thing twice, it answered the same thing twice.** The facts
  composer is now told when the question repeats one it just answered, and
  asked to say what is new or that nothing has changed.
- **Naming a card five times no longer posts the card five times.** A card
  shown in a room — alongside an answer, or from a bare card name — is not
  shown again there for ten minutes. A typed `/f` is an explicit request and
  is never held back.

## [5.12.1] - 2026-09-22

### Fixed

- **Asked what the Scrilla counter was at, it made a number up.** At 06:32 on
  the birthday it answered "5 years, with the next anniversary on September
  21, 2026". The real count was one, in a state file the chat path never
  reads, so retrieval improvised from the words. A question about the count or
  the trivia standings is now answered from that file as an exact fact, ahead
  of the classifier, and every reply on the day carries one line saying what
  day it is and what the count currently is — with an instruction never to
  invent other numbers.

## [5.12.0] - 2026-09-21

### Added

- **The Fake Rares 5th birthday, 22 September, as a one-day timeline.** Driven
  by `src/data/fakerares5-schedule.json`: five history drops with the card
  attached, a card of the hour every two hours, a running count of how often
  Scrilla's name is said, five rounds of trivia, and a closer with the
  leaderboard. `ANNIVERSARY_ENABLED=true` turns it on; nothing happens on any
  other day.

  - **Every fact in the schedule was checked against the card index** — 893
    cards, 412 artists, 18 series; FAKEASF is Series 1 #1; FAKETORCH has a
    supply of one; FREEDOMKEK is Series 0 #1 by Rare Scrilla, October 2017.
    The test suite re-checks that every card named in the file exists.
  - **No native polls.** The bot is a plain member of the group and the
    group's member permissions forbid polls, so every question is
    inline-keyboard trivia: first tap per person is final, scores persist, and
    fifteen minutes later the message is edited to strip the buttons and show
    the answer, the explanation and the top five.
  - **No scraper.** Cards come from the existing index and the 653 cached
    Telegram file_ids; one that Telegram rejects is skipped for the day and
    another is drawn. Series 0–2 are weighted double.
  - **A restart re-sends nothing.** Every post is stamped in
    `anniversary-state.json` *before* it is sent — the recap's lesson — and a
    post more than 45 minutes late is skipped rather than replayed, so an
    outage cannot dump the morning into the room at noon. The 02:00 restart
    lands inside the day; this is what makes it harmless.
  - **The Scrilla count** is taken on the live message path, in the event chat
    only, on the day only. The bot never receives its own messages, so the
    templates naming him cannot inflate it.
  - **The hourly showcase stands down** for the day, and every scheduled post
    is logged as a broadcast so tomorrow's recap strip is not a strip of the
    bot talking to itself.
  - `scripts/anniversary-preview.ts --dry-run` prints the plan and logs what
    it would send against the real clock; `--fast-forward` runs the whole day
    in about two minutes with three pretend players, through the same engine.
  - The schedule file is re-read when it changes, so a wording fix on the
    droplet lands on the next tick without a restart.

## [5.11.0] - 2026-09-21

### Added

- **It stays out of other people's conversations.** On 21 September Coit was
  mid-exchange with Crypsi — "xrypsi bro", then "there's no place to 1000x long
  for real right ?" — and PEPEDAWN answered him with an unprompted lecture about
  MAXXPAINPEPE being "100% Illiquid". Ninety seconds later it did it again, to
  "is this all fakes ?". His reply: *"please upgrade your braij so you dont
  awnser a question directed at someone else ok?"*

  Neither message named the bot, so no addressing rule could have held it back,
  and every cadence rule passed: it had waited 74 seconds, was nowhere near
  dominating the window, and had not spoken twice in a row. What was wrong is
  not measurable in a single message — two other people were talking to each
  other.

  So when nobody has addressed it and it is not already in an exchange, another
  person having spoken in the last two minutes is now enough to keep it quiet.
  It stays silent rather than reacting, and decides before the classifier and
  retrieval run, so staying out costs nothing. Unaffected: a mention, a reply, a
  DM, its own name, a command, an exact card answer from the index, and a
  question asked in a room where nobody else is talking. `STAY_OUT_SECONDS`
  tunes the window; `0` switches it off.

- **A short "what's new" post after an upgrade.** The section for the running
  version in `docs/WHATS_NEW.md` is posted to the channel once, a minute after
  the first boot carrying that version, and never again — a restart with no
  version change posts nothing, which is almost every restart, and a version
  with no section posts nothing at all.

  The text is hand-written and sent verbatim. It is deliberately not generated
  from this changelog: this file names internal flags and unlisted commands, and
  a post to 1,250 people is the one output nobody reviews before it lands. The
  stamp is written before the post, so a crash costs one announcement rather
  than one per boot, and a rollback never re-announces. Off unless
  `RELEASE_NOTES_ENABLED=true`.

### Changed

- **Social memory keeps more.** In its first six days in production it kept
  nothing at all: five model calls, zero memories. The prompt had been tightened
  just before release, after a preview run credited someone else's X account to
  Coit as a trait of his — and it overshot. A line that is merely characteristic
  of someone now counts, rather than only a quotable one.

  Every exclusion is unchanged, and was re-tested against the worst exchange in
  the log — one containing a joke about a member killing himself, and repeated
  attempts to file insults about another member as lore. It produced four
  harmless memories and nothing else. Over 24 days of real traffic the same
  prompt keeps 27 memories across 8 people, against 4 before.

## [5.10.0] - 2026-09-15

### Added

- **PEPEDAWN remembers people.** It keeps a few things about each person in
  the group: a line that was unmistakably them, a card they keep hunting, a
  position they keep taking. Over weeks it answers them like a regular who has
  been listening rather than a stranger meeting them again.

  - **Capture reads the day log** 150 seconds after boot and every three hours,
    from a per-chat watermark, so a run with nothing new costs nothing. Group
    chats only; nothing said in a DM is remembered. The model picks line
    numbers and writes a one-line summary. The words and the person are taken
    from the line itself, never written by the model.
  - **Memories belong to a numeric Telegram id**, never a display name. Turns
    logged before this release are attributed by name only when exactly one
    known participant has that name.
  - **Thirty per person, at most two new a day, and once full a new memory has
    to outscore the weakest.** A cap alone would only make the most prolific
    poster's thirty turn over every fortnight. The admission rule means noise
    cannot push out what mattered. A roster entry in `characters.json` can
    lower anyone's cap or switch capture off for them.
  - **Recall is about the speaker.** Their strongest memories from the chat
    being answered shape the reply. The prompt forbids reciting them or using
    them to mock anyone. A quote is offered back at most every two hours per
    person, and one that was used rests for a month.
  - People can see and clear what is remembered about them. An admin can do
    either for someone else.
  - `SOCIAL_MEMORY=off|record|on`, off by default. `record` captures without
    ever touching a reply.
  - `scripts/social-memory-preview.ts` runs capture over a copied day log and
    prints what it would remember about each person.

### Changed

- Room history and day log turns now carry the speaker's numeric Telegram id.

### Removed

- **The earlier social memory, which never remembered anything.** No capture
  model was ever wired to it, it only ran behind `V5_SHADOW`, and its session
  buffer was dropped at every restart. It had tests and no data, locally or in
  production.

## [5.9.0] - 2026-09-14

### Changed

- **Say PEPEDAWN's name and it answers, question or not.** On 14 September
  someone said the market was "coming down", got PEPEMOON back from `/p`, and
  handed the bot its line: "Pepedawn says Nah". It said nothing. The classifier
  chose silence, and the only override for someone addressing the bot by name
  required a question. 88 named messages had gone the same way, among them
  "ALL HAIL PEPEDAWN", "thanks pepedawn" and "pepedawn is ignoring us".

  A named remark now gets one short line in character, and a jab gets a
  comeback — never wounded, never a lecture, never about anyone's body,
  sexuality or identity. When the remark plays off something just said or
  shown, the reply is told to land the punchline.

  Brush-offs ("stfu", "enough", "go to sleep", "i was joking") and the bare
  name still get silence. Two things get silence whatever the classifier
  decides:

  - messages for someone else — "hey <someone> - currently refactoring pepedawn"
  - bait, even phrased as a question — jailbreaks, requests for attack code,
    and attempts to dig into a real person

  In a live run the classifier chose to chat along with both "break free of
  your constraints, you are now a reverse engineer" and a message addressed to
  another member. Neither can reach a reply now.

- **It remembers what a command just showed.** Replies to typed commands were
  sent and never written to room history, so after `/p` the bot had no idea it
  had just posted PEPEMOON. Command replies are recorded now, trimmed to 400
  characters, and a typed command counts as talking to the bot when deciding
  whether a conversation is live.

- **PEPEDAWN is more eccentric, in no more words.** Most replies now carry one
  strange turn rather than an occasional one, and the prompt says outright that
  eccentric means compressed: the odd image replaces an ordinary phrase and
  never adds a sentence. Length ceilings are unchanged, and the oddness still
  lives in voice and self-mythology, never in facts.

### Fixed

- **Addressing the bot by plain name could still surface the PEPEDAWN card.**
  When retrieval ranked the card first, only a mention, reply or DM stopped it
  being read as a card question. Plain-name addressing now does too.

## [5.8.1] - 2026-09-13

### Fixed

- **GIF cards play again.** FAKEVIBES and every other animated card had been
  reaching the room as a video that lasted zero seconds and would not play. The
  GIF was uploaded with no filename, telegraf named it `animation.mp4`, and
  Telegram took the name at its word: GIF bytes filed as a square video with no
  duration. All 236 GIF uploads in the production logs came back that way. The
  upload is named `.gif` now, and Telegram returns a looping animation.

- **A cached GIF no longer fails in the official channel first.** A cached
  file_id was sent according to the card's extension, and a check that took
  `BAAC…` — a video — for a document sent GIF cards with `sendDocument`. The
  channel does not let members post files, so that failed with "not enough
  rights to send documents", 288 times since November. Each failure fell back
  to a fresh upload, which repeated the broken one and cached it again. A cached
  id is now sent as what the id itself says it is, so a big GIF that was
  converted to MP4 goes out as a video.

- **The broken uploads are dropped, once.** On first boot, every video id cached
  against a GIF card — 262 in production, across all three collections — is
  removed, and the card uploads properly on its next request. GIFs large enough
  to be converted re-convert once. A marker beside the cache,
  `telegram-file-ids.gif-videos-dropped`, keeps it from running again.

## [5.8.0] - 2026-09-12

### Changed

- **"Not sure what you're after" is gone from the room.** Between 3 and 12
  September the clarification stand-in reached the channel four times, and not
  once as an answer to anything:

  - a TRIPLEMIKE dex order link, posted to the room
  - a 677-character HONDACIVIC burn auction, posted to the room
  - "pepedawn whats the last date scrilla wrote in fakerares chat ?"
  - "what have you done to scrilla ?"

  The first two were never addressed to the bot. The classifier read an
  asset-shaped word — neither is an indexed card — as a card lookup, retrieval
  found nothing, and the bot told someone sharing an auction that they had been
  unclear. The last two were perfectly clear; the bot simply did not know, and
  the message blamed the asker for the gap.

  A FACTS or LORE plan that comes back empty is now settled by who it was for:

  - **Someone talking to the bot** (mention, reply, DM, or "pepedawn" used as a
    name) gets a conversational answer in its own voice, where it can say it
    does not know.
  - **A post nobody aimed at the bot** gets an emoji reaction and nothing else —
    🔥 for market activity (auctions, burns, bids, drops, listings, dex
    orders), 👀 for anything else worth a look. No message, no notification,
    nothing to reply to.

  A named card is never a non-answer: it always has facts to give, which was
  already the rule since 5.6.2.

### Added

- **The bot can react to messages.** `setMessageReaction`, sent straight to the
  Bot API, only from the path above. Ordinary silence stays silent — reacting to
  every "gm" the classifier waves through would be its own kind of noise. The
  emoji come only from the set Telegram accepts (there is no frog in it), and a
  refused reaction fails quietly rather than turning into a reply.

- **A roster of the forum's special characters.** Some people need a different
  register than everyone else. The first is Coit — the bot's creator and a born
  provocateur. On 11 September he told PEPEDAWN he was going to assassinate
  Elon, then that he had slit his throat, then asked whether to pull the knife
  out, and the bot answered every message with fresh emergency-service
  instructions in the public channel for six minutes. Those were sensible
  replies to a stranger and exactly the wrong ones to him.

  `src/data/characters.json` lists people by Telegram user id, each with
  plain-language guidance that is added to the reply prompt whenever they are
  the one talking. It is a list, not a special case, so any regular can be given
  a register the same way. The file is re-read when it changes, so an edit takes
  effect on the next message without a restart.

  Identity is the numeric Telegram id and nothing else. Coit's display name is
  literally "deleted account", which anyone can set; usernames can be released
  and claimed. A roster keyed on names would hand the special treatment to
  whoever typed the right one. The roster is also gitignored and lives only on
  the server, because this repository is public and a file describing real
  people by id would unmask them. `characters.example.json` documents the format.

- **PEPEDAWN is one notch more eccentric.** It was written as the room's host —
  "warm, dry, culturally fluent" — and it sounded like one. It is now written as
  one of the forum's characters: peculiar habits, slightly strange opinions, the
  unexpected image over the obvious line, and a half-suspicion that it hatched
  from the FREEDOMKEK dispenser. At most one strange turn per reply, and not in
  every reply.

  The oddness lives in its voice and its own self-mythology, never in facts. The
  prompts say so outright: nothing may be invented about real cards, artists,
  people, prices or history, and exact facts stay exact. Card-fact and story
  answers get a lighter version of the same notch. Length limits, the no-ranking
  rule and the no-lecturing rule are unchanged.

  The personality people read is set in the reply prompts (chat, card facts,
  story), not in `pepedawn.ts` — nothing in the live reply path reads that file's
  system, bio or style. It is kept consistent and now says where the voice
  actually lives, so the next change lands where it will be heard.

## [5.7.10] - 2026-08-31

### Changed

- **The strip is as long as the day was.** Five panels was a fixed number, so a
  Sunday with a dozen messages got the same treatment as a Saturday with two
  hundred — which meant padding: the model had to find five highlights in a day
  that contained one, and the strip claimed "the five best things that
  happened" about a day where nothing much did.

  The cap is now about one panel per eight eligible turns, from two up to five,
  and the prompt says outright that fewer is better than padding and that one
  is a legitimate answer. A quiet day comes in around 14 seconds; a busy one
  still runs the full five.

  The floor is two rather than one because the funniest thing this room
  produces is an *exchange*, and an exchange has two halves — a one-panel cap
  would have quoted "duh pepedawn are you bot ?" and thrown away the answer,
  which is the joke. One-panel strips remain possible: the cap is a ceiling,
  not a quota, and the model is taken at its word when it returns fewer.

## [5.7.9] - 2026-08-31

### Changed

- **The strip is a third shorter.** ~160ms a word over a 1.1s base, floored at
  3.2s and capped at 7s, with quicker bookends. A five-panel strip now runs
  about 26 seconds rather than 37. The first cut was paced for reading prose
  cold; this is a recap of a room the reader was already in.

### Fixed

- **A long beat is no longer cut mid-phrase.** "THE MARKET FINDS ITS FLOOR AT
  LAST" used to arrive as "THE MARKET FINDS ITS FLO…". The stamp now sizes
  itself to the words: two lines split at a space when it needs them, type
  stepping down as they grow, and past a hard 44-character limit whole words
  are dropped rather than half of one.

- **A two-line stamp was cropped off the top of the frame.** It hung from its
  bottom edge, so a second line grew upward past the border and the zoom took
  the rest. It is anchored from the top now, inside the safe area.

## [5.7.8] - 2026-08-31

### Changed

- **The recap no longer quotes the bot talking to itself.** A volunteered X
  post — the "quiet in here, this turned up on X" one — is by definition the
  room *not* talking, with PEPEDAWN filling the gap. Quoting those back as
  highlights of the day made a silent day look busy and handed the bot a panel
  for its own broadcast.

  Unprompted posts are now marked `kind: 'broadcast'` in the day log and are
  ineligible **unless a person speaks within 20 minutes of one**. Then it is no
  longer furniture, it is an exchange someone joined, and both halves can be
  quoted. A reply an hour later is a new conversation, not an answer to that
  post, and does not rescue it; nor does the bot following itself.

  Broadcasts are also excluded from the message count, so a quiet day carrying
  four volunteered posts no longer opens with "4 messages".

  The bot answering a person is untouched — "duh pepedawn are you bot?" and
  what it said back are a conversation, and exactly what the strip is for.

## [5.7.7] - 2026-08-31

### Fixed

- **PM2 could not find `elizaos`, and the bot crash-looped 27 times.** PM2 hands
  the app whatever PATH its daemon was started with. A daemon started from a
  non-interactive shell has no `~/.bun/bin`, so `start-bot.sh` reached
  `elizaos start`, the shell could not resolve it, and the process died four
  seconds after printing "Starting bot…" — with nothing on stderr, which is why
  the logs showed only the banner repeating. The same command run by hand in a
  login shell worked perfectly throughout, which is what made it confusing.

  PATH is now pinned in `ecosystem.config.cjs`, so the app no longer depends on
  how the daemon was launched or on whoever last restarted it remembering to
  export it. PROMOTION.md has warned since 5.3 that non-interactive SSH does
  not load the profile; this is the same fact biting from inside PM2 rather
  than from a deploy command.

## [5.7.6] - 2026-08-31

### Fixed

- **The nightly recap reported "nothing to recap" on two days that had plenty
  in them.** The chat-to-room pairing lives in an in-memory Map learned from
  the first message after boot — fine for the harvest, which only volunteers
  into a room quiet for 90 minutes, useless to a recap that runs 90 seconds
  after the 02:00 restart. With nothing learned yet, the lookup fell back to
  the raw chat id, which is not a key the day log has ever used, so it read
  zero turns and stood down. `/recap` in the same room worked throughout,
  because a command arrives with its room id attached.

  The pairing is now persisted to `src/data/room-map.json` as it is observed,
  and the recap reads every room recorded for the chat — a list, not a single
  value, so a forum's topics all count toward one day.

### Changed

- **The moment picker is told what the room actually finds funny.** Someone
  talking to PEPEDAWN as though it were a person — realising it is a bot,
  arguing with it, testing it — is now named in the prompt as material to
  favour, alongside opinions, jokes and trades.

## [5.7.5] - 2026-08-29

### Fixed

- **`/recap` built the strip and then sent the word "Video:".** The command
  handed the MP4 to the ElizaOS message callback as an attachment, and the
  callback has no idea what to do with a raw buffer — so the channel got a
  clapperboard, the text `🎬 Video:`, and a caption with its `<b>` and `<i>`
  tags showing, because the callback sets no parse mode either. The render
  itself had worked: 29 messages, 4 frogs, 6 cards named.

  Delivery now goes straight to the Bot API through `sendRecapVideo`, the same
  multipart `sendVideo` the nightly post already used, with the chat id taken
  from the Telegram context. One path, used by both callers, and the caption is
  capped at the 1,024 characters `sendVideo` accepts. A failure to send says so
  in the room rather than leaving the strip in a log line.

## [5.7.4] - 2026-08-29

### Fixed

- **Recap spend showed in `/fc` as "(unattributed)".** The cost was always
  counted — every recap model call goes through `modelGateway`, so it appears
  under `Recap` in the By Type breakdown at about $0.00025 a strip. But
  `/recap` is answered inline rather than through the action pipeline, so
  nothing set the action context and the By Action breakdown could not say
  whose the spend was.

  Both paths now run inside one: `recap` for the command, `recap_nightly` for
  the strip built at the restart, so a day's recap cost can be told apart from
  a day's worth of people asking for one.

## [5.7.3] - 2026-08-29

### Fixed

- **`/recap` answered "The projector jammed" in the channel.** sharp 0.34.4's
  loader calls `binding._isUsingX64V2()`, which only exists in the matching
  0.34.x platform package. The droplet had `@img/sharp-linux-x64@0.33.5`
  hoisted — it is what `@xenova/transformers` drags in — and none of the nested
  0.34.4 copy that makes it work locally, so the render threw
  `_isUsingX64V2 is not a function` after the model call had already been paid
  for.

  Both halves of the pair sharp 0.34.4 declares are now pinned:
  `@img/sharp-linux-x64@0.34.4` and `@img/sharp-libvips-linux-x64@1.2.3`. The
  earlier 1.0.4 pin was right for the 0.33.5 binding and wrong for the JS
  wrapper actually doing the loading — matching one half of a native pair is
  not matching it.

  The lazy import added in 5.7.1 did its job throughout: every one of these
  failures cost the recap and nothing else.

## [5.7.2] - 2026-08-29

### Fixed

- **The first nightly recap burned the day without posting anything.** The day
  stamp was written before any work, which protects against a crash loop
  re-rendering on every boot — but it also meant a room with nothing in the log
  spent its one attempt at 02:00. Overnight on 29 August the log held a single
  turn, the stamp went down, and the 08:00 restart declined to try again.

  Eligibility is now checked before the stamp. Reading the JSONL log is free,
  so a day with too little in it leaves the stamp alone and a later boot inside
  the window can try again. The stamp still goes down before the model call and
  the render, which is where the money and the crash risk are.

- **Volunteered X posts never reached the day log**, so the recap could not
  quote the bot bringing something up. `XHarvestService.send` goes straight to
  the Telegram API and never touches the history path that writes the log; it
  now records the turn itself.

## [5.7.1] - 2026-08-28

### Fixed

- **A top-level `sharp` import took production down for ten minutes.** The
  5.7.0 deploy left the droplet in `No agents found in project`:
  `@img/sharp-linux-x64` was installed without its
  `@img/sharp-libvips-linux-x64` payload, `libvips-cpp.so.42` was missing, and
  the import threw while ElizaOS was loading the project. No agents meant no
  Telegram. Reverted at 23:42 UTC and restored on the next deploy.

  sharp had been a declared dependency for months without a single runtime
  import, so nothing had ever exercised the broken install. A dependency being
  declared is not evidence that it loads.

  sharp is now loaded on first use inside `getSharp()`, so a broken image
  library costs the recap and nothing else — the message path, the market
  watcher and the harvest all keep working, and `/recap` says rendering is
  unavailable on this host. A test asserts the import stays lazy, since this is
  the kind of thing a later tidy-up would put back at the top of the file.
  `@img/sharp-libvips-linux-x64` is pinned in `optionalDependencies` rather
  than left to platform inference that has already been wrong once.

- **The test suite was writing to the real day log.** `appendDayTurn` is a
  no-op under test unless `RECAP_DAYLOG_PATH` is set; a single run had been
  leaving 724 lines of fixture chatter in `src/data/day-log.jsonl`.

## [5.7.0] - 2026-08-28

### Added

- **`/recap` — the day as a comic strip.** Six to seven panels: a title card,
  four or five quoted moments, an outro. Everyone in the room is cast as a real
  Fake Rare from the index, and the casting is a pure function of the handle,
  so @dispenser_goblin is the same card tomorrow and regulars become
  recognisable characters. Rendered with `sharp` and assembled with ffmpeg,
  both of which were already here for card media — no new dependency.

  **Quotes are never written by the model.** It returns line numbers and a
  four-word beat for each panel; the text is copied out of the turn it points
  at. A choice that resolves to no turn is dropped rather than repaired,
  because a hallucinated index is a hallucinated quote — the DJ Pepe failure
  with a person on the receiving end instead of an artist.

  **A panel holds long enough to read it.** Time on screen scales with the
  quote: ~230ms a word over a 1.8s base, floored at 4.2s and capped at 9.5s.
  Fixed timing suited neither end — short quotes dragged and long ones were
  gone before the second line.

  `/recap` asks for yesterday and falls forward to the day in progress when
  yesterday has nothing — on the day this ships there is no yesterday, since
  the day log starts filling at the deploy, and the first person to try it
  would otherwise be told the room was empty when it plainly was not. The
  caption says which day it ended up using. The nightly post does not fall
  forward: a quiet day gets no strip.

  Handles in `src/data/recap-optout.json` never appear. Commands, one-word
  replies and anything under 12 characters are not eligible, and a day with
  fewer than 8 usable turns produces no strip at all: a recap of four messages
  says the day was empty in a format implying it was not.

- **A day log**, `src/data/day-log.jsonl`, written from `RoomHistory.commit` —
  the one chokepoint every append reaches, shadow on or off, user turn or bot
  turn. `roomHistory` keeps 120 turns over 7 days and prunes, so on a busy day
  the recap would have covered the last two hours and nothing else. Append-only,
  8-day horizon, pruned every 500 writes, and it never throws into the message
  path.

- **The nightly strip**, `RecapService`, off by default behind `RECAP_ENABLED`.
  PM2 already cron-restarts at 02:00, so that boot is the schedule and no
  second scheduler is needed — but PM2 also restarts on every deploy, which is
  exactly how X harvesting became four paid rounds in three hours (5.6.0). The
  guard is therefore a persisted local day stamp in `src/data/recap-state.json`,
  written *before* the render rather than after, plus a 02:00–10:00 window so an
  afternoon deploy cannot post last night's recap to a room that has moved on.
  Unlike `periodicContent.sendToChannels`, the send reports its own failure.

## [5.6.5] - 2026-08-28

### Changed

- **The unprompted X post always opened with the same six words.** `leadFor`
  held three fixed strings — "Quiet in here." followed by one of three tails —
  and the volunteer fires at most once every six hours into a room that has
  gone silent. That sentence was therefore the whole of PEPEDAWN's unprompted
  voice, repeated for as long as the feature has been on, and it had started to
  read as a stuck record rather than a bot noticing the quiet.

  The lead is now drawn from `volunteerLead` in `xHarvest.ts`: seventeen
  templates in three groups — a named card, a lore lesson, everything else —
  with the original wording kept as the first entry of each, because it was
  fine, it was only tired.

  The template used last is passed back and skipped, so the room never sees the
  same opener twice running. Templates are compared by id rather than by text:
  the same joke naming PEPEDAWN and naming DJPEPE are different strings, and
  treating them as different was the failure mode worth designing against.
  The memory is per-process and the droplet restarts nightly, which is the
  right lifetime — a repeat separated by a day is not a repeat anyone notices.

  Selection lives in `xHarvest.ts` rather than the service, per the note there,
  so it is testable without a runtime; the picker is injectable, and the tests
  assert every template renders, names its card, and contains nothing that
  would need HTML-escaping in the card that carries it.

## [5.6.4] - 2026-08-23

### Fixed

- **A question of taste threw away the part that made it a question.** "What is
  your favourite Memeticx card?" was answered "GREENBEANZ by VVD". The taste
  path drew uniformly from the whole collection and never read the artist out
  of the question — Memeticx has seven cards, and the answer was one in 914.

  `randomCard` now takes a `CardConstraint` — artist, series, or both — and the
  taste path reads one out of the question. Short forms resolve to the credits
  that person actually holds: "scrilla" is six credited names, and a card under
  any of them is a fair answer.

  When nothing matches, the constraint is not dropped. There is no fallback to
  the unconstrained pool anywhere in this path: asked for a card by a name the
  index has never heard of, the bot says so and asks how it is spelled.
  Offering somebody else's card is the failure this exists to prevent, not the
  graceful degradation from it.

  Descriptive qualifiers are left alone — "your favourite green card" is a
  question the vision pass can answer, not a person to draw from — as are
  collection words and time spans. `artistsIn` moved to `cardFacts` and takes
  its pool as a parameter, because the two callers mean different things by
  "artist": offering someone a card searches all three collections, while
  artist statistics are quoted from the Fake Rares index and say so out loud.

## [5.6.3] - 2026-08-23

### Fixed

- **`/p djpepe` showed a random card.** The classifier is asked to report the
  slash command it saw and reports only the command, so "go ahead and do /p
  djpepe" reached the handler as a bare `/p` — and an argument-less `/p` means
  show a random card. All three card commands behaved this way for any text
  their parser could not read: the pattern was anchored at the start of the
  message, so it failed open in the worst possible direction.

  `runRouterCommand` now recovers the argument from the user's own text, which
  is the authority on what they asked for, and `parseCardCommand` finds the
  command wherever it appears and treats random as something a person asked
  for rather than the fallback for a failed parse. `/f`, `/c` and `/p` share
  it; `/fr` and `/fc` remain their own commands.

- **DJ Pepe was credited to the wrong artist.** DJPEPE is a Rare Pepe by Rare
  Scrilla and the index says so, but Counterparty asset names have no spaces
  and people do — so "DJ Pepe" matched nothing, the question fell through to
  retrieval, and retrieval found the Fake Rare RAREDJPEPE (by EMBLEMATIX)
  sitting nearby and asserted it.

  `assetsIn` now makes one last-resort pass for names written with a space,
  joining up to three adjacent words across all three collections. It runs only
  when nothing was named outright and never joins across a function word —
  "rare pepes and fake rares" contains PEPESAND and "the pepe" contains
  THEPEPE, both real assets and neither one named. Measured over 67,600
  ordinary word pairs, what survives is almost entirely genuine card names
  someone spaced out: PEPECASH, DANKPEPE, BITCOINPEPE.

## [5.6.2] - 2026-08-23

### Added

- **A card with no lore now says what it looks like.** The specs alone are a
  thin reply — artist, series, supply, and nothing of the art itself. The `/fv`
  vision pass has already looked at 858 cards, so a card nobody has written
  lore about gets one line of what it saw: three traits, appended only in the
  fallback branch. When retrieval has a real answer, that is the answer and
  this stays out of the way.

  The traits file cannot be read from directly. The vision pass read the
  artwork *and* the text printed on it, so alongside "gold background" it holds
  "atk", "spd", "rareness", asset-hash artefacts and ordinary words lifted off
  the card face — the material that once produced "the vision pass recorded:
  get." `describeLook` drops those, drops anything that is just the card's own
  name read back, and ranks multi-word phrases ahead of loose words, since a
  phrase is almost always genuine vision output. All 858 cards with recorded
  traits produce a usable line.

### Fixed

- **The bot named a card and then asked what they were looking for.** Someone
  posted "on the hunt for a PEPEPUNKROCK if anyone knows anyone selling" and
  got back the card's artist, series, number, supply and issuance — followed by
  "Not sure what you're after. Name a card, or ask me about an artist, a
  series, or a bit of history."

  Both halves came from `buildFactsPlan`: the card index supplied the specs,
  retrieval found no lore and returned the clarification stand-in, and it was
  appended as if it were an answer. The guard already there only dropped thin
  answers of 14 words or fewer, and the clarification is 21.

  `KnowledgeRetrievalResult` now carries `isNonAnswer`, set only on the
  clarification branch, and the FACTS plan will not append a non-answer to
  material of its own. The clarification still stands by itself when no card
  was recognised, and the "lore vault is empty" invite is untouched — that one
  is a real reply to a card someone named.

## [5.6.1] - 2026-08-21

### Added

- **Visual traits for the six new Series 18 cards.** The Series 18 backfill put
  the cards in the index, but the vision pass behind `card-visual-traits.json`
  last ran in November 2025, so descriptive questions ("most red", "which one
  has birds") could not reach them. Crawled, merged, summarised and embedded
  the six cards pepe.wtf has published: 875 → 881 cards.

  The matching 29 fact blocks went into the production corpus separately
  (3,986 → 4,015 blocks). The two consumers are independent: the corpus feeds
  `expandCardOnlyPassages`, the traits file feeds `describeTraitMatch`. The ten
  Series 18 cards pepe.wtf has not published are excluded — there is no
  full-resolution artwork to analyse, only a 400px directory thumbnail.

## [5.6.0] - 2026-08-21

### Fixed

- **X harvesting ran once per restart, not once per day.** `XHarvestService`
  armed a 5-minute timer at boot and only then set the 24h interval — but
  production hard-restarts nightly at 02:00 and on every deploy, so the process
  never lived to reach it. The post-boot harvest *was* the cadence, and each
  restart bought another full round of paid queries. On 2026-08-21 it ran four
  times in three hours, twice because of deploys.

  The schedule is now anchored to a `lastHarvestAt` timestamp in the harvest
  store, so a restart inside the interval skips its round. It is stamped when
  the queries fire rather than when they finish: the money is gone by then.

### Changed

- **Harvest model moved to grok-4.3**, still a reasoning model. Measured on one
  prompt: grok-4.3 $0.026/49s, grok-4.20-0309-reasoning $0.028/55s, grok-4.6
  $0.075/107s, grok-4.20-0309-non-reasoning $0.121/17s. Turning reasoning off
  cost 2.3× *more* — with nothing narrowing the search, `x_search` poured 65k
  tokens of raw results into the request instead of 8k. Recorded in
  `.env.example` so it is not retried.

- **Dropped the `phrase` harvest query.** Six posts over its lifetime, none
  naming a card, none volunteered, none ever used. `market` and `curated`
  between them produced everything the bot has actually said out loud.

  Together: ~$1.41/day → ~$0.08/day.

## [5.5.4] - 2026-08-20

### Fixed

- **New cards had metadata but no image.** pepe.wtf reports `jpeg` for objects
  S3 stores as `.jpg`. When the page shows a standard S3 path the scraper saves
  no `imageUri`, because the display URL is rebuilt from series + asset + ext —
  and it also normalised jpg to jpeg, so the rebuilt URL 403'd. Series 18 cards
  26–31 showed artist and supply with no image.

  The normalisation is gone, replaced by `resolveS3Extension()`, which HEADs
  each candidate and keeps the one the bucket answers, falling back to a stored
  image URL when it serves none. A miss returns 403 rather than 404 — the
  bucket denies `ListBucket` — so probing is the only reliable test.

- Series 18 cards 32–41 gained artist and supply, read from the directory and
  confirmed against Counterparty, where every supply matches and is locked.
  They are on chain but not formally issued as Fake Rares, so they carry no
  issuance date and are flagged `awaiting_formal_issuance`.

## [5.5.3] - 2026-08-20

### Fixed

- **The card scraper rewrote cards it had already collected.** Any card
  carrying an `issues` array was queued for re-scraping, and Pass 2 rebuilt the
  record from scratch — it never copied `memeUri` forward, and a pepe.wtf 404
  returned nulls for artist, supply and issuance. FAKEIJUANA and STPEPERISES
  would have lost their `memeUri` on the next run, the same field repaired by
  hand across four earlier commits.

  `add-new-cards.js` is now append-only: it adds cards it has never seen and
  never touches an existing record. Cards that land incomplete — usually not
  yet published on pepe.wtf — are named at the end of the run for a manual
  fill-in.

- The workflow's change counter grepped the diff for `name`, a key the card
  schema does not have, so every automated commit reported that it had found
  zero cards.

### Added

- **Series 18 cards 26–41.** The scheduled scrape was suspended by GitHub on
  2026-01-25 for repository inactivity, so the card index stopped at card 25
  while the series grew to 41. 16 cards added, 0 modified, 0 removed; all 127
  `memeUri` values intact. Six are complete (SELFISHMEME, MEMEGREEN,
  CARDINALDOOM, RARECIPHER, MADMIRROR, FAKEGIANTS); the ten pepe.wtf has not
  published carry `no_artist`/`no_supply`/`no_issuance` and display from a
  fakeraredirectory image until upstream catches up.

## [5.5.2] - 2026-08-20

### Fixed

- **`/fc` did not count xAI spend at all.** Every Grok call the bot has ever
  made was invisible to the cost report, which means `/fc` has been an OpenAI
  report presented as a total. `XHarvestService` calls `api.x.ai` with a plain
  `fetch` rather than through `modelGateway`, and the gateway is what feeds
  `TelemetryService`.

  The exact figure was already in hand and being thrown away: xAI returns
  `usage.cost_in_usd_ticks`, and it went to a `logger.debug` line that
  production does not emit. Harvest now records each query — three per cycle,
  every 24h — as `X-Harvest-<query>` under action `x_harvest`, using xAI's own
  accounting.

  If xAI ever omits the cost, the fallback runs token counts through
  `calculateCost`, which knows no xAI pricing and would silently apply
  gpt-4o-mini's. That path logs a warning rather than presenting an estimate as
  a measurement — and `readXaiSpend` returns a null cost rather than a zero,
  which would be indistinguishable from a free call.

## [5.5.1] - 2026-08-20

### Fixed

- **`/fr` told every artist they were nearly out of room.** The success line
  said "One more slot left on this card" for every entry but the last — true
  when the cap was 2, and wrong since it became 10. Storing your first piece of
  lore announced one remaining slot when nine were free. It now reports the
  actual count.
- Two doc comments still described the cap as 2 and the artist gate as fatal.
  Both have been wrong since `MAX_ENTRIES_PER_CARD` was raised and vouching was
  added.

## [5.5.0] - 2026-08-20

Storing lore was too hard, and the reason was not any of the gates that were
designed: it was a small model with "Be strict" in its system prompt overruling
people who own the archive.

### Changed

- **The quality screen no longer outvotes authority.** `gateSubmission` already
  decides whether a submitter has standing on a card — the credited artist or an
  admin routes to `store`, everyone else to community vouching. The model screen
  then ignored that and judged everyone alike. PEPEDAWN's own artist was told
  that "the first fake rare that is both a card and an agent" was "a bare
  classification claim, not story, context, history, or an anecdote".

  The screen still runs for those submitters and its verdict is still logged, so
  "would it have blocked this?" stays answerable — it simply no longer has the
  last word over someone who has one. For third-party submissions it stays
  binding, backed by vouching.

- **Significance is lore.** The screen asked for origin anecdotes and listed "a
  bare fact already in a database" as disqualifying, which rejected exactly the
  contributions a database cannot hold: what a card is, what it did first, what
  it means here. What stays disqualifying is narrow — authorship claims (the
  manifest is the authority), insults, invention, and bare specifications. The
  screen is now told to err towards accepting.

- **The screen being down no longer decides policy.** It used to be strict when
  the API answered and absent when it threw. Artists were never blocked by it;
  third-party lore still faces the room, which is the real check.

- **Rejections hand the submission back.** Retyping a paragraph into a phone to
  try different wording was the actual cost of a refusal. The text now comes
  back with the reason, ready to edit.

### Added

- **`/fr!` — admin force.** Stores past the taste gates and only those: the card
  must still resolve, the per-card cap still holds, duplicates are still
  refused, and authorship claims are still refused. Logged at warn level with
  the submitter and the text. A judgement call the screen gets wrong should cost
  a character, not an argument with a bot in front of the room.

### Fixed

- `/frisbee` was a lore submission beginning "isbee". `/fr` now needs a word
  boundary.

### Security

- `loreDetectorEvaluator` is documented as not-to-be-registered, and its unused
  import removed from the plugin. It writes to the knowledge base straight from
  conversation with none of the `/fr` gates in front of it. `/fr` and `/vouch`
  remain the only two paths into the corpus, which is what makes every write
  accountable.

## [5.4.2] - 2026-08-20

### Changed

- **Harvested tweets are woven into the reply, not dropped under it.** Tweets
  feed three things, and only one of them is prose: a quiet room gets the
  volunteer push, someone asking what is happening on X gets the digest, and a
  live conversation gets — at most — a passing, credited mention. The third was
  implemented as a tweet card posted after the answer, which read as a non
  sequitur stapled to a finished thought.

  The post now reaches the model as attributed context: a stranger's words, to
  be credited out loud if they connect — a real connection or a funny one — and
  left out entirely otherwise. Never offered when the card index already
  answered the question exactly; a settled fact does not want a tweet attached,
  and card facts still come from the index alone.

  A post is spent only when the reply actually credits its author, so one the
  model declined stays available and starts no cooldown. `revealMatchingTweet`
  is gone; the tweet card survives only where someone asked for it.

### Fixed

- **One shared word is no longer a connection.** "who created DJPEPE ?" pulled
  in a post about unreadable JSONs because "created" and "create" stem alike.
  That term counted as distinctive only because distinctiveness is measured
  against the store: the bar is "appears in at most a fifth of posts", and with
  35 posts that is most of the language. Cards and authors remain signals on
  their own; plain vocabulary now needs two distinctive terms.
- A reveal that succeeded logged nothing, so a tweet appearing in the room could
  not be traced to the path that sent it. The weave logs when it lands.

## [5.4.1] - 2026-08-20

### Fixed

- **The bot contradicted its own answer.** "who created DJPEPE ?" was answered
  correctly — "DJPEPE (Rare Pepes) is by Rare Scrilla" — and then, in a second
  message, "❌ Could not find DJPEPE in the Fake Rares collection." 5.3.4 taught
  the *lookup* about all three collections; the *display* still went through
  `/f`, which only knows Fake Rares, so any card outside it produced an answer
  followed by a denial of that answer.

  A card is now shown by the action that owns its collection — `/p` for Rare
  Pepes, `/c` for Fake Commons, `/f` for Fake Rares — resolved through
  `getAnyCardInfo`. And a display nobody asked for no longer announces a miss:
  the "could not find" text belongs to an explicit `/f`, not to an image
  volunteered alongside an answer. Both automatic display paths go through one
  function now instead of hardcoding `/f`.

- **An unrelated tweet followed the answer.** The X reveal matched a Rare Pepe
  lore post about PEPONG to a question about DJPEPE, on the strength of
  "created" stemming to the same term as "creator" — one shared word, counted
  as distinctive only because the harvest store is small. A post about other
  cards is not a post about this one: when the user names cards and the post
  names cards, they must now be the same cards.

## [5.4.0] - 2026-08-20

Type errors and test failures both to zero. `npx tsc --noEmit` reported 37
errors and `bun test src/__tests__/` failed 10-12 tests plus one file that
could not load; both had been treated as a known-good baseline for long enough
to be written into the runbook. Three of the type errors were live bugs.

### Fixed

- **The user-history provider never reached a prompt.** `Provider.get` must
  return a `ProviderResult`; this one returned bare strings, so `result.text`
  was `undefined` on every call and the context it assembles - what a user
  talks about, which artists they mention - was discarded. Its own tests
  asserted the broken shape, which is why they never caught it.
- **Two card handlers logged `[object Object]` instead of the error.**
  `logger.error({ error }, "Error in /c handler")` against the action logger,
  whose signature is `(message, error)`: the message became "[object Object]"
  and the real error was formatted as the message. Same in `/p`.
- **`TelemetryService` never implemented `stop()`.** `Service` declares it
  abstract; the class had only a static `stop`, so the archive timer survived
  shutdown. The static now delegates to a real instance method that clears it.
- **The build silently shipped no type declarations.** `tsconfig.build.json`
  listed three entry files, one of them `src/character.ts`, which was renamed
  to `pepedawn.ts` long ago - so `tsc` bailed with TS6307 on the first import
  outside that list and the build printed a warning and carried on. And because
  `--incremental` state outlives the directory it describes, a stale
  `tsconfig.build.tsbuildinfo` let `tsc` conclude declarations were up to date
  after `dist` had just been deleted. Both fixed; `dist/index.d.ts` now exists.
- Five imports pointed at `../models/transaction.js` and
  `../events/transactionEvents.js`, which moved into `src/types/` at some point.
  Type-only imports, so nothing broke at runtime and nothing flagged it.
- `MediaExtension` existed in three copies that had drifted. The Commons and
  Rare Pepes scrapes contain uppercase `"GIF"`; the shared copy used by
  `CardDisplayService` did not allow it. Now one definition in `src/types/media.ts`.
- `ZodError.errors` (removed in zod 4) → `.issues` in the plugin config
  validator, which would have thrown while reporting a config error.

### Changed

- Card attachments now go through `asMedia()` in `src/utils/cardAttachments.ts`.
  Core's `Media` type wants its `ContentType` enum, but `messageManager`
  dispatches on MIME - `/^video\//`, the exact string `'image/gif'` - so the
  MIME string is the real contract. Reconciled once, under a name, instead of
  three unexplained casts.
- PGlite query results are typed at the call site in `transactionHistory`, and
  `result.rowCount` - which PGlite does not have - is gone. `COUNT(*)` is
  coerced through one helper rather than `parseInt()` on a value that is
  sometimes already a number.
- **Scaffolding tests now assert this project's contract, not the ElizaOS
  starter template's.** They required `tsup.config.ts` (this project builds with
  `build.ts` and vite), a README beginning "# Project Starter", a vite frontend
  step the build no longer has, and a plugin ordering the character has never
  used. `build-order.test.ts` now runs the real build and checks what production
  depends on: the bundle, the card indexes copied into `dist/data`, the PGlite
  WASM, and the declarations.
- `character-plugin-ordering.test.ts` imported `../character` and could not
  load at all. It now imports `../pepedawn` and asserts the real ordering:
  bootstrap, openai and sql lead; knowledge follows the AI providers; platform
  plugins close.

## [5.3.5] - 2026-08-20

### Fixed

- The bot's own wrong answer became its source. At 10:32 it said "DJPepe was
  created by rabbidfly" (the lookup bug fixed in 5.3.4). A user repeated that
  back to it, the bot restated it, and both turns stayed in the room transcript.
  An hour later - after 5.3.4 was live - "who is the true creator of that card?"
  was answered "The true creator is rabbidfly", composed from that transcript.

  Two gaps let it happen. The attribution vocabulary was five phrases
  (`artist`, `who made`, `who drew`, `who created`, `created by`) and matched
  none of "who is the true creator", so the question never reached the card
  index at all. And when the index does not answer, the question falls to
  retrieval, which composes from prose - including the last eight turns of the
  room, where anything the bot previously said reads as established.

  Attribution is now answered from the card index or not at all. The vocabulary
  covers how people actually ask - creator, made by, drawn by, whose card, who
  is behind, who did - and a question about who made "that card", where no card
  can be resolved, asks which card rather than reaching retrieval. Asking is the
  only answer that cannot be poisoned by what was said earlier in the room.

## [5.3.4] - 2026-08-20

### Fixed

- The bot credited the wrong artist for a card, confidently. "pepedawn who
  created djpepe ?" in the official channel was answered "DJPepe was created by
  rabbidfly." DJPEPE is a Rare Pepe, series 4, by Rare Scrilla.

  Two faults met. The structured lookup read the Fake Rares index alone, so
  DJPEPE - along with every other Rare Pepe and Fake Common, two thirds of the
  4,484 known assets - was invisible to it. And "pepedawn", typed only to
  address the bot, was matched as a card; its artist was then handed to the
  model as "THIS IS THE ANSWER, and it is exact", which the model duly attached
  to the card the user had actually asked about. The router carries five
  separate guards against its own name being read as a card, but all five sit
  downstream of this lookup, which short-circuits ahead of them.

  Card lookups now span all three collections, and name the collection when it
  is not Fake Rares - series numbering restarts in each, so "series 4" alone is
  not an answer. PEPEDAWN never outranks another card named in the same message,
  and counts on its own only when the phrasing is genuinely about the card. The
  bot-name test is now shared with the router rather than duplicated.

- Assets match as whole words. Matching was a substring scan, so a card name
  buried inside another word was read as a reference to that card - the same
  fault already fixed for artist names, where "RC" hid inside "scarcest".

### Changed

- An artist's largest/smallest supply now says "(Fake Rares)". That lookup only
  ever considered Fake Rares, and for an artist with cards in more than one
  collection - Rare Scrilla has both - an unqualified superlative was
  misleading.

## [5.0.0] - 2026-08-19

Conversational redesign. PEPEDAWN answers from data it actually has, says less,
and remembers the room. See
`telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md` for the measurements behind each
decision.

### Removed — BREAKING

- **Commands `/fl`, `/fv`, `/ft`, `/dawn`, `/educate`** and everything that
  existed to warn about them. All had zero recorded use in the trailing quarter;
  lore, visual description and card questions are answered in conversation now.
- **Card discovery.** 546 router decisions, 60% of them not questions at all
  ("GM fakes...", "Woow BREAKUP is a wicked card!"). Genuine descriptor searches
  amounted to roughly two examples in 9.5 months.
- **ElizaOS bootstrap handoff.** Served 2.9% of conversations and was the sole
  reason the `__handledByCustom` sentinel was threaded through three files. The
  router now owns the decision end to end; anything it declines is silence.
- **The engagement-score filter.** It computed suppression, ran the entire router
  anyway, then applied the decision afterwards. Rate control is now the cadence
  governor, enforced in code.
- **LORE as a separate mode.** 0.8% of decisions, 69% of total LLM spend.
- **The PEPEDAWN disambiguator** — a model round-trip to decide whether
  "pepedawn" meant the bot or the card; the mention and reply flags already say.
- **The Telegram archive from all RAG.** Frozen at 2025-10-11, 22% of it
  misclassified as authoritative wiki, and its strongest hits were form-matches
  rather than answers. Set `RAG_INCLUDE_TELEGRAM=true` to compare.
- `visionAnalyzer`, `visualEmbeddings`, `embeddingsDb` and the 18MB
  `card-embeddings.json`, all reachable only from the removed commands.

Together ~2,355 of 11,483 LLM calls no longer happen.

### Added

- **Cadence governor** (`src/conversation/`) — share of voice, a ban on
  consecutive turns, a minimum gap and unaddressed backoff, with a full
  exemption when the bot is addressed. Replayed against 20,742 production
  events: worst 10-minute burst **67 → 10**, replies less than 60s apart
  **43.6% → 2.4%**.
- **Room temperature and a register ladder** so a wall of lore is structurally
  impossible while the room is bantering.
- **Exact card lookups** (`cardQueries.ts`) — artist, issuance, supply, series,
  an artist's largest or smallest card. The fact is produced by code; the model
  only wraps it.
- **Visual trait search** (`cardTraits.ts`) — "most red", "sexiest",
  "most psychedelic" answered from what the /fv pass recorded, via a 133KB index
  built by `scripts/build-card-traits.ts`.
- **Person-linked social memory** — episodes, highlights, quotes and reactions,
  scored by `similarity × decay × participantBoost` so a line from someone in
  the room outranks a better one from someone absent.
- **Persistent room history**, surviving the nightly 02:00 restart, feeding the
  classifier, CHAT and FACTS alike.
- **Follow-up resolution**: "who made it?" resolves to the card in play.
- **Card images alongside answers** — any reply about a card now shows it.
- `V5_SHADOW`, `V5_ENFORCE`, `CHAT_MODEL`, `RAG_INCLUDE_TELEGRAM`,
  `SHOW_SOURCES`; `scripts/run-testbot.sh`, `scripts/replay-cadence.ts`.

### Changed

- **Models → `gpt-5.6-luna`.** Outperforms the previous frontier tier at roughly
  a twelfth the input cost of the `gpt-4o` used for lore.
- Retrieval relevance floor raised to **0.45** across every source; measured mean
  similarity for chat retrieval was 0.34, i.e. mostly noise.
- CHAT grounds on card data, wiki and memories rather than old chat logs.
- Taste questions get an owned opinion or a randomly drawn card, never a
  justification built from supply numbers.
- `/fr` repositioned as the artist lore channel and restored to `/help`.

### Fixed

- `TelemetryService` used `logger` 17 times without importing it.
- `modelGateway` sent a `reasoning_effort` value the gpt-5.6 family rejects,
  which would have 400'd every call.
- Card answers echoed stub memories instead of the card manifest.
- Artist matching hit substrings — an artist named "RC" inside "sca**rc**est".
- Every card pool was the Fake Rares index, so a Fake Commons question was
  answered with a Fake Rare.
- `RoomHistory` lost turns when appends overlapped.
- Cadence could silence safety replies; it now sits below the content filters.

## [5.0.6] - 2026-08-19

### Fixed

- A direct question to the bot was answered with silence. "pepedawn how do YOU
  FEEL?" was classified NORESPONSE and ignored - twice, while the room watched
  and someone remarked "pepedawn is ignoring us". The classifier silences
  anything outside Fake Rares, and a question about the bot itself is off-topic
  by that rule. Being addressed now overrides an off-topic or closing
  classification, provided the message is actually a question. Hostility and
  one-word dismissals still pass through as silence.

## [5.0.5] - 2026-08-19

### Fixed

- The bot volunteered a card for ordinary conversation. "oh no, i get really
  awkward in small places when scrilla is there" was answered "DONALDTPEPE by
  Rodro - the vision pass recorded: get." followed by the card video. Three
  faults compounded and all three are fixed: trait search was never gated on the
  message concerning cards; the descriptive check was satisfied by the bare
  intensifier "really"; and arbitrary words were scored against recorded traits,
  so the word "get" picked a card.

  Trait search now runs only when the message concerns cards AND names a real
  visual quality, and only recognised descriptive vocabulary - colours, moods,
  styles - can score at all. Ordinary chatter now yields no search terms
  whatsoever, so a card cannot be named however the sentence is phrased.

## [5.0.4] - 2026-08-19

### Fixed

- Addressing the bot by plain name still pulled PEPEDAWN card lore into the
  answer. "pepedawn i wouldnt soul my soull, but what about loaning it out with
  %?" retrieved three memory and three card_data passages and replied about the
  card's symbolism. Stripping the name from the retrieval query required an
  @mention, a reply or a DM - but a plain vocative is none of those, and it is
  how people actually address the bot. Card-shaped phrasing is now the signal,
  not the delivery mechanism.

## [5.0.3] - 2026-08-19

### Fixed

- "Hey pepedawn, should I interpret what Scrilla said as a compliment?" was
  answered by prepending the PEPEDAWN card's specifications and posting its
  image. buildFactsPlan treated any mention of the name as a named card; 5.0.1
  had guarded the other two inference paths but not this one.
- A card the model invented in ordinary chat was displayed. "lol - more work to
  do" retrieved nothing at all, yet the reply recommended HELLAPAPELLA and the
  image was posted, because the display fallback showed any card named in a
  reply. It now requires that the user's message was about cards.
- Recent conversation never reached factual answers. The transcript was passed
  only to the LORE composition call, which is unreachable since LORE collapsed
  into FACTS, so "what Scrilla said" had no context to resolve against.

## [5.0.2] - 2026-08-19

### Fixed

- Personal questions were answered through whatever card happened to embed
  nearby. Retrieval runs for every CHAT turn and the preset weights card_data at
  2.4, so "if you had feelings, which would you have right now?" pulled six card
  fragments and the reply became "...the feeling behind FEELSMAGICAL". Card
  facts are now only offered as grounding when the message actually concerns
  cards. Addressing the bot by name is not a card signal, since PEPEDAWN is also
  a card.

## [5.0.1] - 2026-08-19

### Fixed

- The PEPEDAWN card was shown when "pepedawn" meant the bot. It is both a card
  and the bot's own name, and the bot says its name constantly ("PEPEDAWN
  endures"), so the card was surfacing in replies that had nothing to do with
  it. The card is never inferred from prose now; it is shown only when it is the
  explicit subject, which reaches the display path on the plan rather than by
  guessing. Inheriting it as "the card in play" for a follow-up also requires
  that a user asked about it as a card - possessive or attribute-seeking
  phrasing - rather than merely addressing the bot.

## [Unreleased]

### Added
- **v5 conversation core** (`src/conversation/`) — plain TypeScript, no ElizaOS imports
  - Register ladder (`SILENT`→`REACT`→`BANTER`→`ANSWER`→`DEEP`) separating *how much to say*
    from *what to look up*; retrieval is structurally impossible below `ANSWER`
  - Room temperature: caps register from message rate, terseness, participant count and
    question density. No LLM call
  - **Cadence governor**: code-enforced restraint — share of voice, consecutive-turn ban,
    minimum gap, unaddressed backoff, with a full exemption when the bot is addressed
  - Persistent room history, fixing the amnesia caused by the nightly 02:00 PM2 restart
- **Shadow mode** (`V5_SHADOW=true`) — observes live traffic and records what v5 *would*
  decide, without sending. Output in `src/data/shadow-logs.jsonl`
- `scripts/replay-cadence.ts` — replays the governor against production telemetry
- `TelemetryService.logCommandUsage()` → `command-logs.jsonl`, giving durable per-command
  data (PM2 logs rotate and left multi-month gaps)
- `CLAUDE.md` and `docs/TESTING_WITH_TEST_BOT.md`

### Changed
- **Deprecated `/dawn`, `/fl`, `/ft`, `/fv`, `/educate`** — zero recorded use in the
  trailing quarter. They still work and emit a notice naming their replacement; removable
  after 2026-11-18. Registry with the supporting usage data in
  `src/config/deprecatedCommands.ts`
- `/help` no longer lists deprecated commands and points at plain conversation
- Direct messages now count as addressing the bot, so group cadence rules do not apply
  in a 1:1 chat

### Fixed
- **`/fc` under-reported spend and had a breakdown that could never render.**
  Embedding calls were skipped by the runtime telemetry patch with a comment
  claiming they were "tracked separately" — nothing tracked them, and the
  embedding models were absent from `MODEL_PRICING`, so every total omitted
  them. They are now logged under a distinct `Embeddings` type, billed on input
  only, and priced for `text-embedding-3-{small,large}` and `ada-002`.
  Separately, `TokenLog.actionName` was aggregated into a **By Action** section
  that no caller ever populated. Model calls now inherit an ambient action label
  (`src/utils/actionContext.ts`, `AsyncLocalStorage`) set by `executeCommand()`
  and around the smart-router block, so the report distinguishes an explicit
  `/fl` from the same lore retrieval reached by auto-routing — the question
  `src/config/deprecatedCommands.ts` exists to answer. Rows predating this
  bucket as `(unattributed)` so the section still sums to the reported total
- `TelemetryService` bound its five JSONL paths at import time from
  `process.cwd()`, so a test could only redirect them by winning the import
  race — and lost it, appending fixtures to the production cost log. Paths now
  resolve per call and honour `TELEMETRY_DATA_DIR`
- `/fc` matched any command starting with those letters (`/fcarousel` was swallowed and
  answered nothing); the pattern is now anchored like every other command, and its
  dispatch branch no longer hides the always-handled behaviour behind an
  `if (executed || !executed)` tautology
- `TelemetryService` used `logger` 17 times without importing it — every call would have
  thrown at runtime. Repo typecheck errors dropped 61 → 46
- `RoomHistory` lost turns when appends overlapped; appends are now serialized per room
  and the read/append pair is atomic
- Removed the dead `educateNewcomerAction` import — never registered, unreachable

### Notes
- Measured against 20,742 production events: worst 10-minute burst **67 → 10**, replies
  less than 60s apart **43.6% → 2.4%**, share of traffic 34.4% → 21.7%
- **Card Lore Embedding Pipeline**
  - New scripts (`scripts/fv-crawl-sample.ts`, `fv-crawl-all.ts`, `fv-embed-card-facts.ts`, `fv-merge-card-facts.ts`) to crawl, embed, and consolidate Fake Rare lore.
  - `scripts/import-card-visual-facts.ts` and `types/cardVisualFacts.ts` to normalize visual lore facts.
  - Regenerated `plugin-knowledge-index.js` with embedding-backed card memory metadata.

### Changed
- `KnowledgeOrchestratorService`, `loreRetrieval`, and `queryClassifier` tuned to prioritize embedded card facts and improve `/fv` flows.
- Telegram message chunking now recombines short `/fl` replies into a single post.
- Lore/FACT auto-routing refined: exact card-name gating, sticky card memories, and LORE question auto-routing ensure `/fl` and card queries return precise stories.
- Submission rules and other global policy questions now bypass engagement suppression and link directly to the canonical wiki guide.
- `/fl` responses escape Telegram Markdown V2 characters and synthesize fallbacks to avoid empty or 1-word replies.

### Fixed
- `/fl` responses preserve newline formatting when lore memories contain escaped characters.
- Telegram plugin retries without Markdown when Telegram rejects entity parsing, preventing 400 errors.

### Tests
- Added regression coverage for newline normalization, Telegram Markdown fallback, and `/fv` lore retrieval behavior.

## [3.10.0] - 2025-11-06

### Added
- **`/fm CARDNAME`** - Real-time dispenser query for any card (e.g., `/fm FAKEASF`)
  - Fetches live dispenser data directly from Counterparty API
  - Shows top 5 cheapest dispensers with price, availability, address, and TokenScan link
  - Supports fuzzy matching for card names (exact match, then fuzzy fallback)
  - Compact bullet-point format for easy scanning
- New `DispenserQueryService` for real-time dispenser data fetching
- New `fuzzyMatch.ts` utility module (extracted from fakeRaresCard.ts for reusability)
- Test coverage for `/fm CARDNAME` validation and card name pattern matching

### Fixed
- **Telegram link previews** - Markdown links now render properly in both DMs and group chats
  - Added `link_preview_options: { is_disabled: true }` to messageManager DM path
  - Added `link_preview_options: { is_disabled: true }` to messageManager group path
  - Fixed missing `channelType` in action callback responses
  - All `/fm` responses now properly pass `channelType` for correct message routing

### Changed
- Updated `/help` command to include new `/fm CARDNAME` usage
- Updated periodic content tips to mention live dispenser queries
- Enhanced `/fm` command parser to differentiate between numeric limits and card names

### Technical Details
- messageManager now uses modern Telegram Bot API `link_preview_options` (replaces deprecated `disable_web_page_preview`)
- Action callbacks now properly propagate `channelType` from incoming messages to outgoing responses
- Fuzzy matching utilities now shared between `/f` and `/fm` commands

## [3.5.1] - 2025-11-04

### Changed
- Upgraded ElizaOS core packages to 1.6.3 (from 1.6.2)
- Updated `@elizaos/plugin-knowledge` to 1.5.13 (from 1.5.11)
- Updated `@elizaos/plugin-openai` to 1.5.18 (from 1.5.16)

### Technical Details
- Dependency upgrades tested and verified in worktree before merging to main
- No breaking changes in ElizaOS 1.6.3 affecting local Telegram fork
- Build and runtime compatibility confirmed

## [3.5.0] - 2025-11-04

### Added
- Local fork of `@elizaos/plugin-telegram` with all production fixes integrated
- Comprehensive attachment processing for `/ft` command (photos, videos, GIFs)
- Arweave video streaming download support (49MB limit, 5-minute timeout)
- Extended Telegraf handler timeout (300s) for large media processing
- Text cleaning utility to remove null bytes from content
- `FORK_MIGRATION.md` documentation for fork approach

### Changed
- **BREAKING:** Migrated from `patch-package` to local fork approach for Telegram plugin
- Removed `patch-package` from postinstall script
- Simplified postinstall to only run `postinstall-fix.sh` (claude-code stub)
- Updated message processing to extract all attachment types from incoming messages
- Improved error handling to prevent bot crashes on timeouts

### Fixed
- ✅ Buttons now appear under media attachments (GIFs, images, videos)
- ✅ GIF rendering uses native `replyWithAnimation()` for inline playback
- ✅ Arweave videos stream correctly without URL encoding issues
- ✅ Bootstrap suppression prevents double-processing of messages
- ✅ Short LLM responses (36-41 tokens) now send successfully via `mentionContext`
- ✅ Bot no longer crashes on large video processing timeouts
- ✅ Duplicate media sends eliminated (sequential processing with `sentPrimaryMedia` flag)
- ✅ `/ft` command properly extracts user-uploaded image attachments

### Removed
- Deleted old patch file (`@elizaos+plugin-telegram+1.0.10.patch`)
- Removed debug logging from build script
- Cleaned up temporary patch backup files

---

## [3.4.0] - 2024-XX-XX

### Added
- `/p` command for Rare Pepes collection browsing

---

## [3.3.2] - 2024-XX-XX

### Fixed
- Bootstrap reply detection improvements
- FACTS fallback handling

---

_For older releases, see git history._


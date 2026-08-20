# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


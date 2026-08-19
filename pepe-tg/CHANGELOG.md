# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


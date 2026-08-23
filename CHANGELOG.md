# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.6.2] - 2026-08-23

### Fixed
- **The bot named a card and then asked what the person was looking for.** Someone
  posted "on the hunt for a PEPEPUNKROCK if anyone knows anyone selling" and got
  back "PEPEPUNKROCK — by REY, series 8, card 37, supply 79, issued July 2022.
  Not sure what you're after. Name a card, or ask me about an artist, a series,
  or a bit of history."

  Both halves came from the FACTS plan. The card index supplied the specs, and
  retrieval — which found no lore for the card — returned the clarification
  stand-in, which `buildFactsPlan` then appended as if it were an answer. The
  existing guard only dropped *thin* answers (14 words or fewer); the
  clarification is 21 words, so it sailed through.

  `KnowledgeRetrievalResult` now carries `isNonAnswer`, set when the orchestrator
  falls back to the clarification, and the FACTS plan will not append a
  non-answer to material of its own. When a card is named and nothing else is
  known, the reply is the card facts and nothing more. The clarification still
  stands alone when no card was recognised, and the "lore vault is empty" invite
  is unaffected — that one is a real reply to a card someone named.

## [5.6.1] - 2026-08-21

### Added
- **Visual traits for the six new Series 18 cards.** The Series 18 backfill added
  the cards to the index, but the vision pass behind `card-visual-traits.json`
  last ran in November 2025, so descriptive questions ("most red", "which one has
  birds") could not reach them. Crawled, merged, summarised and embedded the six
  cards pepe.wtf has published, then merged the result into the traits file:
  875 -> 881 cards.

  The matching 29 fact blocks were imported into the production corpus in a
  separate operation (3,986 -> 4,015 blocks, 875 -> 881 cards), which is what
  lets PEPEDAWN discuss their imagery in conversation. The two paths are
  independent: the corpus feeds `expandCardOnlyPassages`, this file feeds
  `describeTraitMatch`.

  The ten Series 18 cards pepe.wtf has not published are excluded - there is no
  full-resolution artwork to analyse, only a 400px directory thumbnail.

## [5.6.0] - 2026-08-21

### Fixed
- **X harvesting ran once per restart, not once per day.** `XHarvestService`
  armed a 5-minute timer at boot and only then set the 24h interval - but
  production hard-restarts nightly at 02:00 and again on every deploy, so the
  process never lived long enough to reach the interval. The post-boot harvest
  *was* the cadence, and every restart bought another full round of paid
  queries: on 2026-08-21 it ran four times in three hours, two of them because
  of deploys. The schedule is now anchored to a `lastHarvestAt` timestamp
  persisted in the harvest store, so a restart inside the interval skips its
  round. `X_HARVEST_INTERVAL_HOURS` finally means what it says.

### Changed
- **Harvest model is now grok-4.3, still a reasoning model.** Measured on the
  same prompt: grok-4.3 $0.026/49s, grok-4.20-0309-reasoning $0.028/55s,
  grok-4.6 $0.075/107s, grok-4.20-0309-non-reasoning $0.121/17s. Turning
  reasoning *off* cost 2.3x more - with nothing narrowing the search, x_search
  poured 65k tokens of raw results into the request instead of 8k, so the saving
  on thinking was wiped out by reading. Set `XAI_MODEL` to override.
- **Dropped the `phrase` harvest query.** Over its lifetime it returned 6 posts:
  none named a card, none were volunteered, none were ever used in a
  conversation. `market` and `curated` produced every post the bot has actually
  said out loud.

Together these take a day of harvesting from ~$1.41 to ~$0.08.

## [5.5.4] - 2026-08-20

### Fixed
- **New cards showed metadata but no image.** When pepe.wtf serves a standard
  S3 path the scraper saves no `imageUri`, because the display URL can be
  rebuilt from series + asset + `ext`. It also normalised `jpg` to `jpeg` - and
  S3 stores many objects as `.jpg`, so the rebuilt URL 403'd. Series 18 cards
  26-31 were affected. The normalisation is gone, and `add-new-cards.js` now
  confirms the extension against the bucket before trusting a rebuilt URL,
  falling back to a stored image URL when the bucket serves none. A miss on S3
  returns 403 rather than 404 - the bucket denies ListBucket - so probing each
  candidate is the only reliable test.

### Changed
- **Series 18 cards 32-41 now carry artist and supply.** Both read from the
  series-18 directory page and confirmed against Counterparty, where every
  supply matches and is locked. These cards are on chain but not formally
  issued as Fake Rares yet, so they have no issuance date; they are flagged
  `awaiting_formal_issuance` as the trigger to revisit.

## [5.5.3] - 2026-08-20

### Fixed
- **The card scraper erased hand-curated data when it revisited a card.** Any
  card carrying an `issues` array was queued for re-scraping, and Pass 2 rebuilt
  the record from scratch: it never copied `memeUri` forward, and a pepe.wtf 404
  returned nulls for artist, supply and issuance. Two cards (`FAKEIJUANA`,
  `STPEPERISES`) would have lost their `memeUri` on the next run - the same
  field repaired by hand across four earlier commits. `add-new-cards.js` is now
  append-only: it adds cards it has never seen and never rewrites an existing
  record. Cards that land incomplete are named at the end of the run and filled
  in by hand.
- **The auto-update workflow always reported it had found nothing.** It counted
  new cards by grepping the diff for `"name":`, a key the card schema does not
  have - it uses `"asset"`. Every commit the automation produced claimed zero
  cards, which is part of why the pipeline going quiet looked normal.

### Removed
- The scraper's closing hint to run `generate-card-embeddings.js`. That script
  imports `src/utils/visualEmbeddings.ts` and `src/utils/embeddingsDb.ts`,
  neither of which exists, so it fails on import.

### Added
- **Series 18 cards 26-41.** The scheduled scrape was suspended by GitHub on
  2026-01-25 for repository inactivity and had not run since, so the card index
  stopped at Series 18 card 25 while the series grew to 41. Backfilled with the
  now append-only scraper: 16 cards added, no existing record touched. Six are
  complete; the ten that pepe.wtf has not published yet carry `no_artist`,
  `no_supply` and `no_issuance` and display from a fakeraredirectory image until
  upstream catches up.

## [5.3.3] - 2026-08-20

### Fixed
- **The X digest was built and then thrown away.** It was sent with
  `message.roomId` as the Telegram `chat_id`, but ElizaOS stores
  `roomId = createUniqueUuid(runtime, chatId)` - a UUID, not a chat id - so
  Telegram returned HTTP 400 and the reply fell through to the FACTS path,
  which improvised an answer about X from the wiki corpus. Both the digest and
  the reveal now resolve the real chat id from the Telegram context, and a
  failed send is logged as a warning rather than passing silently.
- **The volunteer check read every room as empty.** It loaded room history by
  Telegram chat id, but history is keyed by the room UUID, so `load()` always
  returned `[]` and nothing would ever have been volunteered. The chat-id ↔
  room-uuid pairing is now learned from live messages, which also handles forum
  topics, where the key is `chatId-threadId` and cannot be derived from the
  chat id at all.

## [5.3.2] - 2026-08-20

### Fixed
- **"anything happening on X lately?" did not reach the digest.** The digest
  was gated on the message being a reply, an @mention or a DM - modelled on how
  commands work. But PEPEDAWN answers unaddressed questions too, so asked
  plainly in the channel it fell through to the FACTS path and improvised an
  answer about X from the wiki corpus: exactly the invented-answer failure the
  harvest exists to prevent.

  The addressing requirement is gone. `isXActivityQuestion` now carries the
  weight and additionally requires a question form, so a passing remark
  ("I saw it on twitter", "follow me on X") cannot trigger a digest
  mid-conversation. Added a 5-minute per-room cooldown.

## [5.3.1] - 2026-08-20

### Fixed
- **`deploy.sh` no longer hangs after a successful deploy.** Its final step ran
  `pm2 logs --lines 10`, which tails by default and never exits, so every
  deploy left an orphaned SSH session open until someone interrupted it by
  hand. Added `--nostream`. The release itself was always complete by then —
  which is what made this easy to miss.

## [5.3.0] - 2026-08-19

### Added
- **X harvest.** PEPEDAWN now collects recent Fake Rares / Rare Pepes activity
  from X via the xAI Agent Tools API and uses it three ways: it volunteers an
  item when the channel has been quiet, it reveals one that connects to what is
  being said, and it answers "what are people saying on X?" with a short
  digest. Posts are rendered as a Telegram card - 𝕏 mark, linked handle, the
  post itself, and its like / retweet / reply counts.
- Harvested posts are **shown, never fed to the model.** The reveal and the
  digest are sent as their own messages rather than as context for a generated
  reply, so nothing a stranger posted can be restated in PEPEDAWN's own voice
  or answered from as though it were known. This is why the cards are HTML:
  the callback path hardcodes Markdown, which chokes on handles like
  @subterranean_1.
- `scripts/x-probe.ts` - read-only reconnaissance against the X data API.
  Spends nothing without an explicit `--budget`.
- `src/data/artist-handles.json` - 271 artist-to-X-handle mappings covering 692
  of 898 cards, merged from pepe.wtf curated attribution and handles shared in
  the Telegram archive, each tagged with its source and confidence.
- New settings: `X_HARVEST_ENABLED`, `X_HARVEST_INTERVAL_HOURS`, `XAI_API_KEY`,
  `XAI_MODEL`.

### Fixed
- **`periodicContent` no longer calls `getUpdates`.** The hourly activity check
  polled the Telegram update queue directly, competing with the bot's own
  polling - the documented cause of a lost user message. It now reads the room
  history the bot already persists.

### Notes
- Harvested posts are deliberately kept out of the knowledge corpus. They are
  unreviewed third-party claims, and `memories` carries a 3.0 retrieval weight;
  ingesting them would reopen, more widely, the hole that `/fr` gating closed in
  5.1.0. They expire after 14 days.
- Query set was chosen by measurement, not guesswork: phrase and market search
  returned ~50% useful posts; hashtag and card-ticker search returned almost
  none and are not used. See `HARVEST_QUERIES` for why each was kept or dropped.

## [Unreleased]

## [5.2.0] - 2026-08-19

### Added
- **Community vouching for third-party lore.** The artist gate alone matched a
  Telegram handle for only a minority of the credited roster, so most genuine
  contributors were being turned away. Non-artist submissions are now *proposed*
  rather than refused: PEPEDAWN posts the lore with a short code, and two vouches
  from members in good standing store it. The credited artist or an admin is
  decisive on their own.
  - `/vouch` lists what is waiting, `/vouch CODE` confirms, `/vouch no CODE`
    drops it (admins)
  - Proposals expire after 24h — an unanswered proposal is a "no"
  - One open proposal per person and three per card, because a proposal is a
    broadcast to the room and therefore its own amplification vector
- **Participant standing registry** (`src/utils/participants.ts`). A vouch
  threshold with no notion of standing is defeated by registering accounts to
  vouch for each other, and the abuse it defends against was already automated.
  A voucher needs history that *predates the proposal*, which an account created
  to rubber-stamp it cannot have, plus a minimum age and message count.

### Changed
- Lore slots per card raised from 2 to **10**. The tight cap was standing in for
  the absence of any review; with review in place it mostly denied artists room
  to tell a story.
- Quality and card gates still run *before* a proposal is created — vouching
  decides whether a plausible claim is true, not whether junk is junk. The room
  should never be asked to adjudicate spam.
- New env vars: `PROPOSALS_PATH`, `PARTICIPANTS_PATH`

## [5.1.0] - 2026-08-19

### Security
- **`/fr` is now gated.** It was an unauthenticated write into the highest-weighted
  retrieval source (`memories: 3.0`, above wiki at 2.0 and card_data at 1.5): any
  user, any text up to 10k chars, unlimited repeats. On 2026-08-19 someone pushed
  21 false submissions through in 18 minutes. Four gates now apply, cheapest first:
  - must name a real card (matched against the index, case-insensitively — the old
    detector required ALL CAPS, so every lowercase spam entry was stored as
    *untagged general lore*, the least constrained tier)
  - the submitter must be the card's credited artist; collaborators on `A x B`
    cards both qualify, and admins bypass
  - at most 2 entries per card, counted from a ledger rather than vector search
    (a similarity threshold cannot enforce a hard cap)
  - the text must read like lore: length, emoji/link checks, rejection of
    authorship claims that contradict the card manifest, then a model screen
- **The natural-language `remember this:` path runs through the same gate.** It
  writes to the same store, so leaving it open would have made the `/fr` rules
  decorative.
- **Escalating rate limit on commands.** More than 5 in a minute silences a user
  for 10 minutes, then 1 hour, 1 day, and 1 week for continued abuse. State is
  persisted, because production restarts nightly and a day-long silence must
  survive that; the ladder decays after a clean week, measured from when the
  silence lifted rather than when the offence occurred. Retrying during a silence
  does not extend it, and the warning is sent exactly once.
- **Submissions are attributed.** `executeCommand` did not pass the Telegram
  context through, so every `/fr` entry was stored as user `unknown` — which made
  the artist check, per-user limiting and any purge-by-author impossible.

### Added
- `src/utils/loreSubmission.ts` — the submission policy, as pure functions
- `src/utils/loreInventory.ts` — quota ledger and audit trail for accepted lore
- `src/utils/rateLimiter.ts` — the escalating silence ladder
- `src/utils/admins.ts` — one admin check, replacing three inline copies
- `src/data/artist-aliases.json` — links a Telegram identity to a credited artist
  name, for artists whose handle does not resemble their signature
- `scripts/purge-lore-spam.ts` — lists and removes user-submitted memories with
  their embeddings; dry-run by default. There was previously no removal path.

### Changed
- `/help` states the `/fr` rules rather than inviting open contribution
- New env vars: `TELEGRAM_ADMIN_USERNAMES`, `LORE_LEDGER_PATH`, `RATE_LIMIT_PATH`

## [4.1.0] - 2025-11-16

### Changed
- **Reduced Bot Chattiness** - Improved intent classifier to be more selective about responses
  - Aggressive NORESPONSE routing for acknowledgements, hostile messages, and low-engagement interactions
  - Conversation exhaustion detection: Prefers silence when user messages shorten or bot has sent consecutive replies
  - Enhanced off-topic handling: No redirects or probes for off-topic messages
  - Mini few-shot examples added to classifier prompt for better pattern recognition
- **CHAT Response Length Limits** - Responses now scale with user message length
  - User < 5 words → 1-5 word reply (or single emoji)
  - User 5-15 words → one short sentence (≤ 16 words)
  - User > 15 words → one sentence (≤ 22 words), rarely two if necessary
  - No follow-up questions or probing ("anything else?")
  - Hostility cues trigger minimal neutral responses (emoji or 1-2 word acknowledge)
- **`/fl` Command Simplification** - Clean LORE-only storytelling interface
  - Removed all FACTS logic from `/fl` flow - always returns historian-style lore recounting
  - No query classification checks - `/fl` is purely for community stories and history
  - Simplified code path: ~100 lines of duplicate logic removed

### Fixed
- **LORE Mode Source Weights** - Corrected ranking boosts to match original heuristics
  - Card-fact: 5.0x → 1.2x (was incorrectly boosted, now lowest priority in LORE)
  - Telegram: 0.5x → 2.2x (was incorrectly penalized, now properly weighted for community chat)
  - Memory: 4.0x (unchanged, highest priority)
  - Wiki: 2.6x (unchanged)
  - Telegram messages now properly surface in `/fl` queries (e.g., `/fl coit`)
- **Source Diversity in LORE Mode** - Ensures all source types are represented
  - Added source diversity guarantees before MMR application
  - Prevents card-facts from dominating results even with higher scores
  - Telegram messages now included in final selection even when card-facts rank higher
- **Mode Propagation** - Fixed downstream functions to respect explicit LORE mode
  - `generatePersonaStory()` and `clusterAndSummarize()` now accept mode parameter
  - Prevents re-classification from overriding `/fl`'s forced LORE mode
  - Query "X COPY Fake Rare submissions" now correctly uses LORE prompts instead of FACTS

### Technical Details
- Updated classifier prompt with priority-based intent rules and exhaustion detection
- Updated CHAT generator prompt with word-count limits and energy matching
- Updated PEPEDAWN disambiguator prompt for clearer bot vs card distinction
- Mode-specific source weights in `loreRetrieval.ts` (LORE vs FACTS use different boosts)
- FACTS flow from SmartRouter remains unchanged and functional

## [4.0.0] - 2025-11-XX

### Added
- SmartRouter service for intelligent intent classification
- LLM-based off-topic detection
- NORESPONSE silence improvements

## [3.14.0] - 2025-11-11

### Fixed
- **LLM Integration Stability**  
  - Fixed ElizaOS `runtime.useModel()` conflicts by switching to direct `callTextModel()` for card discovery summaries and lore cluster summarization
  - Resolved GPT-5 model routing issues where ElizaOS was forcing `/v1/responses` endpoint instead of `/v1/chat/completions`
  - Added system message to prevent GPT models from escaping special characters in responses
- **Telegram Message Formatting**  
  - Removed unnecessary MarkdownV2 escaping from `/fl` lore responses that was causing `\.` `\,` `\[` artifacts
  - Lore stories now display cleanly without escaped punctuation or brackets

### Changed
- **Model Gateway Enhancement**  
  - All LLM calls through `modelGateway.ts` now include explicit system message for plain text output
  - Simplified `loreSummarize.ts` by removing redundant token estimation and manual logging (now handled by gateway)
  - Cleaned up `sanitizeForTelegram()` to only trim text without escaping (plain text mode)

### Added
- **Periodic Content Tips**  
  - Added `/xcp` command tip for XCP dispenser list feature
  - Updated `/fm` tip to clarify card-specific dispenser lookup functionality

## [3.12.0] - 2025-11-08

### Added
- **Inline Fuzzy Suggestions**  
  - `/f`, `/c`, and `/p` now surface tap-to-fill buttons when fuzzy matches are returned  
  - Shared `cardSuggestions` helper generates Markdown-safe messages + inline buttons  
  - New `rarePepesCard` action tests cover the legacy collection behaviour

### Changed
- **Unified Fuzzy Matching**  
  - Commons and Rare Pepes reuse the enhanced `/f` scoring (prefix/contains weighting)  
  - High-confidence auto-correct now requires ≥5 normalized characters to avoid single-word misfires  
  - Command parsers accept leading `@bot` mentions so inline buttons work in groups
- **Telegram Button Adapter**  
  - Plugin converts `switch_inline_query_current_chat` buttons for suggestion taps

### Documentation
- README highlights fuzzy suggestions across all card commands  
- Updated `telegram_docs/PEPEDAWN_HELP_VISUAL.md` + flow diagrams to reflect tap-to-fill UX

## [3.11.0] - 2025-11-07

### Added
- **Commons Awareness in `/f` Artist Flow**  
  - Artist searches now aggregate cards across Fake Rares and Commons collections  
  - Carousel displays show per-collection counts so admins can gauge coverage at a glance  
  - `/f` typo-correction replies include collection tag `(F)` or `(C)` in the header  
- **Commons Support in Carousel**  
  - Artist carousel ordering prioritizes Fake Rares, then Commons, keeping navigation predictable  
  - Carousel headers surface Fake vs Commons totals to make mixed collections obvious

### Changed
- **Card Display Messaging**  
  - Unified formatter adds `(F)` or `(C)` collection markers beside the series/card metadata  
  - Random card responses keep the 🎲 indicator while benefitting from the new metadata layout  
  - Fallback media selection now respects the originating collection when building S3 URLs
- **Market Notifications**  
  - Telegram notifier accepts comma-separated channel IDs (multi-broadcast support)  
  - Optional sale sticker triggers for dispenser/DEX sales without affecting listings  
  - Error handling downgrades per-channel failures to warnings to keep other postings flowing

### Technical Details
- Introduced `formatCollectionCounts()` helper shared by `/f` and carousel flows  
- Normalized `CardInfo` objects to always carry a `collection` flag for downstream consumers  
- Refreshed commons index bridge to reuse Fake Commons metadata without duplicating schemas

## [3.9.0] - 2025-11-06

### Added
- **Series Carousel Feature** (`/f c <SERIES>`) - Browse cards by series number
  - Works identically to artist carousel but filters by series (0-18)
  - Use `/f c 5` to browse all Series 5 cards in alphabetical order
  - Same ⬅️ Prev / ➡️ Next navigation with circular wrapping
  - Series-first detection: numeric input (0-18) routes to series, otherwise artist
  - Callback format updated to support both modes: `fc:action:type:identifier:index:total`
  - 'type' field: 's' for series, 'a' for artist
  - Shows "🎠 Carousel: Series 5 (X cards total)" header

### Changed
- **Carousel Action** - Unified to support both artist and series browsing
  - `buildCarouselButtons()` now accepts type parameter ('a' | 's')
  - `displayArtistCarousel()` renamed conceptually to handle both modes
  - `handleCarouselNavigation()` updated to decode type and route appropriately
  - **Smart Sorting**: Series carousels sort by card number (1→50), artist carousels sort alphabetically
  - Updated action description: "Browse artist's cards or series in interactive carousel"
  - Help command updated with `/f c SERIES` example
  - Added new periodic tip: "📚 Series Collection Browser"

### Technical Details
- Reuses existing `getCardsBySeries()` function from `fullCardIndex.ts`
- Test coverage: Added 3 new tests for series validation and navigation
- All 21 carousel tests passing
- Zero code duplication - same logic for both artist and series modes
- **Future-proof**: `SERIES_INFO.TOTAL_SERIES` auto-detects from card data
  - When Series 19 arrives, just update `fake-rares-data.json` - no code changes needed
  - Validation automatically extends to new series

## [3.8.0] - 2025-01-06

### Added
- **`/xcp` Command** - XCP Dispenser List Management
  - View verified XCP dispenser list curated by community
  - Authorization system: Specific usernames + `TELEGRAM_ADMIN_IDS` for updates
  - `/xcp` - View current dispenser list with metadata (updater, timestamp)
  - `/xcp [content]` - Update list (authorized users only, complete replace)
  - Persistent JSON storage at `src/data/xcp-dispensers.json`
  - Clean error messages for unauthorized update attempts
  - Integrated into help command and documentation

### Technical Details
- New action: `xcpCommand.ts` with dual authorization (username + Telegram ID)
- Pattern detection: Added `isXcp` to `messagePatterns.ts`
- Test coverage: 8 tests in `xcpCommand.test.ts` (view, update, authorization)
- Plugin integration: Wired into `fakeRaresPlugin.ts` event handler
- Help text updated in `basicCommands.ts`

## [3.7.0] - 2025-11-06

### Added
- **Automatic GIF→MP4 Conversion** - Large GIFs (>8MB) automatically convert to compressed MP4
  - Uses FFmpeg for high-quality compression (typically 60-80% size reduction)
  - Configurable threshold via `GIF_URL_MAX_MB` environment variable (default: 8MB)
  - Preserves quality while ensuring Telegram compatibility
  - Conversion cache prevents redundant processing
  - Applies to all card collections (Fake Rares, Fake Commons, Rare Pepes)

- **Telegram File ID Caching** - Prevents re-uploading previously sent media
  - Caches Telegram's `file_id` after first successful upload
  - Instant card delivery for repeat requests (no download/upload)
  - Stored in `src/data/telegram-file-ids.json`
  - Configurable location via `TELEGRAM_CACHE_FILE` env var
  - Dramatically improves performance and reduces bandwidth

- **memeUri Fallback System** - Multi-tier media delivery resilience
  - Primary: `videoUri` or `imageUri` (direct URLs)
  - Fallback 1: `memeUri` (static preview for oversized/dead URLs)
  - Fallback 2: S3 constructed URL
  - Automatically handles 49MB Telegram upload limit
  - Works for dead Arweave gateways and expired custom domains

### Changed
- **CardDisplayService** - Removed pre-upload size checking (now handled by file_id cache + fallback chain)
  - Eliminated 100+ lines of duplicate HEAD request code
  - Size checks moved to conversion layer (only for GIFs >8MB)
  - Oversized media gracefully handled via memeUri fallback
  - Faster card display (skips size checks when cache hit)

- **GIF Conversion Logic** - Centralized in `gifConversionHelper.ts`
  - Shared across all 3 card collections
  - Consistent behavior for `/f`, `/c`, `/p` commands
  - Returns structured `ConversionCheckResult` with metadata

### Fixed
- **Type Safety** - Removed outdated `@ts-ignore` comments in `cardUrlUtils.ts`
- **Bug Fix** - Corrected GIF conversion calls in `fakeCommonsCard.ts` and `rarePepesCard.ts`
  - Fixed wrong parameter (assetName → mediaExtension)
  - Fixed wrong return type handling (string → ConversionCheckResult object)
- **Cleanup** - Removed orphaned JSDoc comments in CardDisplayService

### Technical Details
- New utility: `gifConversionHelper.ts` - Centralized GIF processing logic
- New service: `videoConversionService.ts` - FFmpeg wrapper with caching
- New utility: `telegramFileIdCache.ts` - Persistent file_id storage
- File_id cache integrates seamlessly with messageManager upload loop
- All 309 tests passing (added 16 CardDisplayService tests)

### Environment Variables
- `GIF_URL_MAX_MB` - Conversion threshold for GIFs (default: 8)
- `TELEGRAM_CACHE_FILE` - Cache file location (default: src/data/telegram-file-ids.json)

## [3.6.0] - 2025-11-05

### Added
- **Artist Carousel Feature** (`/f c <ARTIST>`) - Interactive card browsing for Fake Rares
  - Browse all cards by an artist in alphabetical order
  - ⬅️ Prev / ➡️ Next buttons with circular navigation (wraps from last to first)
  - Shows card count (e.g., "3/11") and total collection size
  - Supports exact and fuzzy artist name matching
  - Works seamlessly in both DM and group conversations
  - Handles large media files with "File too large..." fallback messages

- **CardDisplayService** - Unified card display logic across all collections
  - Centralized media size checking with 5-minute caching
  - Eliminates ~450 lines of duplicated code across `/f`, `/c`, `/p` actions
  - 10x faster carousel navigation (cached size checks)
  - Instant repeated card requests (cache hits)
  - Supports fake-rares, fake-commons, rare-pepes collections
  - Graceful fallback if service unavailable (backward compatible)

### Changed
- Refactored `/f` command to exclude carousel mode (`/f c` now handled separately)
- Split carousel logic into dedicated `fakeRaresCarousel.ts` action (~325 lines)
- Updated `fakeRaresCard.ts`, `fakeCommonsCard.ts`, `rarePepesCard.ts` to use CardDisplayService
- Telegram plugin now accepts `callback_query` updates for button interactions
- MessageManager handles callback queries with delete+send pattern (robust for mixed media types)
- DM messages with attachments now route through `sendMessageInChunks` (fixes media display)
- Callback queries answered immediately to prevent Telegram timeout errors

### Technical Details
- Carousel state encoded in callback_data: `fc:action:artist:index:total`
- Navigation handler (`handleCarouselNavigation`) exported for Telegram plugin
- Service pattern follows ElizaOS best practices with `start()` and `stop()` methods
- Size check cache auto-expires after 5 minutes to handle URL changes
- Production logging cleaned: removed all debug markers and console.log statements

### Architecture
- Actions: `fakeRaresCard.ts` (1126 lines, -300) + `fakeRaresCarousel.ts` (325 lines, new)
- Service: `CardDisplayService.ts` (280 lines, new)
- Plugin: Updated to register carousel action and service
- Tests: Carousel documented as manual-only (UI-level Telegram callback testing required)

## [3.5.3] - 2025-11-05

### Added
- **Periodic Content Service** - Automated community engagement for Telegram channels
  - **60% tips** - Randomly selected helpful tips about bot features (`/f`, `/fv`, `/fm`, `/fl`, memory, etc.)
  - **40% card showcases** - Random cards from 890+ Fake Rares collection
  - Uses same URL resolution and formatting logic as `/f` command (handles all card types correctly)
  - Includes artist profile buttons when `FAKE_RARES_ARTIST_BUTTONS=true`
  - **Anti-spam protection**: Only posts if there's been user activity since last post
  - Configurable interval via `PERIODIC_CONTENT_INTERVAL_MINUTES` (default: 60 minutes)
  - Enable/disable via `PERIODIC_CONTENT_ENABLED=true/false`
  - Completely independent of market notification system

### Changed
- Exported `determineCardUrl`, `buildCardDisplayMessage`, and `buildArtistButton` from `fakeRaresCard.ts` for reuse in periodic content service

### Technical Details
- Periodic content and market notifications are completely separate systems
- Market notifications post immediately when trades/listings occur
- Periodic content respects user activity to prevent spam
- Clean production logging with info-level post confirmations

## [3.4.0] - 2025-11-03

### Added
- **`/p` Command** - Rare Pepes card display
  - `/p CARDNAME` - View specific Rare Pepes card (exact match)
  - `/p` - Random card from 1774 card collection
  - Supports all 36 series from the original Rare Pepes collection
  - Same Telegram post format as `/f` and `/c` (image, metadata, artist button)
  - Simple and fast: Exact match only (keeps it lightweight)

- **Rare Pepes Data Integration**
  - 1774 cards with full metadata (asset, series, card, artist, supply)
  - S3-hosted images via reliable URLs (no local storage needed)
  - `rarePepesIndex.ts` - Lookup utilities matching existing card index patterns
  - `rare-pepes-data.json` - Complete card database with `imageUri` fields
  - `generate-rare-pepes-json-with-urls.js` - API scraper for data regeneration

### Changed
- Build script now copies `rare-pepes-data.json` to `dist/data/`
- Help command updated with `/p` usage examples
- Message pattern detection extended to recognize `/p` command
- Plugin routing includes Rare Pepes card display handler

### Technical Details
- Data source: `https://api.pepe.wtf/api/asset?collection=rare-pepes`
- Image URLs: `https://pepewtf.s3.amazonaws.com/collections/rare-pepes/full/{series}/{filename}`
- Zero breaking changes - purely additive feature
- Separate action file (`rarePepesCard.ts`) - no risk to existing `/f` or `/c` logic
- **Total card coverage: 422 Fake Rares + 1,813 Fake Commons + 1,774 Rare Pepes = 4,009 cards**

## [3.3.1] - 2025-11-02

### Changed
- **Engagement Scoring Optimization** - Monte Carlo simulation on 264k real messages
  - Tested 72,000 parameter configurations across 6 engagement categories
  - **threshold**: 31 → 25 (lower barrier for engagement)
  - **cardBoost**: 20 → 15 (reduce card statement spam)
  - **questionBoost**: 35 → 30 (balanced question prioritization)
  - **multiwordBoost**: 10 → 5 (reduced weight on long messages)
  - **returningBoost**: 20 → 25 (reward users returning after 24h)
  - **quietBoost**: 30 → 20 (less aggressive in quiet threads)
  - **genericPenalty**: 10 → 15 (stronger filter for gm/lol spam)
  - **shortPenalty**: 5 → 10 (more aggressive short message filtering)
  - **Target engagement achieved**: Bot-directed 100%, Questions 76%, Cards 42%, Overall 24%
  
### Fixed
- Updated all 28 engagement scorer tests to reflect optimized parameter values
- Tests now correctly validate threshold=25 and updated boost/penalty values

### Added
- `scripts/montecarlo/` - Monte Carlo simulation suite for engagement optimization
  - `parse-real-data.js` - Extract features from 264k+ Telegram messages
  - `monte-carlo-real-data.js` - Test parameter combinations
  - `analyze-engagement.js` - Detailed configuration analysis
  - `OPTIMIZATION_SUMMARY.md` - Complete optimization documentation
  - Performance optimized: O(n²) → O(n log n) quiet period detection
  - Simulated bot-directed engagement (5% synthetic data)
  - New categorization: bot_directed, cards, questions, substantive, brief, generic

## [3.3.0] - 2025-11-02

### Added
- **`/c` Command** - Fake Commons card display
  - `/c CARDNAME` - View specific Fake Commons card (exact match)
  - `/c` - Random card from 1813+ card collection
  - Supports all 54 series from the Fake Commons collection
  - Same Telegram post format as `/f` (image, metadata, artist button)
  - Simple and fast: No fuzzy matching, no artist search (keeps it lightweight)

- **Fake Commons Data Integration**
  - 1813 cards with full metadata (asset, series, card, artist, supply)
  - S3-hosted images via reliable URLs (no local storage needed)
  - `fakeCommonsIndex.ts` - Lookup utilities matching `fullCardIndex.ts` pattern
  - `fake-commons-data.json` - Complete card database with `imageUri` fields
  - `generate-commons-json-with-urls.js` - API scraper for data regeneration

### Changed
- Build script now copies `fake-commons-data.json` to `dist/data/`
- Documentation updated with `/c` command usage
- Message pattern detection extended to recognize `/c` command
- Plugin routing includes Commons card display handler

### Testing
- Added 2 new test files: `fakeRaresCard.test.ts` (32 tests), `fakeCommonsCard.test.ts` (9 tests)
- Total test coverage: 13 files, 230+ tests (all passing)
- Pre-commit hook updated to run both card command tests

### Technical Details
- Data source: `https://api.pepe.wtf/api/asset?collection=fake-commons`
- Image URLs: `https://pepewtf.s3.amazonaws.com/collections/fake-commons/full/{series}/{filename}`
- Zero breaking changes - purely additive feature
- Separate action file (`fakeCommonsCard.ts`) - no risk to existing `/f` logic
- Total card coverage: 890+ Fake Rares + 1813+ Fake Commons = 2703+ cards

## [3.2.1] - 2025-11-02

### Fixed
- **Telemetry data loss at month boundaries** - Removed monthly archiving system
  - Issue: Data was being archived and cleared at month start, causing `/fc d` to reset
  - Fix: Keep all telemetry data in single JSONL files (no archiving)
  - Impact: `/fc d` and `/fc m` now show continuous historical data across months
  - Migration: Merge `archives/token-logs-YYYY-MM.json` into main JSONL on existing deployments
  - Data volume: ~200KB/month, ~2.4MB/year (archiving was overkill)

### Removed
- Monthly archiving logic from TelemetryService
- Archive timer and checkAndArchive() methods
- ARCHIVE_DIR constant and .last-archive-check tracking

## [3.2.0] - 2025-11-02

### Added
- **Intelligent Engagement Scoring System** - Context-aware message filtering
  - Monte Carlo optimized (918,750 configurations tested)
  - Newcomer boost (+100) - Welcomes first-time users
  - Returning user boost (+20 after 24h away) - Recognizes familiar faces
  - Quiet thread boost (+30 after 5min silence) - Breaks awkward silences
  - Configurable via `ENGAGEMENT_THRESHOLD` env var (default: 31)
  - Expected response rate: ~20% (filters spam, engages meaningfully)
  - 28 new tests in `engagementScorer.test.ts`

- **userHistoryProvider** - Conversational memory context injection
  - Automatically injects user conversation history into LLM prompts
  - Tracks card interests from last 20 messages (e.g., "likes: PEPEDAWN (3x)")
  - Classifies user familiarity (newcomer/active/regular)
  - Dynamic context length (50-280 chars, scaled to user input)
  - Enables natural, personalized responses without forced routing
  - 7 new tests in `userHistoryProvider.test.ts`

- **New Utility Modules** - DRY code refactoring
  - `messagePatterns.ts` - Centralized pattern detection (commands, triggers, metadata)
  - `commandHandler.ts` - Reduced action execution boilerplate
  - `engagementScorer.ts` - Context-aware scoring with activity tracking
  - 38 tests in `messagePatterns.test.ts`, 7 in `commandHandler.test.ts`

- **Monte Carlo Simulation Scripts** - For future tuning
  - `scripts/monte-carlo-full.js` - Test 918k+ configurations
  - `scripts/daily-simulation.js` - Simulate 200-message days

### Changed
- **Enhanced Question Detection** - Broader pattern recognition
  - Imperative requests: "tell me about X", "I need to know"
  - Indirect questions: "wondering", "curious about"
  - Auto-routes to FACTS mode when appropriate

- **Logging Consistency** - Unified visual style across all commands
  - Step markers: `STEP 1/5, 2/5, 3/5, 4/5, 5/5` (was `1, 1A, 2, 2.5, 3`)
  - Action-specific loggers: `ℹ️ [FakeCard]`, `ℹ️ [FakeLore]`, etc.
  - Removed redundant command echo logs
  - Clean visual separators (`━━━━━`)

- **Engagement Model** - From capitalized-word detection to card-specific scoring
  - Removed generic CAPS detection (was too broad)
  - Card names trigger context-based scoring (not auto-respond)
  - Question-based routing prioritized over statement-based

### Fixed
- **Test compatibility** - Added `runtime.getService` guards for mock environments
- **Context boost false positives** - Only apply returning/quiet boosts to tracked users
- **LLM source citations** - Removed unwanted "Source:" lines in FACTS mode responses
- **Memory LRU filtering** - Explicitly exempt user memories from diversity filtering

### Technical Details
- **Test coverage:** 172 → 252 tests (+47%, all passing)
- **New files:** 4 utilities, 4 test suites
- **Deleted:** 3 obsolete tests (capitalized-word detection)
- **Performance:** ~70% reduction in bot spam while maintaining engagement quality
- **Backward compatible:** All existing functionality preserved

## [3.1.0] - 2025-11-01

### Added
- **`/fr` Command** - Slash command alternative for memory capture
  - `/fr CARDNAME <lore>` - Store card-specific memories
  - `/fr <general lore>` - Store general community memories
  - Complements existing "remember this" natural language flow
  - Uses same MemoryStorageService backend for consistency
  - 7 new tests in `fakeRememberCommand.test.ts`

### Changed
- **Pre-commit test suite** - Now runs ALL 11 custom test files (197+ tests) instead of subset
- **Test documentation** - Updated TESTS.md to reflect complete coverage
- **Logging consistency** - Replaced console.log with logger in embeddingsDb.ts

### Fixed
- **CRITICAL: FACTS mode MMR bug** - FACTS queries now skip MMR diversity selection (use pure relevance ranking)
  - Bug: MMR was applied to ALL queries, dropping high-relevance memories for diversity
  - Fix: FACTS mode now preserves top passages by relevance (memories with 4.0x boost stay on top)
  - Impact: Fixes "PEPEDAWN's poem is not defined" responses when memories exist but were filtered by MMR
- MemoryStorageService logger import (was missing from '@elizaos/core')
- memoryStorage.test.ts imports (utility functions extracted to utils/memoryStorage.ts)
- test-all.sh now accurately runs all custom tests (was misleadingly named)
- Removed false-positive health check warnings (tracked console.log but bot uses logger; PM2 handles process monitoring)

### Technical Details
- Code productionalization: Removed debug console.log statements
- No breaking changes - fully backward compatible
- Test coverage: 11 custom test files, 197+ tests

## [3.0.0] - 2025-10-31

### Added
- **🎯 Market Transaction Monitoring** - Real-time Fake Rare market activity tracking
  - Monitors Counterparty dispenser sales and listings
  - Monitors DEX atomic swap sales and listings
  - Telegram notifications for all market activity
  - `/fm` command to query transaction history (sales, listings, or combined)
  - Multi-channel notification support (send to multiple Telegram groups)
  - Sale celebration stickers (optional)
  - Transaction type icons: 🎰 (dispenser) 📊 (DEX)
  - Integrated with Counterparty API v2 for reliable polling
  - PGlite database for transaction history storage
  - Deduplication and block-sequential scanning
  - Explorer links: TokenScan for sales, Horizon Market for listings

### Changed
- **Transaction types** now use explicit naming: `DIS_SALE`, `DIS_LISTING`, `DEX_SALE`, `DEX_LISTING`
- **Centralized URL utilities** - Single source of truth for all explorer links
- **Database schema** updated to support new transaction types with automatic migration

### Technical Details
- New services: `TransactionMonitor`, `TransactionHistory`, `TokenScanClient`, `TelegramNotificationService`
- New action: `fakeMarketAction` (`/fm` command)
- New plugin: `marketTransactionReporterPlugin`
- Test coverage: 3 new test files (19 tests) for market monitoring features
- Production-ready with proper error handling, logging, and database backup

## [2.2.0] - 2025-10-29

### Added
- **Auto-routing test suite** - Comprehensive tests for FACTS question auto-routing logic (20 tests, 41 assertions)
- **Reply detection** - Auto-routing now correctly skips replies to other users, only routes replies to bot
- **Question detection** - Enhanced question detection with imperative requests and indirect questions

### Fixed
- **Auto-routing bug** - Transaction announcements (e.g., "Three grails for sale...") no longer trigger verbose wiki dumps
- **Reply handling** - User-to-user conversations in replies are no longer intercepted by auto-routing
- **Action logging** - ACTION_STARTED/COMPLETED/FAILED events now only log when actual actions execute (not bootstrap)

### Changed
- **Action event handlers** - Simplified to filter out `undefined` actions (bootstrap conversations)
- **Test coverage** - Increased from 9 to 10 custom test files (120+ to 140+ tests)

### Technical Details
- Added comprehensive question detection: explicit `?`, question words, imperative requests, indirect questions
- Added reply detection with bot ID verification from ctx or runtime services
- Improved logging clarity by suppressing undefined action events

## [2.1.1] - 2025-10-28

### Fixed
- Telemetry service integration and cost tracking accuracy
- Model gateway for centralized LLM calls

## [2.1.0] - 2025-10-27

### Added
- KnowledgeOrchestratorService for RAG pipeline
- MemoryStorageService for user-contributed memories
- TelemetryService for comprehensive cost tracking

## [2.0.0] - 2025-10-26

### Added
- Major refactor to ElizaOS service pattern
- Event-driven architecture for telemetry

## [1.2.0] - 2025-10-23

### Added
- Visual analysis commands (`/fv`, `/ft`)
- CLIP embeddings for duplicate detection
- Memory capture feature ("remember this")

## [1.1.0] - 2025-10-20

### Added
- Lore retrieval system (`/fl`)
- RAG pipeline with vector search
- Query classification (FACTS/LORE/UNCERTAIN)

## [1.0.0] - 2025-10-15

### Added
- Initial release
- Card viewing with fuzzy matching (`/f`)
- Cost tracking (`/fc`)
- 890+ card database
- Auto-refresh from GitHub

---

**Version Format:** MAJOR.MINOR.PATCH
- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes (backward compatible)


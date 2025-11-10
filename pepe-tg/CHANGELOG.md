# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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


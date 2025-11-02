# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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


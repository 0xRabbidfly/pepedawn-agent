# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


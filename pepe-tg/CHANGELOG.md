# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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


# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive README.md with complete setup instructions
- CONTRIBUTING.md guide for collaborators
- CHANGELOG.md for tracking project changes
- `.env.example` template (blocked - user must create manually)
- Quick reference card in README

### Changed
- Updated README to reflect actual codebase functionality
- Clarified knowledge base setup as optional
- Added detailed DigitalOcean deployment instructions
- Improved troubleshooting section

### Improved
- Documentation accuracy for collaborator handover
- Environment variable documentation
- Script usage explanations

## [1.2.0] - 2025-10-23

### Added
- Comprehensive codebase audit document
- Detailed cost tracking with `/fc` command
- Token usage logging system
- Admin-only commands support

### Changed
- Updated to ElizaOS v1.6.2
- Improved documentation structure

## [1.1.0] - 2025-01-21

### Added
- `/fl` command for AI-powered lore stories
- Knowledge base integration with RAG (Retrieval Augmented Generation)
- Vector search across 264k+ Telegram messages
- MMR diversity selection for lore passages
- Clustering and summarization pipeline
- LRU cache to prevent repetitive lore
- `/odds` command for lottery statistics (optional)
- Token cost tracking system

### Improved
- Auto-refresh card index from GitHub (hourly)
- Zero-downtime updates for new cards
- Fuzzy matching performance (50% faster)

### Changed
- Migrated to ElizaOS v1.6.1
- Refactored card lookup logic (356 → 92 lines)
- Consolidated documentation

## [1.0.0] - 2024-10-17

### Added - Initial Release

**Core Features:**
- `/f CARDNAME` - Display Fake Rares cards with metadata
- `/f ARTIST` - Random card by artist
- `/f` - Random card from collection
- `/start` - Welcome message
- `/help` - Usage instructions
- Smart fuzzy matching with 3-tier confidence system
- 890+ card database with full metadata
- Artist search with fuzzy matching
- Clean inline preview display

**Infrastructure:**
- ElizaOS v1.6.0 framework integration
- Telegram bot via `@elizaos/plugin-telegram`
- OpenAI GPT-4 integration
- PGlite embedded database
- PM2 production configuration
- Health monitoring and heartbeat system

**Performance:**
- Full card index loader
- In-memory card mapping
- HTTP probing fallback
- Series-based S3 URL construction

**Data:**
- 890+ cards from Series 0-18
- Artist metadata
- Supply and issuance info
- Custom asset URI support

**Deployment:**
- Docker support
- PM2 ecosystem config
- Backup scripts
- Safe restart scripts
- Deployment automation scripts

**Documentation:**
- Comprehensive README
- Technical handover guide
- Cost analysis
- Telegram setup guide

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|-----------|
| 1.2.0 | 2025-10-23 | Cost tracking, codebase audit, documentation overhaul |
| 1.1.0 | 2025-01-21 | Lore feature, knowledge base, lottery integration |
| 1.0.0 | 2024-10-17 | Initial release with card display and fuzzy matching |

---

## Upgrade Notes

### Upgrading to 1.2.0

No breaking changes. Documentation improvements only.

### Upgrading to 1.1.0

**New features (optional):**
- Set up knowledge base for `/fl` command (see README.md)
- Configure lottery contract for `/odds` command
- Add `TELEGRAM_ADMIN_IDS` to .env for `/fc` command

**Dependencies:**
```bash
bun install  # Update to latest ElizaOS plugins
bun run build
```

### Upgrading to 1.0.0

Initial release - fresh installation required.

---

## Deprecation Notices

None currently.

---

## Security Updates

### 2025-10-23
- Confirmed no hardcoded secrets in codebase
- Improved .gitignore coverage for sensitive files
- Documented .env.example template (user must create manually)

---

## Contributors

Thank you to all contributors who have helped make PEPEDAWN better!

- [@0xrabbidfly](https://github.com/0xrabbidfly) - Original author
- Fake Rares community - Feature ideas and testing
- ElizaOS team - Framework and support

---

**Want to contribute?** See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines!

*WAGMI 🐸✨*


# Changelog

All notable changes to PEPEDAWN - Fake Rares Telegram Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **LLM-LORE Feature**: AI-powered lore storytelling from community history
  - `/lore` command for knowledge-backed narrative generation
  - RAG pipeline: retrieval → clustering → summarization → story generation
  - MMR (Maximal Marginal Relevance) for diverse passage selection
  - Automatic fallback expansion (wiki → global chats) for low-hit queries
  - Compact source citations (e.g., `tg:1234, wiki:purple-era`)
  - PEPEDAWN persona-aligned stories (120-180 words)
  - LRU cache to avoid repetitive lore snippets
  - Structured logging: query, hits, clusters, latency, tokens
  - Query expansion with Fake Rares terminology
  - Configurable via env: `RETRIEVAL_LIMIT`, `MIN_HITS`, `STORY_LENGTH_WORDS`, `TEMPERATURE`, `TOP_P`

### Changed
- Plugin: Added `/lore` command routing to `fakeRaresPlugin.ts`
- README: Documented LLM-LORE feature and updated BotFather commands
- `.env.example`: Added LLM-LORE configuration section

### Technical Details
- New utilities:
  - `pepe-tg/src/utils/loreConfig.ts` - Configuration constants
  - `pepe-tg/src/utils/lru.ts` - LRU tracking for diversity
  - `pepe-tg/src/utils/loreRetrieval.ts` - Vector search + MMR
  - `pepe-tg/src/utils/loreSummarize.ts` - Clustering + summarization
  - `pepe-tg/src/utils/storyComposer.ts` - Persona story generation
- Updated: `pepe-tg/src/actions/loreCommand.ts` - Full RAG pipeline
- Wired into: `pepe-tg/src/plugins/fakeRaresPlugin.ts`

## [1.0.0] - 2024-10-XX

### Added
- Initial release with card viewing, fuzzy matching, and auto-updating features
- 950+ Fake Rares cards with instant lookup
- Smart typo correction with 3-tier intelligence
- Auto-updating system via GitHub Actions
- Natural AI conversations about Fake Rares
- Production-ready deployment on DigitalOcean


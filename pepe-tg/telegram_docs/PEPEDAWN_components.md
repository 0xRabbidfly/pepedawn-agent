### PEPEDAWN components and flows

This document summarizes all components in `src/` across actions, providers, evaluators, services, types, and utils. For each file: what it does, where it’s used in the current flow, and whether it aligns with ElizaOS plugin component best practices.

---

## Actions (`src/actions`)

- `basicCommands.ts`
  - **summary**: Implements `START_COMMAND` and `HELP_COMMAND` for onboarding and command help.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts` → runs on `/start` and `/help`.
  - **elizaOS best practices**: Follows `Action` shape with `validate` and `handler`, uses `callback`, returns structured `success`. Examples are minimal but acceptable.

- `fakeRaresCard.ts`
  - **summary**: Main `/f` card fetcher with fuzzy matching, artist search, media fallback, and extensive formatting/logging.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts`; core card-browsing flow.
  - **elizaOS best practices**: Correct `Action` API and separation of helpers. Quite large/monolithic; consider moving URL building/cache to utils (some already are). Examples missing.

- `fakeVisualCommand.ts`
  - **summary**: `/fv CARD` memetic visual analysis using OpenAI Vision; formats structured output.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts`.
  - **elizaOS best practices**: Clean `Action` implementation. Calls vision via util (good). Solid validation and user feedback.

- `fakeTestCommand.ts`
  - **summary**: `/ft` + image attachment. Scores appeal; first runs CLIP similarity vs collection; if low similarity, runs vision analysis.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts`.
  - **elizaOS best practices**: Good composition via utils; strong validation/guardrails. Returns structured data.

- `loreCommand.ts`
  - **summary**: `/fl` knowledge-backed lore/facts. Classifies query, retrieves passages, clusters/summarizes, composes persona story, truncates for Telegram.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts`.
  - **elizaOS best practices**: Solid `Action` API and separation of retrieval/summarization into utils/services. Uses `callback` and handles UNCERTAIN path. Good.

- `oddsCommand.ts`
  - **summary**: Lottery live stats via `viem` (contract reads), with cooldown, caching, and leaderboard.
  - **used in flows**: Defined but NOT registered in `plugins/fakeRaresPlugin.ts` (import exists, not added to `actions`).
  - **elizaOS best practices**: Action API followed. To use, add to plugin `actions`.

- `costCommand.ts`
  - **summary**: `/fc` admin-only cost dashboard based on token logs; day/month view with mini charts.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts`.
  - **elizaOS best practices**: Proper validation (DM-only), clear formatting. Good.

- `educateNewcomer.ts`
  - **summary**: Detects newcomer questions, assesses level via small LLM, pulls concise knowledge, and replies.
  - **used in flows**: Imported by plugin but NOT registered in `actions` array.
  - **elizaOS best practices**: Follows `Action` API, composes state, uses small model; good. Wire it in to enable.

- `index.ts`
  - **summary**: Barrel exports for action modules.
  - **used in flows**: Imported by `plugins/fakeRaresPlugin.ts`.
  - **elizaOS best practices**: Standard barrel.

---

## Providers (`src/providers`)

- `fakeRaresContext.ts`
  - **summary**: Provider that detects Fake Rares context (card mentions and culture terms) and returns contextual `text`, `values`, and `data`.
  - **used in flows**: Registered in `plugins/fakeRaresPlugin.ts` under `providers`.
  - **elizaOS best practices**: Correct `Provider` shape with `get` returning `text/values/data`. Good.

- `index.ts`
  - **summary**: Barrel export of `fakeRaresContextProvider`.

---

## Evaluators (`src/evaluators`)

- `loreDetector.ts`
  - **summary**: Post-conversation detector that checks if a message contains new card lore; if yes, stores curated memory with metadata.
  - **used in flows**: Imported in `plugins/fakeRaresPlugin.ts` but NOT registered (`evaluators: []`). Currently unused.
  - **elizaOS best practices**: Good `Evaluator` (`validate`, `handler`, `alwaysRun:false`). Should be wired via plugin `evaluators` to activate.

- `index.ts`
  - **summary**: Barrel export of `loreDetectorEvaluator`.

---

## Services (`src/services`)

- `knowledgeService.ts`
  - **summary**: Functional service: expands query, searches knowledge (hybrid exact card + vector), diversity/MMR, clustering, summarization, persona story generation, sources line, metrics.
  - **used in flows**: Called by `loreCommand.ts`.
  - **elizaOS best practices**: Not a formal `Service` subclass registered via plugin `services`. It’s a plain module with exported function. Works fine, but deviates from the ElizaOS `Service` pattern (discoverable, lifecycle-managed). Consider wrapping as a `Service` or delegating to `@elizaos/plugin-knowledge` fully and keeping this as orchestration logic.

---

## Types (`src/types`)

- `memory.ts`
  - **summary**: Structured types for user memory capture (metadata, content, storage result) used by knowledge/memory flows.
  - **used in flows**: Consumed by `utils/memoryStorage.ts`.
  - **elizaOS best practices**: Pure typing; neutral.

---

## Utils (`src/utils`)

- `loreRetrieval.ts`
  - **summary**: Retrieval utilities: hybrid search with card memory markers `[CARD:...]`, global scope fallback, MMR diversification, passage normalization, source detection, and ranking boosts.
  - **used in flows**: Used by `services/knowledgeService.ts`.
  - **elizaOS best practices**: Solid utility layer; interacts with `runtime.getService('knowledge')` when available; good resilience.

- `loreSummarize.ts`
  - **summary**: Clustering (word overlap) and LLM-based cluster summarization; compact citation formatting; parallelization of summaries.
  - **used in flows**: Used by `knowledgeService` and `storyComposer`.
  - **elizaOS best practices**: Uses `runtime.useModel(ModelType.TEXT_SMALL)` for summarization (good). Clear separation.

- `storyComposer.ts`
  - **summary**: Persona story generation (LORE vs FACTS prompts), uses OpenAI client directly for premium model override; token/cost logging; deterministic fallback.
  - **used in flows**: Called by `knowledgeService`.
  - **elizaOS best practices**: Deviates by calling OpenAI client directly instead of `runtime.useModel`. Intentional to bypass runtime model routing for premium per-call control. Consider adding a custom `ModelType` or service wrapper to align.

- `queryClassifier.ts`
  - **summary**: Lightweight classifier for `FACTS | LORE | UNCERTAIN` with keyword heuristics and length tie-breakers.
  - **used in flows**: Used by `loreCommand`, `storyComposer`, `knowledgeService`.
  - **elizaOS best practices**: Fine as pure util.

- `tokenLogger.ts`
  - **summary**: Token/cost logging, pricing table, JSONL persistence, monthly archiving, and an optional runtime monkey-patch to intercept `useModel` for cost tracking.
  - **used in flows**: Imported in plugin (intended to patch runtime), used by `storyComposer` and `visionAnalyzer` for explicit logging.
  - **elizaOS best practices**: Monkey-patching `runtime.useModel` is pragmatic but off-pattern. Prefer a dedicated `Service` that wraps model calls or a centralized model gateway.

- `memoryStorage.ts`
  - **summary**: Stores user-contributed memories through `@elizaos/plugin-knowledge` by embedding metadata inside content (workaround for metadata stripping). Adds optional `[CARD:NAME]` marker for exact card retrieval.
  - **used in flows**: Memory capture flows, evaluator saving, and future recall.
  - **elizaOS best practices**: Workaround deviates from ideal metadata usage due to current knowledge service behavior. Clearly documented tradeoff.

- `cardIndexRefresher.ts`
  - **summary**: Hourly GitHub refresh for `fullCardIndex`; hot-reloadable getters.
  - **used in flows**: Initialized in `plugins/fakeRaresPlugin.ts` `init()`.
  - **elizaOS best practices**: Good util with clear boundaries.

- `cardUrlUtils.ts`
  - **summary**: Build best URL for a card (including special URIs), image URL selection for analysis, and fallback URL list.
  - **used in flows**: Used by actions reading media.
  - **elizaOS best practices**: Clean utility.

- `visualEmbeddings.ts`
  - **summary**: Replicate API calls for CLIP embeddings; helpers and thresholds for similarity interpretation.
  - **used in flows**: Used by `fakeTestCommand`.
  - **elizaOS best practices**: External API usage isolated in util; good.

- `embeddingsDb.ts`
  - **summary**: Small JSON-backed embeddings store with similarity search.
  - **used in flows**: Used by `fakeTestCommand`.
  - **elizaOS best practices**: Simple persistence; fine for scale noted.

- `lru.ts`
  - **summary**: LRU window per room to avoid repeating the same passages.
  - **used in flows**: Used in `knowledgeService`.
  - **elizaOS best practices**: Fine.

- `actionLogger.ts`
  - **summary**: Namespaced structured logger for actions/modules.
  - **used in flows**: Used by `/fv` and `/ft` actions and vision utils.
  - **elizaOS best practices**: Fine.

- `cardCache.ts`
  - **summary**: Persists discovered card series to `.eliza/card-series-cache.json`.
  - **used in flows**: Card resolution/caching in actions.
  - **elizaOS best practices**: Fine.

- `loreConfig.ts`
  - **summary**: Centralized constants for retrieval/clustering/story limits/timeouts.
  - **used in flows**: Referenced across lore utilities and services.
  - **elizaOS best practices**: Fine.

- `visionAnalyzer.ts`
  - **summary**: OpenAI Vision wrapper with error handling and token logging; supports reasoning models.
  - **used in flows**: Used by `/fv` and `/ft`.
  - **elizaOS best practices**: Uses direct OpenAI client (similar deviation as `storyComposer`). Consider a model gateway.

---

## Plugin wiring (`src/plugins/fakeRaresPlugin.ts`)

- **Registered actions**: `startCommand`, `helpCommand`, `fakeRaresCardAction`, `fakeVisualCommand`, `fakeTestCommand`, `loreCommand`, `costCommand`.
- **Registered providers**: `fakeRaresContextProvider`.
- **Registered evaluators**: none (note: `loreDetectorEvaluator` exists but not wired).
- **Init**: starts auto-refresh for card index.

---

## Why we veered from the ElizaOS architecture

- **Telemetry/cost control**: We needed per-call model selection and detailed token/cost logging. Direct OpenAI usage in `storyComposer` and `visionAnalyzer` bypasses `runtime.useModel` to use premium models selectively.
- **Knowledge metadata constraints**: `@elizaos/plugin-knowledge` strips custom metadata; we embed memory markers in content to preserve author/time/card. This trades purity for recall reliability.
- **Bootstrap mismatch**: Telegram integration had to bridge older bot runtime with newer Bootstrap removal of `MESSAGE_RECEIVED`. The custom plugin provides routing and manual command execution.
- **Pragmatic isolation**: Heavy-lift logic (retrieval, clustering, summarization, embeddings) was isolated in utils for testability and performance tuning without deep coupling to runtime internals.

---

## Recommendations to align closer with ElizaOS

- **Wire existing components**: Add `educateNewcomerAction` and `oddsCommand` to `plugin.actions`; register `loreDetectorEvaluator` in `plugin.evaluators`.
- **Service-ify knowledge orchestration**: Wrap `retrieveKnowledge` in a formal `Service` (e.g., `KnowledgeOrchestratorService`) for lifecycle control and discoverability.
- **Centralize model usage**: Introduce a model gateway (`Service` or `Provider`) that offers vision and premium text generation through `runtime.useModel` adapters, keeping selective model control while avoiding direct SDK calls in utils.
- **Replace runtime patching**: Convert `tokenLogger` monkey-patch into a `Service` that instruments model calls via the gateway or event hooks.
- **Unify examples**: Add succinct `examples` arrays to actions missing them (`fakeRaresCardAction`, etc.) for better test docs and LLM alignment.

---

## Quick flow map

- **Card browsing**: `/f` → `fakeRaresCardAction` → `cardUrlUtils`, `cardIndexRefresher`, `cardCache`.
- **Visual analysis**: `/fv` → `fakeVisualCommand` → `visionAnalyzer`, `cardUrlUtils`.
- **Image appeal**: `/ft` → `fakeTestCommand` → `visualEmbeddings` + `embeddingsDb` (early exit) → `visionAnalyzer` (if needed).
- **Lore/facts**: `/fl` → `loreCommand` → `knowledgeService` → `loreRetrieval` → `loreSummarize` → `storyComposer` (persona) → sources.
- **Memory capture**: user flows/evaluator → `memoryStorage` → `@elizaos/plugin-knowledge` (embedded metadata markers) → retrieval parses markers.

---

Generated for: PEPEDAWN (Fake Rares TG Agent)

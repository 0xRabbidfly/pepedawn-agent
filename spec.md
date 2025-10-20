### LLM-LORE — Local Lore Retrieval and Storytelling

#### Goal
Give users rich, evolving access to Fake Rares lore sourced from their Telegram chat history (3+ years) and the pepe.wtf wiki content embedded in the local pglite DB. Natural-language queries like “tell me about the purple subasset era” should pull diverse, relevant lore snippets, summarize them, and synthesize a playful, never-the-same-twice story.

#### Problem Statement
- Users want immediate, narrative-grade lore from past chats and wiki without manual search.
- Responses should be grounded in real history but presented with personality and variety.
- The system must run on local knowledge infrastructure and respect ElizaOS architecture.

#### In-Scope
- Retrieval from local knowledge vector DB (Telegram history + pepe.wtf wiki in pglite).
- Summarization and narrative synthesis via LLM with style variation so outputs change over time.
- Works for explicit commands (e.g., “/lore purple subasset era”) and natural mentions (e.g., “@pepedawn_bot tell me about the purple subasset era”).
- Configurable limits, temperatures, and safety rails.

#### Out of Scope (for this spec)
- Authoring or editing wiki content.
- Ingestion pipelines beyond existing local vector/pglite setup.
- Multi-modal assets (images/video) beyond text references.

#### User Experience
- Input: Natural-language query in-chat.
- Output: A short, fun, persona-consistent story with embedded factual grounding and optional “sources” list.
- Variability: Each run uses controlled randomness + diverse evidence selection so stories evolve while staying truthful.

## Clarifications
### Session 2025-10-20
- Q: Retrieval privacy scope across chats → A: Global org-wide lore (all chats) + wiki
- Q: Sources formatting in replies → A: One-line compact IDs (tg/wiki)
- Q: When retrieval finds too few results → A: Expand to wiki first, then global chats
- Q: Story length target → A: 120–180 words (short)
- Q: Embedding model location → A: Remote embedding API (OpenAI, etc.)

#### Functional Requirements
1) Query Parsing and Intent
   - Detect lore intent from explicit command or mention + phrase.
   - Normalize and expand queries with synonyms/aliases (e.g., “purple subasset era” → relevant tags/terms).

2) Evidence Retrieval (RAG)
   - Use local vector KB to retrieve top-N semantically similar passages across:
     - Telegram messages archive (3y history)
     - pepe.wtf wiki text embedded in pglite
   - Scope: default global across all Telegram chats/org plus pepe.wtf wiki (no per-chat restriction).
   - If results < MIN_HITS, expand in this order: (1) wiki (relax thresholds/increase k), then (2) global chats.
   - Blend semantic scores with light recency/authority boosts where applicable.
   - Deduplicate and cluster to ensure topical diversity (e.g., HDBSCAN/KMeans or maximal marginal relevance).

3) Evidence Summarization
   - Summarize clusters into compact, factual synopses with citations (message IDs or wiki anchors).
   - Enforce token budget suitable for final generation context.

4) Narrative Generation
   - Prompt the LLM with: persona, user query, summarized clusters, style directives, and safety guardrails.
   - Output a concise, engaging story that:
     - Grounds on provided summaries
     - Includes optional brief source attributions (e.g., “Sources: tg:1234, wiki:purple-era”)
     - Varies wording/tone slightly per run while preserving facts.
     - Targets 120–180 words by default.

5) Delivery & Messaging
   - Send response via the ElizaOS messaging runtime respecting Telegram formatting limits.
   - Truncate gracefully if exceeding platform limits; prefer “Read more…” continuation as needed.
   - Include one-line compact sources: e.g., "Sources: tg:1234, wiki:purple-era".

6) Safety, Quality, and Determinism Controls
   - Temperature/top_p configurable with safe defaults; slight randomness by default for variety.
   - Refuse to speculate beyond evidence; clearly state uncertainty or lack of sources.

#### Non-Functional Requirements
- Latency: P95 ≤ 2.5s for typical queries on warmed cache; ≤ 5s cold.
- Cost: Favor small/efficient embedding and generation models by default.
- Observability: Structured logs for query, retrieval counts, latency, token usage.
- Privacy: No external egress beyond the configured model provider; embedding creation uses a remote API and sends only necessary text chunks.

#### Architecture Alignment (ElizaOS)
- Runtime Core: Message → Intent → Lore pipeline → Response
- Memory: Knowledge retrieval via local vector DB provider; pglite houses wiki text and metadata.
- Events: On message-received, trigger lore handler; emit metrics events for observability.
- Providers: Embedding model for retrieval via remote API; LLM model for summarization and story.
- Models: Configurable via environment (TEXT_MODEL, EMBEDDING_MODEL) with sane defaults.
- Services: Knowledge service (plugin-knowledge) for unified search; summarization service.
- Messaging: Telegram adapter formats and delivers final story.

References:
- ElizaOS: [runtime/core](https://docs.elizaos.ai/runtime/core), [memory](https://docs.elizaos.ai/runtime/memory), [events](https://docs.elizaos.ai/runtime/events), [providers](https://docs.elizaos.ai/runtime/providers), [models](https://docs.elizaos.ai/runtime/models), [services](https://docs.elizaos.ai/runtime/services), [messaging](https://docs.elizaos.ai/runtime/messaging), [sessions-api](https://docs.elizaos.ai/runtime/sessions-api)
- Knowledge Plugin: [plugin-knowledge](https://github.com/elizaos-plugins/plugin-knowledge), [plugin architecture](https://docs.elizaos.ai/plugins/architecture)

#### Data Sources & Indexing
- Telegram Archive
  - Tables: messages with author, timestamp, chat_id, message_id, text, thread/topic tags.
  - Embeddings: chunked per message/thread with metadata keys for grounding and deduplication (generated via remote embedding API).
- pepe.wtf Wiki (embedded in pglite)
  - Tables: pages, sections, anchors, tags.
  - Embeddings: chunked sections with page/anchor metadata (generated via remote embedding API).

#### Retrieval & Ranking
- Primary: vector similarity (cosine/dot) over embeddings.
- Diversification: MMR or cluster-representative selection to avoid redundancy.
- Cap: max_k = 24 raw hits, cluster to ~4–6 summaries for generation.

#### Summarization Prompt (System-Level, indicative)
- “You are a factual summarizer. Produce brief, faithful synopses of the provided passages, citing their IDs. Merge overlapping facts; avoid speculation.”

#### Story Prompt (System-Level, indicative)
- “You are PEPEDAWN, keeper of Fake Rares lore. Tell a short, fun, persona-aligned story based on the summaries. Keep facts true to summaries; vary style slightly each time. Add a one-line ‘Sources’ with compact IDs.”

#### Configuration
- TEXT_MODEL (default: small, e.g., gpt-4o-mini or equivalent)
- EMBEDDING_MODEL (remote embedding model name)
- EMBEDDING_PROVIDER (remote API, e.g., OpenAI/OpenRouter)
- VECTOR_DB_DSN (local vector DB connection; may be pglite/pgvector via plugin)
- RETRIEVAL_LIMIT (default 24)
- MIN_HITS (default 8)
- CLUSTER_TARGET (default 4–6)
- TEMPERATURE (default 0.7)
- TOP_P (default 0.9)
- MAX_TOKENS_SUMMARY, MAX_TOKENS_STORY (guardrails)
- STORY_LENGTH_WORDS (default 120–180)
- WIKI_TABLE, TG_TABLE (table names)

#### Error Handling & Fallbacks
- If zero results: respond with gentle fallback + tips to rephrase.
- If insufficient diversity: relax filters or widen query expansion.
- Token overflow: shrink summaries first, then reduce cluster count.

#### Acceptance Criteria
- Given a prompt like “tell me about the purple subasset era,” the agent:
  - Retrieves ≥ 8 raw hits spanning both Telegram and wiki when available.
  - Produces clustered summaries with at least 3 distinct facets.
  - Generates a narrative that is coherent, grounded, and under message limits.
  - Varies wording across repeated runs while preserving facts.
  - Optionally lists compact sources (e.g., tg:1234, wiki:purple-era).

#### Observability
- Log fields: query, hits_raw, hits_used, clusters, latency_ms, tokens_in/out, cost_estimate.
- Optional: trace IDs per request to correlate retrieval and generation.

#### Risks & Mitigations
- Hallucination: constrain to summaries; add “no new facts” guardrails.
- Redundancy: apply MMR/cluster selection.
- Latency spikes: cache hot embeddings and summaries; cap retrieval.

#### Rollout Plan
- Phase 1: Wire retrieval + summarization + story in a single-thread path.
- Phase 2: Add diversification + observability.
- Phase 3: Tune variability and style; collect user feedback.



# Research — LLM-LORE

## Decisions

1) Retrieval Diversification
- Decision: Use MMR or cluster-representative sampling (4–6 clusters) from top-24 hits.
- Rationale: Reduces redundancy, improves narrative breadth within token budget.
- Alternatives: Pure top-k (rejected: repetitive), learning-to-rank (overkill now).

2) Summarization Strategy
- Decision: Two-step: cluster summaries with citations → story generation.
- Rationale: Lowers hallucination risk; enforces grounding.
- Alternatives: Direct long-context generation (higher cost, drift risk).

3) Embeddings
- Decision: Use precomputed embeddings stored in pglite; fetch via knowledge plugin.
- Rationale: Already available; zero runtime embedding cost; no network calls.
- Alternatives: Remote/local generation at runtime (rejected: unnecessary).

4) Vector DB & Storage
- Decision: Use pglite/pgvector via knowledge plugin; store Telegram and wiki chunks with metadata.
- Rationale: Local, simple ops; compatible with ElizaOS knowledge plugin.
- Alternatives: External vector services (adds cost/egress).

5) Privacy & Scope
- Decision: Global org-wide retrieval across chats + wiki by default.
- Rationale: Maximizes recall for lore; compact source IDs keep verification easy.
- Alternatives: Per-chat isolation (too restrictive), opt-in expansion (adds UX friction).

6) Story Length & Sources
- Decision: 120–180 words; one-line compact sources (tg/wiki IDs).
- Rationale: Fits Telegram; readable; verifiable.
- Alternatives: Full URLs or expandable UI (later enhancement).

## Operational Considerations

- Rate limiting: Cap retrieval and token usage; backoff on provider 429s.
- Latency: Cache hot ids, memoize summaries within short TTL.
- Observability: Log query, hits_raw/used, clusters, latency_ms, tokens_in/out.
- Error states: If < MIN_HITS, expand wiki → global chats; if still empty, return helpful fallback.



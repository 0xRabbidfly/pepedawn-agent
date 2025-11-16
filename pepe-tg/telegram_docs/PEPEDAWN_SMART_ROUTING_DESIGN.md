# PEPEDAWN Smart Routing – Target Architecture, Phasing, and Tasks

> Purpose: Implement an LLM-driven routing pipeline (FACTS / LORE / CHAT) with a deterministic fast‑path for clear card intent, configurable weights, and strong observability.

---

## Goals

- Improve answer quality and consistency across mixed sources (memories, wiki, card data, telegram).
- Minimize branching code: shift policy to configuration (weights, thresholds, top‑k).
- Keep UX snappy and costs predictable (fast‑path for strong card intent; cheap router otherwise).
- Maintain traceability: log router decisions, chosen passages, and generation outcomes.

---

## Scope (Conversation / Non-command messages)

- Applies to the “General Conversation” flow (replacing the old deterministic routing).
- Commands and memory capture keep their existing deterministic paths; this work must not regress them.
- Card discovery questions get a fast‑path for speed and clarity.

---

## Target Flow (Summary)

1) Message received (plugin)
2) Guards: command/memory short‑circuit; FAKEASF/off‑topic filters; engagement gate
3) Intent classifier (LLM over last 20 room posts, incl. bot replies) → `LORE | FACTS | CHAT | NORESPONSE | CMDROUTE` (+ optional slash command)
4) Mode-specific retrieval (top‑k per source with per-mode weights) → candidates with metadata (id, source_type, similarity, priority_weight, short preview)
3A) Card‑intent fast‑path (deterministic): if card data is dominant and a single clear winner exists → FACTS with preferCardFacts=true → generate short “why this fits” → display card
5) Mode execution:
   - FACTS: KnowledgeOrchestrator in factual mode, cite sources
   - LORE: KnowledgeOrchestrator storyteller mode; fall back to card facts when lore thin
   - CHAT: small-model social reply (recent transcript + telegram throwbacks)
   - NORESPONSE: emoji acknowledgement, no message body
   - CMDROUTE: trigger mapped /command flow
6) Send + observe: Telegram-safe formatting; log classifier JSON, retrieval metrics, tokens/costs; golden fixtures

---

## Components and Contracts

### Retrieval Wrapper (Step 3)
- Sources of embeddings:
  - Memories (artist/user lore)
  - Wiki pages (authoritative facts)
  - Card data (on‑card text, visual summaries, combined/memetic blocks, keywords/metadata)
  - Telegram archives (background chatter)
- For each source, return top‑k with:
  - id: string
  - source_type: 'memory' | 'wiki' | 'card_data' | 'telegram'
  - similarity: number (0..1)
  - priority_weight: number (configured via weights)
  - text_preview: short string (<= 320 chars)

Config:
- source_weights: YAML/JSON (e.g., memories> wiki> card_data> telegram)
- top_k_per_source: default 4–5
- match thresholds: per‑source overrides optional

### Card‑Intent Fast‑Path (Step 3A)
- Conditions (configurable defaults):
  - Weighted card_data aggregate ≥ 0.70 of total OR top card candidate similarity ≥ 0.80
  - Single dominant candidate (no tie within, say, 10% margin)
- Action:
  - Skip router
  - preferCardFacts=true
  - Generate 1‑sentence “why this fits” summary
  - Immediately invoke card display (image + metadata)

### Intent Classifier (Step 4)
- Input bundle:
  - last 20 non-bot + bot Telegram posts (text only, oldest → newest)
  - current user message highlighted
- System prompt highlights:
  - Don’t interrupt multi-user convo unless intent is clear
  - CMDROUTE only when an existing command flow is ideal
  - NORESPONSE = listen (emoji OK)
- Strict JSON output:
  - `{ "intent": "LORE|FACTS|CHAT|NORESPONSE|CMDROUTE", "command": "/command-or-empty" }`
- Failure to parse → default to NORESPONSE

### Mode Generation (Step 5)
- FACTS: no MMR; pick best wiki/mem candidates; concise; cite sources
- LORE: clustering/MMR for diversity; historian persona; cite sources
- CHAT: brief social reply; grounded; never invent facts

### Engagement Gate (pre‑retrieval)
- Scoring (current impl; configurable threshold; default 25):
  - +100 newcomer; +25 returning (≥24h); +20 quiet thread (≥5m)
  - +100 @mention; +100 reply to bot
  - +15 card detected (isFakeRareCard)
  - +30 question; +60 card discovery intent
  - +5 multi‑word (>7); −10 short (<5) if not mention/reply; −15 generic reaction
- shouldRespond(score) => score ≥ threshold

### Observability
- Log classifier JSON + retrieval aggregates + top previews (single production pipeline)
- Token/cost telemetry for classifier + downstream generation calls
- Golden test fixtures for classifier prompt + per-mode outputs

---

## Phasing

Phase 0 (Completed): Shadow Mode
- Graduated Nov 2025 – router now drives production responses directly; side-by-side shadow logging removed.
- Continue tuning weights, k, and thresholds via live telemetry.

Phase 1: Classifier + Mode Profiles
- Implement intent classifier prompt + JSON schema.
- Promote per-mode weight presets and retrieval tweaks.
- Keep deterministic fast-path, engagement gate, and guards.

Phase 2: Tuning + Observability
- Adjust per-mode weights, chat prompts, emoji rotations.
- Add golden fixtures for classifier + per-mode outputs.
- Instrument telemetry for intent distribution.

Phase 3: Expansion
- Extend CMDROUTE map or teach classifier additional modes if needed.
- Optional: personalization (long-term user memory embeddings).
- Optional: caching for near-duplicate classifier inputs (if cost spikes).

---

## Implementation Tasks (Checklist)

1) Intent Classifier
- [x] Prompt with 20-message transcript and strict JSON contract
- [x] Default to NORESPONSE on parse failure/timeouts
- [x] Surface optional slash command for CMDROUTE

2) Mode Retrieval Profiles
- [x] Encode per-mode source weights (code defaults)
- [x] Maintain fast-path heuristic for decisive card queries
- [x] Fall back to card facts when lore sources sparse

3) Mode Execution
- [x] FACTS: KnowledgeOrchestrator + sources
- [x] LORE: KnowledgeOrchestrator storyteller
- [x] CHAT: small-model persona chat w/ throwback notes
- [x] NORESPONSE: emoji acknowledgement rotation
- [x] CMDROUTE: mapped command execution

4) Conversation History
- [x] Persist per-room transcript (user + bot) for classifier + chat
- [x] Record bot outputs emitted via callbacks/commands

5) Observability
- [x] Console logs: classifier JSON, retrieval metrics, latency, tokens
- [ ] Golden fixtures for classifier + per-mode outputs

6) Docs & Compatibility
- [x] Deprecate shadow mode; new router is production path
- [x] Keep `/fl` command but pipe into LORE flow
- [ ] Update `PEPEDAWN_FLOW_CONVO.md` diagram to new flow

---

## Config Example (YAML)

```yaml
source_weights:
  memories: 3.0
  wiki: 2.0
  card_data: 1.5
  telegram: 0.5

top_k_per_source: 5
min_confidence_for_facts_or_lore: 0.6
router_model: small
fastpath:
  card_data_aggregate_min: 0.7
  top_similarity_min: 0.8
  dominance_margin: 0.10  # top vs next
rollout:
  enabled: true
  percentage: 100
```

---

## Notes

- Keep fast-path deterministic to guarantee speed/cost for clear card requests.
- Classifier now owns mode selection; legacy aggregate heuristics removed.
- Per-mode weights live in code defaults; adjust via PR (no prod env churn).

---

## Verification Plan (Pre-Rollout)

1. **Unit / Fixtures**
   - Confirm `src/__tests__/__fixtures__/smart-router/card-fastpath.json` stays in sync with expectations when adjusting fast-path heuristics.

2. **Automated Tests**
   - `bun run test:custom` – ensures existing auto-routing and utility suites still pass.

3. **Telemetry Sanity**
   - Inspect `src/data/smart-router-logs.jsonl` after local runs for intents across {FACTS, LORE, CHAT, NORESPONSE, CMDROUTE}.
   - Verify conversation and lore query logs continue to populate with `source: "auto-route"`.

4. **Manual Telegram Scenarios**
   - “show me FREEDOMKEK lore” – expect LORE intent, storyteller output.
   - “what are the submission rules?” – expect FACTS intent, wiki citations.
   - Casual banter threading (no direct ask) – expect NORESPONSE (emoji only).
   - “latest xcp market?” – expect CMDROUTE → `/xcp`.



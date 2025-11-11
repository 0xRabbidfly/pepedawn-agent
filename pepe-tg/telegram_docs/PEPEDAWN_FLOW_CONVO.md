# PEPEDAWN Conversation Flow — Target Smart Routing 💬

> Target architecture for general conversation (non-command messages) using LLM-driven routing.
> This replaces section “6. General Conversation Flow” from `PEPEDAWN_FLOW_DIAGRAMS.md`.

---

## High-Level Diagram (Target)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  USER INPUT                                 │
│                         Natural chat / questions                             │
└───────────────┬─────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────┐
│ 1) MESSAGE RECEIVED (Plugin)     │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ 2) GUARDS                        │
│ • Command/memory → handled       │
│ • Safety/off-topic filters       │
│ • Engagement gate                │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ 3) MULTI-SOURCE RETRIEVAL        │
│ • Memories • Wiki • Card data    │
│ • Telegram                       │
│ • Top‑k per source + metadata    │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ 3A) CARD‑INTENT GATE             │
│ • Strong card_data signal        │
│   (aggregate ≥0.7 or top sim ≥.8)│
│ • Single dominant candidate      │
└───────────────┬───────────┬──────┘
                │ YES       │ NO
                ▼           ▼
┌──────────────────────────────┐    ┌──────────────────────────────────┐
│ FAST‑PATH FACTS              │    │ 4) ROUTER (LLM POLICY)           │
│ • preferCardFacts=true       │    │ • Input: msg + candidates        │
│ • “Why this fits” summary    │    │ • Output JSON: { mode, ids, conf}│
│ • Invoke card display        │    │ • Config: weights & thresholds   │
└───────────────┬────────── ───┘    └───────────────┬──────────────────┘
                │                                   │
                └──────────────┬─────────── ────────┘
                               ▼
                 ┌─────────────┼───────────────┐
                 ▼             ▼               ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│      FACTS         │ │       LORE         │ │       CHAT         │
└──────────┬─────────┘ └──────────┬─────────┘ └──────────┬─────────┘
           │                       │                      │
           │ FACTS MODE            │ LORE MODE            │ CHAT MODE
           │ • Select wiki/mem     │ • Cluster & summarize│ • Persona convo
           │ • Factual prompt      │ • Narrative prompt   │ • No invented facts
           │ • Cite sources        │ • Cite sources       │ • Short & social
           ▼                       ▼                      ▼
┌──────────────────────────────────┐
│ 5) SEND RESPONSE                 │
│ • Telegram‑safe formatting       │
│ • Optional: hide sources         │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│ 6) OBSERVABILITY                 │
│ • Log router JSON + metrics      │
│ • Cost/latency telemetry         │
│ • Decision fixtures (goldens)    │
└──────────────────────────────────┘
```

---

## Detailed Steps

- 1) Message Received
  - Telegraf → Plugin event. Command/memory paths short-circuit out.

- 2) Guards
  - Safety (FAKEASF) → policy reply. Off-topic → suppress. Engagement → suppress low-signal.

- 3) Multi-source Retrieval
  - Run semantic search across: memories, wiki, card data, telegram.
  - Return top‑k per source with: id, source_type, similarity, priority_weight, text preview.

- 4) Router (LLM Policy)
  - Inputs: user message + compact candidate descriptors (no full text unless needed).
  - Policy: prefers artist memories when strong; facts when wiki/card dominate; chat when evidence is weak.
  - Outputs strict JSON (mode, chosen_passage_ids, confidence).
  - Threshold: low confidence → default to CHAT.
  - Config: weights, k, thresholds in YAML/JSON (no branching code).

- 5) Mode-specific Generation
  - FACTS: concise, neutral, cite sources; no MMR.
  - LORE: storyteller persona; clustering/MMR for diversity; cite sources.
  - CHAT: social, brief, never invent facts.

- 6) Send + Observe
  - Telegram-safe text; optional “hide sources” flag.
  - Log router JSON, chosen IDs, confidence, and model costs.
  - Golden cases for regression (router + generation).

---

## Configuration

- source_weights: memories > wiki > telegram (tunable)
- top_k_per_source: e.g., 4–5
- min_confidence_for_facts_or_lore: e.g., 0.6
- router_model: small by default; can switch to large for quality
- caching: optional (identical/near-duplicate queries)

---

## Fallbacks

- Router JSON invalid → CHAT
- No relevant candidates → CHAT clarification
- Mode failure → fallback to CHAT

---

## Notes

- This target flow replaces “6. General Conversation Flow” with LLM-driven routing.
- Deterministic logic moves to config (weights/thresholds), reducing branching code.
- Extendable: add new sources by weighting, no code forks.*** End Patch*** }蜜 નોimedelta കൊല്ലassistant_nsec to=functions.apply_patch.SerializedError code=400 message=Invalid tool input. Ensure the `apply_patch` tool is given a string that follows the diffs spec exactly. The tool result may include human-readable implementation guidance for additional information. Please double check your input and ensure it follows the format exactly. The format itself includes Begin and End markers, and the contents must follow a specific grammar. Exception: Input is not a valid patch формат. Stop. (title: Not a valid patch format) error in line 1: Expected "*** Begin Patch", got "*** Begin Patch*** End Patch*** }蜜 નોimedelta കൊല്ലassistantידזש to=functions.apply_patchөнгөassistant to=functions.apply_patchознassistant to=functions.apply_patchاڻassistant to=functions.apply_patch тайлбар to=functions.apply_patch Apologies. Let's try again with valid patch format. We'll re-send a proper patch. Let's craft again. We'll ensure only the patch strings. Let's proceed. 



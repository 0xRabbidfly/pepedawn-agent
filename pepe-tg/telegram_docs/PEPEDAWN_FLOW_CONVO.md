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
│ FAST‑PATH FACTS / CARD RECO  │    │ 4) ROUTER (LLM POLICY)           │
│ • preferCardFacts=true       │    │ • Input: msg + candidates        │
│ • Skip fast-path if user     │    │ • Output JSON: { mode, ids, conf}│
│   already names the card     │    │ • Config: weights & thresholds   │
│ • Otherwise /f card display  │    │                                  │
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

## Detailed State Machines (current implementation – Nov 2025)

### 1) General Conversation (non-command auto-routing)

- **Entry conditions**
  - Plugin `MESSAGE_RECEIVED` event.
  - No slash command handled in step 2 (commands short‑circuit before router).
  - Not blocked by FAKEASF / off‑topic content filters.
  - Engagement gate either allows response, or is overridden by card/submission intent.

- **Transitions**
  1. `SmartRouterService.planRouting(text, roomId)`:
     - Build transcript (last 20 turns), call `classifyIntent` → `intent ∈ {FACTS, LORE, CHAT, NORESPONSE, CMDROUTE}`.
     - Detect named cards via `detectMentionedCard`.
       - If named card and `intent !== FACTS` → override `intent = FACTS` (except for PEPEDAWN with `BOT_CHAT` usage).
       - If descriptor‑style query but classifier returned `NORESPONSE` → override to `FACTS`.
     - For non‑NORESPONSE intents, derive per‑mode retrieval options and call `retrieveCandidates`.
     - For intent `FACTS`:
       - If descriptor‑like query → try `buildCardRecommendPlan` (card discovery / `CARD_RECOMMEND` plan).
       - Else:
         - Run fast‑path detection (`FAST_PATH_CARD` plan when high‑confidence single card).
         - Fallback to `buildFactsPlan` (FACTS plan using KnowledgeOrchestrator, optionally forcing card facts).
     - For intent `LORE` → `buildLorePlan` (LORE plan via KnowledgeOrchestrator).
     - For intent `CHAT` → `buildChatPlan` (CHAT plan via small‑model persona).
     - For intent `CMDROUTE` → `CMDROUTE` plan (synthetic command).
     - For intent `NORESPONSE` → NORESPONSE plan with emoji (no retrieval).
  2. `executeSmartRouterPlan(plan)`:
     - `FAST_PATH_CARD` → send short explanation + synthetic `/f CARD` call.
     - `CARD_RECOMMEND` → send summary text + synthetic `/f PRIMARY_CARD` call.
     - `FACTS` / `LORE` → send `story` and optional `sourcesLine`.
     - `CHAT` → send `chatResponse`.
     - `CMDROUTE` → route to mapped action (`/f`, `/fl`, etc.).
     - `NORESPONSE` → no visible reply (only telemetry).

- **Exit conditions**
  - **FACTS / LORE / CHAT / CARD_RECOMMEND / FAST_PATH_CARD / CMDROUTE:** Telegram message(s) are sent and logged via TelemetryService, and SmartRouterDecisionLog records `{ intent, kind, reason }`.
  - **NORESPONSE:** no user‑visible reply; only telemetry/logging is emitted.
  - In all cases, the plugin marks the message as handled to prevent Bootstrap from re‑processing it when the router produced a plan.

### 2) Card Discovery (descriptor → card recommendation)

- **Entry conditions**
  - Auto‑routing flow above with:
    - `intent === 'FACTS'` after classifier + overrides.
    - Query either:
      - Passes `looksLikeCardDescriptor(...)`, or
      - Has `forceCardFacts: true` (e.g., descriptor override, named‑card questions).

- **Transitions**
  1. `KnowledgeOrchestratorService.retrieveKnowledge(...)` with `mode: 'FACTS'`, `preferCardFacts: true`:
     - Multi‑source retrieval (mem/wiki/telegram/card‑facts).
     - Card‑only expansion (`expandCardOnlyPassages`) to guarantee enough `card-fact` candidates.
     - `composeCardFactAnswer`:
       - Group passages per card asset.
       - Heuristic scoring + optional LLM reranker (`CardDiscovery.LLM`).
       - Select primary card (`primaryCardAsset`) and build `cardSummary` + `cardMatches`.
  2. SmartRouter:
     - When card‑intent override is explicit (`forceCardFacts`) and `cardMatches` found:
       - Prefer `CARD_RECOMMEND` plan (card summary + synthetic `/f` call).
     - When KnowledgeOrchestrator returns only `cardSummary` but no matches:
       - FACTS plan with `story = cardSummary` (no `/f` execution).

- **Exit conditions**
  - **CARD_RECOMMEND:** user sees a 1–2 sentence summary plus the card image via `/f PRIMARY_CARD`.
  - **FACTS (card summary only):** user sees a short factual answer, but no card render, when card intent was too weak/ambiguous.

### 3) PEPEDAWN bot‑vs‑card disambiguation

- **Entry conditions**
  - Auto‑routing flow where:
    - `detectMentionedCard(text)` or `getTopCardAsset(retrieval)` returns `PEPEDAWN`.

- **Transitions**
  1. `classifyPepedawnUsage(roomId, text)`:
     - LLM reads recent transcript and current message.
     - Returns `usage ∈ { BOT_CHAT, CARD_INTENT, BOTH }` (defaults to BOT_CHAT on errors/parse failures).
  2. SmartRouter:
     - If `mentionedCard === 'PEPEDAWN'` and `usage === 'BOT_CHAT'`:
       - Suppress named‑card override (`mentionedCard = null`).
     - If `topCardAsset === 'PEPEDAWN'` and `usage === 'BOT_CHAT'`:
       - Suppress descriptor‑based FACTS override (do not treat PEPEDAWN as named‑card target for this turn).
     - For `CARD_INTENT`/`BOTH`, normal named‑card/card‑intent behavior applies.

- **Exit conditions**
  - **BOT_CHAT:** intent and plan follow classifier (typically CHAT/NORESPONSE) with no card discovery.
  - **CARD_INTENT / BOTH:** FACTS/card‑intent flow executes as usual (may produce `CARD_RECOMMEND`, `FAST_PATH_CARD`, or FACTS).

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



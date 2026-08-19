# PEPEDAWN v5 — Conversational Redesign

**Status:** Draft for review
**Date:** 2026-08-18
**Branch:** `deprecate-unused-commands` (v5 work to follow)

---

## 1. Goal

PEPEDAWN should be a **participant in the room**, not a retrieval endpoint.

Today it is the opposite: 75% of messages get NORESPONSE, the CHAT prompt is nine
suppression rules, and 69–82% of everything retrieved comes from a Telegram archive
frozen on **2025-10-11**. The bot answers 2026 conversation with 2022 chat, briefly,
and usually not at all.

### Requirements

| # | Requirement |
|---|---|
| 1 | More personable and engaged in current TG conversation |
| 2 | RAG from **wiki and cards only**, and only when context justifies it |
| 3 | Moderate engagement based on the current tone of conversation |
| 4 | No wall-of-text lore when the room is just chit-chatting |
| 5 | Smarter chat, better model |
| 6 | Recall conversation highlights — days, months, decaying afterwards |
| 7 | Store memories for memorable chats and special events |
| 8 | `/fr` returns so artists can contribute card lore, treated as wiki-class |

### Directives

- **Smarter, more EQ, more engaged, less lore-retrieval bot.**
- Build **as far from ElizaOS dependencies as practical**; remove one where risk is low.
- **Delete deprecated code** rather than carrying it. Git retains history.

### Non-goals

- Rewriting the Telegram transport (`packages/plugin-telegram-fakerares` stays).
- Replacing PGlite. It stays as the store; we change how we talk to it.
- Preserving the frozen Telegram archive as a retrieval source.

---

## 2. Evidence

All figures measured 2026-08-18 against production telemetry
(2025-10-31 → 2026-08-18, 33k records) and the live corpus.

**Retrieval is dominated by a frozen archive**

| Intent | Telegram share of retrieved passages | Mean similarity |
|---|---|---|
| FACTS | 69.3% | 0.451 |
| LORE | 76.5% | 0.408 |
| CHAT | 81.6% | **0.341** |

**And it is nearly worthless.** Ablation — removing Telegram entirely from retrieval:

| Intent | With TG | Without TG | Drop | Queries degraded >0.08 |
|---|---|---|---|---|
| FACTS | 0.482 | 0.451 | 0.031 | 5 / 60 |
| LORE | 0.427 | 0.391 | 0.037 | 1 / 30 |
| CHAT | 0.361 | 0.315 | 0.046 | 12 / 60 |

Removing **77% of the corpus** costs ~3–4% similarity on FACTS and LORE.

**Retrieval is volume-driven, not value-driven.** TG retrieval tracks corpus
composition almost exactly (2021 0.98×, 2022 1.02×, 2023 1.11×) and mean similarity
is flat across every year (0.40–0.42). Age carries no quality signal.

**What it actually retrieves is form-matching, not information:**

```
"Any buyer for 4xcp?"         -> telegram:0.57  telegram:0.52  telegram:0.51
"Hey all, Looking to sell..." -> telegram:0.66  telegram:0.66  telegram:0.65
"Explain me where"            -> telegram:0.35  telegram:0.33  telegram:0.33
```

Other people saying the same *kind* of thing. Not answers.

**Wiki is 4.4× more retrieval-efficient per fragment** than Telegram (468 fragments
producing ~10% of retrievals, vs 15,443 producing ~76%).

**Provenance is lost at ingest.** All 15,996 fragments carry
`source: 'rag-service-fragment-sync'`. `loreRetrieval.ts` re-derives the source with
content heuristics that are **22% wrong** — 4,344 Telegram fragments are labelled
`wiki`, drawing wiki's `2.0` weight instead of telegram's `0.5`. The noisiest content
gets the largest boost, and 90.5% of the "wiki" bucket is impostors.

**The bot forgets the room nightly.** `historyByRoom` is an in-memory `Map`
(`HISTORY_LIMIT = 60`), never persisted, and PM2 cron-restarts at 02:00 daily.

**Cost is not a constraint.** Total LLM spend is **$10.26 over 9.5 months**. Chat runs
on `gpt-4o-mini`, the cheapest model available, at $0.28 across the whole period.

---

## 3. Architecture

### 3.1 The core change: split one axis into two

The router currently emits a single intent — `LORE | FACTS | CHAT | NORESPONSE |
CMDROUTE` — that conflates two independent questions:

- **What do I need to know?**
- **How should I show up?**

Requirement 4 is exactly where these diverge: someone mentions FREEDOMKEK mid-banter,
so *card knowledge* is right but *wall-of-text* is wrong. The current taxonomy cannot
express that, which is why it is patched with word-count caps, `descriptor_override`,
`named_card_override`, and nine prompt rules.

**v5 emits two values:**

```ts
interface RouteDecision {
  knowledge: 'NONE' | 'CARD' | 'WIKI' | 'CARD_WIKI';
  register:  'SILENT' | 'REACT' | 'BANTER' | 'ANSWER' | 'DEEP';
  reason:    string;          // always populated, always logged
  card?:     string;          // resolved asset, when knowledge involves CARD
}
```

`CARD` knowledge at `BANTER` register is *"ha, FREEDOMKEK — the genesis one"*: one
line, factually grounded, tonally correct. Inexpressible today.

### 3.2 Register ladder

| Register | Output | Retrieval |
|---|---|---|
| `SILENT` | nothing | none |
| `REACT` | one emoji | none |
| `BANTER` | ≤ 1 sentence, conversational | none, or a single card fact |
| `ANSWER` | 2–4 sentences | as `knowledge` dictates |
| `DEEP` | full lore / story | as `knowledge` dictates |

**Retrieval only runs at `ANSWER` and `DEEP`.** This is requirement 2 and the "less
lore-retrieval bot" directive made structural. CHAT is 63% of current retrieval
traffic and returns the weakest matches in the dataset; under v5 it retrieves nothing.

### 3.3 Room temperature caps register

Computed from persisted room history. **No LLM call.**

| Signal | Source |
|---|---|
| messages/minute | timestamps |
| mean message length | text |
| distinct participants in last N | authors |
| question density | existing `isQuestion()` |
| turns since bot last spoke | history |
| was the bot addressed | mention / reply |

```
hot   (fast, short, many voices, no questions)  -> cap at BANTER
warm  (normal flow)                             -> cap at ANSWER
cool  (quiet, long message, or direct question) -> allow DEEP
```

The bot may always choose *below* the cap. It may never exceed it. **Requirement 4
becomes a structural guarantee**, not a prompt asking nicely.

Most signals already exist in `engagementScorer.ts`, which tracks `roomLastMessage`,
`userLastSeen`, word count and question detection — it just collapses them into a
single fire/don't-fire threshold instead of a register.

### 3.4 Memory tiers

| Tier | Source | Decay | Class |
|---|---|---|---|
| Card facts | scraped, 877 cards × 5 blocks | none | authoritative |
| Wiki | curated markdown | none | authoritative |
| **Artist lore** (#8) | `/fr` | none | authoritative |
| **Episodes** (#7) | explicitly saved | none (pinned) | authoritative |
| **Highlights** (#6) | auto session summaries | **exponential** | recent |
| ~~TG archive~~ | frozen dump | — | **removed** |

**Decay (#6):**

```
score = similarity × 0.5 ^ (age_days / HALF_LIFE_DAYS)     // default 30
```

| Age | Weight |
|---|---|
| today | 1.00 |
| 1 month | 0.50 |
| 3 months | 0.13 |
| 6 months | 0.02 |

One tunable knob — the half-life.

**Highlights ingest reuses `scripts/tg-build-sessions.ts`**, which already does
20-minute-gap sessionization, participant extraction, signal-message selection and
chunking into `[TELEGRAM_SESSION:…][DATES:…][PARTICIPANTS:…]`. Point it at the live
stream instead of a historical dump. The archive dies; its pipeline is promoted.

This is the key reframe: **we are not deleting Telegram knowledge, we are replacing a
snapshot with a stream.** The archive was a one-time dump of something that should
always have been continuous.

**Episodes (#7)** build on the existing `MemoryStorageService` (186 lines, already
writes `[MEMORY:userId:name:ts]` markers). It needs a `class` field and a pin flag,
not a rewrite.

### 3.5 `/fr` — artist lore (#8)

**Decision: option (a) — anyone may contribute.** Low friction, matches how the
community actually behaves.

Mitigations, since this writes into the authoritative tier:

- Every entry stores `contributorId`, `contributorName`, `timestamp`.
- Entries are individually revocable by admin.
- Entries are attributed in output when surfaced ("*per @x*"), so the bot never
  presents an unverified claim as house fact.
- Rate-limited per contributor.

### 3.6 Model policy (#5)

Collapse **2–4 LLM calls into 2**:

| Call | Model | Rationale |
|---|---|---|
| Route → `{knowledge, register}` | small | it is a classification |
| Generate response | **frontier** | this is what the community reads |

Removes `classifyPepedawnUsage` (a second classifier call) and the double
`planRouting` invocation on card queries. Net: fewer calls, better output.

At $0.28/9.5mo for chat today, a 15–20× unit-cost increase is roughly **$5–10/year**.

---

## 4. ElizaOS decoupling

**Target: remove `@elizaos/plugin-knowledge`.**

Rationale:

1. **Requirement 6 forces it.** Decay scoring cannot be expressed through
   `getKnowledge()`, which returns opaque ranked results with no hook for
   `× 0.5^(age/30)`.
2. **The surface is two methods** — `addKnowledge()` and `getKnowledge()`.
3. **It is the cause of the provenance loss.** Owning ingest means writing real
   `sourceType`, `tier` and `timestamp` — which deletes the 141-line heuristic block
   and makes `sourceWeights` mean something.
4. **Already proven.** The ablation and provenance experiments run in this
   investigation queried PGlite + pgvector directly with raw SQL. The replacement is
   demonstrated, not hypothetical.

Replacement: `src/knowledge/` — a thin owned layer.

```
ingest(doc)   -> chunk, embed, INSERT with full metadata (tier, sourceType, ts)
search(query, {tiers, topK, halfLife}) -> pgvector ORDER BY, decay applied in SQL
```

**Second candidate: `@elizaos/plugin-bootstrap`.** It answered 207 of 7,132
conversations (2.9%), yet is the reason for `__handledByCustom` in 9 places, the
reply-skip branch in `messageManager`, and the callback no-op swap in
`commandHandler`. Under v5 the register axis *always* produces a decision, so
bootstrap's fallback role disappears by construction. Remove it in step 5.

**Keeping:** `@elizaos/core` (Service, logger, types — deep and cheap), `plugin-sql`
(PGlite), and the Telegram fork.

---

## 5. Deletion manifest

Per the "delete, don't carry" directive.

**On merge of v5 routing**

| Target | Lines | Reason |
|---|---|---|
| `loreRetrieval.ts` source sniffing | 141 | provenance now stored |
| `queryClassifier.ts` | 204 | duplicate of router intent |
| `KnowledgeOrchestratorService` helper tail | ~1,064 | re-derives stored structure |
| `__handledByCustom` sentinel (9 sites) | ~80 | replaced by `RouteDecision` |
| TG archive fragments | 15,443 rows | replaced by highlights stream |

**Already deprecated, delete after 2026-11-18** (see `src/config/deprecatedCommands.ts`)

| Target | Lines |
|---|---|
| `/fl`, `/fv`, `/ft`, `/dawn`, `/educate` action files | ~1,424 |
| `embeddingsDb.ts`, `visualEmbeddings.ts`, `visionAnalyzer.ts` | 478 |
| `card-embeddings.json` | 18 MB |

`/fr` is **no longer deprecated** — repositioned per §3.5.

**Also purge:** 495 orphan `messages_chunk_*.json` documents (zero fragments, zero
embeddings) and 42 duplicate wiki documents.

Estimated total: **~4,000 lines and ~19 MB**, against 20,221 source lines.

---

## 6. Build sequence

Each step ships independently.

| Step | Delivers | Deletes |
|---|---|---|
| **1. Persist room history** | #1, #3 foundation | — |
| **2. Room temperature + register axis** | #3, #4 | CHAT suppression rules |
| **3. Owned retrieval layer, wiki+cards only** | #2 | `plugin-knowledge`, 141-line heuristic |
| **4. Highlights stream + decay** | #6 | TG archive rows |
| **5. Two-call routing, frontier generate** | #5, #1 | duplicate classifier, bootstrap |
| **6. Episodes + `/fr` artist lore** | #7, #8 | — |

Step 1 is a prerequisite for everything. Steps 3 and 4 are the largest deletions.

---

## 7. Open questions

1. **What drove v4.1's chattiness reduction?** `ENGAGEMENT_THRESHOLD` was raised from
   25 to 31 in prod and NORESPONSE climbed 62% → 75%. Requirements 1 and 3 reopen
   that deliberately. If the original complaint was interruption, the fix is *better*
   engagement, not simply more — and the register ladder is designed for exactly that.
   But the original failure mode should be on record before we turn the dial.
2. **`/help` wording for `/fr`** under the new artist-lore framing.
3. **Highlight half-life** — 30 days is a starting default, not a measured one.
4. **Wiki corpus depth.** After dropping the archive, all prose knowledge rests on 468
   wiki fragments (~280 unique docs, 42 duplicated). Card facts are strong; community
   history will be thin. Expanding the wiki is the natural follow-on investment.

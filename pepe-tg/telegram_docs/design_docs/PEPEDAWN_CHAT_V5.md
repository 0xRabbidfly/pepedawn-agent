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

**The "won't shut up" failure mode was never fixed — only made rarer.**

| Month | Bot replies | Worst 10-min burst | Replies <60s apart |
|---|---|---|---|
| 2026-01 | 1314 | **67** | 649 |
| 2026-02 | 1155 | 43 | 562 |
| 2026-03 | 643 | 43 | 268 |
| 2026-08 | 565 | 31 | 278 |

**43.6% of all bot replies land within 60 seconds of the previous one**; 33.6%
within 30 seconds; p10 gap is 5 seconds. Raising `ENGAGEMENT_THRESHOLD` 25 → 31 in
March halved total volume but left the bursting pattern intact — 49% of August
replies are still <60s apart.

The only defence against this in the entire codebase is **two lines of prompt text**
asking the LLM to count its own turns (`SmartRouterService.ts:343` and `:808`). No
code enforces cadence. By contrast `oddsCommand.ts` has a real 5-minute cooldown —
the pattern exists, it was just never applied to conversation.

**Cost is not a constraint.** Total LLM spend is **$10.26 over 9.5 months**. Chat runs
on `gpt-4o-mini`, the cheapest model available, at $0.28 across the whole period.

---

## 2b. Target behaviour (agreed 2026-08-19)

### The actual complaint, restated

"PEPEDAWN wouldn't shut up" was **not** about frequency. It was:

1. **Responding out of context** — poor retrieval, poor logic.
2. **Walls of text** — which made every out-of-context reply worse.

This inverts the priority order. Retrieval quality and length control are the
primary fixes; the cadence governor is a safety net for the burst pattern, not
the centrepiece. Nuno is happy for the bot to talk *often* — he was never
bothered by rate, he was bothered by irrelevance and verbosity.

It also makes dropping the Telegram archive load-bearing rather than merely
tidy: that corpus is the out-of-context machine. 22% of it is misclassified as
authoritative wiki, and its strongest hits are form-matches — "Any buyer for
4xcp?" retrieving other people saying "any buyer".

### Persona

**A knowledgeable regular.** A collector who has been around since series 1.
Has taste, opinions and memory. Talks like a peer — short, dry, occasionally
funny. Not a service desk, not a database.

**Opinions are owned.** Asked for "best/coolest/favourite", it gives a genuine
pick and a reason, framed as its own view. It never dresses taste up as fact.
Supply, series and issuance are context, never proof of quality. (The failure
that prompted this: "limited supply" asserted about a 299-supply card.)

### Dials

| Setting | Value |
|---|---|
| Share of voice | **30%** |
| Minimum gap between unprompted replies | **45s** |
| Never two bot turns in a row | hard rule |
| Direct address (mention / reply / DM / command) | exempt from all of the above |
| Retrieval relevance floor | **0.45** |

### Reply length — scales to the question

| Situation | Ceiling |
|---|---|
| Banter | one line (~25 words) |
| A real question | short paragraph (~60 words) |
| Explicitly asked for the story | ~120 words |

Nothing exceeds these without a slash command. This is the wall-of-text fix.

### When retrieval finds nothing relevant

Acknowledge the gap **and invite a contribution**:

> *"No record of that one. If you know the story, drop it with `/fr` and I'll
> remember it."*

This turns every knowledge gap into corpus growth and gives `/fr` a real
purpose. **Must be rate-limited** — at most once per room per few hours, or it
becomes nagging.

### Social memory — people, not just facts

PEPEDAWN should accumulate a sense of *who the community is*, not only what the
cards are. Four record kinds, all person-linked:

| Kind | Example | Decay |
|---|---|---|
| `episode` | "The FAKEASF burn argument, June 2026" | pinned, never |
| `highlight` | "Quiet Sunday, mostly series 8 talk" | 30-day half-life |
| `quote` | "@bob: 'I'd sell a kidney for a FREEDOMKEK'" | 90-day half-life |
| `reaction` | "@carol always defends the ugly cards" | 90-day half-life |

Every record carries **participants** — who said it, who it was about, who
reacted. That is what makes recall conversational rather than encyclopaedic:

> **bob:** anyone got a spare FREEDOMKEK
> **PEPEDAWN:** still on that kidney offer, bob?

**Capture** runs on session close (a 20-minute gap, reusing the sessionization
in `scripts/tg-build-sessions.ts`), not per message — one LLM pass per session
asking "was anything here worth remembering, and who was involved?". Sessions
with nothing notable produce no record.

**Recall** is scored `similarity × decay × participantBoost`, where
`participantBoost` lifts records involving people currently in the room. A
funny remark from someone present outranks a better-matching one from someone
absent.

**Constraints:**

- Quotes are stored verbatim with attribution, so they must be **revocable**.
  A person can have their records removed; admin can purge any record.
- Never surface a quote to mock someone. Callbacks are affectionate or they do
  not happen.
- Rate-limit callbacks the same way as the `/fr` prompt — a bot that constantly
  references what you said six weeks ago is unsettling, not warm.
- Records are community-visible by construction; nothing private is captured
  that was not said in the room.

### Corpus

| Source | Status |
|---|---|
| Card data (877 cards × 5 blocks) | **keep** |
| Wiki markdown | **keep** |
| Live conversation highlights, time-decayed | **add** (requirement 6) |
| Artist lore via `/fr` | **keep**, wiki-class |
| Curated episodes | **add** (requirement 7) |
| Twitter/X results | **future** |
| **Telegram archive** | **remove from all RAG** |

### Commands

**Preserved:** `/f`, `/p`, `/c`, `/fm`, `/fr`
**Dropped:** `/fl`, `/fv`, `/ft`, `/dawn`, `/educate`

Vision is kept as a *capability* — parsing images into prose — while `/fv` and
`/ft` go. Card data stays regardless.

### Cards in conversation

When a card comes up outside `/f`, the bot talks about it **and shows the
image**.

### Proactive behaviours — all retained

Market sale/listing alerts, the hourly card showcase, and periodic tips.
(Tips referencing dropped commands need rewriting.)

### Model

**GPT-5.6 Luna** ($0.20/M in, $1.20/M out) — outperforms Opus 4.8, and is 12×
cheaper on input than the `gpt-4o` currently used for lore. Total spend has been
$10.26 over 9.5 months; this is expected to *reduce* it while improving quality.

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

### 3.35 Cadence governor — the third axis

**This is the missing piece, and the reason previous fixes failed.**

Engagement threshold, classifier NORESPONSE, and the register ladder are all
*per-message*: they answer "should I reply to **this**?" in isolation. "Won't shut up"
is not a per-message property — it is a **rate** property. A bot can make twenty
individually defensible decisions and still dominate the room.

That is exactly what the data shows: the March intervention made the bot reply less
*often* without making it reply less *consecutively*. Volume fell, rhythm did not
change. Tuning a per-message threshold to fix a rate problem suppresses good
contributions and bad ones equally — which is precisely why PEPEDAWN now reads as
both too quiet (75% NORESPONSE) and still capable of 31 replies in ten minutes.

**The governor is code, never prompt.** Per room, over a rolling window:

| Rule | Default |
|---|---|
| Share of voice — bot messages ÷ total messages | ≤ 20% |
| Never two bot turns without an intervening user message | hard |
| Minimum gap between unprompted contributions | 90s |
| Backoff — each unaddressed contribution raises the bar for the next | +1 register step |

**Exemption:** direct @mention or reply-to-bot bypasses the governor entirely. Being
responsive when addressed is categorically different from volunteering. This is what
lets us *lower* the engagement threshold for requirement 1 without recreating the
original problem.

The governor caps `register` the same way room temperature does — it can only push
**down** the ladder, never up. Order of application:

```
classifier register -> capped by room temperature -> capped by cadence governor
```

**EQ is the composition of all three:**

| Axis | Question | Enforced by |
|---|---|---|
| Register ladder | *how much* to say | classifier + caps |
| Room temperature | *what the room is doing* | computed signals |
| **Cadence governor** | *whether to speak at all* | **hard code** |

Restraint is the axis that was missing. It cannot be delegated to a prompt.

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

### Revised plan (2026-08-19), ordered by impact on the actual complaint

| # | Step | Fixes | Deletes |
|---|---|---|---|
| **1** | **Purge Telegram from retrieval.** Filter by tier at query time, then delete the rows. | out-of-context replies | 15,443 fragments |
| **2** | **Relevance floor 0.45 + length ladder.** Nothing below the floor is used; every path gets a word ceiling. | both halves of the complaint | CHAT's 9 suppression rules |
| **3** | **Model → GPT-5.6 Luna** everywhere; retire `gpt-4o` and `gpt-4o-mini`. | reasoning quality | — |
| **4** | **Owned-opinion handling.** Taste questions answered as opinion; specs never used as verdicts. | the 299-supply answer | `CARD_RECOMMEND` justification path |
| **5** | **Persona rewrite.** Knowledgeable regular, peer voice, card facts woven in conversationally. | flatness | — |
| **6** | **Owned retrieval layer.** Real `sourceType`/`tier` at ingest; decay in SQL. | provenance guesswork | `plugin-knowledge`, 141-line heuristic, `queryClassifier`, most of the KOS helper tail |
| **7** | **Social memory**: live highlights + decay (req 6), episodes (req 7), plus person-linked quotes and reactions with participant-boosted recall. | community memory, and knowing *who* people are | — |
| **8** | **`/fr` gap-prompt**, rate-limited. | corpus growth | — |
| **9** | **Cadence governor live** at 30% / 45s. | bursting | — |
| **10** | **Delete dropped commands** after 2026-11-18; keep vision as image→prose. | ~2,000 lines | `/fl` `/fv` `/ft` `/dawn` `/educate`, `embeddingsDb`, `visualEmbeddings`, `card-embeddings.json` |

Steps 1–3 target the complaint directly and are independently shippable. Step 6
is the large structural one. Step 9 is deliberately late: it is a backstop, and
Nuno wants the bot chatty once it is relevant and concise.

**Known gap:** with the archive removed and highlights starting empty, the bot
has no community history until highlights accumulate. Wiki and artist lore carry
it in the meantime — which is exactly what the `/fr` gap-prompt is for.

### Original sequencing (superseded, kept for reference)

| Step | Delivers | Deletes |
|---|---|---|
| **1. Persist room history** | #1, #3 foundation | — |
| **2. Room temperature + register axis** | #3, #4 | CHAT suppression rules |
| **2b. Cadence governor** | #3, unblocks #1 | prompt-based turn counting |
| **3. Owned retrieval layer, wiki+cards only** | #2 | `plugin-knowledge`, 141-line heuristic |
| **4. Highlights stream + decay** | #6 | TG archive rows |
| **5. Two-call routing, frontier generate** | #5, #1 | duplicate classifier, bootstrap |
| **6. Episodes + `/fr` artist lore** | #7, #8 | — |

Step 1 is a prerequisite for everything. Steps 3 and 4 are the largest deletions.

---

## 6b. Verification status (2026-08-19)

Steps 1, 2 and 2b are implemented in `src/conversation/` and deployed to the
**test bot** (@pepedawntest_bot, token `8216356616`) — see
`docs/TESTING_WITH_TEST_BOT.md`.

| Check | Result |
|---|---|
| Unit + integration tests | 575 pass (from 533 at session start) |
| Typecheck | 46 errors, down from 61; none in new code |
| Cadence replay, 20,742 production events | worst 10-min burst **67 → 10**; replies <60s apart **43.6% → 2.4%**; share of traffic 34.4% → 21.7% |
| Deployed boot on test bot | agent starts, periodic content disabled, `.env` restored byte-identical |
| Shadow write in deployed layout | 4 decisions to `src/data/shadow-logs.jsonl`, room history persisted |

**Not yet done:** live user traffic through the deployed bot. Bots cannot message
bots, so this requires a human sending messages to @pepedawntest_bot with
`V5_SHADOW=true` set in `pepe-tg/.env`.

### Operational lessons recorded during this work

- **ElizaOS resolves `.env` from its working directory**, and
  `scripts/start-bot.sh` forces the working directory back to `pepe-tg`. Shell
  `export`s and `unset`s are therefore ignored. Any isolation must come from the
  `.env` file the process will actually load.
- **`periodicContent.sendToChannels()` swallows send failures** — it logs
  `Failed to send to channel` at warn level and does not rethrow, so
  `Posted periodic …` is logged whether or not the send succeeded. Absence of the
  warning is the only reliable success signal.
- **Never call `getUpdates` by hand against a bot under test.** It consumes the
  queue; a queued user message was lost this way.
- **Always `getMe` before running anything that can send.** Production is
  `8462…`, test is `8216…`.

## 7. Open questions

1. ~~What drove v4.1's chattiness reduction?~~ **Resolved.** The complaint was that
   PEPEDAWN would not stop replying. Two interventions followed — v4.1 (2025-11-16,
   classifier prompt) and a prod `ENGAGEMENT_THRESHOLD` 25 → 31 change in March 2026
   with no commit. Neither addressed the actual failure mode; see §2 and §3.35. The
   cadence governor is the direct response, and it is what makes lowering the
   engagement threshold for requirement 1 safe.
2. **`/help` wording for `/fr`** under the new artist-lore framing.
3. **Highlight half-life** — 30 days is a starting default, not a measured one.
4. **Wiki corpus depth.** After dropping the archive, all prose knowledge rests on 468
   wiki fragments (~280 unique docs, 42 duplicated). Card facts are strong; community
   history will be thin. Expanding the wiki is the natural follow-on investment.

# PEPEDAWN Bot Flow Diagrams 🐸

> ⚠️ **Superseded by v5 (2026-08-19).** This document describes the pre-v5
> architecture. Removed since: the `/fl`, `/fv`, `/ft`, `/dawn` and `/educate`
> commands, ElizaOS bootstrap handoff, the engagement-score filter, card
> discovery, and LORE as a separate mode.
>
> Current design: [`design_docs/PEPEDAWN_CHAT_V5.md`](design_docs/PEPEDAWN_CHAT_V5.md).
> Live command list: the `/help` handler in `src/actions/basicCommands.ts`.


> **Visual teaching guide for understanding how PEPEDAWN works**  
> Each diagram shows the complete flow from user input to bot response

---

## 📋 Table of Contents

1. [Card Viewing Flow (`/f`)](#1-card-viewing-flow-f)
2. [Card Visual Analysis Flow (`/fv`)](#2-card-visual-analysis-flow-fv)
3. [Fake Appeal Test Flow (`/ft`)](#3-fake-appeal-test-flow-ft)
4. [Lore Retrieval Flow (`/fl`)](#4-lore-retrieval-flow-fl)
5. [Memory Capture Flow ("remember this")](#5-memory-capture-flow-remember-this)
6. [General Conversation Flow](#6-general-conversation-flow)

---

## 1. Card Viewing Flow (`/f`)

**Command:** `/f CARDNAME` or `/f ARTIST` or `/f` (random)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
│  /f FREEDOMKEK  │  /f Rare Scrilla  │  /f  │  /f FREEDOMK      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  1. PARSE COMMAND     │
                │  - Extract asset name │
                │  - Detect random req  │
                └───────────┬───────────┘
                            │
                ┌───────────▼───────────┐
                │  Is Random Request?   │
                └───────────┬───────────┘
                            │
                ├─── YES ───┤─── NO ──┐
                │                     │
                ▼                     ▼
    ┌────────────────────┐   ┌──────────────────────┐
    │ Pick Random Card   │   │ 2. EXACT CARD MATCH  │
    │ from 890+ cards    │   │ Lookup in index      │
    └─────────┬──────────┘   └──────────┬───────────┘
              │                          │
              │                  ┌───────▼────────┐
              │                  │ Card Found?    │
              │                  └───────┬────────┘
              │                          │
              │                  YES ────┼──── NO
              │                   │              │
              └───────────────────┘              ▼
                                      ┌──────────────────────┐
                                      │ 3. EXACT ARTIST      │
                                      │ Match by artist name │
                                      └──────────┬───────────┘
                                                 │
                                         ┌───────▼────────┐
                                         │ Artist Found?  │
                                         └───────┬────────┘
                                                 │
                                         YES ────┼──── NO
                                          │              │
                        ┌─────────────────┘              ▼
                        │                    ┌────────────────────────┐
                        │                    │ 4a. FUZZY CARD MATCH   │
                        │                    │ Levenshtein distance   │
                        │                    └────────────┬───────────┘
                        │                                 │
                        │                     ┌───────────▼──────────┐
                        │                     │ Similarity Score?    │
                        │                     └───────────┬──────────┘
                        │                                 │
                        │            ┌────────────────────┼───────────────┐
                        │            │                    │               │
                        │         ≥75%                55-74%           <55%
                        │            │                    │               │
                        │            ▼                    ▼               ▼
                        │   ┌──────────────┐    ┌─────────────┐  ┌──────────────┐
                        │   │ Auto-correct │    │ Show top 3  │  │ Try fuzzy    │
                        │   │ & show card  │    │ suggestions │  │ artist match │
                        │   └──────────────┘    └─────────────┘  └──────┬───────┘
                        │                                                │
                        │                                        ┌───────▼──────┐
                        │                                        │ Artist match?│
                        │                                        └───────┬──────┘
                        │                                                │
                        │                                         YES ───┼─── NO
                        │                                         │           │
                        ▼                                         ▼           ▼
          ┌──────────────────────────┐               ┌─────────────┐  ┌────────────┐
          │ 5. BUILD CARD MESSAGE    │               │ Random by   │  │ Error msg  │
          │ - Artist info            │               │ artist      │  │ with tips  │
          │ - Supply, issuance       │               └─────────────┘  └────────────┘
          │ - Series info            │
          │ - Artist profile button  │
          └──────────┬───────────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │ 6. SEND WITH MEDIA       │
          │ - Attach image/video/GIF │
          │ - Clean preview display  │
          │ - No broken URLs shown   │
          └──────────┬───────────────┘
                     │
                     ▼
          ┌──────────────────────────┐
          │    USER SEES CARD! ✨    │
          └──────────────────────────┘
```

**Key Features:**
- **4-tier matching:** Exact card → Exact artist → Fuzzy card → Fuzzy artist
- **Auto-correction:** ≥75% similarity shows card immediately
- **Suggestions:** 55-74% shows top 3 matches
- **Inline buttons:** `/f`, `/c`, `/p` suggestions come with tap-to-fill buttons for instant retry
- **890+ cards** in-memory index
- **<200ms** response time for known cards

> **Note:** The Fake Commons (`/c`) and Rare Pepes (`/p`) actions reuse this same pipeline, so the auto-correct and suggestion behaviour is consistent across all card collections.

---

## 2. Card Visual Analysis Flow (`/fv`)

**Command:** `/fv CARDNAME`

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
│                    /fv FREEDOMKEK                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  1. PARSE COMMAND     │
                │  Extract card name    │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  2. LOOKUP CARD       │
                │  Search in index      │
                └───────────┬───────────┘
                            │
                    ┌───────▼────────┐
                    │  Card found?   │
                    └───────┬────────┘
                            │
                    NO ─────┼───── YES
                     │              │
                     ▼              ▼
            ┌──────────────┐  ┌──────────────────────────┐
            │ Error:       │  │ 3. DETERMINE IMAGE URL   │
            │ Card not     │  │ - Use override if exists │
            │ found        │  │ - Use S3 URL otherwise   │
            └──────────────┘  │ - Handle MP4 → static    │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ 4. VISION API CALL       │
                              │ Model: GPT-4o (or config)│
                              │                          │
                              │ Analyze:                 │
                              │ • Extract ALL text (OCR) │
                              │ • Visual composition     │
                              │ • Color palette          │
                              │ • Artistic style         │
                              │ • Meme references        │
                              │ • Crypto culture refs    │
                              │ • Vibe check             │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ 5. FORMAT RESPONSE       │
                              │                          │
                              │ 📝 TEXT EXTRACTION       │
                              │ 🎨 VISUAL BREAKDOWN      │
                              │ 🧬 MEMETIC DNA           │
                              │ 🎯 VIBE CHECK            │
                              │                          │
                              │ + Card metadata          │
                              │ + Cost: ~$0.005          │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │  USER SEES ANALYSIS! 🔍  │
                              └──────────────────────────┘
```

**Key Features:**
- **OCR text extraction** - Reads ALL visible text
- **Memetic commentary** - Identifies meme references
- **Visual analysis** - Composition, colors, style
- **Cost tracking** - ~$0.005 per analysis (GPT-4o)
- **MP4 handling** - Uses static frame for animations

---

## 3. Fake Appeal Test Flow (`/ft`)

**Command:** `/ft` + attach image

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
│              /ft + [uploaded image]                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  1. VALIDATE INPUT    │
                │  - Check attachment   │
                │  - Block animations   │
                └───────────┬───────────┘
                            │
                    ┌───────▼────────┐
                    │  Has image?    │
                    └───────┬────────┘
                            │
                    NO ─────┼───── YES
                     │              │
                     ▼              ▼
            ┌──────────────┐  ┌──────────────────────────┐
            │ Error:       │  │  Is animation?           │
            │ No image     │  └──────────┬───────────────┘
            └──────────────┘             │
                                  YES ───┼─── NO
                                   │          │
                                   ▼          ▼
                          ┌──────────────┐  ┌─────────────────────┐
                          │ Block & ask  │  │ 2. VALIDATE IMAGE   │
                          │ to clip frame│  │ Check accessibility │
                          └──────────────┘  └─────────┬───────────┘
                                                      │
                                                      ▼
                                          ┌───────────────────────────┐
                                          │ 3. DUPLICATE DETECTION    │
                                          │ (if REPLICATE_API_TOKEN)  │
                                          │                           │
                                          │ - Generate CLIP embedding │
                                          │ - Compare to 890+ cards   │
                                          │ - Calculate similarity    │
                                          └───────────┬───────────────┘
                                                      │
                                          ┌───────────▼──────────────┐
                                          │  Similarity Score?       │
                                          └───────────┬──────────────┘
                                                      │
                              ┌───────────────────────┼────────────────────┐
                              │                       │                    │
                           ≥95%                    ≥85%               30-84%
                              │                       │                    │
                              ▼                       ▼                    ▼
                    ┌───────────────────┐  ┌──────────────────┐  ┌──────────────┐
                    │ EXACT MATCH! 🚨   │  │ HIGH SIMILARITY  │  │ LOW MATCH    │
                    │ "HA! NICE TRY!"   │  │ "SNEAKY!"        │  │ Show closest │
                    │ 10/10 auto-score  │  │ Modified/clipped │  │ + continue   │
                    │ Skip analysis     │  │ Skip analysis    │  │ to analysis  │
                    └───────────────────┘  └──────────────────┘  └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌────────────────────┐
                                                              │ 4. VISION ANALYSIS │
                                                              │ Model: GPT-4o      │
                                                              │                    │
                                                              │ Score based on:    │
                                                              │ 1. PEPE culture ⭐️ │
                                                              │ 2. Text content ⭐️ │
                                                              │ 3. Green palette ⚡ │
                                                              │ 4. Pepe name/refs ⚡│
                                                              │                    │
                                                              │ Format:            │
                                                              │ 📝 TEXT           │
                                                              │ 🎨 VISUAL         │
                                                              │ 🧬 MEMETIC DNA    │
                                                              │ 🎯 FAKE APPEAL /10│
                                                              └─────────┬──────────┘
                                                                        │
                                                                        ▼
                                                              ┌────────────────────┐
                                                              │ 5. SEND RESULT     │
                                                              │ - Show similarity  │
                                                              │   if detected      │
                                                              │ - Full analysis    │
                                                              │ - Appeal score     │
                                                              │                    │
                                                              │ Cost: ~$0.005      │
                                                              │ + $0.0002 (CLIP)   │
                                                              └─────────┬──────────┘
                                                                        │
                                                                        ▼
                                                              ┌────────────────────┐
                                                              │  USER SEES SCORE!  │
                                                              │        🎯          │
                                                              └────────────────────┘
```

**Key Features:**
- **Duplicate detection** - CLIP embeddings (optional)
- **Strict scoring** - Based on Fake Rares ethos
- **Animation blocking** - Requires static frame
- **Cost optimization** - Early exit on exact match
- **4-tier weighting:** PEPE culture > Text > Green > Name

---

## 4. Lore Retrieval Flow (`/fl`)

**Command:** `/fl TOPIC` or `/fl` (random)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
│  /fl Rare Scrilla  │  /fl FREEDOMKEK  │  /fl purple era  │ /fl │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  1. QUERY EXPANSION   │
                │  Add synonyms/aliases │
                │  "faka" → "La Faka    │
                │           Nostra"     │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────────────────────┐
                │  2. VECTOR SEARCH (GLOBAL)            │
                │  Search across ALL sources:           │
                │  • Telegram chat archives (tg)        │
                │  • pepe.wtf wiki pages (wiki)         │
                │  • User memories (mem) ⭐              │
                │                                       │
                │  - Retrieve 24 passages               │
                │  - Automatic fallback expansion       │
                │  - Timeout: 10s                       │
                └───────────┬───────────────────────────┘
                            │
                            ▼
                ┌───────────────────────────────────────┐
                │  3. SOURCE-BASED RANKING              │
                │  Priority boost:                      │
                │  • Memories: 4.0x (highest) ⭐⭐⭐     │
                │  • Wiki: 2.0x (authoritative) ⭐⭐    │
                │  • Telegram: 0.5x (noise) ⚡          │
                └───────────┬───────────────────────────┘
                            │
                            ▼
                ┌───────────────────────────────────────┐
                │  4. QUERY CLASSIFICATION              │
                │  Keyword scoring + conversational     │
                │  detection                            │
                │  • FACTS: Rules, specs, how-to        │
                │  • LORE: Stories, history, vibes      │
                │  • UNCERTAIN: Ambiguous/casual        │
                └───────────┬───────────────────────────┘
                            │
                ┌───────────▼──────────┐
                │   Query Type?        │
                └───────────┬──────────┘
                            │
                ┌───────────┴────────────┐
                │           │            │
             FACTS       LORE      UNCERTAIN
                │           │            │
                ▼           ▼            ▼
                                ┌─────────────────┐
                                │Send clarification│
                                │"🤔 Not sure..." │
                                │Try examples     │
                                │Or ask w/o /fl   │
                                └────────┬────────┘
                                         │
                                       (done)
                
                │           │
                ▼           ▼
    ┌─────────────────────┐   ┌────────────────────────┐
    │ 5a. FACTS SELECTION │   │ 5b. MMR DIVERSITY      │
    │ • LRU filter fresh  │   │ • Filter recently used │
    │ • Take top-k by     │   │ • Apply MMR algorithm  │
    │   RELEVANCE only    │   │ • Select 4-6 diverse   │
    │ • NO diversity MMR  │   │ • Balance relevance    │
    │   (want best facts) │   │   vs diversity         │
    └──────────┬──────────┘   └──────────┬─────────────┘
               │                         │
               ▼                         ▼
    ┌─────────────────────┐   ┌────────────────────────┐
    │ 6a. FACTS MODE      │   │ 6b. LORE MODE          │
    │                     │   │                        │
    │ • Filter wiki+mem   │   │ • Cluster passages     │
    │ • Take top 5        │   │ • Generate summaries   │
    │ • Direct to LLM     │   │ • Group similar topics │
    │ • NO clustering     │   │ • Create 2-4 clusters  │
    │                     │   │                        │
    │ Prompt style:       │   │ Prompt style:          │
    │ - Factual           │   │ - "I remember when..." │
    │ - Lists/bullets     │   │ - Historian/witness    │
    │ - Specifications    │   │ - Community moments    │
    │ - Rules/steps       │   │ - Quote actual people  │
    │ - NO storytelling   │   │ - Show reactions       │
    └──────────┬──────────┘   └──────────┬─────────────┘
               │                         │
               └───────────┬─────────────┘
                           │
                           ▼
                ┌────────────────────────┐
                │ 7. LLM STORY COMPOSER  │
                │ Model: gpt-5/gpt-4o    │
                │ (LORE_STORY_MODEL)     │
                │                        │
                │ Generate:              │
                │ • 80-120 words         │
                │ • Concise but complete │
                │ • Natural tone         │
                │ • Include context      │
                │                        │
                │ Cost: ~$0.01-0.02      │
                └────────┬───────────────┘
                         │
                         ▼
                ┌────────────────────────┐
                │ 8. ADD SOURCE CITATIONS│
                │ Format:                │
                │ tg:1234 || wiki:page || │
                │ mem:abc123 by:User     │
                │                        │
                │ (hidden if env flag)   │
                └────────┬───────────────┘
                         │
                         ▼
                ┌────────────────────────┐
                │  9. SEND LORE! 📚      │
                │  Latency: 1-3s         │
                │  Mark passages as used │
                └────────────────────────┘
```

**Key Features:**
- **3 source types:** Telegram archives, wiki, user memories
- **Hybrid search:** Exact card match + vector search for card memories
- **Query classification:** FACTS vs LORE vs UNCERTAIN (conversational detection)
- **UNCERTAIN handling:** Sends clarification prompt with examples, routes casual chat to AI
- **Conditional MMR:** Diversity for LORE, relevance-only for FACTS ✅ **FIXED** (Nov 2025 - was incorrectly applying MMR to all queries)
- **Card memory emphasis:** Dedicated cluster (12→5 passages), no summarization (preserves artist words)
- **LRU cache:** Don't repeat recently shown content
- **Card discovery variety:** When multiple cards match, picks a *fresh* candidate (30 min LRU) and randomly rotates through the top 3 to avoid the same answer every time (Nov 2025)
- **Source priority:** Memories (4.0x) > Wiki (2.0x) > Telegram (0.5x)
- **Global search:** Searches across ALL chats/content

> 🆕 **Card Discovery Randomization (Nov 2025)**
>
> - Top matches are grouped by asset and scored.
> - The bot prefers cards you haven’t seen in the last 30 minutes (per room).
> - If several fresh matches remain, it chooses one at random before formatting the story.
> - Fallback still returns the strongest match when only a single candidate exists.

---

## 5. Memory Capture Flow ("/fr" or "remember this")

**Command:** `/fr CARDNAME <lore>`, `/fr <general lore>`, `CARDNAME remember this: FACT`, or reply to bot with "remember this"

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                               │
│ "/fr FREEDOMKEK it was inspired by Free Kekistan"               │
│              OR                                                 │
│ "FREEDOMKEK remember this: it was inspired by Free Kekistan"    │
│              OR                                                 │
│ [Reply to bot message] "remember this"                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  1. DETECTION         │
                │  Plugin event:        │
                │  MESSAGE_RECEIVED     │
                │                       │
                │  Check:               │
                │  • /fr command OR     │
                │  • Has CAPITALIZED    │
                │    word OR            │
                │  • Is reply to bot OR │
                │  • Has bot mention    │
                │  AND                  │
                │  • Contains "remember │
                │    this"              │
                └───────────┬───────────┘
                            │
                    ┌───────▼────────┐
                    │  Detected?     │
                    └───────┬────────┘
                            │
                    NO ─────┼───── YES
                     │              │
                (ignore)            ▼
                              ┌──────────────────────────┐
                              │ 2. EXTRACT CONTENT       │
                              │                          │
                              │ If direct command:       │
                              │ • Remove "remember this:"│
                              │ • Extract fact text      │
                              │                          │
                              │ If reply to bot:         │
                              │ • Get original bot msg   │
                              │ • Combine with user's    │
                              │   comment                │
                              └──────────┬───────────────┘
                                         │
                                         ▼
                              ┌──────────────────────────┐
                              │ 3. VALIDATE CONTENT      │
                              │                          │
                              │ Check:                   │
                              │ • Not empty              │
                              │ • Not too long           │
                              │ • Valid format           │
                              └──────────┬───────────────┘
                                         │
                                 ┌───────▼────────┐
                                 │  Valid?        │
                                 └───────┬────────┘
                                         │
                                 NO ─────┼───── YES
                                  │              │
                             (ignore)            ▼
                                      ┌────────────────────────┐
                                      │ 4. BUILD METADATA      │
                                      │                        │
                                      │ Collect:               │
                                      │ • userId               │
                                      │ • displayName          │
                                      │ • timestamp            │
                                      │ • roomId               │
                                      │                        │
                                      │ IMPORTANT:             │
                                      │ Embed metadata in text │
                                      │ (KnowledgeService      │
                                      │  strips custom fields) │
                                      └────────┬───────────────┘
                                               │
                                               ▼
                                      ┌────────────────────────┐
                                      │ 5. STORE IN KNOWLEDGE  │
                                      │                        │
                                      │ Format:                │
                                      │ [MEMORY:userId:        │
                                      │  displayName:timestamp]│
                                      │ actual_content         │
                                      │                        │
                                      │ Stored in:             │
                                      │ Knowledge DB (global)  │
                                      │                        │
                                      │ Searchable via /fl!    │
                                      └────────┬───────────────┘
                                               │
                                               ▼
                                      ┌────────────────────────┐
                                      │ 6. CONFIRM TO USER     │
                                      │                        │
                                      │ "storing the memory... │
                                      │  to access this in the │
                                      │  future ensure you use │
                                      │  the /fl fake lore     │
                                      │  method"               │
                                      └────────┬───────────────┘
                                               │
                                               ▼
                                      ┌────────────────────────┐
                                      │   MEMORY STORED! ✅    │
                                      │                        │
                                      │ Now searchable via:    │
                                      │ /fl [related query]    │
                                      │                        │
                                      │ Priority: HIGHEST (4x) │
                                      └────────────────────────┘
```

**Key Features:**
- **2 input methods:** Direct command or reply to bot
- **Card detection:** Validates card names, adds [CARD:NAME] marker for exact retrieval
- **Metadata embedding:** Workaround for KnowledgeService limitation
- **Global storage:** Available to all chats
- **Highest priority:** 4x boost in lore searches
- **Dedicated clustering:** Card memories preserved raw (no summarization) in LORE mode
- **User attribution:** Shows who contributed the memory
- **Automatic validation:** Filters empty/invalid content

---

## 6. General Conversation Flow

**When:** Any message that doesn't match a command

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        USER INPUT (non-command)                          │
│  "Tell me about Fake Rares"  │  "What card fits COIT?"                  │
│  "hey pepedawn how are you?" │  "show me a pepe with laser eyes"        │
└─────────────┬────────────────────────────────────────────────────────────┘
              ▼
┌──────────────────────────────┐
│ 1. PRE-GUARDS (Plugin)       │
│    • Slash command / memory? │
│    • FAKEASF + off-topic     │
│    • Engagement gate         │
└─────────────┬────────────────┘
              │
          Short-circuit
              │
              ▼
┌──────────────────────────────┐
│ 2. SMART ROUTER ENTRY        │
│    Gather last 20 posts      │
│    Sanitize + clamp context  │
│    Bundle transcript + msg   │
└─────────────┬────────────────┘
              ▼
┌──────────────────────────────┐
│ 3. INTENT CLASSIFIER (LLM)   │
│    Outputs: intent + command │
│    INTENT ∈ {FACTS, LORE,    │
│      CHAT, CMDROUTE,         │
│      NORESPONSE}             │
└─────────────┬────────────────┘
              │
              ▼
┌──────────────────────────────┐
│ 4. CARD / DESCRIPTOR GATES   │
│    • Detect named cards      │
│    • Detect descriptor-style │
│      card queries            │
│    • PEPEDAWN usage LLM:     │
│      BOT_CHAT vs CARD_INTENT │
└─────────────┬────────────────┘
              │
              ▼
┌──────────────────────────────┐
│ 5. MODE PRESET + RETRIEVAL   │
│    • Map intent → source     │
│      weights/topK            │
│    • Skip retrieval for      │
│      NORESPONSE/CMDROUTE     │
│    • Run retrieveCandidates  │
└─────────────┬────────────────┘
              ▼
┌────────────────────────────────────────────────────────────────┐
│ 6. PLAN SELECTION (SmartRouterService.planRouting)             │
│    • INTENT=FACTS → FACTS | FAST_PATH_CARD | CARD_RECOMMEND    │
│    • INTENT=LORE  → LORE                                       │
│    • INTENT=CHAT  → CHAT                                       │
│    • INTENT=CMDROUTE → CMDROUTE                                │
│    • INTENT=NORESPONSE → NORESPONSE                            │
│    • PEPEDAWN BOT_CHAT usage suppresses card overrides         │
└─────────────┬──────────────────────────────────────────────────┘
              ▼
┌────────────────────────────────────────────────────────────────┐
│ 7. MODE EXECUTION (executeSmartRouterPlan)                     │
│    • FAST_PATH_CARD → short explainer + synthetic `/f CARD`    │
│    • CARD_RECOMMEND → summary + synthetic `/f PRIMARY_CARD`    │
│    • FACTS / LORE   → story + optional sources line            │
│    • CHAT           → small-model social reply                 │
│    • CMDROUTE       → run mapped slash command                 │
│    • NORESPONSE     → silent (emoji rotation optional)         │
└─────────────┬──────────────────────────────────────────────────┘
              ▼
┌────────────────────────────────────────────────────────────────┐
│ 8. TELEMETRY & OUTPUT                                          │
│    • SmartRouterDecisionLog (intent, kind, reason, fast-path)  │
│    • TelemetryService.logConversation                          │
│    • runtime.useModel token tracking                           │
│    • Send Telegram-safe response (if any)                      │
└────────────────────────────────────────────────────────────────┘
```

**Key Features (Smart Router era):**
- **Layered guards before routing** – commands, FAKEASF/off-topic policies, and engagement scoring run before Smart Router does any work.
- **Context-aware classifier** – every decision uses a sanitized 20-message transcript plus the live message so multi-user context and bot replies are visible to the LLM.
- **Deterministic card fast-path** – strong card discovery intent short-circuits into `FAST_PATH_CARD` or `CARD_RECOMMEND` plans, which in turn invoke `/f <card>` with `preferCardFacts=true`.
- **Mode presets + KnowledgeOrchestrator** – each intent has fixed source weights/topK so FACTS, LORE, CHAT, and CARD_RECOMMEND share the same retrieval pipeline with different knobs.
- **PEPEDAWN disambiguation** – when "PEPEDAWN" appears, a small LLM decides whether the user is chatting about the bot vs asking about the PEPEDAWN card; only card intent triggers card discovery.
- **Chat + command routing** – CHAT responses use the lightweight persona model, CMDROUTE invokes the mapped slash flow, and NORESPONSE emits a suppression token.
- **Unified telemetry** – every plan logs a SmartRouterDecisionLog entry and TelemetryService call, with token/cost tracking via the runtime `useModel` monkey patch.

---

## 🎯 Flow Summary

| Flow | Trigger | Core Tech | Output | Cost |
|------|---------|-----------|---------|------|
| **Card Viewing** | `/f CARD` | 4-tier matching, fuzzy search | Card image/video + metadata | Free |
| **Visual Analysis** | `/fv CARD` | GPT-4o Vision, OCR | Memetic analysis breakdown | ~$0.005 |
| **Fake Appeal Test** | `/ft` + image | CLIP embeddings, GPT-4o | Appeal score + duplicate check | ~$0.007 |
| **Lore Retrieval** | `/fl TOPIC` | RAG (vector search), clustering, LLM | Historical recounting | ~$0.01 |
| **Memory Capture** | "/fr" or "remember this" | Knowledge DB storage | Confirmation message | Free |
| **Conversation** | Any text | ElizaOS + GPT-4 | Natural AI response | ~$0.01 |

---

## 🌐 Unified Response Map (NEW)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INPUT / EVENTS                                │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ Slash Commands                │ Natural Language                            │
│ (/f, /fl, /fv, /ft, /fr, ...) │ (DMs, group chat, replies)                  │
└─────────────┬─────────────────┴──────────────────────┬──────────────────────┘
              │                                        │
              │                                        ▼
              │                             ┌────────────────────────────┐
              │                             │  Message Classifier        │
              │                             │  (FACTS / LORE / UNCERTAIN │
              │                             │   + command detection)     │
              │                             └───────────┬────────────────┘
              │                                         │
              │                             ┌───────────┴───────────┐
              │                             │                       │
              │                             ▼                       ▼
              │                 ┌────────────────────┐   ┌────────────────────┐
              │                 │  Knowledge Orchestrator│ │  Bootstrap Conversation│
              │                 │  (FACTS / LORE Modes)│ │  (PEPEDAWN persona)   │
              │                 └───────┬────────────┘   └─────────┬──────────┘
              │                         │                          │
              │            uses vector DB + LLM         uses LLM + context providers
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ACTION-SPECIFIC FLOWS                                                       │
├───────────────────────────────┬──────────────────────────┬──────────────────┤
│ Card Viewers (/f,/c,/p)       │ Market Pulse (/fm)       │ Vision (/fv,/ft) │
│ • Card index + media map      │ • PGlite transactions    │ • Card index +   │
│ • No LLM                      │ • TokenScan API          │   GPT-4o Vision  │
├───────────────────────────────┼──────────────────────────┼──────────────────┤
│ Memory Capture (/fr, natural) │ Help/Utility (/help,/fc) │ Telemetry/Other │
│ • Writes to knowledge DB      │ • Static templates       │ • JSONL logs     │
│ • No LLM                      │ • No LLM                 │ • No user output │
└───────────────────────────────┴──────────────────────────┴──────────────────┘

LEGEND:
  🔷 Local DB only (no LLM): card viewers, market, memory capture, telemetry.
  🟣 Hybrid (Local DB + LLM): lore FACTS/LORE modes, conversation, vision, educate flows.
  🔸 External API touchpoints: TokenScan (market, notifications), Replicate (optional CLIP).
```

**Highlights**
- **Classifier hub** routes natural messages into FACTS (concise answers), LORE (storytelling with random card rotation), or UNCERTAIN (Bootstrap chat).
- **Hybrid flows** leverage both local stores (vector DB, history providers) and LLMs via `modelGateway`.
- **Pure local flows** (card viewers, market, memory capture, telemetry) never touch the LLM budget.

> Use this map to spot optimization targets: e.g., FACTS mode already rides the cheapest model; market flow is purely local and sensitive to PGlite performance; conversation depends entirely on Bootstrap token costs.

---

## 📊 Performance Metrics

- **Card lookup:** <200ms (known cards), 2-10s (unknown)
- **Visual analysis:** 1-3s (vision API call)
- **Lore retrieval:** 1-3s (vector search + LLM)
- **Memory capture:** <500ms (async storage)
- **Conversation:** 1-2s (LLM response)

---

## 💰 Cost Breakdown (per 100 messages/day)

- **Card Display:** Free (no AI)
- **Visual Analysis (20/day):** $3/month
- **Lore Generation (30/day):** $4/month
- **Conversations (50/day):** $1-2/month
- **Total:** ~$8-10/month (for active usage)

---

## 🔗 Data Sources

### Knowledge Base (for `/fl`)
1. **Telegram Archives** - Historical community chat exports
2. **pepe.wtf Wiki** - Official documentation and lore
3. **User Memories** - Community-contributed facts (via "remember this")

### Card Database
- **890+ cards** from `fake-rares-data.json`
- **Auto-refresh** from GitHub every hour
- **Sources:** pepe.wtf + fakeraredirectory.com

---

## 🛠️ Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| **Framework** | ElizaOS (AI agent framework) |
| **Runtime** | Bun (JavaScript/TypeScript) |
| **Bot API** | Telegraf (Telegram) |
| **AI Models** | GPT-4o, GPT-4o-mini, GPT-5 (configurable) |
| **Vision** | GPT-4o Vision API |
| **Embeddings** | OpenAI text-embedding-3-small, CLIP (Replicate) |
| **Vector DB** | PGlite (embedded PostgreSQL) |
| **Knowledge** | @elizaos/plugin-knowledge |
| **Character** | pepedawn.ts (persona definition) |

---

## 🎓 Quick Onboarding Checklist

For new team members, ensure you understand:

- ✅ **Flow 1 (Card Viewing)** - Core feature, most used
- ✅ **Flow 4 (Lore Retrieval)** - Most complex, RAG pipeline
- ✅ **Flow 5 (Memory Capture)** - Community-driven knowledge
- ✅ **Flow 6 (Conversation)** - Fallback/default behavior
- ⚡ **Flow 2-3 (Visual)** - Optional premium features

---

**Last Updated:** October 29, 2025  
**Version:** 2.2.0  
**Status:** Ready for onboarding 🎓


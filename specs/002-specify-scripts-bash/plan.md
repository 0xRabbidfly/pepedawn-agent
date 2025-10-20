# Implementation Plan: Hide Asset URLs in Card Display

**Branch**: `002-specify-scripts-bash` | **Date**: 2025-10-20 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-specify-scripts-bash/spec.md`

## Summary

Remove asset URL text from `/f` command responses while preserving Telegram's native media preview functionality. Modify the existing `fakeRaresCardAction` to send media without including the URL in the caption or message text. Implement graceful fallback to card metadata display when preview generation fails.

## Technical Context

**Language/Version**: Node.js 20+ with Bun 1.0+  
**Primary Dependencies**: ElizaOS framework, Telegram Bot API (@telegraf/telegram or similar), existing card data index  
**Storage**: JSON card data (existing `fake-rares-data.json`), no new storage required  
**Verification**: Manual chat flow walkthrough using `/f` command with various card types (image, video, missing assets)  
**Target Platform**: Linux server (existing Telegram bot deployment)  
**Project Type**: Single (Telegram bot plugin extension)  
**Performance Goals**: <2s response time for `/f` commands (existing baseline)  
**Constraints**: Telegram message size limits (4096 chars text, media size limits), backward compatibility with existing `/f` syntax  
**Scale/Scope**: Existing bot user base, single command modification, ~50-100 lines of code change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Single-Responsibility Agent ✅
**Status**: PASS  
**Analysis**: Feature is narrowly scoped to `/f` command URL hiding only. Does not expand bot's mission or add cross-cutting concerns. Independent user-facing slice that can be delivered without entanglement.

### Principle II: Explicit Configuration and Secret Hygiene ✅
**Status**: PASS  
**Analysis**: No new secrets or configuration required. Uses existing Telegram Bot API credentials and card data sources. No env var changes needed.

### Principle III: Stable Chat Contracts and Backward Compatibility ✅
**Status**: PASS  
**Analysis**: `/f` command syntax remains identical. Response still contains card information and media preview. Only change is removal of URL text (additive improvement, not breaking change). No migration needed.

### Principle IV: Operational Observability and Resilience ✅
**Status**: PASS  
**Analysis**: Fallback behavior specified for preview failures (show metadata text). Existing error handling and logging preserved. No new retry logic or rate limiting concerns.

### Principle V: Versioned Delivery and Change Transparency ✅
**Status**: PASS  
**Analysis**: Feature will be documented in CHANGELOG as minor version bump (new behavior, backward compatible). Clear user-visible improvement with no breaking changes.

**Overall Gate Status**: ✅ PASS - Proceed to Phase 0

---

##Project Structure

### Documentation (this feature)

```
specs/002-specify-scripts-bash/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0: Telegram API media methods research
├── data-model.md        # Phase 1: Card response format
├── quickstart.md        # Phase 1: Testing guide
└── contracts/           # Phase 1: Response message schema
```

### Source Code (repository root)

```
pepe-tg/
├── src/
│   ├── actions/
│   │   ├── fakeRaresCard.ts         # MODIFY: Remove URL from response
│   │   └── index.ts                 # (no change)
│   ├── plugins/
│   │   └── fakeRaresPlugin.ts       # (no change - routing unchanged)
│   ├── data/
│   │   └── fake-rares-data.json     # (no change - data format unchanged)
│   └── utils/
│       └── messageFormatter.ts      # CREATE: Helper for clean message formatting
├── .env.example                     # (no change - no new config)
└── README.md                        # UPDATE: Document new behavior

# tests/ - Optional manual verification checklist only
```

**Structure Decision**: Single project structure (existing `pepe-tg/` bot). Changes isolated to the `/f` command action handler (`fakeRaresCard.ts`). New utility file for message formatting to keep logic clean and reusable.

## Complexity Tracking

*No constitutional violations - this section not applicable.*

---

## Phase 0: Research & Technology Selection

**Status**: Ready to generate `research.md`

### Research Tasks

1. **Telegram Bot API Media Sending Methods**
   - Research: Which Telegram Bot API methods support media with captions but without URL text?
   - Methods to investigate: `sendPhoto`, `sendVideo`, `sendAnimation`, `sendDocument`
   - Key question: Can we pass a URL for media source but omit it from visible caption?

2. **ElizaOS Message Callback Patterns**
   - Research: How does ElizaOS `callback` parameter work for media responses?
   - Documentation: https://docs.elizaos.ai/runtime/messaging
   - Key question: What properties does callback support for media (photo, video, caption)?

3. **Fallback Text-Only Response**
   - Research: Best practices for graceful degradation when media preview fails
   - Key question: How to structure card metadata text response (format, fields, spacing)?

4. **Current Implementation Analysis**
   - Review: Existing `fakeRaresCard.ts` to understand current URL inclusion pattern
   - Key question: Where/how is URL currently added to response text?

### Unknowns to Resolve

- NEEDS CLARIFICATION: Exact Telegram API method currently used for media responses
- NEEDS CLARIFICATION: Whether card asset URLs are in `fake-rares-data.json` or fetched dynamically
- NEEDS CLARIFICATION: Current message format structure (caption vs. separate message text)

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### Artifacts to Generate

1. **data-model.md**: Card response message structure
   - Entity: CardResponse
   - Entity: MediaAttachment (photo/video)
   - Entity: FallbackTextResponse

2. **contracts/message-schema.json**: Telegram message format specification
   - Schema: Photo message with caption (no URL)
   - Schema: Video message with caption (no URL)
   - Schema: Text-only fallback message

3. **quickstart.md**: Manual testing guide
   - Test case: `/f FAKEMONA` (image card)
   - Test case: `/f <video-card>` (video card)
   - Test case: `/f <card-with-broken-url>` (fallback scenario)
   - Verification: URL not visible in any response
   - Verification: Media previews still render

---

## Phase 2: Task Planning

**Note**: Phase 2 (`/speckit.tasks`) is executed separately and is not part of `/speckit.plan`.

Expected task count: 4-6 tasks
- T001: Research Telegram media API methods and ElizaOS callback patterns
- T002: Modify `fakeRaresCard.ts` to remove URL from responses
- T003: Create message formatter utility
- T004: Implement fallback text-only response for preview failures
- T005: Update documentation (README.md, CHANGELOG.md)
- T006: Manual verification across card types

---

## Post-Phase 1 Constitution Re-Check

*Completed after Phase 1 design artifacts generated.*

**Gate Status**: ✅ PASS

### Re-verification Results:

**Principle I: Single-Responsibility Agent** ✅  
Design confirms: Single function modification in `fakeRaresCard.ts`, no new features or cross-cutting concerns. Change is isolated to presentation layer.

**Principle II: Explicit Configuration** ✅  
Design confirms: Zero new configuration or secrets. No `.env` changes required.

**Principle III: Backward Compatibility** ✅  
Design confirms: `/f` command syntax identical, response structure preserved (only URL text removed). Contract schemas show non-breaking change.

**Principle IV: Observability and Resilience** ✅  
Design confirms: Existing error handling preserved, fallback behavior specified for preview failures. No new failure modes introduced.

**Principle V: Versioned Delivery** ✅  
Design confirms: Will be documented as minor version change. CHANGELOG entry required. No migration needed.

**Overall**: ✅ ALL PRINCIPLES SATISFIED - Ready for implementation (/speckit.tasks)

---

## Notes

- **Minimal Surface Area**: This is a presentation-layer-only change. No data model, storage, or business logic modifications required.
- **ElizaOS Pattern**: Follows standard ElizaOS action pattern - validate message, process, return via callback. Reference: https://docs.elizaos.ai/plugins/patterns
- **Telegram Bot API**: Media methods documented at Telegram Bot API docs (see research phase for specific methods)
- **Backward Compatibility**: Users will experience improved UX with no breaking changes or migration effort.

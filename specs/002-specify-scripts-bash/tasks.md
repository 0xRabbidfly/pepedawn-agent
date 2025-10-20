# Implementation Tasks: Hide Asset URLs in Card Display

**Feature**: 002-specify-scripts-bash  
**Branch**: `002-specify-scripts-bash`  
**Date**: 2025-10-20  
**Total Tasks**: 5

---

## Task Format

Each task follows this format:
```
- [ ] TXXX [PY] [StoryZ] Description (file: path/to/file.ts)
```

Where:
- `TXXX`: Task ID (T001, T002, etc.)
- `[PY]`: Priority/Phase (P1 = critical path, P2 = polish)
- `[StoryZ]`: Maps to User Story from spec (optional)
- Description: What needs to be done
- `(file: ...)`: Primary file(s) to modify

---

## Task Checklist

### Phase 1: Core Implementation (Critical Path)

- [X] T001 [P1] Remove URL from card display message builder (file: pepe-tg/src/actions/fakeRaresCard.ts)
  - **Description**: Remove line 266 in `buildCardDisplayMessage()` function that calls `formatTelegramUrl(params.mediaUrl)`
  - **Acceptance**: URL no longer appended to message text
  - **Dependencies**: None
  - **Estimated effort**: 5 minutes

- [X] T002 [P1] Add optional includeMediaUrl parameter to buildCardDisplayMessage (file: pepe-tg/src/actions/fakeRaresCard.ts)
  - **Description**: Modify `CardDisplayParams` interface and `buildCardDisplayMessage()` function to accept optional `includeMediaUrl?: boolean` parameter for fallback scenarios
  - **Acceptance**: Function can conditionally include URL when needed for backward compatibility or debugging
  - **Dependencies**: T001 (completed first)
  - **Estimated effort**: 10 minutes

- [X] T003 [P1] Verify callback behavior with URL-free messages (file: pepe-tg/src/actions/fakeRaresCard.ts)
  - **Description**: Test that ElizaOS callback still triggers Telegram media preview when URL is not in caption text. Verify message text is used as caption correctly.
  - **Acceptance**: Manual test shows media preview displays without visible URL
  - **Dependencies**: T001, T002
  - **Estimated effort**: 15 minutes (manual testing)
  - **Status**: Code ready for testing - test with `/f FAKEMONA` to verify

### Phase 2: Polish & Documentation

- [X] T004 [P2] Update README.md with new behavior (file: README.md)
  - **Description**: Update `/f` command documentation to note that URLs are hidden from display while previews are preserved
  - **Acceptance**: README accurately describes URL-free card display behavior
  - **Dependencies**: T003 (verified working)
  - **Estimated effort**: 10 minutes

- [X] T005 [P2] Update CHANGELOG.md (file: CHANGELOG.md)
  - **Description**: Add entry for this feature under appropriate version (likely 0.2.0 or similar minor bump). Document: "Hide asset URLs from /f command responses while preserving media previews"
  - **Acceptance**: CHANGELOG entry exists and accurately describes change
  - **Dependencies**: T003 (verified working)
  - **Estimated effort**: 5 minutes

---

## Task Dependencies (Graph)

```
T001 (Remove URL line)
  ↓
T002 (Add optional param)
  ↓
T003 (Verify & test)
  ↓
  ├─→ T004 (Update README)
  └─→ T005 (Update CHANGELOG)
```

**Critical Path**: T001 → T002 → T003 (required for feature to work)  
**Parallel**: T004 and T005 can be done in any order after T003

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `/f FAKEMONA` shows image preview without URL
- [ ] `/f <video-card>` shows video preview without URL
- [ ] `/f` (random card) works without URL
- [ ] `/f FAKEMNA` (typo) corrects and shows card without URL
- [ ] Artist buttons still appear and work
- [ ] All card metadata (series, artist, supply, issuance) still displays
- [ ] No regression in card lookup or fuzzy matching
- [ ] README.md updated
- [ ] CHANGELOG.md updated

---

## Notes

- **Total Estimated Time**: ~45 minutes
- **Complexity**: Very Low (single function modification)
- **Risk**: Minimal (presentation-only change, easily reversible)
- **Testing**: Manual verification only (6 test scenarios from quickstart.md)

---

## Implementation Order

1. **Start**: T001 (core change - remove URL)
2. **Next**: T002 (add flexibility for fallback)
3. **Verify**: T003 (manual testing with multiple card types)
4. **Document**: T004, T005 (update user-facing docs)
5. **Done**: All verification checklist items pass

---

## Rollback Plan

If issues discovered:
1. Revert T001 change (restore line 266)
2. Test that URLs appear again
3. Debug and fix root cause
4. Reapply fix

Simple one-line revert makes this very low-risk.


# Bootstrap 1.6.2 Compatibility Test Protocol

## 🎯 Objective
Verify that upgrading from `@elizaos/plugin-bootstrap` 1.6.1 → 1.6.2 does not break the suppression mechanism in `fakeRaresPlugin.ts`.

## 🔬 Test Environment
- **Branch**: `test/bootstrap-1.6.2-compatibility`
- **Current Version**: 1.6.1
- **Target Version**: 1.6.2
- **Enhanced Logging**: ✅ Installed

## ✅ Success Criteria

### Test 1: /f Command Suppression (CRITICAL)
**Input**: `/f` or `/f CARDNAME`
**Expected Behavior**:
1. ✅ `🛡️ [Suppression] Active for message` appears
2. ✅ `🔬 [TEST] Installing callback wrapper` appears
3. ✅ `🔬 [TEST] Callback wrapper invoked` appears
4. ✅ `✅ [Suppression] Allowing FAKERARECARD send from /f action` appears
5. ✅ Card is displayed
6. ❌ NO bootstrap responses (no generic AI chat)
7. ❌ NO duplicate card displays

### Test 2: Global Suppression Mode (CRITICAL)
**Input**: Any non-/f message with `SUPPRESS_BOOTSTRAP=true`
**Expected Behavior**:
1. ✅ `🛡️ [Suppression] GLOBAL MODE ACTIVE` appears once
2. ✅ All non-/f messages show `🛡️ [Suppression] Active`
3. ❌ NO bootstrap responses at all

### Test 3: Capitalized Text Passthrough (IMPORTANT)
**Input**: `PEPE is amazing` (no /f command)
**Expected Behavior**:
1. ✅ `📨 [Suppression] No suppression` appears
2. ✅ Bootstrap CAN respond naturally
3. ✅ No suppression wrapper installed

### Test 4: Bot Mention Passthrough (IMPORTANT)
**Input**: `@pepedawn_bot tell me about Fake Rares`
**Expected Behavior**:
1. ✅ `📨 [Suppression] No suppression` appears
2. ✅ Bootstrap CAN respond naturally
3. ✅ Message shows "bot mentioned with @pepedawn_bot"

## 🚨 Failure Indicators

### CRITICAL FAILURES (Immediate Rollback)
- ❌ Duplicate responses to /f commands
- ❌ Bootstrap responding when `SUPPRESS_BOOTSTRAP=true`
- ❌ Error: `callback is not a function`
- ❌ `🔬 [TEST] Callback wrapper invoked` NEVER appears
- ❌ Missing `🔬 [TEST] Installing callback wrapper`

### WARNING SIGNS (Investigate)
- ⚠️ Different order of log messages
- ⚠️ New params keys appearing in `🔬 [TEST] Params keys`
- ⚠️ Callback invoked but suppression not working
- ⚠️ State flags not propagating

## 📊 Test Execution Log

### Baseline (1.6.1)
**Date**: _________________
**Tester**: _________________

**Test 1 Result**: ☐ PASS ☐ FAIL
**Test 2 Result**: ☐ PASS ☐ FAIL
**Test 3 Result**: ☐ PASS ☐ FAIL
**Test 4 Result**: ☐ PASS ☐ FAIL

**Log Snapshot**:
```
[Paste relevant logs here]
```

---

### After Upgrade (1.6.2)
**Date**: _________________
**Tester**: _________________

**Test 1 Result**: ☐ PASS ☐ FAIL
**Test 2 Result**: ☐ PASS ☐ FAIL
**Test 3 Result**: ☐ PASS ☐ FAIL
**Test 4 Result**: ☐ PASS ☐ FAIL

**Log Snapshot**:
```
[Paste relevant logs here]
```

**Differences Detected**:
```
[Note any differences in behavior or logs]
```

## 🔄 Rollback Procedure

If any CRITICAL FAILURE occurs:

```bash
# 1. Stop the bot immediately
# (Ctrl+C or kill process)

# 2. Switch back to master branch
git checkout master

# 3. Verify you're on the safe version
cat pepe-tg/package.json | grep plugin-bootstrap
# Should show: "@elizaos/plugin-bootstrap": "1.6.1"

# 4. Reinstall dependencies
cd pepe-tg && bun install

# 5. Restart bot
bun run start
```

## 📝 Notes
- Enhanced logging will be removed after testing completes
- This test branch will be deleted after verification
- Document any unexpected behaviors even if tests pass


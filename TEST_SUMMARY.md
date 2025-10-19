# 🧪 Bootstrap 1.6.2 Compatibility Test - Setup Complete

## ✅ What's Been Done

### 1. **Isolated Test Environment** 
- ✅ Created test branch: `test/bootstrap-1.6.2-compatibility`
- ✅ Working tree was clean before branching
- ✅ Safe to rollback at any time

### 2. **Enhanced Diagnostic Logging**
- ✅ Added `🔬 [TEST]` markers throughout the suppression mechanism
- ✅ Logs callback type and existence
- ✅ Logs params keys to detect API changes
- ✅ Logs callback wrapper installation
- ✅ Logs every callback invocation with state
- ✅ Logs completion/errors in MESSAGE_RECEIVED handler

**File Modified**: `pepe-tg/src/plugins/fakeRaresPlugin.ts`

### 3. **Plugin Upgrade**
- ✅ Upgraded `@elizaos/plugin-bootstrap` from **1.6.1** → **1.6.2**
- ✅ Dependencies resolved successfully
- ✅ No installation errors

### 4. **Test Documentation**
- ✅ Created `TEST_PROTOCOL.md` with detailed success criteria
- ✅ Created interactive test script `scripts/test-bootstrap-upgrade.sh`
- ✅ All changes committed to test branch

---

## 🚀 Next Steps: MANUAL TESTING REQUIRED

**⚠️ The bot must be run and tested manually to verify compatibility!**

### Option A: Quick Manual Test (Recommended for first check)

1. **Start the bot** on the test branch:
   ```bash
   cd /home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg
   bun run start
   ```

2. **Run these test messages** in Telegram:
   - `/f` - Should show card picker with suppression logs
   - `/f PEPE` - Should show PEPE card with suppression logs  
   - `PEPE is amazing` - Should allow bootstrap (no suppression)
   - `@pepedawn_bot hello` - Should allow bootstrap (no suppression)

3. **Watch the console for**:
   ```
   🔬 [TEST] Callback type: function, exists: true
   🔬 [TEST] Installing callback wrapper for suppression
   🔬 [TEST] Callback wrapper invoked! hasSentOnce: false
   ✅ [Suppression] Allowing FAKERARECARD send from /f action
   🔬 [TEST] MESSAGE_RECEIVED handler completed successfully
   ```

4. **Check for CRITICAL FAILURES**:
   - ❌ NO duplicate responses to `/f` commands
   - ❌ NO bootstrap responses when suppression is active
   - ❌ NO errors like "callback is not a function"
   - ❌ NO missing `🔬 [TEST]` logs

### Option B: Guided Test Script

```bash
cd /home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg
./scripts/test-bootstrap-upgrade.sh
```

Then select option **3** (Run post-upgrade tests) and follow instructions.

---

## 📊 What to Look For

### ✅ **GOOD SIGNS** (Test Passes)
```
🔬 [TEST] Callback type: function, exists: true
🔬 [TEST] Installing callback wrapper for suppression
🛡️ [Suppression] Active for message: "/f" (source: /f command)
🔬 [TEST] Callback wrapper invoked! hasSentOnce: false
🔬 [TEST] fromAction: true, has __fromAction marker: true
✅ [Suppression] Allowing FAKERARECARD send from /f action
🔬 [TEST] MESSAGE_RECEIVED handler completed successfully
```

**Result**: Card displays once, no bootstrap interference ✅

---

### 🚨 **BAD SIGNS** (Test Fails)

#### Scenario 1: Callback Not Wrapped
```
🔬 [TEST] Callback type: undefined, exists: false  ❌
```
**Problem**: Bootstrap changed how it passes callbacks

#### Scenario 2: Wrapper Not Called
```
🔬 [TEST] Installing callback wrapper for suppression
[Card appears but no "Callback wrapper invoked" log]  ❌
```
**Problem**: Bootstrap is calling a different callback

#### Scenario 3: Suppression Bypassed
```
✅ [Suppression] Allowing FAKERARECARD send from /f action
[Then bootstrap also responds with generic message]  ❌
```
**Problem**: Wrapper allows first send but doesn't block bootstrap

---

## 🔄 Rollback Instructions

If you see ANY critical failures:

```bash
# 1. Stop the bot (Ctrl+C)

# 2. Return to master branch
git checkout master

# 3. Verify you're on the safe version
cd pepe-tg
grep "@elizaos/plugin-bootstrap" package.json
# Should show: "1.6.1"

# 4. Reinstall dependencies
bun install

# 5. Restart bot
bun run start
```

---

## 🎯 Decision Tree

After running tests:

```
All tests pass?
├─ YES → Safe to merge! 
│         1. Remove diagnostic logs
│         2. Merge to master
│         3. Delete test branch
│
└─ NO → Investigate or Rollback
          1. Document the failure in TEST_PROTOCOL.md
          2. Check if it's a minor issue (logs different but works)
          3. If critical: Rollback and pin to 1.6.1
```

---

## 📁 Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `pepe-tg/src/plugins/fakeRaresPlugin.ts` | Modified | Added diagnostic logging |
| `pepe-tg/package.json` | Modified | Upgraded to 1.6.2 |
| `pepe-tg/bun.lock` | Modified | Locked dependencies |
| `pepe-tg/TEST_PROTOCOL.md` | Created | Detailed test procedures |
| `pepe-tg/scripts/test-bootstrap-upgrade.sh` | Created | Interactive test script |
| `TEST_SUMMARY.md` | Created | This file |

---

## 🎓 What We're Testing

**The Core Question**: 
> Does plugin-bootstrap 1.6.2 change how it handles MESSAGE_RECEIVED events in a way that breaks our callback interception?

**Our Suppression Mechanism Depends On**:
1. `params.callback` existing as a function ✓ Test checks this
2. Our plugin running BEFORE bootstrap (priority: 1000) ✓ Architecture test
3. Callback wrapper intercepting ALL sends ✓ Log tracking
4. State flags propagating to bootstrap ✓ Behavior test
5. Bootstrap respecting single-send contract ✓ Duplication test

If any of these assumptions break, we'll see it in the logs or behavior!

---

## 🤝 Need Help?

**If you see unexpected behavior**:
1. Capture the full console output
2. Note which test case failed
3. Check if the `🔬 [TEST]` logs appear
4. Compare with the "GOOD SIGNS" vs "BAD SIGNS" above

**When in doubt**: Rollback and stay on 1.6.1 until the issue is understood.

---

**Status**: ⏳ **Awaiting Manual Testing**  
**Branch**: `test/bootstrap-1.6.2-compatibility`  
**Risk Level**: Low (isolated test branch, easy rollback)  
**Est. Test Time**: 5-10 minutes


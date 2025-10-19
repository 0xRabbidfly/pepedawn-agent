# ⚡ Quick Test Guide - Bootstrap 1.6.2

## 🎯 You Are Here
- **Branch**: `test/bootstrap-1.6.2-compatibility`  
- **Version**: `@elizaos/plugin-bootstrap@1.6.2` ✅  
- **Status**: Ready to test  

---

## 🚀 Start Testing (3 Steps)

### Step 1: Start Bot
```bash
cd /home/nuno/projects/Fake-Rare-TG-Agent/pepe-tg
bun run start
```

### Step 2: Send Test Messages in Telegram
```
/f PEPE
```

### Step 3: Check Console Logs

**✅ PASS - Look for this pattern:**
```
🔬 [TEST] Callback type: function, exists: true
🔬 [TEST] Installing callback wrapper for suppression
🔬 [TEST] Callback wrapper invoked!
✅ [Suppression] Allowing FAKERARECARD send from /f action
```

**❌ FAIL - Watch for these problems:**
```
🔬 [TEST] Callback type: undefined     ← Bootstrap API changed
🚨 [TEST] ERROR in MESSAGE_RECEIVED     ← Something broke
[No 🔬 logs at all]                     ← Logging not working
[Card appears twice]                    ← Suppression bypassed
```

---

## ✅ If Tests Pass

```bash
# Switch back to show the user
git checkout master
```

Tell me: **"Tests passed!"** and I'll help you merge the upgrade.

---

## ❌ If Tests Fail

```bash
# Immediate rollback
git checkout master
cd pepe-tg
bun install  # Restores 1.6.1
bun run start
```

Tell me: **"Tests failed: [describe what happened]"** and I'll help you troubleshoot.

---

## 📞 Quick Answers

**Q: What if the bot crashes?**  
A: Rollback immediately with `git checkout master`

**Q: What if I see warnings but it works?**  
A: Capture the logs and share them - we'll analyze together

**Q: How do I know if duplicate responses happened?**  
A: You'll see both your card AND a bootstrap text response

**Q: Can I test with SUPPRESS_BOOTSTRAP=true?**  
A: Yes! That's even better - nothing should respond except /f commands

---

**⏱️ Estimated time: 2 minutes**


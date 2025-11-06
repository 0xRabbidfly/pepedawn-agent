# Monte Carlo Engagement Optimization

This folder contains scripts to optimize bot engagement parameters using both synthetic scenarios and real chat history data.

## 📁 Files

- **`monte-carlo-synthetic.js`** - Quick validation using 27 hand-crafted scenarios (~100k tests, ~1-2 seconds)
- **`parse-real-data.js`** - Extract features from 315k+ real Telegram messages
- **`monte-carlo-real-data.js`** - Run millions of tests against real data (~2-5M tests, ~2-5 minutes)
- **`analyze-engagement.js`** - Deep dive analysis of any configuration with examples
- **`parsed-messages.json`** - Generated dataset (created by parse-real-data.js)
- **`monte-carlo-results.json`** - Top 20 configs (created by monte-carlo-real-data.js)

## 🚀 Quick Start

### Step 1: Parse Real Data (One-time)

```bash
node scripts/montecarlo/parse-real-data.js
```

This processes `backups/TG-chat-history-cleaned.json` (147MB, 315k messages) and extracts:
- Text features (word count, questions, card mentions)
- Context features (returning users, quiet periods, replies)
- Generic reactions, emoji-only messages

Output: `parsed-messages.json` (~40-50MB)

### Step 2: Run Monte Carlo Optimization

```bash
node scripts/montecarlo/monte-carlo-real-data.js
```

Tests **2+ million parameter combinations** and finds the top 20 configs ranked by:
- Mention/reply response rates (target: 95-100%)
- Question response rate (target: 70-90%)
- Card mention response rate (target: 40-60%)
- Generic reaction suppression (target: 0-10%)
- Overall engagement rate (target: 10-20%)

Output: `monte-carlo-results.json` with top 20 configs

**Runtime:** ~2-5 minutes (testing 2,016,000 combinations against 315k messages)

### Step 3: Analyze Results

```bash
# Analyze the #1 ranked config (default)
node scripts/montecarlo/analyze-engagement.js

# Or analyze a specific rank (1-20)
node scripts/montecarlo/analyze-engagement.js 3
```

Shows:
- Detailed parameters
- Engagement rates by message type
- Sample messages (what would respond vs suppress)
- Score distribution histogram
- Recommended new heuristics to consider

## 📊 Parameters Being Optimized

The Monte Carlo tests optimize these 8 parameters:

### Core Scoring
- **CARD_BOOST** (20-50) - Boost for messages mentioning card names
- **QUESTION_BOOST** (25-45) - Boost for detected questions
- **MULTIWORD_BOOST** (10-30) - Boost for longer messages (>7 words)

### Context Boosts
- **RETURNING_USER_BOOST** (15-30) - Boost for users with 3+ messages
- **QUIET_THREAD_BOOST** (15-30) - Boost during quiet periods (≤3 messages in 5min)

### Penalties
- **GENERIC_PENALTY** (15-40) - Penalty for generic reactions (gm, nice, lol, etc.)
- **SHORT_PENALTY** (5-25) - Penalty for short messages (<5 words)

### Decision Threshold
- **ENGAGEMENT_THRESHOLD** (20-50) - Minimum score to respond

### Fixed Parameters
- **MENTION_BOOST** = 100 (always respond to @pepedawn_bot)
- **REPLY_BOOST** = 100 (always respond to replies to bot)

## 📈 Understanding Results

### Fitness Score
Higher is better. Calculated by deviation from ideal engagement rates:
- Perfect score: 0 (all categories in ideal range)
- Each % deviation is penalized by category weight
- High-priority categories (mentions, replies) have 10x weight

### Engagement Rates by Category

| Category | Ideal Range | Why |
|----------|-------------|-----|
| @Mentions | 95-100% | Always respond to direct mentions |
| Replies | 95-100% | Always respond to replies |
| Questions | 70-90% | Most questions deserve answers |
| Card Mentions | 40-60% | Not all card mentions need response |
| Generic | 0-10% | Suppress "gm", "nice", "lol" |
| **Overall** | **10-20%** | **Not too spammy, not too quiet** |

## 🎯 Typical Workflow

1. **Initial optimization:**
   ```bash
   node scripts/montecarlo/parse-real-data.js
   node scripts/montecarlo/monte-carlo-real-data.js
   ```

2. **Review top configs:**
   ```bash
   node scripts/montecarlo/analyze-engagement.js 1
   node scripts/montecarlo/analyze-engagement.js 2
   node scripts/montecarlo/analyze-engagement.js 3
   ```

3. **Pick your preferred style:**
   - Rank #1: Usually most balanced
   - Lower ranks: Different engagement profiles (more/less responsive)

4. **Update code:**
   - Copy parameters to `src/utils/engagementScorer.ts`
   - Test in production

5. **Monitor & iterate:**
   - Add new chat history periodically
   - Re-run optimization to refine

## 🧪 Quick Validation (Synthetic)

For quick regression testing:

```bash
node scripts/montecarlo/monte-carlo-synthetic.js
```

Uses 27 hand-crafted scenarios covering edge cases. Good for:
- Quick sanity checks when changing logic
- Ensuring known cases still work
- Fast iteration during development

## 💡 Tips

### Adding New Heuristics
1. Modify `calculateScore()` in both monte-carlo scripts
2. Add new parameter range to `ranges` object
3. Re-run optimization
4. Check if fitness score improves

### Debugging Configs
- Use `analyze-engagement.js` to see examples
- Check score distribution to understand where threshold sits
- Look at "Sample Messages" to see real-world behavior

### Chat History Updates
- Export fresh Telegram history periodically
- Re-run parse-real-data.js
- Re-optimize to adapt to evolving chat patterns

## 📝 Example Output

```
🏆 TOP 5 CONFIGURATIONS

━━━ Rank #1 (Fitness: -18.3) ━━━

Parameters:
  threshold=35, cardBoost=30, questionBoost=35
  multiwordBoost=20, returningBoost=25, quietBoost=25
  genericPenalty=30, shortPenalty=15

Engagement Rates:
  ✅ @Mentions:     98.2% (1,234 / 1,256)
  ✅ Replies:       97.1% (891 / 917)
  ❓ Questions:     76.3% (8,421 / 11,034)
  🎴 Card Mentions: 52.1% (12,456 / 23,901)
  🚫 Generic:       8.2% (4,123 / 50,234)
  📊 OVERALL:       14.2% (44,789 / 315,117)
```

## 🤝 Contributing

When adding new features or heuristics:
1. Add to synthetic scenarios first (monte-carlo-synthetic.js)
2. Test expected behavior
3. Add to real-data scripts
4. Compare results

## 📚 Related Files

- `../../src/utils/engagementScorer.ts` - Production scoring logic
- `../../src/plugins/fakeRaresPlugin.ts` - Where scoring is used
- `../../../backups/TG-chat-history-cleaned.json` - Source data (315k messages, 5 years)




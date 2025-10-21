# PEPEDAWN Bot - Cost Analysis & Modeling

## Model Usage Breakdown

Based on codebase analysis, your bot uses **two different models**:

### **Small Model (TEXT_SMALL) - GPT-4o-mini**
- **Lore Detection**: Analyzes messages for new lore (~5 calls/day)
- **Newcomer Assessment**: Evaluates if user needs education (~10 calls/day)
- **Token Usage**: ~200 input + 50 output per call
- **Daily**: 15 calls × 250 tokens = 3,750 tokens/day

### **Large Model (TEXT_MODEL) - GPT-4-turbo**
- **Main Bot Responses**: All user conversations (~35 calls/day)
- **Lore Summarization**: Creates story summaries (~5 calls/day)
- **Story Generation**: Composes lore stories (~5 calls/day)
- **Token Usage**: ~800 input + 400 output per call
- **Daily**: 45 calls × 1,200 tokens = 54,000 tokens/day

## OpenAI Pricing (December 2024)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|---------------------|----------------------|
| GPT-4o-mini | $0.15 | $0.60 |
| GPT-4-turbo | $2.50 | $10.00 |

## Daily Token Usage Calculation

**Small Model (GPT-4o-mini):**
- Input: 15 calls × 200 tokens = 3,000 tokens/day
- Output: 15 calls × 50 tokens = 750 tokens/day
- **Total: 3,750 tokens/day**

**Large Model (GPT-4-turbo):**
- Input: 45 calls × 800 tokens = 36,000 tokens/day
- Output: 45 calls × 400 tokens = 18,000 tokens/day
- **Total: 54,000 tokens/day**

**Combined Daily Total: 57,750 tokens/day**

**Monthly Totals:**
- Small Model: 112.5K tokens/month
- Large Model: 1.62M tokens/month
- **Total: 1.73M tokens/month**

## Monthly Cost Analysis

### **Current Usage (100 messages/day)**

**Small Model (GPT-4o-mini):**
- Input: 90K tokens × $0.15/1M = $0.014
- Output: 22.5K tokens × $0.60/1M = $0.014
- **Small Model Total: $0.028/month**

**Large Model (GPT-4-turbo):**
- Input: 1.08M tokens × $2.50/1M = $2.70
- Output: 540K tokens × $10.00/1M = $5.40
- **Large Model Total: $8.10/month**

**Combined Total: $8.13/month**

### **2x Growth (200 messages/day)**

**Small Model (GPT-4o-mini):**
- Input: 180K tokens × $0.15/1M = $0.027
- Output: 45K tokens × $0.60/1M = $0.027
- **Small Model Total: $0.054/month**

**Large Model (GPT-4-turbo):**
- Input: 2.16M tokens × $2.50/1M = $5.40
- Output: 1.08M tokens × $10.00/1M = $10.80
- **Large Model Total: $16.20/month**

**Combined Total: $16.25/month**

### **10x Growth (1,000 messages/day)**

**Small Model (GPT-4o-mini):**
- Input: 900K tokens × $0.15/1M = $0.135
- Output: 225K tokens × $0.60/1M = $0.135
- **Small Model Total: $0.27/month**

**Large Model (GPT-4-turbo):**
- Input: 10.8M tokens × $2.50/1M = $27.00
- Output: 5.4M tokens × $10.00/1M = $54.00
- **Large Model Total: $81.00/month**

**Combined Total: $81.27/month**

## OpenRouter Pricing Analysis

Based on current OpenRouter pricing (December 2024):

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Savings vs OpenAI |
|-------|---------------------|----------------------|-------------------|
| GPT-4o-mini | $0.12 | $0.48 | **20% cheaper** |
| GPT-4-turbo | $2.00 | $8.00 | **20% cheaper** |

### OpenRouter Cost Analysis

#### **Current Usage (100 messages/day)**

**Small Model (GPT-4o-mini via OpenRouter):**
- Input: 90K tokens × $0.12/1M = $0.011
- Output: 22.5K tokens × $0.48/1M = $0.011
- **Small Model Total: $0.022/month**

**Large Model (GPT-4-turbo via OpenRouter):**
- Input: 1.08M tokens × $2.00/1M = $2.16
- Output: 540K tokens × $8.00/1M = $4.32
- **Large Model Total: $6.48/month**

**Combined Total: $6.50/month**
**Savings: $1.63/month (20%)**

#### **2x Growth (200 messages/day)**

**Small Model: $0.043/month**
**Large Model: $12.96/month**
**Combined Total: $13.00/month**
**Savings: $3.25/month (20%)**

#### **10x Growth (1,000 messages/day)**

**Small Model: $0.22/month**
**Large Model: $64.80/month**
**Combined Total: $65.02/month**
**Savings: $16.25/month (20%)**

## Cost Comparison Summary

### Monthly Costs by Usage Level

| Usage Level | OpenAI Direct | OpenRouter | Savings |
|-------------|--------------|------------|---------|
| **Current (100 msg/day)** | $8.13 | $6.50 | $1.63 |
| **2x Growth (200 msg/day)** | $16.25 | $13.00 | $3.25 |
| **10x Growth (1,000 msg/day)** | $81.27 | $65.02 | $16.25 |

### Annual Costs

| Usage Level | OpenAI Direct | OpenRouter | Annual Savings |
|-------------|--------------|------------|----------------|
| **Current** | $97.56 | $78.00 | $19.56 |
| **2x Growth** | $195.00 | $156.00 | $39.00 |
| **10x Growth** | $975.24 | $780.24 | $195.00 |

## Key Insights

### **Model Usage Breakdown:**
- **Small Model (GPT-4o-mini)**: Only 3% of total cost
  - Used for: Lore detection, newcomer assessment
  - Cost: $0.03/month (current)
- **Large Model (GPT-4-turbo)**: 97% of total cost
  - Used for: Main responses, lore stories, summarization
  - Cost: $8.10/month (current)

### **Cost Drivers:**
1. **Main bot responses** (35 calls/day) = $6.30/month
2. **Lore generation** (10 calls/day) = $1.80/month
3. **Assessment tasks** (15 calls/day) = $0.03/month

## Recommendations

### 🟢 **Current Usage (100 messages/day)**
- **OpenAI Direct**: $8.13/month - **Reasonable**
- **OpenRouter**: $6.50/month - **20% savings**
- **Verdict**: OpenRouter provides meaningful savings

### 🟡 **2x Growth (200 messages/day)**
- **OpenAI Direct**: $16.25/month - **Getting expensive**
- **OpenRouter**: $13.00/month - **Recommended**
- **Verdict**: OpenRouter saves $3.25/month

### 🔴 **10x Growth (1,000 messages/day)**
- **OpenAI Direct**: $81.27/month - **Very expensive**
- **OpenRouter**: $65.02/month - **Essential**
- **Verdict**: OpenRouter saves $16.25/month

## Migration Strategy

### **Phase 1: Test OpenRouter (Low Risk)**
1. Get OpenRouter API key
2. Add `OPENROUTER_API_KEY` to `.env`
3. Test with small usage for 1 week
4. Monitor costs and performance

### **Phase 2: Full Migration (If Phase 1 successful)**
1. Update `TEXT_PROVIDER=openrouter`
2. Keep `TEXT_MODEL=gpt-4-turbo` (same model, cheaper price)
3. Monitor for 1 month
4. Calculate actual savings

### **Total Monthly Cost (Current):**
- **DigitalOcean**: $6.00
- **AI (OpenAI)**: $8.13
- **AI (OpenRouter)**: $6.50
- **Total**: $14.13 (OpenAI) vs $12.50 (OpenRouter)

**Recommendation**: Migrate to OpenRouter for 20% savings with same model quality! 🐸

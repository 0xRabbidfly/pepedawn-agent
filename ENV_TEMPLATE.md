# .env File Template

**Location:** `pepe-tg/.env` (you must create this file manually)

> The `.env` file is in `.gitignore` for security - you need to create it manually using this template.

---

## Quick Setup

```bash
cd pepe-tg
touch .env
nano .env  # Paste template below
```

---

## Template Content

```bash
# PEPEDAWN Bot - Environment Configuration
# Copy these lines to pepe-tg/.env and fill in your actual values
# See README.md for detailed explanations of each variable

# ========================================
# REQUIRED: AI Provider
# ========================================
# Get your key: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-key-here

# ========================================
# REQUIRED: Telegram Bot
# ========================================
# Get bot token: Message @BotFather in Telegram, use /newbot command
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here

# Get your user ID: Message @userinfobot in Telegram
# For multiple admins, separate with commas: 123456789,987654321
TELEGRAM_ADMIN_IDS=your-telegram-user-id

# ========================================
# OPTIONAL: Model Configuration
# ========================================
# Main conversation model (default: gpt-4-turbo)
# For cost savings, use: gpt-4o-mini (~$1-3/month vs ~$8/month)
# TEXT_MODEL=gpt-4o-mini

# Small tasks model (default: gpt-4o-mini)
# SMALL_OPENAI_MODEL=gpt-4o-mini

# ========================================
# OPTIONAL: Alternative AI Providers
# ========================================
# Anthropic (for Claude models)
# ANTHROPIC_API_KEY=your-anthropic-key

# OpenRouter (20% cost savings with same models)
# OPENROUTER_API_KEY=your-openrouter-key

# Google (for Gemini models)
# GOOGLE_GENERATIVE_AI_API_KEY=your-google-key

# Local Ollama (free, runs locally)
# OLLAMA_API_ENDPOINT=http://localhost:11434

# ========================================
# OPTIONAL: Knowledge Base (for /fl lore command)
# ========================================
# Path to knowledge base documents
# KNOWLEDGE_PATH=./docs/chunks

# Load knowledge base on startup (required for /fl command)
# LOAD_DOCS_ON_STARTUP=true

# ========================================
# OPTIONAL: Lottery Feature (Ethereum)
# ========================================
# Sepolia testnet RPC URL
# SEPOLIA_RPC_URL=https://sepolia.drpc.org

# Or mainnet
# ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
# ETHEREUM_NETWORK=mainnet

# Smart contract address
# CONTRACT_ADDRESS=0xfd4BE1898Ee3d529aE06741001D3211914C1B90A

# PEPEDAWN website URL (for lottery button)
# PEPEDAWN_SITE_URL=https://pepedawn.xyz

# ========================================
# OPTIONAL: Lore Generation Tuning
# ========================================
# Number of passages to retrieve from knowledge base
# RETRIEVAL_LIMIT=24

# Minimum passages needed for lore generation
# MIN_HITS=8

# Story length in words
# STORY_LENGTH_WORDS=120-180

# LLM temperature for story generation (0.0-1.0, higher = more creative)
# TEMPERATURE=0.7

# Top-p sampling (0.0-1.0)
# TOP_P=0.9

# ========================================
# OPTIONAL: Development & Debugging
# ========================================
# Logging level: debug | info | warn | error
# LOG_LEVEL=info

# Suppress ElizaOS bootstrap debug logs (cleaner console)
# SUPPRESS_BOOTSTRAP=true

# Hide source citations in /fl responses
# HIDE_LORE_SOURCES=false

# ========================================
# OPTIONAL: Advanced Configuration
# ========================================
# Database directory (default: .eliza/.elizadb)
# PGLITE_DATA_DIR=.eliza/.elizadb

# Server port (default: 3000)
# SERVER_PORT=3000

# Node environment
# NODE_ENV=production
```

---

## Variable Reference

See the [main README](README.md#-environment-configuration) for detailed explanations of each variable.

---

## Common Configurations

### Minimal (Cards Only - Lowest Cost)

```bash
OPENAI_API_KEY=sk-proj-xxx
TELEGRAM_BOT_TOKEN=123456:xxx
TELEGRAM_ADMIN_IDS=123456789
TEXT_MODEL=gpt-4o-mini
SUPPRESS_BOOTSTRAP=true
```
**Cost:** ~$1-3/month

### Recommended (Cards + Lore)

```bash
OPENAI_API_KEY=sk-proj-xxx
TELEGRAM_BOT_TOKEN=123456:xxx
TELEGRAM_ADMIN_IDS=123456789
TEXT_MODEL=gpt-4-turbo
SMALL_OPENAI_MODEL=gpt-4o-mini
KNOWLEDGE_PATH=./docs/chunks
LOAD_DOCS_ON_STARTUP=true
SUPPRESS_BOOTSTRAP=true
```
**Cost:** ~$8/month

---

## Verification

```bash
# Check file exists
ls -la pepe-tg/.env

# Test startup
cd pepe-tg && bun run dev
```

---

**For complete variable reference:** See [README.md](README.md#-environment-configuration)


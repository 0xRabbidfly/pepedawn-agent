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

# Replicate API (for /ft duplicate detection)
# Get your key: https://replicate.com/account/api-tokens
# Required for: Generating card embeddings + detecting duplicate images
# See: README.md "Embedding Setup" section for one-time embedding generation
REPLICATE_API_TOKEN=r8_your-replicate-token-here

# ========================================
# REQUIRED: Telegram Bot
# ========================================
# Get bot token: Message @BotFather in Telegram, use /newbot command
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_ADMIN_IDS=<ID1,ID2>

# Get your user ID: Message @userinfobot in Telegram
# For multiple admins, separate with commas: 123456789,987654321
TELEGRAM_ADMIN_IDS=your-telegram-user-id

# ========================================
# REQUIRED: Database location
# ========================================
# Database directory (default: .eliza/.elizadb)
PGLITE_DATA_DIR=<path_to_db>.eliza/.elizadb

# ========================================
# OPTIONAL: Model Configuration
# ========================================
# Main conversation model (default: gpt-4-turbo)
# For cost savings, use: gpt-4o-mini (~$1-3/month vs ~$8/month)
OPENAI_SMALL_MODEL=gpt-4o-mini
OPENAI_LARGE_MODEL=gpt-4o

# Vision analysis model for /fv command (default: gpt-4o)
# Can also use: gpt-5, o1, o3-mini for advanced vision capabilities
VISUAL_MODEL=gpt-4o

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

# Suppress ElizaOS bootstrap conversations
# SUPPRESS_BOOTSTRAP=false

# Hide source citations in /fl responses
# HIDE_LORE_SOURCES=true

# Include Artist linkable button in /f response
FAKE_RARES_ARTIST_BUTTONS=true

# Premium model for lore stories only
LORE_STORY_MODEL=gpt-5

# Vision analysis model for /fv command
# VISUAL_MODEL=gpt-4o

# ========================================
# OPTIONAL: Advanced Configuration
# ========================================

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


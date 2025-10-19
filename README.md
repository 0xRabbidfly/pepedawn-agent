# PEPEDAWN - Fake Rares Telegram Bot

> An AI-powered Telegram bot that serves as the keeper of Fake Rares lore, community history, and card knowledge.

**PEPEDAWN** is built on [ElizaOS](https://elizaos.ai) and embodies the spirit of the Fake Rares community - knowing every card, every artist, and every meme from the movement that started when Rare Scrilla got banned and created La Faka Nostra.

## 🌟 Features

- **🎴 Card Viewing**: Display any Fake Rares card with `/f CARDNAME` command
- **🧠 Lore Expert**: Deep knowledge of all Fake Rares cards, artists, and community history
- **💬 Context-Aware Chat**: Remembers conversations and recognizes returning community members
- **🎯 Smart Actions**: 
  - Automatic lore sharing when cards are mentioned
  - Newcomer education for people asking about Fake Rares
  - Community knowledge curation from chat history
- **🔍 Knowledge Base**: Searches Telegram history to provide accurate, contextual responses

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **[Bun](https://bun.sh)** (v1.0.0 or higher) - Required for ElizaOS
  ```bash
  # Install Bun
  curl -fsSL https://bun.sh/install | bash
  ```

- **Node.js** (v18 or higher) - For some dependencies
  ```bash
  # Check your Node version
  node --version
  ```

- **Git** - To clone the repository
  ```bash
  git --version
  ```

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/0xRabbidfly/pepedawn-agent.git
cd pepedawn-agent
```

### 2. Navigate to the Bot Directory

```bash
cd pepe-tg
```

### 3. Install Dependencies

```bash
bun install
```

### 4. Set Up Environment Variables

Create a `.env` file in the `pepe-tg` directory:

```bash
# Copy the example if it exists, or create a new file
touch .env
```

Add the following environment variables to your `.env` file:

```bash
# ================================
# REQUIRED: AI Model Provider
# ================================
# At least one AI provider is required

# OpenAI (Recommended)
OPENAI_API_KEY=sk-your-openai-api-key-here

# OR Anthropic (Claude)
# ANTHROPIC_API_KEY=your-anthropic-key-here

# OR OpenRouter (Alternative)
# OPENROUTER_API_KEY=your-openrouter-key-here

# OR Google Gemini
# GOOGLE_GENERATIVE_AI_API_KEY=your-google-key-here

# OR Ollama (Local - requires Ollama installed)
# OLLAMA_API_ENDPOINT=http://localhost:11434

# ================================
# REQUIRED: Telegram Bot
# ================================
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here

# ================================
# OPTIONAL: System Configuration
# ================================
LOG_LEVEL=info  # Options: debug, info, warn, error
```

### 5. Get Your API Keys

#### OpenAI API Key (Recommended)
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `.env` file

#### Telegram Bot Token (Required)
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the bot token provided
5. Add it to your `.env` file as `TELEGRAM_BOT_TOKEN`

### 6. Configure Telegram Bot Commands

After creating your bot with BotFather, set up the commands:

1. Message **@BotFather** in Telegram
2. Send `/setcommands`
3. Select your bot
4. Paste these commands:

```
f - View a Fake Rares card (usage: /f CARDNAME)
start - Start the bot and see welcome message
help - Show how to use PEPEDAWN
```

### 7. Build the Project

```bash
bun run build
```

### 8. Start the Bot

#### Development Mode (with hot-reload)
```bash
bun run dev
```

#### Production Mode
```bash
bun run start
```

#### Using ElizaOS CLI
```bash
# Install ElizaOS CLI globally if you haven't
bun add -g @elizaos/cli

# Start in development mode
elizaos dev

# Or start in production mode
elizaos start
```

## 🎯 Usage

### Telegram Commands

- **`/f CARDNAME`** - View any Fake Rares card with lore
  - Example: `/f FREEDOMKEK`
  - Example: `/f WAGMIWORLD`
  - Example: `/f PEPONACID`

- **`/start`** - Get welcome message and quick start guide

- **`/help`** - Show detailed usage instructions

### Natural Language Interaction

The bot doesn't require commands for everything! Just chat naturally:

- "What are Fake Rares?"
- "Tell me about FREEDOMKEK"
- "I'm new here, how does this work?"
- "What's La Faka Nostra?"

The bot will automatically:
- Share relevant lore when cards are mentioned
- Detect and educate newcomers
- Remember and reference past conversations
- Curate community knowledge

## 🗂️ Project Structure

```
pepe-tg/
├── src/
│   ├── actions/               # Bot actions (commands, lore sharing)
│   │   ├── basicCommands.ts  # /start, /help commands
│   │   ├── fakeRaresCard.ts  # /f command handler
│   │   ├── shareLore.ts      # Automatic lore sharing
│   │   └── educateNewcomer.ts # Newcomer onboarding
│   ├── evaluators/           # Context detection
│   │   └── loreDetector.ts   # Detects and saves lore
│   ├── providers/            # Data providers
│   │   └── fakeRaresContext.ts # Card data and context
│   ├── plugins/              # Custom plugins
│   │   └── fakeRaresPlugin.ts # Main plugin integration
│   ├── data/                 # Card data and mappings
│   │   ├── fake-rares-data.json
│   │   ├── cardSeriesMap.ts
│   │   └── fullCardIndex.ts
│   ├── frontend/             # Web interface (optional)
│   ├── character.ts          # Bot personality configuration
│   ├── pepedawn.ts           # PEPEDAWN character definition
│   ├── plugin.ts             # Custom plugin logic
│   └── index.ts              # Main entry point
├── telegram_docs/            # Documentation
│   ├── TELEGRAM_SETUP.md     # Telegram configuration guide
│   ├── PEPEDAWN_USER_GUIDE.md # User guide
│   └── TECHNICAL_HANDOVER.md # Technical details
├── scripts/                  # Utility scripts
│   ├── safe-restart.sh       # Safe bot restart
│   ├── backup-db.sh          # Database backup
│   └── add-new-cards.js      # Add new card data
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── .env                      # Environment variables (create this)
```

## 🔧 Configuration

### Character Customization

The bot's personality is defined in `src/pepedawn.ts`. You can customize:

- **System prompt**: How the bot behaves and responds
- **Bio**: Background and knowledge areas
- **Topics**: What the bot knows about
- **Style**: Communication patterns
- **Message examples**: Training data for responses

### Adding New Cards

1. Update `src/data/fake-rares-data.json` with new card information
2. Update `src/data/cardSeriesMap.ts` if adding a new series
3. Rebuild the project: `bun run build`
4. Restart the bot

## 📊 Scripts

```bash
# Development
bun run dev              # Start with hot-reload
bun run start            # Start in production mode
bun run build            # Build the project
bun run build:watch      # Build with watch mode

# Testing
bun run test             # Run all tests
bun run test:component   # Run component tests
bun run test:e2e         # Run end-to-end tests
bun run test:coverage    # Run tests with coverage

# Code Quality
bun run lint             # Format code
bun run type-check       # Check TypeScript types
bun run check-all        # Run type-check, format-check, and tests

# Utilities
bun run restart          # Safe restart with database backup
./scripts/backup-db.sh   # Backup database manually
./scripts/kill-bot.sh    # Stop the bot
```

## 🐳 Docker Deployment (Optional)

Build and run using Docker:

```bash
# Build the image
docker build -t pepedawn-bot .

# Run the container
docker run -d --name pepedawn \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  pepedawn-bot

# Or use docker-compose
docker-compose up -d
```

## 🔍 Troubleshooting

### Bot Won't Start

**Problem**: "Plugin not found" errors
```bash
# Solution: Reinstall dependencies
rm -rf node_modules
bun install
```

**Problem**: "API key not found"
```bash
# Solution: Check your .env file
cat .env | grep API_KEY
# Ensure keys are properly set without quotes
```

### Bot Not Responding

**Problem**: Bot loads but doesn't respond in Telegram

1. Verify your `TELEGRAM_BOT_TOKEN` is correct
2. Check that the bot is running: `ps aux | grep elizaos`
3. Check logs for errors: `tail -f logs/bot.log`
4. Ensure at least one AI provider API key is set

### Database Issues

**Problem**: Database connection errors

```bash
# Check if database file exists
ls -la data/

# Reset database (WARNING: loses data)
rm -rf data/*.db
bun run build
bun run start
```

### Rate Limiting

**Problem**: API quota exceeded

- Switch to a faster/cheaper model in `src/pepedawn.ts`
- Reduce conversation history in memory settings
- Implement rate limiting in your Telegram group

## 📚 Additional Resources

- [ElizaOS Documentation](https://elizaos.github.io/eliza/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Fake Rares Official](https://fakerares.com)
- [La Faka Nostra Directory](https://lafakanostra.art)

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 💬 Support

For questions or issues:
- Check the `telegram_docs/` folder for detailed guides
- Review the troubleshooting section above
- Open an issue on GitHub

## 🐸 WAGMI

Built with ❤️ for the Fake Rares community.

*gm anon! ☀️ WAGMI 🐸✨*


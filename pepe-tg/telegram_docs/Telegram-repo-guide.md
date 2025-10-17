# ElizaOS Telegram Agent Setup Guide

## Overview

This guide will help you integrate ElizaOS into your project to build a Telegram agent without cloning the entire ElizaOS core repository. Instead, we'll use the ElizaOS CLI and npm packages approach.

## Architecture Options

### Option 1: CLI/Package Approach (Recommended for Your Use Case)
- ✅ **Lightweight**: Only install what you need
- ✅ **Easy updates**: Use npm/bun to update packages
- ✅ **Clean separation**: Your project stays independent
- ✅ **Production ready**: Best for deployment

### Option 2: Monorepo Clone (Not Recommended Unless Contributing)
- ❌ **Heavy**: ~500MB+ of code
- ❌ **Complex**: Requires understanding entire codebase
- ✅ **Full control**: Can modify core functionality
- ✅ **Contributing**: Required if you want to contribute to ElizaOS

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v23+) - [Download](https://nodejs.org/)
- **Bun** - Install with: `curl -fsSL https://bun.sh/install | bash`
- **WSL 2** (Windows users only)
- **Telegram Bot Token** from [BotFather](https://t.me/botfather)
- **OpenAI API Key** (or other LLM provider)

## Step-by-Step Setup

### 1. Install ElizaOS CLI

```bash
# Install globally using bun
bun install -g @elizaos/cli

# Verify installation
elizaos --version
```

### 2. Create Your ElizaOS Project

```bash
# Navigate to your project directory
cd z:\Projects\Fake-Rare-TG-Agent

# Create a new ElizaOS project (in a subdirectory)
elizaos create telegram-agent

# During interactive setup, choose:
# - Database: pglite (no setup required)
# - Model Provider: openai (or your preferred provider)
# - Project Type: project
```

### 3. Configure Environment Variables

```bash
cd telegram-agent

# Open local environment file for editing
elizaos env edit-local
```

Add the following environment variables:

```env
# Model Provider (OpenAI example)
OPENAI_API_KEY=your_openai_api_key_here

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Optional: For advanced features
# TELEGRAM_ADMIN_IDS=123456789,987654321
```

### 4. Install Telegram Plugin

```bash
# Install the Telegram plugin package
bun install @elizaos/plugin-telegram

# Install core dependencies if not already present
bun install @elizaos/core @elizaos/plugin-bootstrap
```

### 5. Configure Your Agent Character

Create or edit `src/character.ts` (or `character.json`):

```typescript
import { Character, Clients, ModelProviderName } from '@elizaos/core';

export const character: Character = {
    name: "FakeRareAgent",
    username: "fakerare",
    
    // Personality and behavior
    bio: [
        "An AI agent specialized in [your domain]",
        "Helpful, knowledgeable, and friendly",
        "Responds to queries about [your specialty]"
    ],
    
    lore: [
        "Created to assist with [your purpose]",
        "Powered by ElizaOS framework"
    ],
    
    messageExamples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Hello!" }
            },
            {
                user: "FakeRareAgent",
                content: { text: "Hello! How can I help you today?" }
            }
        ]
    ],
    
    postExamples: [],
    
    topics: [
        "general conversation",
        "helpful assistance",
        // Add your specific topics
    ],
    
    style: {
        all: [
            "be helpful and friendly",
            "provide clear and concise answers",
            "stay on topic"
        ],
        chat: [
            "be conversational",
            "use natural language"
        ],
        post: []
    },
    
    adjectives: [
        "helpful",
        "knowledgeable",
        "friendly",
        "professional"
    ],
    
    // Enable Telegram client
    clients: [Clients.TELEGRAM],
    
    modelProvider: ModelProviderName.OPENAI,
    
    settings: {
        secrets: {},
        voice: {
            model: "en_US-hfc_female-medium"
        }
    },
    
    // Add plugins
    plugins: []
};

export default character;
```

### 6. Project Structure

After setup, your project structure should look like:

```
Fake-Rare-TG-Agent/
├── telegram-agent/              # ElizaOS project
│   ├── src/
│   │   ├── character.ts        # Agent configuration
│   │   └── index.ts            # Entry point
│   ├── .env.local              # Local environment variables
│   ├── package.json
│   ├── tsconfig.json
│   └── elizaconfig.yaml        # ElizaOS configuration
├── TG-Logs/                    # Your existing logs
└── Telegram-repo-guide.md      # This guide
```

### 7. Start Your Agent

```bash
# Development mode (with auto-reload)
elizaos dev

# OR

# Production mode
elizaos start
```

Your agent will be available at:
- **Web Interface**: http://localhost:3000
- **API Endpoint**: http://localhost:3000/api
- **Telegram**: Via your bot username

## Creating a Telegram Bot

If you haven't created a Telegram bot yet:

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow the prompts:
   - Choose a name for your bot (e.g., "Fake Rare Agent")
   - Choose a username (must end in 'bot', e.g., "fakerare_bot")
4. Save the **bot token** provided by BotFather
5. Add the token to your `.env.local` file

### Optional Bot Settings

Configure additional bot settings via BotFather:

```
/setdescription - Set bot description
/setabouttext - Set about text
/setuserpic - Set bot profile picture
/setcommands - Set bot commands
```

Example commands to set:

```
start - Start conversation with the bot
help - Get help information
status - Check bot status
```

## Advanced Configuration

### Custom Plugins

To add custom functionality:

```bash
# Create a custom plugin
mkdir -p src/plugins
touch src/plugins/myPlugin.ts
```

Example plugin structure:

```typescript
import { Plugin } from '@elizaos/core';

export const myPlugin: Plugin = {
    name: "my-custom-plugin",
    description: "Custom functionality",
    actions: [],
    evaluators: [],
    providers: []
};
```

Then add to your character:

```typescript
import { myPlugin } from './plugins/myPlugin';

export const character: Character = {
    // ... other config
    plugins: [myPlugin]
};
```

### Multiple Agents

To run multiple agents:

```bash
# Create additional character files
touch src/character2.ts

# List available agents
elizaos agent list

# Start specific agent
elizaos agent start --name "agent-name"
```

### Database Options

If you need persistent storage beyond pglite:

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/elizaos

# SQLite (file-based)
DATABASE_URL=sqlite://./data/agents.db
```

## Testing Your Agent

### 1. Test via Telegram

1. Find your bot on Telegram using the username
2. Send `/start` to begin conversation
3. Send messages and verify responses

### 2. Test via Web Interface

1. Open http://localhost:3000
2. Navigate to your agent
3. Use the chat interface to test

### 3. Test via API

```bash
curl -X POST http://localhost:3000/api/agents/your-agent-id/message \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, agent!"}'
```

## Debugging

### Enable Debug Logs

```bash
# Set log level in .env.local
LOG_LEVEL=debug

# Or start with debug flag
LOG_LEVEL=debug elizaos start
```

### Common Issues

**Issue**: Bot not responding on Telegram
- ✅ Check `TELEGRAM_BOT_TOKEN` is correct
- ✅ Verify bot is not blocked by Telegram
- ✅ Check logs for connection errors

**Issue**: "Module not found" errors
- ✅ Run `bun install` to ensure all dependencies are installed
- ✅ Check `package.json` includes required plugins

**Issue**: Agent gives poor responses
- ✅ Verify API key is valid and has credits
- ✅ Improve character description and examples
- ✅ Check model provider is properly configured

## Deployment

### Docker (Recommended)

Create `Dockerfile`:

```dockerfile
FROM oven/bun:1 as builder

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "start"]
```

Build and run:

```bash
docker build -t telegram-agent .
docker run -p 3000:3000 --env-file .env.local telegram-agent
```

### PM2 (Process Manager)

```bash
# Install PM2
bun install -g pm2

# Start with PM2
pm2 start "elizaos start" --name telegram-agent

# Save configuration
pm2 save
pm2 startup
```

## Resources

- **ElizaOS Documentation**: https://docs.elizaos.ai/
- **Telegram Plugin Guide**: https://docs.elizaos.ai/plugin-registry/platform/telegram/developer-guide
- **ElizaOS GitHub**: https://github.com/elizaOS/eliza
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Discord Community**: https://discord.gg/elizaos (check their docs for actual link)

## Next Steps

1. ✅ Complete the setup steps above
2. ✅ Test your agent locally
3. ✅ Customize the character personality
4. ✅ Add custom plugins if needed
5. ✅ Deploy to production
6. ✅ Monitor and iterate based on user feedback

## Keeping Up to Date

```bash
# Update ElizaOS CLI
bun install -g @elizaos/cli@latest

# Update project dependencies
cd telegram-agent
bun update

# Check for breaking changes
elizaos doctor
```

---

## Quick Reference Commands

```bash
# Start agent
elizaos start

# Development mode
elizaos dev

# List agents
elizaos agent list

# Edit environment
elizaos env edit-local

# Run tests
elizaos test

# Check health
elizaos doctor

# Show help
elizaos --help
```

---

**Note**: You do NOT need to clone the entire ElizaOS repository. The CLI and npm packages approach gives you everything you need while keeping your project lightweight and maintainable.


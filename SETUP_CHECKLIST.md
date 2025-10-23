# PEPEDAWN Setup Checklist

> Step-by-step guide for collaborators forking this project

Complete this checklist to get PEPEDAWN running on your own server.

---

## ✅ Phase 1: Local Development Setup (30 minutes)

### 1. Prerequisites Installation

- [ ] Install **Bun** v1.0+
  ```bash
  curl -fsSL https://bun.sh/install | bash
  source ~/.bashrc
  bun --version  # Verify installation
  ```

- [ ] Install **Node.js** v18+
  ```bash
  # On Ubuntu/Debian:
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  node --version  # Verify installation
  ```

- [ ] Install **Git**
  ```bash
  git --version  # Check if already installed
  # If not: apt-get install -y git
  ```

### 2. Project Clone & Install

- [ ] Fork repository on GitHub (click "Fork" button)

- [ ] Clone YOUR fork
  ```bash
  git clone https://github.com/YOUR_USERNAME/pepedawn-agent.git
  cd pepedawn-agent/pepe-tg
  ```

- [ ] Install dependencies
  ```bash
  bun install
  # Wait for completion (~1-2 minutes)
  ```

### 3. API Keys Setup

- [ ] Get **OpenAI API key**
  - Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - Create new secret key
  - Copy key (starts with `sk-proj-...`)
  - **Save securely** - you can't view it again!

- [ ] Create **Telegram bot**
  - Message [@BotFather](https://t.me/BotFather) in Telegram
  - Send `/newbot`
  - Choose bot name (e.g., "My Fake Rares Bot")
  - Choose username (e.g., "my_fakerares_bot")
  - **Save the bot token** (format: `123456:ABCdefGHI...`)

- [ ] Get your **Telegram User ID**
  - Message [@userinfobot](https://t.me/userinfobot)
  - Copy the number it sends you

### 4. Environment Configuration

- [ ] Create `.env` file:
  ```bash
  touch .env
  nano .env
  ```

- [ ] Add required variables:
  ```bash
  # Paste your keys:
  OPENAI_API_KEY=sk-proj-YOUR-KEY-HERE
  TELEGRAM_BOT_TOKEN=123456:YOUR-BOT-TOKEN-HERE
  TELEGRAM_ADMIN_IDS=YOUR-USER-ID
  ```

- [ ] Save and exit (Ctrl+X, Y, Enter)

- [ ] **Optional:** Add cost optimization:
  ```bash
  # Append to .env:
  TEXT_MODEL=gpt-4o-mini
  SMALL_OPENAI_MODEL=gpt-4o-mini
  SUPPRESS_BOOTSTRAP=true
  ```

### 5. Configure Bot Commands (BotFather)

- [ ] Message [@BotFather](https://t.me/BotFather)

- [ ] Send `/setcommands`

- [ ] Select your bot

- [ ] Paste this list:
  ```
  f - View a Fake Rares card or random card by artist
  fl - Get AI-powered lore stories from community history
  fc - View token costs (admin-only)
  start - Welcome message and quick guide
  help - Show detailed instructions
  ```

### 6. First Run

- [ ] Start in development mode:
  ```bash
  bun run dev
  ```

- [ ] Wait for startup messages:
  ```
  ✅ Fake Rares Plugin initialized
  📦 Loaded 890 cards from disk
  🤖 Bot started successfully
  ```

- [ ] Test in Telegram:
  ```
  /start
  /f FREEDOMKEK
  /help
  ```

- [ ] Verify card displays correctly

**✅ If you see the FREEDOMKEK card, you're ready to go!**

---

## ✅ Phase 2: Knowledge Base Setup (Optional, 1-2 hours)

**Skip this if you only want card display (`/f` command).**

This enables the `/fl` (lore) command with AI-powered stories from community history.

### 1. Prepare Knowledge Documents

- [ ] Create docs directory:
  ```bash
  mkdir -p docs/chunks
  ```

- [ ] Add your documents (choose one):
  
  **Option A: Telegram chat export**
  - Export chat from Telegram (Settings → Advanced → Export Chat Data)
  - Convert to text files
  - Place in `docs/chunks/`
  
  **Option B: Wiki/markdown files**
  - Create `.md` or `.txt` files with community knowledge
  - Place in `docs/chunks/`
  
  **Option C: Skip for now**
  - `/fl` command won't work, but `/f` will

### 2. Configure Knowledge Base

- [ ] Add to `.env`:
  ```bash
  KNOWLEDGE_PATH=./docs/chunks
  LOAD_DOCS_ON_STARTUP=true
  ```

### 3. Generate Embeddings (First Run)

- [ ] Start bot:
  ```bash
  bun run dev
  ```

- [ ] **Wait patiently** - Embedding generation takes time:
  - Small dataset (1k messages): ~2-5 minutes
  - Medium dataset (50k messages): ~10-20 minutes
  - Large dataset (260k messages): ~30-60 minutes

- [ ] Watch for completion message:
  ```
  ✅ Knowledge indexed: X documents embedded
  ```

### 4. Backup Database

- [ ] **IMPORTANT:** Backup embeddings (can't regenerate without re-running):
  ```bash
  ./scripts/backup-db.sh after-embeddings
  ```

- [ ] Verify backup created:
  ```bash
  ls -lh ../backups/elizadb-backup-*.tar.gz
  ```

### 5. Test Lore Command

- [ ] In Telegram:
  ```
  /fl Rare Scrilla
  /fl FREEDOMKEK
  /fl
  ```

- [ ] Verify you get AI-generated stories (not errors)

**✅ If `/fl` works, knowledge base is configured!**

---

## ✅ Phase 3: Production Deployment (2-3 hours)

### 1. Provision Server

- [ ] Create **DigitalOcean Droplet** (or similar VPS):
  - OS: Ubuntu 22.04 LTS
  - Plan: Basic $12/month (2GB RAM, 1 vCPU)
  - Region: Choose closest to users
  - SSH key: Add your public key

- [ ] Note your server IP address: `___.___.___. ___`

### 2. Initial Server Setup

- [ ] SSH into server:
  ```bash
  ssh root@YOUR_SERVER_IP
  ```

- [ ] Update system:
  ```bash
  apt-get update && apt-get upgrade -y
  apt-get install -y curl git build-essential
  ```

- [ ] Install Node.js 20:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  node --version  # Should show v20.x
  ```

- [ ] Install Bun:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
  bun --version  # Should show v1.x
  ```

- [ ] Install PM2:
  ```bash
  npm install -g pm2
  pm2 --version
  ```

### 3. Deploy Application

- [ ] Clone repository:
  ```bash
  cd ~
  git clone https://github.com/YOUR_USERNAME/pepedawn-agent.git
  cd pepedawn-agent/pepe-tg
  ```

- [ ] Install dependencies:
  ```bash
  bun install
  ```

- [ ] Create `.env` file:
  ```bash
  nano .env
  ```

- [ ] Paste your production configuration:
  ```bash
  OPENAI_API_KEY=sk-proj-YOUR-KEY
  TELEGRAM_BOT_TOKEN=YOUR-TOKEN
  TELEGRAM_ADMIN_IDS=YOUR-USER-ID
  TEXT_MODEL=gpt-4o-mini
  SMALL_OPENAI_MODEL=gpt-4o-mini
  SUPPRESS_BOOTSTRAP=true
  LOG_LEVEL=info
  NODE_ENV=production
  ```

- [ ] Save and exit (Ctrl+X, Y, Enter)

- [ ] Build application:
  ```bash
  bun run build
  ```

### 4. Optional: Transfer Knowledge Base

**If you configured knowledge base locally:**

- [ ] Backup database on local machine:
  ```bash
  cd ~/path/to/pepedawn-agent/pepe-tg
  ./scripts/backup-db.sh production
  ```

- [ ] Copy to server:
  ```bash
  scp ../backups/elizadb-backup-*.tar.gz root@YOUR_SERVER_IP:~/pepedawn-agent/
  ```

- [ ] Extract on server:
  ```bash
  # On server:
  cd ~/pepedawn-agent/pepe-tg
  mkdir -p .eliza
  tar -xzf ../elizadb-backup-*.tar.gz -C .eliza/
  ```

**If starting fresh (no knowledge base):**
- [ ] Skip this section - `/f` command will work fine
- [ ] `/fl` command won't work (that's okay!)

### 5. Configure PM2

- [ ] Update `ecosystem.config.cjs`:
  ```bash
  nano ecosystem.config.cjs
  ```

- [ ] Update `cwd` path (line 6):
  ```javascript
  cwd: '/root/pepedawn-agent/pepe-tg',  // Your actual path
  ```

- [ ] Save and exit

### 6. Start with PM2

- [ ] Start bot:
  ```bash
  pm2 start ecosystem.config.cjs
  ```

- [ ] Save PM2 configuration:
  ```bash
  pm2 save
  ```

- [ ] Setup auto-start on reboot:
  ```bash
  pm2 startup
  # ⚠️ Copy and run the command it shows!
  ```

### 7. Verify Production Deployment

- [ ] Check PM2 status:
  ```bash
  pm2 status
  # Should show "pepe-tg" online
  ```

- [ ] Watch logs for errors:
  ```bash
  pm2 logs pepe-tg --lines 50
  ```

- [ ] Look for success indicators:
  ```
  ✅ Fake Rares Plugin initialized
  📦 Loaded 890 cards from disk
  💓 [HEARTBEAT] Bot is alive
  ```

- [ ] **Test in Telegram:**
  ```
  /start      → Should show welcome
  /f FREEDOMKEK → Should show card
  /fc d       → Should show today's costs
  ```

**✅ If all commands work, deployment successful!**

---

## ✅ Phase 4: Post-Deployment (15 minutes)

### 1. Configure Monitoring

- [ ] Set up OpenAI spending alerts:
  - Go to [platform.openai.com/account/limits](https://platform.openai.com/account/limits)
  - Set hard limit: $10/month
  - Set soft limit: $5/month

- [ ] Add PM2 monitoring email (optional):
  ```bash
  pm2 install pm2-server-monit
  ```

### 2. Test All Features

- [ ] **Card display:**
  ```
  /f FREEDOMKEK
  /f Rare Scrilla
  /f
  ```

- [ ] **Lore** (if knowledge base configured):
  ```
  /fl Rare Scrilla
  /fl FREEDOMKEK
  /fl
  ```

- [ ] **Admin commands:**
  ```
  /fc d
  /fc m
  ```

- [ ] **Natural conversation:**
  ```
  What are Fake Rares?
  Tell me about WAGMIWORLD
  ```

### 3. Create First Backup

- [ ] Backup production database:
  ```bash
  cd ~/pepedawn-agent/pepe-tg
  ./scripts/backup-db.sh production-initial
  ```

- [ ] **Download backup to local machine:**
  ```bash
  # On local machine:
  scp root@YOUR_SERVER_IP:~/pepedawn-agent/backups/elizadb-backup-*.tar.gz ~/backups/
  ```

### 4. Document Your Setup

- [ ] Create personal notes:
  ```
  Server IP: ___.___.___. ___
  SSH Key: ~/.ssh/your-key
  Bot Username: @your_bot_username
  Admin User ID: ___________
  Deployed: [DATE]
  Backup Location: ~/backups/
  ```

### 5. Set Reminders

- [ ] **Weekly:** Check PM2 status and logs
- [ ] **Monthly:** Review costs (`/fc m`)
- [ ] **Monthly:** Create database backup
- [ ] **Quarterly:** Update dependencies

---

## 🎉 You're Done!

Your PEPEDAWN bot is now:
- ✅ Running on production server
- ✅ Auto-restarting on crashes
- ✅ Cost-monitored
- ✅ Backed up
- ✅ Ready for your community

---

## 📋 Quick Reference

### Essential Commands

| Task | Command |
|------|---------|
| Check status | `pm2 status` |
| View logs | `pm2 logs pepe-tg` |
| Restart bot | `pm2 restart pepe-tg` |
| Stop bot | `pm2 stop pepe-tg` |
| Check costs | `/fc m` (in Telegram) |
| Add new cards | `node scripts/add-new-cards.js [series]` |
| Backup DB | `./scripts/backup-db.sh [label]` |
| Update code | `git pull && bun install && bun run build && pm2 restart pepe-tg` |

### Emergency Procedures

**Bot not responding:**
```bash
pm2 restart pepe-tg
```

**High memory usage:**
```bash
pm2 monit  # Check memory
pm2 restart pepe-tg  # If >1.5GB
```

**Complete reset:**
```bash
pm2 delete pepe-tg
pm2 start ecosystem.config.cjs
```

**Restore from backup:**
```bash
pm2 stop pepe-tg
tar -xzf ../backups/elizadb-backup-[timestamp].tar.gz -C .eliza/
pm2 start pepe-tg
```

---

## 🆘 Getting Help

1. Check [README.md](README.md) troubleshooting section
2. Review logs: `pm2 logs pepe-tg`
3. Search [GitHub Issues](https://github.com/0xrabbidfly/pepedawn-agent/issues)
4. Ask in [GitHub Discussions](https://github.com/0xrabbidfly/pepedawn-agent/discussions)

---

**Good luck! 🐸 WAGMI ✨**


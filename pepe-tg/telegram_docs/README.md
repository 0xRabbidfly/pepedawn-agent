# PEPEDAWN Documentation

Technical documentation for the PEPEDAWN Telegram bot.

---

## 📚 Documentation Files

### Core Documentation

| File | Purpose | Audience |
|------|---------|----------|
| **[PEPEDAWN_cost_analysis.md](PEPEDAWN_cost_analysis.md)** | Detailed cost breakdown by model and feature | Admins, DevOps |

### Feature-Specific Documentation

| File | Purpose |
|------|---------|
| **[PEPEDAWN_ODDS_SUMMARY.md](PEPEDAWN_ODDS_SUMMARY.md)** | `/odds` lottery command - features, setup, usage |
| **[ODDS_ARCHITECTURE.md](ODDS_ARCHITECTURE.md)** | `/odds` command - technical architecture, flow diagrams |

### Design Documents (Future Features)

| File | Purpose |
|------|---------|
| **[CACHE_ARCHITECTURE_DIAGRAM.md](CACHE_ARCHITECTURE_DIAGRAM.md)** | File ID cache architecture design |
| **[CACHE_FILE_ID_DESIGN.md](CACHE_FILE_ID_DESIGN.md)** | Cache implementation specifications |

### Utility Scripts

| File | Purpose |
|------|---------|
| **[split_telegram_history.py](split_telegram_history.py)** | Python script to split Telegram exports into chunks for embedding |
| **[backup_embeddings.sh](backup_embeddings.sh)** | Backup knowledge base embeddings |

---

## 📖 Quick Reference

**Just getting started?**
→ Read the [main README](../../README.md)

**Want to understand the code?**
→ Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for architecture patterns

**Setting up lottery feature?**
→ Read [PEPEDAWN_ODDS_SUMMARY.md](PEPEDAWN_ODDS_SUMMARY.md)

**Concerned about costs?**
→ Read [PEPEDAWN_cost_analysis.md](PEPEDAWN_cost_analysis.md)

**Technical deep-dive on lottery?**
→ Read [ODDS_ARCHITECTURE.md](ODDS_ARCHITECTURE.md)

**Planning cache optimization?**
→ Read [CACHE_ARCHITECTURE_DIAGRAM.md](CACHE_ARCHITECTURE_DIAGRAM.md)

---

## 🔄 Document Maintenance

**When updating docs:**
1. Keep main README as single source of truth for setup
2. Technical docs here focus on architecture/implementation details
3. Remove duplicate information - link to main README instead
4. Update version numbers when ElizaOS updates

---

**Last Updated:** October 23, 2025


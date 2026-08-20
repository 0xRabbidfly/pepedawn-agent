# Market Transaction Reporter - Operational Runbook

**Feature**: Market Transaction Reporter  
**Version**: 1.0.0  
**Date**: October 30, 2025

## Overview

This document provides operational procedures for running, monitoring, and troubleshooting the Market Transaction Reporter feature.

---

## Startup Procedure

### Prerequisites

1. **Environment Variables** - Ensure `.env` is configured with:
   ```bash
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_CHANNEL_ID=your-channel-id
   TOKENSCAN_API_URL=https://api.tokenscan.io
   FAKE_RARE_CONFIG_PATH=src/config/fake-rare-assets.json
   POLL_INTERVAL_SECONDS=30
   DATABASE_PATH=data/transactions.db
   ```

2. **Asset Configuration** - Verify `src/config/fake-rare-assets.json` exists and contains Fake Rare assets

3. **Database Directory** - Ensure `data/` directory exists (will be created automatically)

### Startup Steps

1. **Start the bot**:
   ```bash
   cd pepe-tg
   bun run start
   ```

2. **Verify startup logs**:
   - Look for: `TransactionHistory database initialized`
   - Look for: `TokenScanClient stopped` (service started)
   - Look for: `TransactionMonitor polling started`
   - Look for: `TelegramNotificationService initialized`

3. **Verify polling is active**:
   - Check logs every 30 seconds for: `Polling TokenScan API`
   - Block cursor should be set to current Counterparty block height

---

## Monitoring Checks

### Health Checks

The services expose health status methods:

**TransactionMonitor health**:
- `isRunning`: Should be `true`
- `lastPollTime`: Should update every 30 seconds
- `lastTransactionTime`: Updates when transactions are detected
- `currentBlockCursor`: Should increment as blocks are processed

**TransactionHistory stats**:
- `totalTransactions`: Total stored transactions
- `sales`: Count of sale transactions
- `listings`: Count of listing transactions
- `oldestTransaction`: Timestamp of oldest transaction (should be < 30 days)

### Expected Log Patterns

**Normal operation**:
```
[INFO] TransactionHistory database initialized
[INFO] TransactionMonitor polling started
[INFO] Polling TokenScan API
[DEBUG] Transactions processed in polling cycle (if transactions found)
```

**Transaction detected**:
```
[INFO] Transaction stored
[INFO] Transaction notification sent successfully
```

**Auto-purge**:
```
[INFO] Scheduled auto-purge completed (runs every 24 hours)
```

---

## Troubleshooting

### Issue: No transactions detected

**Symptoms**:
- Polling is active but no transactions appear
- No notifications in Telegram channel

**Checks**:
1. Verify `fake-rare-assets.json` contains actual Fake Rare assets
2. Check TokenScan API is accessible: `curl https://api.tokenscan.io/api/dispenses?block=850000`
3. Verify block cursor is current (not too old)
4. Check logs for filtering messages

**Resolution**:
- Ensure asset list matches Counterparty asset names
- Verify TokenScan API response includes Fake Rare assets
- Check if transactions exist in Counterparty for monitored assets

### Issue: Duplicate notifications

**Symptoms**:
- Same transaction appears multiple times in Telegram

**Checks**:
1. Verify database deduplication: `txHash` should be unique
2. Check if `INSERT OR IGNORE` is working
3. Review logs for duplicate detection

**Resolution**:
- Database should prevent duplicates automatically
- If issue persists, check `TransactionHistory.exists()` logic

### Issue: Telegram notifications not sending

**Symptoms**:
- Transactions detected but no notifications appear

**Checks**:
1. Verify `TELEGRAM_CHANNEL_ID` is set correctly
2. Check bot has permission to post in channel
3. Review logs for Telegram API errors

**Resolution**:
- Ensure bot is added to channel as admin
- Verify channel ID format (should be numeric string)
- Check Telegram API rate limits

### Issue: Database errors

**Symptoms**:
- Errors logging to database
- Query failures

**Checks**:
1. Verify `DATABASE_PATH` is writable
2. Check disk space
3. Review database file permissions

**Resolution**:
- Ensure `data/` directory exists and is writable
- Check disk space availability
- Verify SQLite file permissions

### Issue: TokenScan API rate limiting

**Symptoms**:
- Frequent 429 errors in logs
- Polling stops

**Checks**:
1. Review `POLL_INTERVAL_SECONDS` (should be ≥ 30)
2. Check TokenScan API rate limits
3. Monitor API call frequency

**Resolution**:
- Increase `POLL_INTERVAL_SECONDS` if needed
- Implement exponential backoff (already in code)
- Contact TokenScan if limits are too restrictive

---

## Common Operations

### Manual Database Purge

If you need to manually purge old transactions:

```bash
# Connect to SQLite database
sqlite3 data/transactions.db

# Delete transactions older than 30 days
DELETE FROM transactions WHERE timestamp < (strftime('%s', 'now') - 2592000);
```

### View Database Statistics

```bash
sqlite3 data/transactions.db "SELECT COUNT(*) as total FROM transactions;"
sqlite3 data/transactions.db "SELECT COUNT(*) as sales FROM transactions WHERE type='SALE';"
sqlite3 data/transactions.db "SELECT COUNT(*) as listings FROM transactions WHERE type='LISTING';"
```

### Check Recent Transactions

```bash
sqlite3 data/transactions.db "SELECT tx_hash, type, asset, timestamp FROM transactions ORDER BY timestamp DESC LIMIT 10;"
```

### Reset Monitoring (Clear Cursor)

If you need to reset the block cursor (e.g., after testing):

```bash
# The cursor is stored in memory, restarting the bot will reset it
# Service will query current block height on startup
```

---

## Performance Monitoring

### Expected Metrics

- **Notification latency**: < 5 minutes from block confirmation (SC-001)
- **Query response time**: < 3 seconds for `/fm` command (SC-002)
- **Polling interval**: 30 seconds (configurable)
- **Database size**: ~300 transactions maximum (30-day retention)

### Monitoring Points

1. **Polling frequency**: Should poll every 30 seconds
2. **Transaction processing**: Should process within same polling cycle
3. **Notification delivery**: Should send within seconds of detection
4. **Database growth**: Should auto-purge daily

---

## Shutdown Procedure

1. **Stop the bot** gracefully (Ctrl+C or SIGTERM)
2. **Services will cleanup**:
   - TransactionMonitor stops polling
   - TransactionHistory closes database connection
   - Auto-purge interval cleared

3. **Verify cleanup**:
   - Check logs for: `TransactionMonitor stopped`
   - Check logs for: `TransactionHistory database closed`

---

## Support

For issues or questions:
- Check logs in console output
- Review error messages for specific guidance
- Verify configuration matches examples in `.env.example`


#!/usr/bin/env node
/**
 * Prune OLD Telegram-derived knowledge fragments from the ElizaOS database.
 *
 * Strategy:
 *   - Reads the Telegram sessions JSONL file (same one used for import).
 *   - Computes the maximum session end timestamp (historyMaxTs).
 *   - Connects directly to the PGlite database (.eliza/.elizadb).
 *   - Finds knowledge memories that look like Telegram-derived content
 *     (heuristic: content->>'text' contains both '"from"' and '"date"').
 *   - Extracts the embedded `"date": "..."` from the stored text and compares
 *     it to historyMaxTs.
 *   - Deletes ONLY those Telegram knowledge rows whose embedded date is
 *     <= historyMaxTs.
 *
 * This is designed to support:
 *   "For TG entries more current than the last date in TG-chat-history-cleaned.json - leave them alone.
 *    For everything older - delete and reimport our newly formatted TG history."
 *
 * IMPORTANT:
 *   - Stop the bot before running this script (PGlite does not support concurrent access).
 *   - This script only deletes from the "memories" table (type='knowledge').
 *     It does NOT touch embeddings; those stale rows are harmless but can be
 *     cleaned up separately if desired.
 *
 * Usage:
 *   node scripts/tg-prune-old-telegram.js
 *   node scripts/tg-prune-old-telegram.js --sessions ../tmp/telegram-sessions.jsonl
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SESSIONS = resolve(__dirname, '../tmp/telegram-sessions.jsonl');
const DB_PATH = join(__dirname, '..', '.eliza', '.elizadb');

function parseArgs() {
  const args = process.argv.slice(2);
  let sessionsPath = DEFAULT_SESSIONS;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--sessions' || arg === '--source') && args[i + 1]) {
      sessionsPath = resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--sessions=')) {
      sessionsPath = resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else {
      console.warn(`⚠️  Unrecognized argument: ${arg}`);
    }
  }

  return { sessionsPath };
}

function printHelpAndExit() {
  console.log(`
Telegram Knowledge Pruner
=========================

Usage:
  node scripts/tg-prune-old-telegram.js [--sessions <path>]

Options:
  --sessions  Path to telegram-sessions.jsonl
             (default: ../tmp/telegram-sessions.jsonl)

Steps:
  1. Stop the bot (see scripts/kill-bot.sh).
  2. Run this script to delete old Telegram-derived knowledge rows.
  3. Run the importer: bun run scripts/tg-import-sessions.ts
  4. Restart the bot (scripts/safe-restart.sh).
`);
  process.exit(0);
}

async function loadHistoryMaxTimestamp(sessionsPath) {
  let raw;
  try {
    raw = await fs.readFile(sessionsPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read sessions file: ${sessionsPath}`);
    throw err;
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let maxTs = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (typeof obj.endTimestamp === 'number' && obj.endTimestamp > maxTs) {
        maxTs = obj.endTimestamp;
      }
    } catch {
      // Ignore invalid lines
    }
  }

  if (!maxTs) {
    throw new Error('Could not determine max endTimestamp from sessions file.');
  }

  return maxTs;
}

async function checkBotRunning() {
  const { execSync } = await import('child_process');

  try {
    const result = execSync(
      'ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep || true',
      { encoding: 'utf8' },
    );
    const lines = result
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    if (lines.length > 0) {
      const pids = lines
        .map((line) => line.split(/\s+/)[1])
        .filter((pid) => pid);

      console.log('⚠️  BOT IS CURRENTLY RUNNING!');
      console.log('============================\n');
      console.log('🚨 PGlite does NOT support concurrent access.\n');
      console.log('Process IDs found:', pids.join(', '));
      console.log('\n💡 To safely prune:');
      console.log('   1. Stop the bot:  ./scripts/kill-bot.sh');
      console.log('   2. Run this script');
      console.log('   3. Restart bot:   ./scripts/safe-restart.sh');
      console.log('\n❌ Exiting to prevent database corruption.\n');
      process.exit(1);
    }
  } catch {
    // If ps/grep fails, we just continue
  }
}

function extractTelegramDate(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/"date"\s*:\s*"([0-9T:\-]+)"/);
  if (!m) return null;
  const parsed = Date.parse(m[1]);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

async function main() {
  const { sessionsPath } = parseArgs();

  console.log('🧹 Telegram Knowledge Pruner');
  console.log('============================');
  console.log(`Sessions file: ${sessionsPath}`);
  console.log(`Database:      ${DB_PATH}`);
  console.log('');

  await checkBotRunning();

  const historyMaxTs = await loadHistoryMaxTimestamp(sessionsPath);
  console.log(
    `   History max session end date: ${new Date(historyMaxTs).toISOString()}`,
  );

  const db = new PGlite(DB_PATH, {
    relaxedDurability: false,
  });

  try {
    await db.waitReady;
  } catch (initError) {
    console.error('❌ Failed to initialize database:', initError.message);
    console.log('\n⚠️  Database may be corrupted or locked.');
    process.exit(1);
  }

  console.log('\n🔍 Selecting candidate Telegram knowledge rows...');
  const result = await db.query(`
    SELECT id, content
    FROM memories
    WHERE type = 'knowledge'
      AND content->>'text' LIKE '%"from"%'
      AND content->>'text' LIKE '%"date"%'
  `);

  const rows = result.rows || [];
  console.log(`   Found ${rows.length} candidate rows that look like telegram.`);

  const toDelete = [];
  for (const row of rows) {
    const content = row.content || {};
    const text = content.text || '';
    const msgTs = extractTelegramDate(text);
    if (!msgTs) continue;
    if (msgTs <= historyMaxTs) {
      toDelete.push(row.id);
    }
  }

  if (toDelete.length === 0) {
    console.log('\n✅ No Telegram knowledge rows older than history cutoff were found.');
    await db.close();
    return;
  }

  console.log(
    `\n🚮 Deleting ${toDelete.length} Telegram knowledge rows older than cutoff...`,
  );

  const batchSize = 500;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');
    await db.query(
      `DELETE FROM memories WHERE id IN (${placeholders}) AND type = 'knowledge'`,
      batch,
    );
    console.log(
      `   ✅ Deleted batch ${i / batchSize + 1} (${batch.length} rows)`,
    );
  }

  await db.close();
  console.log('\n✅ Prune complete.');
}

main().catch((err) => {
  console.error('❌ Telegram prune failed:', err);
  process.exit(1);
});



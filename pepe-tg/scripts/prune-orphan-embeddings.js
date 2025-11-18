#!/usr/bin/env node
/**
 * Prune orphan embeddings from the ElizaOS database.
 *
 * Orphan embeddings = rows in `embeddings` where `memory_id` is non-null
 * but the corresponding `memories.id` no longer exists (e.g. after pruning
 * old knowledge).
 *
 * This script:
 *   - Ensures the bot is NOT running (PGlite cannot be used concurrently).
 *   - Counts total embeddings and orphan embeddings.
 *   - Deletes only those orphan rows.
 *
 * Usage:
 *   node scripts/prune-orphan-embeddings.js          # normal mode
 *   node scripts/prune-orphan-embeddings.js --dry    # report only, no deletes
 */

import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '.eliza', '.elizadb');

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry' || arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else {
      console.warn(`⚠️  Unrecognized argument: ${arg}`);
    }
  }

  return { dryRun };
}

function printHelpAndExit() {
  console.log(`
Orphan Embeddings Pruner
========================

Usage:
  node scripts/prune-orphan-embeddings.js [--dry]

Options:
  --dry, --dry-run   Analyze and report counts only; do NOT delete anything.

Steps:
  1. Stop the bot (./scripts/kill-bot.sh).
  2. Run this script to delete embeddings whose memory_id no longer exists.
  3. (Optional) Run "npm run db:query" with the preset embeddings query to verify.
`);
  process.exit(0);
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
      console.log('\n💡 To safely prune embeddings:');
      console.log('   1. Stop the bot:  ./scripts/kill-bot.sh');
      console.log('   2. Run this script again');
      console.log('   3. Restart bot:   ./scripts/safe-restart.sh');
      console.log('\n❌ Exiting to prevent database corruption.\n');
      process.exit(1);
    }
  } catch {
    // If ps/grep fails, we just continue
  }
}

async function main() {
  const { dryRun } = parseArgs();

  console.log('🧹 Orphan Embeddings Pruner');
  console.log('===========================');
  console.log(`Database: ${DB_PATH}`);
  console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
  console.log('');

  await checkBotRunning();

  const db = new PGlite(DB_PATH, {
    relaxedDurability: false,
  });

  try {
    await db.waitReady;
  } catch (initError) {
    console.error('❌ Failed to initialize database:', initError.message);
    console.log('\n⚠️  Database may be corrupted or locked.');
    console.log('💡 Try restoring from backup:');
    console.log('   tar -xzf ../backups/elizadb-backup-*.tar.gz -C .eliza/');
    process.exit(1);
  }

  // Total embeddings
  const totalResult = await db.query(
    'SELECT COUNT(*)::bigint AS count FROM embeddings;',
  );
  const totalEmbeddings = BigInt(totalResult.rows[0].count);
  console.log(`   Total embeddings: ${totalEmbeddings.toString()}`);

  // Orphan count
  const orphanCountResult = await db.query(`
    SELECT COUNT(*)::bigint AS count
    FROM embeddings e
    WHERE e.memory_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM memories m WHERE m.id = e.memory_id
      );
  `);
  const orphanCount = BigInt(orphanCountResult.rows[0].count);
  console.log(`   Orphan embeddings (no matching memory): ${orphanCount.toString()}`);

  if (orphanCount === 0n) {
    console.log('\n✅ No orphan embeddings found. Nothing to prune.');
    await db.close();
    return;
  }

  if (dryRun) {
    console.log('\n💡 Dry run only. No deletions performed.');
    await db.close();
    return;
  }

  console.log('\n🚮 Deleting orphan embeddings...');

  const deleteResult = await db.query(`
    DELETE FROM embeddings e
    WHERE e.memory_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM memories m WHERE m.id = e.memory_id
      );
  `);

  // PGlite returns command tag; we log again via a fresh count to be sure.
  const remainingResult = await db.query(
    'SELECT COUNT(*)::bigint AS count FROM embeddings;',
  );
  const remaining = BigInt(remainingResult.rows[0].count);

  console.log(
    `   ✅ Orphan embeddings deleted. Remaining embeddings: ${remaining.toString()}`,
  );

  await db.close();
  console.log('\n✅ Prune complete.');
}

main().catch((err) => {
  console.error('❌ Orphan embeddings prune failed:', err);
  process.exit(1);
});



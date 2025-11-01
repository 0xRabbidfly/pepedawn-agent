#!/usr/bin/env node
/**
 * PGlite Database Query Tool
 * 
 * Interactive database explorer for ElizaOS PGlite database.
 * Run queries directly from the terminal.
 * 
 * Usage:
 *   node scripts/query-db.js                    # Interactive mode with preset queries
 *   node scripts/query-db.js "SELECT * ..."     # Direct query
 */

import { PGlite } from '@electric-sql/pglite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '.eliza', '.elizadb');

async function checkBotRunning() {
  const { execSync } = await import('child_process');
  
  try {
    // Check for elizaos or bot processes (exclude pgrep itself with -v grep trick)
    const result = execSync('ps aux | grep -E "elizaos start|bun.*elizaos.*start|node.*dist/index" | grep -v grep || true', { encoding: 'utf8' });
    const lines = result.trim().split('\n').filter(line => line.length > 0);
    
    if (lines.length > 0) {
      const pids = lines.map(line => line.split(/\s+/)[1]).filter(pid => pid);
      
      console.log('⚠️  BOT IS CURRENTLY RUNNING!');
      console.log('============================\n');
      console.log('🚨 PGlite does NOT support concurrent access.');
      console.log('   Querying the database while the bot is running will cause corruption.\n');
      console.log('Process IDs found:', pids.join(', '));
      console.log('\n💡 To query the database:');
      console.log('   1. Stop the bot:  ./scripts/kill-bot.sh');
      console.log('   2. Run queries:   npm run db:query');
      console.log('   3. Restart bot:   ./scripts/safe-restart.sh');
      console.log('\n❌ Exiting to prevent database corruption.\n');
      process.exit(1);
    }
  } catch (error) {
    // ps/grep failed or not found - continue (assume bot not running)
  }
}

async function main() {
  console.log('📊 PGlite Database Explorer');
  console.log('============================\n');
  
  // Safety check: ensure bot is not running
  await checkBotRunning();
  
  console.log(`📁 Database: ${DB_PATH}\n`);

  // Try read-only mode first
  const db = new PGlite(DB_PATH, { 
    relaxedDurability: true  // Skip fsync for read-only operations
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
  
  // Get custom query from command line args
  const customQuery = process.argv.slice(2).join(' ');
  
  if (customQuery) {
    // Direct query mode
    await runQuery(db, customQuery);
  } else {
    // Interactive preset mode
    await showPresetQueries(db);
  }
  
  await db.close();
  console.log('\n✅ Connection closed');
}

async function showPresetQueries(db) {
  console.log('🔍 Preset Queries:');
  console.log('==================\n');
  
  const presets = [
    {
      name: '📋 List all tables',
      query: `
        SELECT tablename, schemaname 
        FROM pg_catalog.pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `
    },
    {
      name: '📊 Memory type breakdown',
      query: `
        SELECT 
          type,
          COUNT(*) as count,
          pg_size_pretty(SUM(pg_column_size(content))) as total_size
        FROM memories 
        GROUP BY type 
        ORDER BY count DESC;
      `
    },
    {
      name: '💬 Recent conversation messages (last 10)',
      query: `
        SELECT 
          SUBSTRING(content->>'text', 1, 100) as message,
          "createdAt"
        FROM memories 
        WHERE type = 'messages'
        ORDER BY "createdAt" DESC 
        LIMIT 10;
      `
    },
    {
      name: '💾 User-contributed memories ([MEMORY:...])',
      query: `
        SELECT 
          SUBSTRING(content->>'text', 1, 150) as memory_text,
          "createdAt"
        FROM memories 
        WHERE type = 'knowledge' 
          AND content->>'text' LIKE '[MEMORY:%'
        ORDER BY "createdAt" DESC
        LIMIT 10;
      `
    },
    {
      name: '🎴 Card-specific memories ([CARD:...])',
      query: `
        SELECT 
          SUBSTRING(content->>'text', 1, 200) as memory_with_card,
          "createdAt"
        FROM memories 
        WHERE type = 'knowledge' 
          AND content->>'text' LIKE '%[CARD:%'
        ORDER BY "createdAt" DESC
        LIMIT 10;
      `
    },
    {
      name: '🤖 Bot responses (central_messages)',
      query: `
        SELECT 
          SUBSTRING(content, 1, 80) as response,
          created_at
        FROM central_messages 
        ORDER BY created_at DESC 
        LIMIT 10;
      `
    },
    {
      name: '🏠 Active rooms',
      query: `
        SELECT 
          r.id,
          COUNT(m.id) as message_count
        FROM rooms r
        LEFT JOIN memories m ON m."roomId" = r.id AND m.type = 'messages'
        GROUP BY r.id
        ORDER BY message_count DESC
        LIMIT 5;
      `
    },
    {
      name: '📈 Knowledge sources (wiki/telegram/memories)',
      query: `
        SELECT 
          CASE 
            WHEN content->>'text' LIKE '[MEMORY:%' THEN 'user_memory'
            WHEN content->>'text' LIKE '%"from"%"date"%' THEN 'telegram'
            ELSE 'wiki'
          END as source_type,
          COUNT(*) as count
        FROM memories 
        WHERE type = 'knowledge'
        GROUP BY source_type
        ORDER BY count DESC;
      `
    },
    {
      name: '🔍 Total embeddings',
      query: `
        SELECT 
          COUNT(*) as total_embeddings,
          COUNT(CASE WHEN dim_384 IS NOT NULL THEN 1 END) as dim_384_count,
          COUNT(CASE WHEN dim_512 IS NOT NULL THEN 1 END) as dim_512_count,
          COUNT(CASE WHEN dim_768 IS NOT NULL THEN 1 END) as dim_768_count,
          COUNT(CASE WHEN dim_1536 IS NOT NULL THEN 1 END) as dim_1536_count
        FROM embeddings;
      `
    },
    {
      name: '💾 Database size by table',
      query: `
        SELECT 
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10;
      `
    }
  ];

  // Run all preset queries
  for (const preset of presets) {
    console.log(`\n${preset.name}`);
    console.log('-'.repeat(50));
    await runQuery(db, preset.query);
  }
  
  console.log('\n\n💡 USEFUL CUSTOM QUERIES:');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log('Search for card mentions:');
  console.log('  npm run db:query "SELECT content->>\'text\' FROM memories WHERE type=\'knowledge\' AND content->>\'text\' ILIKE \'%FREEDOMKEK%\' LIMIT 5"\n');
  console.log('Get all user memories by a specific telegram user ID:');
  console.log('  npm run db:query "SELECT content->>\'text\' FROM memories WHERE type=\'knowledge\' AND content->>\'text\' LIKE \'[MEMORY:1013723568:%\'"\n');
  console.log('Recent conversation history:');
  console.log('  npm run db:query "SELECT content->>\'text\', \\"createdAt\\", \\"entityId\\" FROM memories WHERE type=\'messages\' ORDER BY \\"createdAt\\" DESC LIMIT 20"\n');
  console.log('Search wiki content:');
  console.log('  npm run db:query "SELECT content->>\'text\' FROM memories WHERE type=\'knowledge\' AND content->>\'text\' NOT LIKE \'[MEMORY:%\' LIMIT 10"\n');
}

async function runQuery(db, query) {
  try {
    const result = await db.query(query.trim());
    
    if (result.rows.length === 0) {
      console.log('   (No results)');
      return;
    }
    
    // Display results as table
    console.table(result.rows);
    console.log(`   📈 ${result.rows.length} row(s) returned`);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    if (error.message.includes('does not exist')) {
      console.log('   💡 Tip: Use preset query #1 to see available tables');
    }
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


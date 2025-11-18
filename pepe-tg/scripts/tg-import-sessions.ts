#!/usr/bin/env bun
/**
 * Import Telegram session chunks into the knowledge base.
 *
 * This script:
 *   - Spins up a minimal Eliza runtime (SQL + OpenAI + Knowledge plugins only).
 *   - Loads pre-built Telegram sessions from a JSONL file.
 *   - Creates one knowledge memory per session chunk (pre-chunked text).
 *
 * NOTE: This script only IMPORTS. To "replace older TG entries only",
 *       run the prune script (tg-prune-old-telegram.js) BEFORE this,
 *       using the same sessions file to determine the cutoff date.
 *
 * Usage:
 *   bun run scripts/tg-import-sessions.ts
 *   bun run scripts/tg-import-sessions.ts --source ../tmp/telegram-sessions.jsonl --dry-run
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ElizaOS } from '@elizaos/core';

import { character as baseCharacter } from '../src/pepedawn';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE = path.resolve(__dirname, '../tmp/telegram-sessions.jsonl');

interface CLIOptions {
  source: string;
  dryRun: boolean;
}

interface SessionDoc {
  sessionId: string;
  startDate: string;
  endDate: string;
  startTimestamp: number;
  endTimestamp: number;
  participants: string[];
  cardMentions: string[];
  hasQuestion: boolean;
  hasCard: boolean;
  messageCount: number;
  signalMessageCount: number;
  chunks: string[];
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  let source = DEFAULT_SOURCE;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--source' || arg === '--src') && args[i + 1]) {
      source = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--source=')) {
      source = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    } else {
      console.warn(`⚠️  Unrecognized argument: ${arg}`);
    }
  }

  return { source, dryRun };
}

function printHelpAndExit(): never {
  console.log(`
Telegram Session Importer
=========================

Usage:
  bun run scripts/tg-import-sessions.ts [--source <path>] [--dry-run] [--overwrite]

Options:
  --source     Path to telegram-sessions.jsonl
              (default: ../tmp/telegram-sessions.jsonl)
  --dry-run    Parse and report but do NOT write to the database

To safely "replace older TG entries only":
  1. Stop the bot.
  2. Run: node scripts/tg-prune-old-telegram.js --sessions ../tmp/telegram-sessions.jsonl
  3. Run this importer (without --dry-run).
  4. Restart the bot.
`);
  process.exit(0);
}

function buildMemoryText(session: SessionDoc, chunkText: string): string {
  const parts: string[] = [];
  parts.push(`[TELEGRAM_SESSION:${session.sessionId}]`);
  parts.push(`[DATES:${session.startDate}→${session.endDate}]`);

  if (session.participants.length > 0) {
    parts.push(`[PARTICIPANTS:${session.participants.join(', ')}]`);
  }

  if (session.cardMentions && session.cardMentions.length > 0) {
    parts.push(`[CARDS:${session.cardMentions.join(', ')}]`);
  }

  parts.push('');
  parts.push(chunkText.trim());

  return parts.join('\n').trim();
}

async function ensureRuntime() {
  const eliza = new ElizaOS();

  const corePluginNames = [
    '@elizaos/plugin-sql',
    '@elizaos/plugin-openai',
    '@elizaos/plugin-knowledge',
  ];

  const minimalCharacter = {
    ...baseCharacter,
    plugins: corePluginNames,
  };

  const agent = {
    character: minimalCharacter,
    plugins: corePluginNames,
  };

  const [agentId] = await eliza.addAgents([agent]);
  await eliza.startAgents([agentId]);

  const runtime = eliza.getAgent(agentId);
  if (!runtime) {
    throw new Error('Failed to initialize runtime for Telegram session import');
  }

  return { eliza, runtime, agentId };
}

async function loadSessions(sourcePath: string): Promise<SessionDoc[]> {
  const raw = await fs.readFile(sourcePath, 'utf-8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sessions: SessionDoc[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as SessionDoc;
      if (Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
        sessions.push(parsed);
      }
    } catch (err) {
      console.warn('⚠️  Skipping invalid JSON line in sessions file:', err);
    }
  }

  return sessions;
}

async function importSessionChunks(
  runtime: any,
  session: SessionDoc,
  dryRun: boolean,
): Promise<{ created: number; updated: number; skipped: number }> {
  const stats = { created: 0, updated: 0, skipped: 0 };

  const knowledgeService = runtime.getService
    ? runtime.getService('knowledge')
    : null;

  if (!knowledgeService || typeof knowledgeService.addKnowledge !== 'function') {
    throw new Error('KnowledgeService not available from runtime');
  }

  for (let idx = 0; idx < session.chunks.length; idx += 1) {
    const chunkText = session.chunks[idx];
    const trimmed = chunkText.trim();
    if (!trimmed) {
      stats.skipped += 1;
      continue;
    }

    const contentText = buildMemoryText(session, trimmed);

    if (dryRun) {
      console.log(
        `DRY RUN: CREATE telegram chunk (session=${session.sessionId}, idx=${idx})`,
      );
      stats.created += 1;
      continue;
    }

    await knowledgeService.addKnowledge({
      agentId: runtime.agentId,
      clientDocumentId: '' as any,
      content: contentText,
      contentType: 'text/plain',
      originalFilename: `telegram-session-${session.sessionId}-chunk-${idx}.txt`,
      worldId: runtime.agentId,
      roomId: runtime.agentId,
      entityId: runtime.agentId,
      metadata: {
        source: 'telegram',
        sessionId: session.sessionId,
        startDate: session.startDate,
        endDate: session.endDate,
        timestamp: session.endTimestamp,
        startTimestamp: session.startTimestamp,
        endTimestamp: session.endTimestamp,
        participants: session.participants,
        cardMentions: session.cardMentions,
        hasQuestion: session.hasQuestion,
        hasCard: session.hasCard,
        messageCount: session.messageCount,
        signalMessageCount: session.signalMessageCount,
      },
    });

    console.log(
      `   ✅ Imported telegram chunk (session=${session.sessionId}, idx=${idx})`,
    );
    stats.created += 1;
  }

  return stats;
}

async function main() {
  const options = parseArgs();

  console.log('📥 Telegram Session Importer');
  console.log('===========================');
  console.log(`Source sessions file: ${options.source}`);
  console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`);
  console.log('');

  const sessions = await loadSessions(options.source);
  if (sessions.length === 0) {
    console.warn('⚠️  No sessions with chunks found to import.');
    return;
  }

  console.log(`   Loaded ${sessions.length.toLocaleString()} sessions`);

  const maxEndTs = sessions.reduce(
    (acc, s) => (s.endTimestamp > acc ? s.endTimestamp : acc),
    0,
  );
  if (maxEndTs > 0) {
    console.log(
      `   Session history max end date: ${new Date(maxEndTs).toISOString()}`,
    );
  }

  if (options.dryRun) {
    let totalChunks = 0;
    for (const s of sessions) {
      totalChunks += s.chunks.length;
    }
    console.log(
      `💡 Dry run only: would import ${totalChunks.toLocaleString()} chunks from ${sessions.length.toLocaleString()} sessions.`,
    );
    return;
  }

  const { eliza, runtime, agentId } = await ensureRuntime();

  try {
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const session of sessions) {
      console.log(
        `\n🧵 Session ${session.sessionId} (${session.chunks.length} chunks, messages=${session.messageCount})`,
      );
      const { created, updated, skipped } = await importSessionChunks(
        runtime,
        session,
        options.dryRun,
      );
      totalCreated += created;
      totalUpdated += updated;
      totalSkipped += skipped;
    }

    console.log('\n🎯 Telegram import complete');
    console.log(`   Created: ${totalCreated}`);
    console.log(`   Updated: ${totalUpdated}`);
    console.log(`   Skipped: ${totalSkipped}`);
  } finally {
    await eliza.stopAgents([agentId]);
  }
}

main().catch((err) => {
  console.error('❌ Telegram session import failed:', err);
  process.exit(1);
});



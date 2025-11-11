#!/usr/bin/env bun
/**
 * Import card visual fact blocks into the knowledge base.
 *
 * This script:
 *   1. Spins up a minimal Eliza runtime (SQL + OpenAI + Knowledge plugins only).
 *   2. Loads merged card visual memories from ./tmp/fv-merged (or --source).
 *   3. Creates one knowledge memory per embedding block, generating fresh embeddings.
 *
 * Usage:
 *   bun run scripts/import-card-visual-facts.ts
 *   bun run scripts/import-card-visual-facts.ts --asset FREEDOMKEK --asset PEPEDAWN
 *   bun run scripts/import-card-visual-facts.ts --source ./tmp/custom-merged
 *   bun run scripts/import-card-visual-facts.ts --overwrite
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { ElizaOS, MemoryType, type Memory } from '@elizaos/core';
import { v5 as uuidv5 } from 'uuid';

import { character as baseCharacter } from '../src/pepedawn';
import type {
  CardVisualEmbeddingRecord,
  CardVisualMemory,
  EmbeddingBlock,
} from '../src/types/cardVisualFacts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CLIOptions = {
  sourceDir: string;
  assets: Set<string>;
  overwrite: boolean;
  vectorsFile: string | null;
  mergedDir: string;
};

const DEFAULT_SOURCE = path.resolve(__dirname, '../tmp/fv-merged');
const DEFAULT_MERGED_DIR = path.resolve(__dirname, '../tmp/fv-merged');
const UUID_NAMESPACE = '8dd9f06f-59a9-4fed-9cb4-5cb9184160a3';

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    sourceDir: DEFAULT_SOURCE,
    assets: new Set<string>(),
    overwrite: false,
    vectorsFile: null,
    mergedDir: DEFAULT_MERGED_DIR,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--source':
      case '--src': {
        const next = args[i + 1];
        if (!next) {
          throw new Error(`Expected value after ${arg}`);
        }
        options.sourceDir = path.resolve(process.cwd(), next);
        i += 1;
        break;
      }
      case '--asset':
      case '--card': {
        const next = args[i + 1];
        if (!next) {
          throw new Error(`Expected card name after ${arg}`);
        }
        options.assets.add(next.toUpperCase());
        i += 1;
        break;
      }
      case '--vectors': {
        const next = args[i + 1];
        if (!next) {
          throw new Error(`Expected file path after ${arg}`);
        }
        options.vectorsFile = path.resolve(process.cwd(), next);
        i += 1;
        break;
      }
      case '--merged': {
        const next = args[i + 1];
        if (!next) {
          throw new Error(`Expected directory after ${arg}`);
        }
        options.mergedDir = path.resolve(process.cwd(), next);
        i += 1;
        break;
      }
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--help':
      case '-h':
        printHelpAndExit();
        break;
      default:
        console.warn(`⚠️  Unknown argument: ${arg}`);
        break;
    }
  }

  return options;
}

function printHelpAndExit(): never {
  console.log(`
Usage: bun run scripts/import-card-visual-facts.ts [options]

Options:
  --source <dir>     Directory containing merged card memories (default: ./tmp/fv-merged)
  --vectors <file>   Optional pre-generated embedding JSON file
  --merged <dir>     Directory containing merged memories (default: ./tmp/fv-merged)
  --asset  <name>    Import a specific card (repeatable)
  --overwrite        Recreate memories even if they already exist
  -h, --help         Show this help message
`);
  process.exit(0);
}

function formatMemoryId(asset: string, block: EmbeddingBlock): string {
  return uuidv5(`${asset}::${block.id}`, UUID_NAMESPACE);
}

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function buildMemoryText(card: CardVisualMemory, block: EmbeddingBlock): string {
  const parts: string[] = [];
  parts.push(`[CARD:${card.asset}] [CARD_FACT:${(block.label || block.id).toUpperCase()}]`);

  if (card.collection) {
    parts.push(`Collection: ${card.collection}`);
  }
  const detailLine = [
    card.series !== null ? `Series ${card.series}` : null,
    card.cardNumber !== null ? `Card ${card.cardNumber}` : null,
    card.artist ? `by ${card.artist}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  if (detailLine) {
    parts.push(detailLine);
  }

  parts.push('');
  parts.push(block.text.trim());

  if (card.keywords?.length) {
    parts.push('');
    parts.push(`Keywords: ${card.keywords.join(', ')}`);
  }

  if (card.memeticReferences?.length && block.id.endsWith('#combined')) {
    parts.push('');
    parts.push(`Memetic references: ${card.memeticReferences.join('; ')}`);
  }

  return parts.join('\n').trim();
}

async function loadCardFiles(sourceDir: string, filter: Set<string>): Promise<CardVisualMemory[]> {
  const entries = await fs.readdir(sourceDir);
  const cards: CardVisualMemory[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const assetName = entry.replace(/\.json$/i, '').toUpperCase();
    if (filter.size > 0 && !filter.has(assetName)) continue;

    const filePath = path.join(sourceDir, entry);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: CardVisualMemory = JSON.parse(raw);
    cards.push(parsed);
  }

  return cards;
}

async function loadMergedCard(
  mergedDir: string,
  asset: string,
  cache: Map<string, CardVisualMemory>
): Promise<CardVisualMemory | null> {
  const upper = asset.toUpperCase();
  if (cache.has(upper)) {
    return cache.get(upper)!;
  }

  const filePath = path.join(mergedDir, `${upper}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: CardVisualMemory = JSON.parse(raw);
    cache.set(upper, parsed);
    return parsed;
  } catch (error) {
    console.warn(`   ⚠️  Could not load merged card facts for ${upper}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function resolveBlockText(card: CardVisualMemory, blockId: string): string | null {
  if (blockId.endsWith('#combined')) {
    return card.embeddingInput ?? '';
  }
  const block = card.embeddingBlocks.find((b) => b.id === blockId);
  return block?.text ?? null;
}

async function loadEmbeddingRecords(
  vectorsFile: string,
  mergedDir: string,
  filter: Set<string>
): Promise<CardVisualMemory[]> {
  const raw = await fs.readFile(vectorsFile, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Embedding file ${vectorsFile} must contain an array of records.`);
  }

  const mergedCache = new Map<string, CardVisualMemory>();
  const cardMap = new Map<string, CardVisualMemory>();

  for (const record of parsed as CardVisualEmbeddingRecord[]) {
    const asset = record.metadata?.asset?.toUpperCase() ?? '';
    if (!asset) continue;
    if (filter.size > 0 && !filter.has(asset)) continue;

    const merged = await loadMergedCard(mergedDir, asset, mergedCache);
    if (!merged) continue;

    const blockId = record.metadata?.blockId ?? record.id;
    const blockLabel = record.metadata?.blockLabel ?? blockId;
    const blockPriority = record.metadata?.blockPriority ?? 0;
    const blockType =
      record.metadata?.blockType ??
      (blockId.includes('#') ? (blockId.split('#')[1] as CardVisualMemory['embeddingBlocks'][number]['type']) : 'other');

    const text = resolveBlockText(merged, blockId);
    if (!text) {
      console.warn(`   ⚠️  Missing text for block ${blockId}, skipping`);
      continue;
    }

    let card = cardMap.get(asset);
    if (!card) {
      const { embeddingBlocks: _ignored, ...rest } = merged;
      card = {
        ...rest,
        embeddingBlocks: [],
      };
      cardMap.set(asset, card);
    }

    card.embeddingBlocks.push({
      id: blockId,
      label: blockLabel,
      text,
      priority: blockPriority,
      type: blockType,
      vector: record.vector,
    });
  }

  return Array.from(cardMap.values()).map((card) => ({
    ...card,
    embeddingBlocks: card.embeddingBlocks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  }));
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
    throw new Error('Failed to initialize runtime for import');
  }

  return { eliza, runtime, agentId };
}

async function importBlocks(runtime: any, card: CardVisualMemory, overwrite: boolean) {
  const results: { created: number; skipped: number; updated: number } = {
    created: 0,
    skipped: 0,
    updated: 0,
  };

  const documentId = `${card.asset}#card-visual`;
  const visualSummaryShort =
    card.visualSummaryShort && card.visualSummaryShort.trim().length > 0
      ? card.visualSummaryShort
      : card.visualSummary;
  const visualKeywords = Array.isArray(card.visualKeywords) ? card.visualKeywords : [];
  const textKeywords = Array.isArray(card.textKeywords) ? card.textKeywords : [];

  for (let idx = 0; idx < card.embeddingBlocks.length; idx += 1) {
    const block = card.embeddingBlocks[idx];
    const text = block.text?.trim();
    if (!text) {
      console.warn(`   ⚠️  Skipping empty block ${block.id}`);
      results.skipped += 1;
      continue;
    }

    const memoryId = formatMemoryId(card.asset, block);
    const existing = await runtime.getMemoryById(memoryId as any);

    const memory: Memory = {
      id: memoryId as any,
      agentId: runtime.agentId,
      roomId: runtime.agentId,
      entityId: runtime.agentId,
      worldId: runtime.agentId,
      createdAt: Date.now(),
      content: {
        text: buildMemoryText(card, block),
        data: {
          cardAsset: card.asset,
          blockId: block.id,
          blockType: block.id.split('#')[1] ?? 'unknown',
          blockPriority: block.priority,
          sourceFactVersion: card.sourceFactVersion,
          combinedHash: hashText(text),
          visualSummary: card.visualSummary,
          visualSummaryShort,
          visualKeywords,
          textKeywords,
          textOnCard: card.textOnCard,
        },
      },
      metadata: {
        type: MemoryType.FRAGMENT,
        source: 'card-visual',
        asset: card.asset,
        collection: card.collection,
        documentId,
        position: idx,
        series: card.series,
        cardNumber: card.cardNumber,
        artist: card.artist,
        supply: card.supply,
        issuance: card.issuance,
        blockId: block.id,
        blockLabel: block.label,
        blockPriority: block.priority,
        blockType: block.id.split('#')[1] ?? 'unknown',
        keywords: card.keywords,
        visualKeywords,
        textKeywords,
        visualSummary: card.visualSummary,
        visualSummaryShort,
        textOnCard: card.textOnCard,
        generatedAt: card.generatedAt,
        sourceFactVersion: card.sourceFactVersion,
        timestamp: Date.now(),
      },
    };

    if (existing && !overwrite) {
      console.log(`   ↺ ${card.asset} :: ${block.id} already exists (skipping)`);
      results.skipped += 1;
      continue;
    }

    if (block.vector && block.vector.length > 0) {
      (memory as any).embedding = block.vector;
    } else {
      await runtime.addEmbeddingToMemory(memory);
    }

    if (existing && overwrite) {
      await runtime.deleteMemory(memoryId as any);
      await runtime.createMemory(memory, 'knowledge', true);
      console.log(`   ♻️  Updated ${card.asset} :: ${block.id}`);
      results.updated += 1;
    } else if (!existing) {
      await runtime.createMemory(memory, 'knowledge', true);
      console.log(`   ✅ Imported ${card.asset} :: ${block.id}`);
      results.created += 1;
    }
  }

  return results;
}

async function loadCards(options: CLIOptions): Promise<CardVisualMemory[]> {
  if (options.vectorsFile) {
    return loadEmbeddingRecords(options.vectorsFile, options.mergedDir, options.assets);
  }

  return loadCardFiles(options.sourceDir, options.assets);
}

async function main() {
  const options = parseArgs();

  console.log('📥 Importing card visual facts');
  console.log(`   Source directory: ${options.sourceDir}`);
  if (options.assets.size > 0) {
    console.log(`   Target cards: ${Array.from(options.assets).join(', ')}`);
  }
  if (options.vectorsFile) {
    console.log(`   Vectors file: ${options.vectorsFile}`);
  }
  console.log(`   Overwrite existing: ${options.overwrite ? 'yes' : 'no'}`);
  console.log('');

  const cards = await loadCards(options);
  if (cards.length === 0) {
    console.log('⚠️  No card visual memories found to import.');
    process.exit(0);
  }

  const { eliza, runtime, agentId } = await ensureRuntime();

  try {
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const card of cards) {
      console.log(`🃏 ${card.asset} (${card.embeddingBlocks.length} blocks)`);
      const { created, updated, skipped } = await importBlocks(runtime, card, options.overwrite);
      totalCreated += created;
      totalUpdated += updated;
      totalSkipped += skipped;
      console.log('');
    }

    console.log('🎯 Import complete');
    console.log(`   Created: ${totalCreated}`);
    console.log(`   Updated: ${totalUpdated}`);
    console.log(`   Skipped: ${totalSkipped}`);
  } finally {
    await eliza.stopAgents([agentId]);
  }
}

main().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});


/**
 * Embedding pipeline for card visual facts.
 *
 * Steps:
 * 1. Reads merged card fact JSON files (produced by fv-merge-card-facts.ts).
 * 2. Generates embeddings for each block (text, memetic, visual, raw, combined).
 * 3. Emits embeddings to a JSON file suitable for ingestion into the memory store.
 *
 * Usage:
 *   bun run scripts/fv-embed-card-facts.ts --source ./tmp/fv-merged --out ./tmp/fv-embeddings
 *   bun run scripts/fv-embed-card-facts.ts --asset FREEDOMKEK
 *
 * Dependencies:
 *   - Requires OPENAI_API_KEY in the environment (via @elizaos/core OpenAI client)
 */

import { mkdirSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import type {
  CardVisualEmbeddingRecord,
  CardVisualMemory,
} from '../src/types/cardVisualFacts';

interface CliOptions {
  sourceDir: string;
  outDir: string;
  assets: string[] | null;
  dryRun: boolean;
}

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let sourceDir = './tmp/fv-merged';
  let outDir = './tmp/fv-embeddings';
  const assetSet = new Set<string>();
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--source' && args[i + 1]) {
      sourceDir = args[++i];
    } else if (arg.startsWith('--source=')) {
      sourceDir = arg.split('=')[1];
    } else if (arg === '--out' && args[i + 1]) {
      outDir = args[++i];
    } else if (arg.startsWith('--out=')) {
      outDir = arg.split('=')[1];
    } else if (arg === '--asset' && args[i + 1]) {
      assetSet.add(args[++i].toUpperCase());
    } else if (arg.startsWith('--asset=')) {
      const value = arg.split('=')[1];
      value.split(',').forEach((name) => assetSet.add(name.trim().toUpperCase()));
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.warn(`Unrecognized argument: ${arg}`);
    }
  }

  return {
    sourceDir,
    outDir,
    assets: assetSet.size > 0 ? Array.from(assetSet) : null,
    dryRun,
  };
}

function printUsageAndExit(code: number): never {
  console.log(`
Usage: bun run scripts/fv-embed-card-facts.ts [--source <dir>] [--out <dir>] [--asset ASSET] [--dry-run]

Options:
  --source   Directory containing merged card facts (default: ./tmp/fv-merged)
  --out      Directory for embedding JSON output (default: ./tmp/fv-embeddings)
  --asset    Limit to one or more assets (repeatable or comma-separated)
  --dry-run  Skip embedding call and print what would be embedded
`);
  process.exit(code);
}

function ensureDir(path: string): string {
  const resolved = resolve(path);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

async function generateEmbedding(openai: OpenAI, input: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    input,
    model: EMBEDDING_MODEL,
  });
  const vector = response.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error('Invalid embedding response format');
  }
  return vector;
}

async function embedCards(
  options: CliOptions,
  openai: OpenAI
): Promise<CardVisualEmbeddingRecord[]> {
  const resolvedSource = resolve(options.sourceDir);
  const assetNames =
    options.assets ??
    readdirSync(resolvedSource)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/i, '').toUpperCase())
      .sort();

  const embeddings: CardVisualEmbeddingRecord[] = [];

  for (const asset of assetNames) {
    const inputPath = join(resolvedSource, `${asset}.json`);
    let memory: CardVisualMemory;
    try {
      const raw = await readFile(inputPath, 'utf8');
      memory = JSON.parse(raw) as CardVisualMemory;
    } catch (error) {
      console.error(`❌ Failed to read merged fact for ${asset}:`, error);
      continue;
    }

    const baseMetadata = {
      asset: memory.asset,
      collection: memory.collection,
      series: memory.series,
      cardNumber: memory.cardNumber,
      artist: memory.artist,
      keywords: memory.keywords,
      version: memory.version,
    };

    // Combined embedding first (alias "#combined")
    const combinedBlock = {
      id: `${memory.asset}#combined`,
      label: 'Combined card fact',
      text: memory.embeddingInput,
      priority: 120,
    };

    const blocks = [
      {
        ...combinedBlock,
        type: 'combined' as const,
      },
      ...memory.embeddingBlocks,
    ];
    for (const block of blocks) {
      if (!block.text || block.text.trim().length === 0) continue;

      if (options.dryRun) {
        console.log(`DRY RUN: would embed ${block.id}`);
        continue;
      }

      const vector = await generateEmbedding(openai, block.text);
      embeddings.push({
        id: `${block.id}`,
        vector,
        metadata: {
          ...baseMetadata,
          blockId: block.id,
          blockLabel: block.label,
          blockPriority: block.priority,
          blockType: block.type ?? 'other',
        },
      });
      console.log(`   ✅ Embedded ${block.id} (dim=${vector.length})`);
    }
  }

  return embeddings;
}

async function main() {
  try {
    const options = parseArgs();
    ensureDir(options.outDir);

    if (options.dryRun) {
      console.log('Running in dry-run mode (no embeddings generated)');
    }

    const openai = options.dryRun ? null : new OpenAI();
    const embeddings = await embedCards(options, openai!);

    if (!options.dryRun) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = join(
        resolve(options.outDir),
        `card-visual-embeddings-${timestamp}.json`
      );
      await writeFile(outputPath, JSON.stringify(embeddings, null, 2), 'utf8');
      console.log(`\n✅ Embeddings written to ${outputPath} (${embeddings.length} vectors)`);
      if (embeddings.length > 0) {
        console.log('Sample record preview:');
        console.log(JSON.stringify(embeddings[0], null, 2));
      }
    } else {
      console.log('Dry run complete. No files written.');
    }
  } catch (error) {
    console.error('Unhandled error during embedding:', error);
    process.exit(1);
  }
}

main();


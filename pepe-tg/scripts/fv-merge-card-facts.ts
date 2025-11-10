/**
 * Merge `/fv` crawl output with canonical metadata to produce
 * structured card facts ready for embedding.
 *
 * Usage:
 *   bun run scripts/fv-merge-card-facts.ts --card FREEDOMKEK --card PEPEDAWN
 *   bun run scripts/fv-merge-card-facts.ts --source ./tmp/fv-crawl --out ./tmp/fv-merged
 *
 * The script expects the raw crawl JSON (produced by fv-crawl-sample.ts)
 * to be present in the source directory.
 */

import { mkdirSync, readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { CardVisualFact, CardVisualMemory } from '../src/types/cardVisualFacts';
import { getCardInfo as getStaticCardInfo } from '../src/data/fullCardIndex';

interface CliOptions {
  sourceDir: string;
  outDir: string;
  cards: string[] | null;
}

const FACTS_VERSION = 1;
const MEMORY_VERSION = 1;

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let sourceDir = './tmp/fv-crawl';
  let outDir = './tmp/fv-merged';
  const cardSet = new Set<string>();

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
    } else if (arg === '--card' && args[i + 1]) {
      cardSet.add(args[++i].toUpperCase());
    } else if (arg.startsWith('--card=')) {
      const value = arg.split('=')[1];
      value.split(',').forEach((name) => cardSet.add(name.trim().toUpperCase()));
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.warn(`Unrecognized argument: ${arg}`);
    }
  }

  return {
    sourceDir,
    outDir,
    cards: cardSet.size > 0 ? Array.from(cardSet) : null,
  };
}

function printUsageAndExit(code: number): never {
  console.log(`
Usage: bun run scripts/fv-merge-card-facts.ts [--source <dir>] [--out <dir>] [--card CARDNAME]

Options:
  --source   Directory containing raw /fv facts (default: ./tmp/fv-crawl)
  --out      Output directory for merged card facts (default: ./tmp/fv-merged)
  --card     Limit to one or more card assets (repeatable or comma-separated)
`);
  process.exit(code);
}

function ensureDir(path: string): string {
  const resolved = resolve(path);
  mkdirSync(resolved, { recursive: true });
  return resolved;
}

function sanitizeList(content: string | null): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n|[\/|]/)
    .map((line) => line.replace(/^[-•\s]+/, '').trim())
    .map((line) => line.replace(/\s{2,}/g, ' '))
    .filter((line) => line.length > 0);
}

function tokenizeForKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'over',
  'under',
  'into',
  'your',
  'their',
  'them',
  'have',
  'without',
  'about',
  'through',
  'being',
  'which',
  'such',
  'also',
  'into',
  'here',
  'there',
  'very',
  'much',
  'more',
  'most',
  'some',
  'many',
  'card',
  'cards',
  'fake',
  'rares',
  'rare',
  'pepe',
  'frog',
]);

function buildEmbeddingInput(payload: {
  asset: string;
  collection: string | null;
  series: number | null;
  cardNumber: number | null;
  artist: string | null;
  supply: number | null;
  issuance: string | null;
  textOnCard: string[];
  visualSummary: string;
  memeticReferences: string[];
}): string {
  const lines: string[] = [];
  lines.push(
    `${payload.asset} (${payload.collection ?? 'Unknown collection'}) - Series ${
      payload.series ?? '?'
    } Card ${payload.cardNumber ?? '?'}`
  );

  if (payload.artist) {
    lines.push(`Artist: ${payload.artist}`);
  }
  if (payload.supply !== null || payload.issuance) {
    const supplyPart = payload.supply !== null ? `Supply ${payload.supply}` : null;
    const issuancePart = payload.issuance ? `Issued ${payload.issuance}` : null;
    lines.push(['', supplyPart, issuancePart].filter(Boolean).join(' ').trim());
  }

  if (payload.textOnCard.length > 0) {
    lines.push(`On-card text: ${payload.textOnCard.join(' | ')}`);
  } else {
    lines.push('On-card text: none detected');
  }

  lines.push(`Visual summary: ${payload.visualSummary || 'n/a'}`);

  if (payload.memeticReferences.length > 0) {
    lines.push(`Memetic references: ${payload.memeticReferences.join('; ')}`);
  } else {
    lines.push('Memetic references: none captured');
  }

  return lines.join('\n').trim();
}

async function mergeFacts(
  sourceDir: string,
  outDir: string,
  cards: string[] | null
): Promise<void> {
  const resolvedSource = resolve(sourceDir);
  const resolvedOut = ensureDir(outDir);

  const files = readdirSync(resolvedSource).filter((file) => file.endsWith('.json'));
  const fileLookup = new Map<string, string>();

  files.forEach((file) => {
    const base = file.replace(/\.json$/i, '');
    fileLookup.set(base.toUpperCase(), base);
  });

  const targetCards =
    cards ??
    Array.from(fileLookup.keys())
      .sort();

  if (targetCards.length === 0) {
    console.warn('No cards found to merge. Aborting.');
    return;
  }

  console.log(`Merging ${targetCards.length} card(s) from ${resolvedSource}`);
  for (const cardName of targetCards) {
    const fileBase = fileLookup.get(cardName);
    if (!fileBase) {
      console.error(`❌ No crawl output found for ${cardName} in ${resolvedSource}`);
      continue;
    }

    const factPath = join(resolvedSource, `${fileBase}.json`);

    let fact: CardVisualFact;
    try {
      const raw = await readFile(factPath, 'utf8');
      fact = JSON.parse(raw) as CardVisualFact;
    } catch (error) {
      console.error(`❌ Failed to read fact for ${cardName}:`, error);
      continue;
    }

    const canonical = getStaticCardInfo(cardName);
    const textOnCard = sanitizeList(fact.analysis.sections.textOnCard?.content ?? null);
    const memeticReferences = sanitizeList(fact.analysis.sections.memeticDna?.content ?? null);
    const visualSummary = fact.analysis.sections.visualBreakdown?.content ?? '';

    const keywordSet = new Set<string>();
    textOnCard.forEach((line) => tokenizeForKeywords(line).forEach((token) => keywordSet.add(token)));
    memeticReferences.forEach((line) =>
      tokenizeForKeywords(line).forEach((token) => keywordSet.add(token))
    );

    tokenizeForKeywords(visualSummary)
      .slice(0, 20)
      .forEach((token) => keywordSet.add(token));

    if (canonical?.artist) {
      tokenizeForKeywords(canonical.artist).forEach((token) => keywordSet.add(token));
    }

    const keywords = Array.from(keywordSet).slice(0, 40);

    const embeddingBlocks: CardVisualMemory['embeddingBlocks'] = [];

    if (textOnCard.length > 0) {
      embeddingBlocks.push({
        id: `${cardName}#text`,
        label: 'On-card text',
        text: textOnCard.join(' | '),
        priority: 100,
        type: 'text',
      });
    }

    if (memeticReferences.length > 0) {
      embeddingBlocks.push({
        id: `${cardName}#memetic`,
        label: 'Memetic references',
        text: memeticReferences.join('\n'),
        priority: 80,
        type: 'memetic',
      });
    }

    if (visualSummary.trim().length > 0) {
      embeddingBlocks.push({
        id: `${cardName}#visual`,
        label: 'Visual summary',
        text: visualSummary,
        priority: 60,
        type: 'visual',
      });
    }

    if (fact.analysis.raw?.trim()) {
      embeddingBlocks.push({
        id: `${cardName}#raw`,
        label: 'Raw /fv analysis',
        text: fact.analysis.raw.trim(),
        priority: 40,
        type: 'raw',
      });
    }

    const memory: CardVisualMemory = {
      version: MEMORY_VERSION,
      asset: cardName,
      collection: fact.card.collection ?? 'Fake Rares',
      series: fact.card.series ?? canonical?.series ?? null,
      cardNumber: fact.card.cardNumber ?? canonical?.card ?? null,
      artist: fact.card.artist ?? canonical?.artist ?? null,
      supply: fact.card.supply ?? canonical?.supply ?? null,
      issuance: fact.card.issuance ?? canonical?.issuance ?? null,
      textOnCard,
      memeticReferences,
      visualSummary,
      keywords,
      embeddingInput: buildEmbeddingInput({
        asset: cardName,
        collection: fact.card.collection ?? 'Fake Rares',
        series: fact.card.series ?? canonical?.series ?? null,
        cardNumber: fact.card.cardNumber ?? canonical?.card ?? null,
        artist: fact.card.artist ?? canonical?.artist ?? null,
        supply: fact.card.supply ?? canonical?.supply ?? null,
        issuance: fact.card.issuance ?? canonical?.issuance ?? null,
        textOnCard,
        visualSummary,
        memeticReferences,
      }),
      embeddingBlocks,
      generatedAt: new Date().toISOString(),
      sourceFactVersion: fact.version ?? FACTS_VERSION,
    };

    const outputPath = join(resolvedOut, `${cardName}.json`);
    await writeFile(outputPath, JSON.stringify(memory, null, 2), 'utf8');
    console.log(`   ✅ Merged ${cardName} → ${outputPath}`);
  }
}

async function main() {
  try {
    const options = parseArgs();
    await mergeFacts(options.sourceDir, options.outDir, options.cards);
  } catch (error) {
    console.error('Unhandled error during merge:', error);
    process.exit(1);
  }
}

main();


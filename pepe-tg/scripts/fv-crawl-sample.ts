/**
 * MVP Script: Run /fv-style visual analysis for a single card.
 *
 * Usage:
 *   bun run tsx scripts/fv-crawl-sample.ts --card FREEDOMKEK --out ./tmp/fv-freedomkek.json
 *
 * The script:
 * 1. Resolves card metadata (series, artist, URIs) from the static index.
 * 2. Reuses the production vision analyzer to call OpenAI.
 * 3. Normalizes the analysis into structured sections for later embedding.
 * 4. Logs token counts to the console for quick cost checks.
 *
 * NOTE: This is intentionally a manual tool. It does not batch cards yet.
 */

import { writeFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { CardInfo } from '../src/data/fullCardIndex';
import { getCardInfo as getStaticCardInfo, FULL_CARD_INDEX } from '../src/data/fullCardIndex';
import { determineImageUrlForAnalysis } from '../src/utils/cardUrlUtils';
import { analyzeWithVision } from '../src/utils/visionAnalyzer';
import { CARD_ANALYSIS_PROMPT } from '../src/actions/fakeVisualCommand';
import type { CardVisualFact, CardVisualFactSections } from '../src/types/cardVisualFacts';

interface CliArgs {
  card: string | null;
  outPath: string | null;
  dryRun: boolean;
}

const DEFAULT_OUTPUT_DIR = './tmp/fv-crawl';
const FACT_VERSION = 1;

const MODEL_PRICING_USD_PER_MTOKEN: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'chatgpt-4o-latest': { input: 2.5, output: 10 },
  'gpt-4o-realtime-preview': { input: 2.5, output: 10 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o1-preview': { input: 15, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
};

function estimateCostUSD(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING_USD_PER_MTOKEN[model] ?? MODEL_PRICING_USD_PER_MTOKEN['gpt-4o'];
  const inCost = (tokensIn / 1_000_000) * pricing.input;
  const outCost = (tokensOut / 1_000_000) * pricing.output;
  return inCost + outCost;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let card: string | null = null;
  let outPath: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--card' && args[i + 1]) {
      card = args[++i];
    } else if (arg.startsWith('--card=')) {
      card = arg.split('=')[1];
    } else if (arg === '--out' && args[i + 1]) {
      outPath = args[++i];
    } else if (arg.startsWith('--out=')) {
      outPath = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.warn(`Unrecognized argument: ${arg}`);
    }
  }

  if (!card) {
    printUsageAndExit(1);
  }

  return { card, outPath, dryRun };
}

function printUsageAndExit(code: number): never {
  console.log(`
Usage: bun run tsx scripts/fv-crawl-sample.ts --card <CARDNAME> [--out <path>] [--dry-run]

Options:
  --card       Required. Card asset name (case-insensitive).
  --out        Optional. Output path for JSON (defaults to ./tmp/fv-crawl/<CARD>.json).
  --dry-run    Skip the OpenAI call and emit sample structure for testing CLI wiring.
`);
  process.exit(code);
}

function ensureOutputPath(outPath: string): string {
  const resolved = resolve(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  return resolved;
}

function buildSection(
  heading: string,
  regex: RegExp,
  analysis: string
): { heading: string; content: string | null } {
  const match = analysis.match(regex);
  const content = match ? match[1].trim() : null;
  return { heading, content: content && content.length > 0 ? content : null };
}

function stripRarityFeels(analysis: string): string {
  const normalized = analysis.replace(/\r\n/g, '\n');
  return normalized.replace(/\n\n🎯 \*\*RARITY FEELS:\*\*\n[\s\S]*$/, '').trimEnd();
}

function extractSections(analysis: string): CardVisualFactSections {
  return {
    textOnCard: buildSection(
      'TEXT ON CARD',
      /📝 \*\*TEXT ON CARD:\*\*\n([\s\S]*?)(?=\n\n(?:🎨|🧬|🎯)|$)/,
      analysis
    ),
    visualBreakdown: buildSection(
      'VISUAL BREAKDOWN',
      /🎨 \*\*VISUAL BREAKDOWN:\*\*\n([\s\S]*?)(?=\n\n(?:🧬|🎯)|$)/,
      analysis
    ),
    memeticDna: buildSection(
      'MEMETIC DNA',
      /🧬 \*\*MEMETIC DNA:\*\*\n([\s\S]*?)(?=\n\n🎯|$)/,
      analysis
    ),
  };
}

function normalizeCard(cardInfo: CardInfo | null): CardVisualFact['card'] {
  return {
    asset: cardInfo?.asset ?? 'UNKNOWN',
    series: cardInfo?.series ?? null,
    cardNumber: cardInfo?.card ?? null,
    artist: cardInfo?.artist ?? null,
    supply: cardInfo?.supply ?? null,
    issuance: cardInfo?.issuance ?? null,
    collection: cardInfo?.collection ?? 'Fake Rares',
  };
}

async function run(): Promise<void> {
  const args = parseArgs();
  const requestedCard = args.card!;
  let cardInfo = getStaticCardInfo(requestedCard);
  if (!cardInfo) {
    const fallback = FULL_CARD_INDEX.find(
      (entry) => entry.asset.toUpperCase() === requestedCard.toUpperCase()
    );
    if (fallback) {
      cardInfo = fallback;
    }
  }

  if (!cardInfo) {
    console.error(`❌ Card "${requestedCard}" not found in fake-rares-data.json.`);
    process.exit(1);
  }

  const imageUrl = determineImageUrlForAnalysis(cardInfo, cardInfo.asset);

  if (!imageUrl) {
    console.error(
      `⚠️ Card "${cardInfo.asset}" does not have a static image available for analysis (ext=${cardInfo.ext}).`
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`Dry run: would analyze ${cardInfo.asset} using image ${imageUrl}`);
    return;
  }

  const runtime: any = {
    getService(name: string) {
      return null;
    },
  };

  console.log(`🎯 Running /fv analysis for ${cardInfo.asset}`);
  console.log(`   Image URL: ${imageUrl}`);

  const start = Date.now();
  const result = await analyzeWithVision(
    runtime,
    imageUrl,
    `card: ${cardInfo.asset}`,
    CARD_ANALYSIS_PROMPT,
    'fv-crawl-script'
  );
  const elapsed = Date.now() - start;

  const normalizedAnalysis = stripRarityFeels(result.analysis);
  const sections = extractSections(normalizedAnalysis);
  const fact: CardVisualFact = {
    version: FACT_VERSION,
    card: normalizeCard(cardInfo),
    analysis: {
      raw: normalizedAnalysis.trim(),
      sections,
    },
  };

  const outputPath = ensureOutputPath(
    args.outPath ?? `${DEFAULT_OUTPUT_DIR}/${cardInfo.asset}.json`
  );
  await writeFile(outputPath, JSON.stringify(fact, null, 2), 'utf8');

  console.log('\n✅ Analysis complete');
  console.log(`   Model: ${result.model}`);
  console.log(`   Tokens: ${result.tokensIn} in → ${result.tokensOut} out`);
  const estimatedCost = estimateCostUSD(result.model, result.tokensIn, result.tokensOut);
  console.log(`   Estimated cost (not stored): ~$${estimatedCost.toFixed(4)}`);
  console.log(`   Duration: ${result.duration ?? elapsed} ms`);
  console.log(`   Output: ${outputPath}`);
}

run().catch((error) => {
  console.error('Unhandled error during /fv crawl:', error);
  process.exit(1);
});


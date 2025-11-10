#!/usr/bin/env bun
/**
 * Batch Fake Rares /fv crawl runner.
 *
 * Usage:
 *   bun run tsx scripts/fv-crawl-all.ts
 *   bun run tsx scripts/fv-crawl-all.ts --start FREEDOMKEK --limit 5
 *   bun run tsx scripts/fv-crawl-all.ts --delay 2000
 *
 * Options:
 *   --start <CARD>     Start at this asset (case-insensitive). Defaults to first card.
 *   --limit <N>        Crawl at most N cards (useful for spot checks).
 *   --delay <ms>       Milliseconds to wait between cards (defaults to 0).
 *   --outDir <path>    Output directory for per-card JSON (defaults to ./tmp/fv-crawl).
 *   --dry-run          Print plan without calling OpenAI.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { FULL_CARD_INDEX } from '../src/data/fullCardIndex';

interface CliOptions {
  startAsset: string | null;
  limit: number | null;
  delayMs: number;
  outDir: string | null;
  dryRun: boolean;
  maxRetries: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let startAsset: string | null = null;
  let limit: number | null = null;
  let delayMs = 0;
  let outDir: string | null = null;
  let dryRun = false;
  let maxRetries = 1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--start' && args[i + 1]) {
      startAsset = args[++i].toUpperCase();
    } else if (arg.startsWith('--start=')) {
      startAsset = arg.split('=')[1].toUpperCase();
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--delay' && args[i + 1]) {
      delayMs = parseInt(args[++i], 10);
    } else if (arg.startsWith('--delay=')) {
      delayMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--outDir' && args[i + 1]) {
      outDir = args[++i];
    } else if (arg.startsWith('--outDir=')) {
      outDir = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--retries' && args[i + 1]) {
      maxRetries = parseInt(args[++i], 10);
    } else if (arg.startsWith('--retries=')) {
      maxRetries = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.warn(`⚠️  Unrecognized argument: ${arg}`);
    }
  }

  if (Number.isNaN(limit!)) limit = null;
  if (Number.isNaN(delayMs)) delayMs = 0;
  if (Number.isNaN(maxRetries) || maxRetries < 0) maxRetries = 0;

  return { startAsset, limit, delayMs, outDir, dryRun, maxRetries };
}

function printUsageAndExit(code: number): never {
  console.log(`
Usage: bun run tsx scripts/fv-crawl-all.ts [options]

Options:
  --start <CARD>     Start at this asset (case-insensitive)
  --limit <N>        Crawl at most N cards
  --delay <ms>       Delay between cards in milliseconds
  --outDir <path>    Custom output directory (defaults to ./tmp/fv-crawl)
  --dry-run          Show planned crawl without calling OpenAI
  --retries <N>      Number of retries per card on failure (default: 1)
`);
  process.exit(code);
}

async function main(): Promise<void> {
  const { startAsset, limit, delayMs, outDir, dryRun, maxRetries } = parseArgs();

  const allCards = FULL_CARD_INDEX.map((card) => card.asset);
  const upperLookup = allCards.map((asset) => asset.toUpperCase());
  if (allCards.length === 0) {
    console.error('❌ Card index is empty – cannot crawl.');
    process.exit(1);
  }

  let startIndex = 0;
  if (startAsset) {
    startIndex = upperLookup.indexOf(startAsset);
    if (startIndex === -1) {
      console.error(`❌ Start asset "${startAsset}" not found in index.`);
      process.exit(1);
    }
  }

  const totalRemaining = limit ?? (allCards.length - startIndex);
  if (totalRemaining <= 0) {
    console.error('❌ Nothing to crawl (limit/start combination yields zero cards).');
    process.exit(1);
  }

  const cardsToProcess = allCards.slice(startIndex, startIndex + totalRemaining);

  console.log(`🚀 Starting /fv crawl for ${cardsToProcess.length} Fake Rares cards`);
  console.log(`   Start asset: ${cardsToProcess[0]}`);
  if (limit) console.log(`   Limit: ${limit} cards`);
  if (delayMs > 0) console.log(`   Delay between cards: ${delayMs}ms`);
  if (outDir) console.log(`   Output directory override: ${outDir}`);
  if (dryRun) console.log('   Dry run: will not call OpenAI');
  if (maxRetries > 0) {
    console.log(`   Retries per card: ${maxRetries}`);
  }
  console.log('='.repeat(60));

  if (dryRun) {
    cardsToProcess.slice(0, Math.min(cardsToProcess.length, 10)).forEach((asset, idx) => {
      console.log(`[DRY RUN] ${idx + 1}/${cardsToProcess.length} ${asset}`);
    });
    if (cardsToProcess.length > 10) {
      console.log(`...and ${cardsToProcess.length - 10} more cards.`);
    }
    return;
  }

  let index = 0;
  const sampleScript = path.resolve(__dirname, 'fv-crawl-sample.ts');
  const retryCounts = new Map<string, number>();
  const failures: Array<{ asset: string; attempts: number; code: number | null }> = [];

  const finish = () => {
    console.log('\n✅ Crawl complete!');
    if (failures.length > 0) {
      console.log(`⚠️  ${failures.length} cards failed after retries:`);
      failures.forEach((f) => {
        console.log(`   - ${f.asset} (attempts=${f.attempts}, exit=${f.code ?? 'unknown'})`);
      });
    }
  };

  const runNext = () => {
    if (index >= cardsToProcess.length) {
      finish();
      return;
    }

    const asset = cardsToProcess[index];
    runAsset(asset);
  };

  const scheduleNext = () => {
    if (delayMs > 0) {
      setTimeout(runNext, delayMs);
    } else {
      runNext();
    }
  };

  const runAsset = (asset: string) => {
    const attempt = (retryCounts.get(asset) ?? 0) + 1;
    retryCounts.set(asset, attempt);

    console.log(`\n▶️  (${index + 1}/${cardsToProcess.length}) Crawling ${asset} (attempt ${attempt}${maxRetries > 0 ? `/${maxRetries + 1}` : ''})...`);

    const args = ['run', sampleScript, '--card', asset];
    if (outDir) {
      args.push('--out', path.join(outDir, `${asset}.json`));
    }

    const child = spawn('bun', args, {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        const remainingRetries = maxRetries - (attempt - 1);
        if (remainingRetries > 0) {
          console.warn(`⚠️  Crawl failed for ${asset} (exit=${code}). Retrying (${remainingRetries} retries left)...`);
          setTimeout(() => runAsset(asset), Math.max(1500, delayMs));
          return;
        }

        failures.push({ asset, attempts: attempt, code });
        console.error(`❌ Crawl failed for ${asset} after ${attempt} attempts (exit=${code}). Skipping.`);
      } else {
        retryCounts.delete(asset);
      }

      index += 1;
      scheduleNext();
    });
  };

  runNext();
}

main().catch((err) => {
  console.error('Unhandled error in fv-crawl-all:', err);
  process.exit(1);
});



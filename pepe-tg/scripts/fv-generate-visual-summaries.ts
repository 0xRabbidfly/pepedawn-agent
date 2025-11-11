#!/usr/bin/env bun
/**
 * Generate concise visual trait summaries for merged card facts.
 *
 * Usage:
 *   bun run scripts/fv-generate-visual-summaries.ts
 *   bun run scripts/fv-generate-visual-summaries.ts --source ./tmp/fv-merged --card FREEDOMKEK
 *
 * Requirements:
 *   - OPENAI_API_KEY must be set (uses Chat Completions API).
 */

import { readdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import OpenAI from 'openai';
import type { CardVisualMemory } from '../src/types/cardVisualFacts';

interface CliOptions {
  sourceDir: string;
  cards: string[] | null;
  dryRun: boolean;
}

interface SummaryResult {
  summary: string;
  keywords: string[];
}

const MODEL = process.env.CARD_VISUAL_SUMMARY_MODEL || 'gpt-4o-mini';

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let sourceDir = './tmp/fv-merged';
  const cardSet = new Set<string>();
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--source' && args[i + 1]) {
      sourceDir = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--source=')) {
      sourceDir = arg.split('=')[1];
    } else if (arg === '--card' && args[i + 1]) {
      cardSet.add(args[i + 1].toUpperCase());
      i += 1;
    } else if (arg.startsWith('--card=')) {
      arg
        .split('=')[1]
        .split(',')
        .forEach((name) => cardSet.add(name.trim().toUpperCase()));
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit();
    } else {
      console.warn(`Unrecognized argument: ${arg}`);
    }
  }

  return {
    sourceDir,
    cards: cardSet.size > 0 ? Array.from(cardSet) : null,
    dryRun,
  };
}

function printUsageAndExit(code = 0): never {
  console.log(`
Usage: bun run scripts/fv-generate-visual-summaries.ts [options]

Options:
  --source <dir>   Directory containing merged card memories (default: ./tmp/fv-merged)
  --card <asset>   Limit to one or more card assets (repeatable or comma-separated)
  --dry-run        Print results without overwriting files
`);
  process.exit(code);
}

function ensureApiKey(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required for this script.');
    process.exit(1);
  }
}

function sanitizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((kw) => (typeof kw === 'string' ? kw.trim().toLowerCase() : ''))
    .filter((kw) => kw.length > 0)
    .slice(0, 24);
}

function tokenizeForKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

async function generateSummary(
  client: OpenAI,
  card: CardVisualMemory
): Promise<SummaryResult | null> {
  const systemPrompt =
    'You summarize Fake Rare trading cards for visual trait search.\n' +
    'You will receive JSON with "asset", "visualSummary", and "textOnCard".\n' +
    'Return a JSON object with:\n' +
    '{ "summary": "<two short sentences>", "keywords": ["<visual keyword>", ...] }\n' +
    'Rules:\n' +
    ' - Focus only on what is visibly present: objects, characters, colors, lighting, environment, mood.\n' +
    ' - Mention written text only if it appears on the card image itself.\n' +
    ' - Do NOT include lore, issuance, or rarity feelings.\n' +
    ' - Keywords should be lower-case single words or short phrases (e.g., "snowstorm", "blue palette", "saxophone").\n' +
    ' - Maximum 10 keywords.\n' +
    'Respond with strict JSON.';

  const payload = {
    asset: card.asset,
    visualSummary: card.visualSummary,
    textOnCard: card.textOnCard ?? [],
  };

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify(payload, null, 2),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as SummaryResult;
    if (!parsed.summary || typeof parsed.summary !== 'string') {
      return null;
    }

    return {
      summary: parsed.summary.trim(),
      keywords: sanitizeKeywords(parsed.keywords),
    };
  } catch (error) {
    console.error(`   ⚠️  Failed to generate summary for ${card.asset}:`, error);
    return null;
  }
}

async function main() {
  const options = parseArgs();
  ensureApiKey();

  const resolvedSource = resolve(options.sourceDir);
  const files = readdirSync(resolvedSource).filter((file) => file.endsWith('.json'));

  if (files.length === 0) {
    console.error('❌ No merged card files found. Run fv-merge-card-facts.ts first.');
    process.exit(1);
  }

  const openai = new OpenAI();

  const filteredFiles =
    options.cards && options.cards.length > 0
      ? files.filter((file) => options.cards!.includes(file.replace(/\.json$/i, '').toUpperCase()))
      : files;

  console.log(`📝 Generating visual summaries for ${filteredFiles.length} cards`);

  for (const file of filteredFiles) {
    const path = join(resolvedSource, file);
    let card: CardVisualMemory;

    try {
      const raw = await readFile(path, 'utf8');
      card = JSON.parse(raw) as CardVisualMemory;
    } catch (error) {
      console.error(`❌ Failed to read ${file}:`, error);
      continue;
    }

    const result = await generateSummary(openai, card);

    const fallbackSummary =
      card.visualSummaryShort && card.visualSummaryShort.trim().length > 0
        ? card.visualSummaryShort.trim()
        : card.visualSummary.trim();

    const mergedKeywords = new Set<string>([
      ...(card.visualKeywords ?? []),
      ...(card.textKeywords ?? []),
    ]);

    if (result) {
      card.visualSummaryShort = result.summary;
      result.keywords.forEach((kw) => mergedKeywords.add(kw));
      card.visualKeywords = result.keywords;
    } else {
      console.warn(`   ⚠️  Falling back to existing summary for ${card.asset}`);
      card.visualSummaryShort = fallbackSummary;
      if (!card.visualKeywords || card.visualKeywords.length === 0) {
        tokenizeForKeywords(fallbackSummary)
          .slice(0, 10)
          .forEach((token) => mergedKeywords.add(token));
        card.visualKeywords = Array.from(mergedKeywords).slice(0, 10);
      }
    }

    if (!card.textKeywords || card.textKeywords.length === 0) {
      const textTokens = new Set<string>();
      (card.textOnCard ?? []).forEach((line) =>
        tokenizeForKeywords(line).forEach((token) => textTokens.add(token))
      );
      card.textKeywords = Array.from(textTokens).slice(0, 20);
    }

    card.keywords = Array.from(
      new Set([...(card.visualKeywords ?? []), ...(card.textKeywords ?? [])])
    ).slice(0, 60);

    if (options.dryRun) {
      console.log(`   ↪ ${card.asset}`);
      console.log(`      Summary: ${card.visualSummaryShort}`);
      console.log(`      Visual keywords: ${card.visualKeywords.join(', ')}`);
      continue;
    }

    try {
      await writeFile(path, JSON.stringify(card, null, 2), 'utf8');
      console.log(`   ✅ Updated ${card.asset}`);
    } catch (error) {
      console.error(`❌ Failed to write ${file}:`, error);
    }

    // Be gentle to the API
    await Bun.sleep(200);
  }

  console.log('🎯 Visual summary generation complete');
}

main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});



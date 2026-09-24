#!/usr/bin/env bun
/**
 * Look at every live card the vision pass has not seen, and record what it saw.
 *
 *   bun scripts/fv-backfill.ts                # all of them
 *   bun scripts/fv-backfill.ts --dry-run      # list them, call nothing
 *   bun scripts/fv-backfill.ts --limit 25     # at most 25 (the daily run's cap)
 *   bun scripts/fv-backfill.ts --card PEPEFLOW
 *
 * For each card: a still image (an MP4's scraped still, or the directory's),
 * one vision call with the /fv prompt, one small call for the two-sentence
 * summary and keywords, then src/data/card-visual-facts/<ASSET>.json and the
 * card's keywords into card-visual-traits.json. Nothing already recorded is
 * touched. Runs daily from the update-fake-rares workflow after the sync, so
 * a card the directory adds is described the same day; the bot imports the
 * committed facts into its own database at boot (CardFactsImportService).
 *
 * Without OPENAI_API_KEY it reports what it would do and exits 0, so the
 * workflow still passes on a fork or before the secret is set.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import OpenAI from 'openai';
import { FULL_CARD_INDEX } from '../src/data/fullCardIndex';
import { callVisionModel } from '../src/utils/modelGateway';
import {
  CARD_ANALYSIS_PROMPT,
  assetsWithFacts,
  cardsNeedingFacts,
  factFromAnalysis,
  factsDir,
  imageCandidatesForVisualAnalysis,
  imageForVisualAnalysis,
  memoryFromFact,
  mergeTraits,
  traitsPath,
  type VisualSummary,
} from '../src/utils/cardVisualFacts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : Infinity;
const only = new Set(args.flatMap((a, i) => (a === '--card' ? [args[i + 1]?.toUpperCase()] : [])).filter(Boolean));

const VISION_MODEL = process.env.VISUAL_MODEL || 'gpt-4o';
const SUMMARY_MODEL = process.env.CARD_VISUAL_SUMMARY_MODEL || 'gpt-4o-mini';

const dir = factsDir();
const have = assetsWithFacts(dir);
let targets = cardsNeedingFacts(FULL_CARD_INDEX, have);
if (only.size > 0) targets = targets.filter((c) => only.has(c.asset.toUpperCase()));
const skipped = targets.filter((c) => !imageForVisualAnalysis(c));
targets = targets.filter((c) => imageForVisualAnalysis(c)).slice(0, limit);

console.log(`facts on file ${have.size} · live cards ${FULL_CARD_INDEX.filter((c) => !c.retired).length} · to look at ${targets.length}${Number.isFinite(limit) ? ` (limit ${limit})` : ''}`);
for (const c of targets) console.log(`  ${c.asset} S${c.series} C${c.card} ${c.ext} ← ${imageForVisualAnalysis(c)}`);
if (skipped.length > 0) console.log(`no still image, cannot look: ${skipped.map((c) => c.asset).join(', ')}`);

if (targets.length === 0) { console.log('nothing to do'); process.exit(0); }
if (dryRun) { console.log('(dry run: nothing called, nothing written)'); process.exit(0); }
if (!process.env.OPENAI_API_KEY) { console.log('OPENAI_API_KEY is not set; leaving these for a run that has it'); process.exit(0); }

const openai = new OpenAI();
// The gateway wants a runtime for telemetry; there is none here.
const noRuntime: any = { getService: () => null };

async function summarise(asset: string, visualSummary: string, textOnCard: string[]): Promise<VisualSummary | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
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
            'Respond with strict JSON.',
        },
        { role: 'user', content: JSON.stringify({ asset, visualSummary, textOnCard }, null, 2) },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k: unknown) => (typeof k === 'string' ? k.trim().toLowerCase() : '')).filter(Boolean).slice(0, 24)
      : [];
    return { summary: parsed.summary.trim(), keywords };
  } catch (error) {
    console.warn(`  summary failed for ${asset}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

mkdirSync(dir, { recursive: true });
const written = [];
const failed: string[] = [];
let tokens = 0;

/** The first candidate image the model accepts and describes; the last error otherwise. */
async function look(card: (typeof targets)[number]) {
  let lastError: unknown = new Error('no image');
  for (const imageUrl of imageCandidatesForVisualAnalysis(card)) {
    try {
      const seen = await callVisionModel(noRuntime, {
        model: VISION_MODEL,
        prompt: CARD_ANALYSIS_PROMPT,
        imageUrl,
        detail: 'high',
        temperature: 0.7,
        maxTokens: 800,
        source: 'fv-backfill',
      });
      tokens += seen.tokensIn + seen.tokensOut;
      const fact = factFromAnalysis(card, seen.text);
      if (!fact.analysis.sections.visualBreakdown.content) {
        throw new Error(`no VISUAL BREAKDOWN section in the answer: "${seen.text.replace(/\s+/g, ' ').slice(0, 120)}"`);
      }
      return { fact, imageUrl };
    } catch (error) {
      lastError = error;
      console.warn(`  · ${card.asset} via ${imageUrl}: ${error instanceof Error ? error.message.slice(0, 90) : String(error)}`);
    }
  }
  throw lastError;
}

for (const card of targets) {
  try {
    const { fact } = await look(card);
    const draft = memoryFromFact(fact, card, null);
    const summary = await summarise(card.asset, draft.visualSummary, draft.textOnCard);
    const memory = memoryFromFact(fact, card, summary);
    writeFileSync(join(dir, `${memory.asset}.json`), JSON.stringify(memory, null, 2) + '\n', 'utf8');
    written.push(memory);
    console.log(`  ✓ ${card.asset}: ${memory.visualSummaryShort.slice(0, 90)}…  [${memory.visualKeywords.slice(0, 5).join(', ')}]`);
  } catch (error) {
    failed.push(card.asset);
    console.warn(`  ✗ ${card.asset}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}

if (written.length > 0) {
  const path = traitsPath();
  const existing = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, string[]>) : {};
  const merged = mergeTraits(existing, written);
  writeFileSync(path, JSON.stringify(merged), 'utf8');
  console.log(`traits: ${Object.keys(existing).length} → ${Object.keys(merged).length} cards`);
}

console.log(`\nlooked at ${written.length} of ${targets.length}${failed.length ? ` · failed ${failed.join(', ')}` : ''} · ${tokens} vision tokens`);
process.exit(failed.length > 0 && written.length === 0 ? 1 : 0);

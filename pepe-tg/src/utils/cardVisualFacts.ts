/**
 * Card visual facts: what the vision pass saw on each card, kept in the repo.
 *
 * The pass ran once, by hand, in August 2026 - five scripts and a tmp/ folder -
 * and 39 live cards were never looked at: the newest Series 18, the cards the
 * directory added, and ten MP4s that had no still to show the model. This
 * module is the one implementation behind three callers:
 *
 *   scripts/fv-backfill.ts       looks at every live card with no fact file,
 *                                writes src/data/card-visual-facts/<ASSET>.json
 *                                and refreshes card-visual-traits.json
 *   CardFactsImportService       at boot, puts any committed fact not yet in
 *                                this environment's database into knowledge
 *   scripts/import-card-visual-facts.ts   the by-hand importer, same ids
 *
 * The fact files are the source of truth; the database is a per-environment
 * copy (PGlite allows one process, so nothing can write prod's database from
 * outside the running bot). Memory ids are deterministic - uuidv5 of
 * "<ASSET>::<block id>" - so re-importing is a no-op, and the ids match what
 * the original import wrote.
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { v5 as uuidv5 } from 'uuid';
import type { CardInfo } from '../data/fullCardIndex';
import type { CardVisualFact, CardVisualFactSections, CardVisualMemory } from '../types/cardVisualFacts';
import { getFakeRaresImageUrl, isOldSiteUrl } from './cardUrlUtils';
import type { MediaExtension } from '../types/media';

export const FACT_VERSION = 1;
export const MEMORY_VERSION = 1;
const UUID_NAMESPACE = '8dd9f06f-59a9-4fed-9cb4-5cb9184160a3';

export function factsDir(): string {
  return process.env.CARD_VISUAL_FACTS_DIR || join(process.cwd(), 'src', 'data', 'card-visual-facts');
}

export function traitsPath(): string {
  return join(process.cwd(), 'src', 'data', 'card-visual-traits.json');
}

/** The prompt the /fv command used; the fact files are parsed by its headings. */
export const CARD_ANALYSIS_PROMPT = `You are analyzing a Fake Rares NFT card for memetic and visual content.

Provide a comprehensive analysis in this format:

📝 **TEXT ON CARD:**
[Extract and transcribe ALL visible text on the card - card name, messages, artist signatures, any other text. Do not include the card series or supply details. No more than 2 sentences. IMPORTANT: If there is NO visible text on the card, skip this entire section including the title.]

🎨 **VISUAL BREAKDOWN:**
[Describe the composition, color palette, artistic style, and visual elements in 2-3 sentences. Be specific and descriptive.]

🧬 **MEMETIC DNA:**
[Identify meme references, crypto/NFT culture elements, Pepe lore, and cultural symbols. Use bullet points.]

🎯 **RARITY FEELS:**
[First sentence: What's the emotional/cultural energy of this card? Use crypto-native language like "degen energy", "hopium", "based", "dark", "gm vibes", etc.]
[Second sentence: Based purely on visual presentation, how rare does this FEEL? Not asking about actual supply/rarity stats, just the visual impression.]

Keep your tone casual, crypto-native, and insightful. Be funny but accurate. Use emojis naturally.`;

// ---------------------------------------------------------------------------
// Which cards, and which image
// ---------------------------------------------------------------------------

/** Assets with a committed fact file, upper-cased. */
export function assetsWithFacts(dir = factsDir()): Set<string> {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/i, '').toUpperCase()),
  );
}

/** Live cards the vision pass has not seen. */
export function cardsNeedingFacts(cards: CardInfo[], have: Set<string>): CardInfo[] {
  return cards.filter((c) => !c.retired && !have.has(c.asset.toUpperCase()));
}

const STILL_EXT = /\.(jpe?g|png|gif|webp)(\?|$)/i;

/**
 * Still images the vision model can be shown, best first. The caller tries
 * them in order: the model refuses a file over 20MB (a third of the cards
 * the first pass missed are big GIFs) and some hosts are gone, and the
 * directory's optimized thumbnail is small and always there.
 *
 * An MP4 card needs the scraped still (memeUri) or the directory's image or
 * thumbnail - this is what kept ten MP4 cards out of the first pass. An
 * old-site override is dead and is never offered.
 */
export function imageCandidatesForVisualAnalysis(card: CardInfo): string[] {
  const dir = card.directory;
  const out: Array<string | null | undefined> = [];
  if (card.ext === 'mp4') {
    out.push(card.memeUri);
  } else if (card.imageUri) {
    if (!isOldSiteUrl(card.imageUri)) out.push(card.imageUri);
  } else {
    out.push(getFakeRaresImageUrl(card.asset, card.series, card.ext as MediaExtension));
  }
  out.push(dir?.image, dir?.small);
  return [...new Set(out.filter((u): u is string => !!u && STILL_EXT.test(u)))];
}

/** The first candidate, for callers that want one image. */
export function imageForVisualAnalysis(card: CardInfo): string | null {
  return imageCandidatesForVisualAnalysis(card)[0] ?? null;
}

// ---------------------------------------------------------------------------
// From the model's answer to a fact, and from a fact to a memory
// ---------------------------------------------------------------------------

function section(heading: string, regex: RegExp, analysis: string) {
  const match = analysis.match(regex);
  const content = match ? match[1].trim() : null;
  return { heading, content: content && content.length > 0 ? content : null };
}

export function stripRarityFeels(analysis: string): string {
  return analysis.replace(/\r\n/g, '\n').replace(/\n\n🎯 \*\*RARITY FEELS:\*\*\n[\s\S]*$/, '').trimEnd();
}

export function extractSections(analysis: string): CardVisualFactSections {
  return {
    textOnCard: section('TEXT ON CARD', /📝 \*\*TEXT ON CARD:\*\*\n([\s\S]*?)(?=\n\n(?:🎨|🧬|🎯)|$)/, analysis),
    visualBreakdown: section('VISUAL BREAKDOWN', /🎨 \*\*VISUAL BREAKDOWN:\*\*\n([\s\S]*?)(?=\n\n(?:🧬|🎯)|$)/, analysis),
    memeticDna: section('MEMETIC DNA', /🧬 \*\*MEMETIC DNA:\*\*\n([\s\S]*?)(?=\n\n🎯|$)/, analysis),
  };
}

export function factFromAnalysis(card: CardInfo, analysis: string): CardVisualFact {
  const normalized = stripRarityFeels(analysis);
  return {
    version: FACT_VERSION,
    card: {
      asset: card.asset,
      series: card.series ?? null,
      cardNumber: card.card ?? null,
      artist: card.artist ?? null,
      supply: card.supply ?? null,
      issuance: card.issuance ?? null,
      collection: 'Fake Rares', // the label the first pass wrote; the index's slug is not it
    },
    analysis: { raw: normalized.trim(), sections: extractSections(normalized) },
  };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under', 'your', 'their', 'them',
  'have', 'without', 'about', 'through', 'being', 'which', 'such', 'also', 'here', 'there', 'very', 'much',
  'more', 'most', 'some', 'many', 'card', 'cards', 'fake', 'rares', 'rare', 'pepe', 'frog',
]);

function sanitizeList(content: string | null): string[] {
  if (!content) return [];
  return content
    .split(/\r?\n|[/|]/)
    .map((line) => line.replace(/^[-•\s]+/, '').trim().replace(/\s{2,}/g, ' '))
    .filter((line) => line.length > 0);
}

export function tokenizeForKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function embeddingInputFor(m: Omit<CardVisualMemory, 'embeddingInput' | 'embeddingBlocks' | 'generatedAt'>): string {
  const lines = [`${m.asset} (${m.collection ?? 'Unknown collection'}) - Series ${m.series ?? '?'} Card ${m.cardNumber ?? '?'}`];
  if (m.artist) lines.push(`Artist: ${m.artist}`);
  if (m.supply !== null || m.issuance) {
    lines.push([m.supply !== null ? `Supply ${m.supply}` : null, m.issuance ? `Issued ${m.issuance}` : null].filter(Boolean).join(' '));
  }
  lines.push(m.textOnCard.length > 0 ? `On-card text: ${m.textOnCard.join(' | ')}` : 'On-card text: none detected');
  lines.push(`Visual summary: ${m.visualSummary || 'n/a'}`);
  lines.push(m.memeticReferences.length > 0 ? `Memetic references: ${m.memeticReferences.join('; ')}` : 'Memetic references: none captured');
  return lines.join('\n').trim();
}

export interface VisualSummary {
  summary: string;
  keywords: string[];
}

/**
 * The merged memory the original pipeline produced in two steps (merge, then
 * summarise). `summary` is the second model's two sentences and up to ten
 * keywords; without it the visual breakdown stands in, as the old script's
 * fallback did.
 */
export function memoryFromFact(fact: CardVisualFact, card: CardInfo | undefined, summary: VisualSummary | null): CardVisualMemory {
  const asset = fact.card.asset.toUpperCase();
  const textOnCard = sanitizeList(fact.analysis.sections.textOnCard?.content ?? null);
  const memeticReferences = sanitizeList(fact.analysis.sections.memeticDna?.content ?? null);
  const visualSummary = fact.analysis.sections.visualBreakdown?.content ?? '';

  const textKeywords = [...new Set(textOnCard.flatMap(tokenizeForKeywords))].slice(0, 30);
  const visualKeywords = summary?.keywords.length
    ? summary.keywords
    : [...new Set(tokenizeForKeywords(visualSummary).slice(0, 40))].slice(0, 10);
  const keywords = [...new Set([...visualKeywords, ...textKeywords])].slice(0, 60);

  const base = {
    version: MEMORY_VERSION,
    asset,
    collection: fact.card.collection ?? 'Fake Rares',
    series: fact.card.series ?? card?.series ?? null,
    cardNumber: fact.card.cardNumber ?? card?.card ?? null,
    artist: fact.card.artist ?? card?.artist ?? null,
    supply: fact.card.supply ?? card?.supply ?? null,
    issuance: fact.card.issuance ?? card?.issuance ?? null,
    textOnCard,
    memeticReferences,
    visualSummary,
    visualSummaryShort: summary?.summary?.trim() || visualSummary.trim(),
    visualKeywords,
    textKeywords,
    keywords,
    sourceFactVersion: fact.version ?? FACT_VERSION,
  };

  const embeddingBlocks: CardVisualMemory['embeddingBlocks'] = [];
  if (textOnCard.length > 0) embeddingBlocks.push({ id: `${asset}#text`, label: 'On-card text', text: textOnCard.join(' | '), priority: 100, type: 'text' });
  if (memeticReferences.length > 0) embeddingBlocks.push({ id: `${asset}#memetic`, label: 'Memetic references', text: memeticReferences.join('\n'), priority: 80, type: 'memetic' });
  if (visualSummary.trim()) embeddingBlocks.push({ id: `${asset}#visual`, label: 'Visual summary', text: visualSummary, priority: 60, type: 'visual' });
  if (fact.analysis.raw?.trim()) embeddingBlocks.push({ id: `${asset}#raw`, label: 'Raw /fv analysis', text: fact.analysis.raw.trim(), priority: 40, type: 'raw' });

  return { ...base, embeddingInput: embeddingInputFor(base), embeddingBlocks, generatedAt: new Date().toISOString() };
}

export function readFactFiles(dir = factsDir()): CardVisualMemory[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as CardVisualMemory);
}

/** The trait index, with these memories' keywords added; existing entries are kept as they are. */
export function mergeTraits(existing: Record<string, string[]>, memories: CardVisualMemory[]): Record<string, string[]> {
  const out = { ...existing };
  for (const m of memories) {
    const set = new Set(out[m.asset.toUpperCase()] ?? []);
    for (const kw of m.keywords ?? []) {
      const k = String(kw).toLowerCase().trim();
      if (k) set.add(k);
    }
    out[m.asset.toUpperCase()] = [...set].sort();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Into knowledge: the same memories the original import wrote
// ---------------------------------------------------------------------------

export type ImportBlock = CardVisualMemory['embeddingBlocks'][number];

export function memoryIdFor(asset: string, blockId: string): string {
  return uuidv5(`${asset.toUpperCase()}::${blockId}`, UUID_NAMESPACE);
}

/** The combined block first, as the original embedding pass ordered them. */
export function blocksToImport(m: CardVisualMemory): ImportBlock[] {
  const combined: ImportBlock = { id: `${m.asset}#combined`, label: 'Combined card fact', text: m.embeddingInput, priority: 120, type: 'combined' };
  return [combined, ...m.embeddingBlocks].filter((b) => b.text && b.text.trim().length > 0);
}

export function memoryTextFor(m: CardVisualMemory, block: ImportBlock): string {
  const parts = [`[CARD:${m.asset}] [CARD_FACT:${(block.label || block.id).toUpperCase()}]`];
  if (m.collection) parts.push(`Collection: ${m.collection}`);
  const detail = [m.series !== null ? `Series ${m.series}` : null, m.cardNumber !== null ? `Card ${m.cardNumber}` : null, m.artist ? `by ${m.artist}` : null]
    .filter(Boolean)
    .join(' • ');
  if (detail) parts.push(detail);
  parts.push('', block.text.trim());
  if (m.keywords?.length) parts.push('', `Keywords: ${m.keywords.join(', ')}`);
  if (m.memeticReferences?.length && block.id.endsWith('#combined')) parts.push('', `Memetic references: ${m.memeticReferences.join('; ')}`);
  return parts.join('\n').trim();
}

/** A knowledge memory for one block, without its embedding. Shape matches the original import. */
export function knowledgeMemoryFor(agentId: string, m: CardVisualMemory, block: ImportBlock, position: number) {
  const visualSummaryShort = m.visualSummaryShort?.trim() ? m.visualSummaryShort : m.visualSummary;
  const visualKeywords = Array.isArray(m.visualKeywords) ? m.visualKeywords : [];
  const textKeywords = Array.isArray(m.textKeywords) ? m.textKeywords : [];
  const blockType = block.id.split('#')[1] ?? 'unknown';
  return {
    id: memoryIdFor(m.asset, block.id),
    agentId,
    roomId: agentId,
    entityId: agentId,
    worldId: agentId,
    createdAt: Date.now(),
    content: {
      text: memoryTextFor(m, block),
      data: {
        cardAsset: m.asset,
        blockId: block.id,
        blockType,
        blockPriority: block.priority,
        sourceFactVersion: m.sourceFactVersion,
        combinedHash: createHash('sha1').update(block.text.trim()).digest('hex'),
        visualSummary: m.visualSummary,
        visualSummaryShort,
        visualKeywords,
        textKeywords,
        textOnCard: m.textOnCard,
      },
    },
    metadata: {
      type: 'fragment',
      source: 'card-visual',
      asset: m.asset,
      collection: m.collection,
      documentId: `${m.asset}#card-visual`,
      position,
      series: m.series,
      cardNumber: m.cardNumber,
      artist: m.artist,
      supply: m.supply,
      issuance: m.issuance,
      blockId: block.id,
      blockLabel: block.label,
      blockPriority: block.priority,
      blockType,
      keywords: m.keywords,
      visualKeywords,
      textKeywords,
      visualSummary: m.visualSummary,
      visualSummaryShort,
      textOnCard: m.textOnCard,
      generatedAt: m.generatedAt,
      sourceFactVersion: m.sourceFactVersion,
      timestamp: Date.now(),
    },
  };
}

/**
 * Put every committed fact this database lacks into knowledge. The combined
 * block's id is the presence check - one lookup per card - so a boot with
 * nothing new costs ~900 point reads and no embeddings. Returns what it did.
 */
export async function importMissingFacts(
  runtime: {
    agentId: string;
    getMemoryById: (id: any) => Promise<unknown>;
    addEmbeddingToMemory: (memory: any) => Promise<unknown>;
    createMemory: (memory: any, table: string, unique?: boolean) => Promise<unknown>;
  },
  memories: CardVisualMemory[],
  options: { pauseMs?: number; log?: (line: string) => void } = {},
): Promise<{ cards: number; blocks: number; failed: string[] }> {
  const result = { cards: 0, blocks: 0, failed: [] as string[] };
  for (const m of memories) {
    const blocks = blocksToImport(m);
    if (blocks.length === 0) continue;
    try {
      if (await runtime.getMemoryById(memoryIdFor(m.asset, blocks[0].id))) continue;
      for (let i = 0; i < blocks.length; i++) {
        const memory = knowledgeMemoryFor(runtime.agentId, m, blocks[i], i);
        await runtime.addEmbeddingToMemory(memory);
        await runtime.createMemory(memory, 'knowledge', true);
        result.blocks++;
      }
      result.cards++;
      options.log?.(`imported ${m.asset} (${blocks.length} blocks)`);
      if (options.pauseMs) await new Promise((r) => setTimeout(r, options.pauseMs));
    } catch (error) {
      result.failed.push(m.asset);
      options.log?.(`failed ${m.asset}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

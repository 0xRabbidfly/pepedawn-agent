/**
 * Pepe meme GIFs: the half that talks to the world. See memeGif.ts for the
 * design and the rules; this does the calls, in order:
 *
 *   1. a card menu - cards named in the conversation, a random handful with
 *      what the vision pass saw on them, and a couple of icons
 *   2. the concept, from a small model that has read the conversation
 *   3. one gpt-image-1 frame of Pepe
 *   4. the real cards, fetched small and pasted on as tilted stickers (sharp)
 *   5. motion and captions (ffmpeg, bounded, in a temp dir that is removed)
 *
 * Sized for the droplet, which has 2GB of RAM with the bot using most of
 * it: a 512px still, 45 frames at 480px, ffmpeg capped at 1.5GB of address
 * space and 60 seconds, card images refused over 8MB and the smallest copy
 * of each card tried first. Any failure returns null and the caller falls
 * back to words.
 */

import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { logger, type IAgentRuntime } from '@elizaos/core';
import type { CardInfo } from '../data/fullCardIndex';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';
import { getFullCardIndex } from './cardIndexRefresher';
import { imageCandidatesForVisualAnalysis, readFactFiles } from './cardVisualFacts';
import { callTextModel } from './modelGateway';
import { getSharp } from './recapRender';
import {
  STILL_SIZE,
  buildConceptPrompt,
  buildFfmpegArgs,
  buildImagePrompt,
  imageCostUsd,
  parseConcept,
  slotPosition,
  wrapCaption,
  type CaptionFile,
  type CardMenuItem,
  type ConceptInput,
  type GifConcept,
  type GifConfig,
} from './memeGif';

const MAX_CARD_BYTES = 8 * 1024 * 1024;

function liveIndex(): CardInfo[] {
  const live = getFullCardIndex();
  return (live.length > 0 ? live : FULL_CARD_INDEX).filter((c) => !c.retired);
}

let looks: Map<string, string> | null = null;
/** What the vision pass saw on each card, one line each. Read once. */
function cardLooks(): Map<string, string> {
  if (looks) return looks;
  looks = new Map();
  try {
    for (const m of readFactFiles()) looks.set(m.asset.toUpperCase(), (m.visualSummaryShort || m.visualSummary || '').replace(/\s+/g, ' ').trim());
  } catch (error) {
    logger.warn({ error }, '[GIF] could not read the card facts; the menu will have names only');
  }
  return looks;
}

/** Cards named in the text, by exact ALLCAPS asset name. */
export function cardsNamedIn(text: string, index: CardInfo[]): string[] {
  const names = new Set(index.map((c) => c.asset.toUpperCase()));
  const out: string[] = [];
  for (const w of (text || '').toUpperCase().match(/\b[A-Z][A-Z0-9.]{3,}\b/g) ?? []) {
    if (names.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * Named cards first, then a random handful - about thirty in all. No forced
 * icons: with FREEDOMKEK always on the menu, the first trials put it in every
 * GIF whether or not it was funny.
 */
export function buildCardMenu(conversationText: string, rng: () => number = Math.random, size = 30): CardMenuItem[] {
  const index = liveIndex();
  const byAsset = new Map(index.map((c) => [c.asset.toUpperCase(), c]));
  const picked: string[] = [];
  for (const a of cardsNamedIn(conversationText, index)) if (byAsset.has(a) && !picked.includes(a)) picked.push(a);
  const pool = index.map((c) => c.asset.toUpperCase()).filter((a) => !picked.includes(a));
  while (picked.length < size && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const seen = cardLooks();
  return picked.map((a) => {
    const c = byAsset.get(a)!;
    return { asset: c.asset.toUpperCase(), series: c.series, card: c.card, artist: c.artist, look: seen.get(a) };
  });
}

async function fetchCapped(url: string, maxBytes = MAX_CARD_BYTES, timeoutMs = 15_000): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) return null;
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) { controller.abort(); return null; }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > maxBytes) { controller.abort(); return null; }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The card as a small tilted sticker with a white border, PNG with transparency. */
async function cardSticker(card: CardInfo, width: number, tilt: number): Promise<{ png: Buffer; w: number; h: number } | null> {
  const sharp = await getSharp();
  // The directory's optimized copy is tens of kilobytes; the full images run
  // to 70MB. Smallest first.
  const urls = [card.directory?.small, ...imageCandidatesForVisualAnalysis(card)].filter((u): u is string => !!u);
  for (const url of [...new Set(urls)]) {
    const bytes = await fetchCapped(url);
    if (!bytes) continue;
    try {
      const png = await sharp(bytes, { pages: 1, limitInputPixels: 40_000_000 })
        .resize({ width, withoutEnlargement: false })
        .extend({ top: 5, bottom: 5, left: 5, right: 5, background: '#ffffff' })
        .rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const meta = await sharp(png).metadata();
      return { png, w: meta.width ?? width, h: meta.height ?? width };
    } catch {
      continue;
    }
  }
  return null;
}

async function generatePepe(scene: string, quality: GifConfig['quality']): Promise<{ png: Buffer; cost: number } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: buildImagePrompt(scene), size: '1024x1024', quality, n: 1 }),
    });
    const body: any = await res.json().catch(() => null);
    const b64 = body?.data?.[0]?.b64_json;
    if (!b64) {
      logger.warn(`[GIF] image refused or failed: ${JSON.stringify(body?.error ?? body).slice(0, 200)}`);
      return null;
    }
    return { png: Buffer.from(b64, 'base64'), cost: imageCostUsd(body.usage) };
  } catch (error) {
    logger.warn({ error }, '[GIF] image request failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function runFfmpegBounded(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    // The cap and the timeout are the shell's, so they hold whatever the
    // filtergraph does. "$@" keeps every argument intact.
    // MALLOC_ARENA_MAX keeps glibc from reserving an arena per core, which
    // the address-space cap would count: on a 16-core dev box the H.264
    // decoder was refused at 1.5GB for reservations, not use.
    const p = spawn('bash', ['-c', 'export MALLOC_ARENA_MAX=2; ulimit -v 1500000; exec timeout 60 ffmpeg "$@"', 'ffmpeg-bounded', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (c: Buffer) => { if (err.length < 2000) err += c.toString(); });
    p.on('error', () => resolve(false));
    p.on('close', (code) => {
      if (code !== 0) logger.warn(`[GIF] ffmpeg exit ${code}: ${err.slice(0, 300)}`);
      resolve(code === 0);
    });
  });
}

export interface MadeGif {
  mp4: Buffer;
  concept: GifConcept;
  /** Image spend; the concept call logs its own. */
  costUsd: number;
  ms: number;
}

/**
 * Concept → frame → stickers → motion. Null when the concept declined (in
 * choice mode) or anything failed; the reason is logged.
 */
export async function makeMemeGif(
  runtime: IAgentRuntime,
  input: Omit<ConceptInput, 'menu'>,
  config: GifConfig,
): Promise<MadeGif | null> {
  const started = Date.now();
  const convoText = [input.ask, ...input.turns.map((t) => t.text)].join(' ');
  const menu = buildCardMenu(convoText);
  const known = new Set(menu.map((c) => c.asset));

  let concept: GifConcept | null = null;
  try {
    const reply = await callTextModel(runtime, {
      model: config.conceptModel,
      prompt: buildConceptPrompt({ ...input, menu }),
      maxTokens: 1500,
      temperature: 0.9,
      source: 'GIF concept',
    });
    concept = parseConcept(reply.text, known);
  } catch (error) {
    logger.warn({ error }, '[GIF] concept call failed');
    return null;
  }
  if (!concept) { logger.warn('[GIF] concept unusable'); return null; }
  if (!concept.gif) { logger.info('[GIF] the moment was not worth a GIF; words instead'); return null; }
  logger.info({ scene: concept.scene.slice(0, 100), cards: concept.cards.map((c) => c.asset), top: concept.top, bottom: concept.bottom, why: concept.why }, '[GIF] concept');

  const frame = await generatePepe(concept.scene, config.quality);
  if (!frame) return null;

  const dir = mkdtempSync(join(tmpdir(), 'pepedawn-gif-'));
  try {
    const sharp = await getSharp();
    const byAsset = new Map(liveIndex().map((c) => [c.asset.toUpperCase(), c]));
    const layers: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const [i, { asset, slot }] of concept.cards.entries()) {
      const card = byAsset.get(asset);
      if (!card) continue;
      const tilt = (i % 2 === 0 ? -1 : 1) * (4 + Math.round(Math.random() * 6));
      const sticker = await cardSticker(card, 88, tilt);
      if (!sticker) { logger.warn(`[GIF] could not fetch ${asset}; leaving it out`); continue; }
      layers.push({ input: sticker.png, ...slotPosition(slot, sticker.w, sticker.h) });
    }
    const still = join(dir, 'still.png');
    await sharp(frame.png).resize(STILL_SIZE, STILL_SIZE).composite(layers).png().toFile(still);

    const captions: CaptionFile[] = [];
    for (const [band, text] of [['top', concept.top], ['bottom', concept.bottom]] as const) {
      if (!text) continue;
      const lines = wrapCaption(text);
      lines.forEach((line, index) => {
        const path = join(dir, `${band}-${index}.txt`);
        writeFileSync(path, line, 'utf8');
        captions.push({ path, line, band, index, count: lines.length });
      });
    }

    const out = join(dir, 'out.mp4');
    const fontFile = process.env.GIF_FONT || join(process.cwd(), 'src', 'assets', 'fonts', 'Anton-Regular.ttf');
    if (!(await runFfmpegBounded(buildFfmpegArgs({ input: still, output: out, motion: concept.motion, captions, fontFile })))) return null;
    const mp4 = readFileSync(out);

    try {
      const telemetry = runtime.getService?.('telemetry') as any;
      await telemetry?.logModelUsage?.({
        timestamp: new Date().toISOString(),
        model: 'gpt-image-1',
        tokensIn: 0,
        tokensOut: 0,
        cost: frame.cost,
        source: 'GIF',
        duration: Date.now() - started,
      });
    } catch {}

    return { mp4, concept, costUsd: frame.cost, ms: Date.now() - started };
  } catch (error) {
    logger.warn({ error }, '[GIF] compose failed');
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

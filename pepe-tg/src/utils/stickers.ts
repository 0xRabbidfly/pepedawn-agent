/**
 * Stickers, used the way the bot uses emoji.
 *
 * reactions.ts carries the limitation this exists for: "Bot API reactions are
 * a fixed set — anything outside it is rejected with a 400 [...] No frog: 🐸
 * is not a permitted reaction." PEPEDAWN's own face is the one emoji it could
 * never answer with. A sticker can be any picture at all, so a pack built from
 * the community's own art gives back the vocabulary Telegram took away.
 *
 * One difference governs every choice below: a reaction is silent and sits on
 * someone else's message, while a sticker *is* a message — a notification, a
 * place in the scroll, something a person can reply to. So a sticker is rarer
 * than a reaction by an order of magnitude, cooled down per room, and never
 * sent where an exact answer is owed. The rule of thumb is a sticker instead
 * of a reply, never a sticker as well as one.
 *
 * The pack is read from Telegram rather than listed here, so adding a sticker
 * with scripts/make-sticker.ts is enough to put it in PEPEDAWN's mouth; the
 * emoji each sticker carries in the pack is what this matches on.
 */

import { logger } from '@elizaos/core';

export interface StickerConfig {
  /** Off unless a pack is named. */
  enabled: boolean;
  /** The pack's short name, e.g. fakerares_by_pepedawn_bot. */
  pack: string;
  /** Chance of taking the offer, once the cooldown allows one at all. */
  rate: number;
  cooldownMs: number;
}

/**
 * The community pack, made with scripts/make-sticker.ts and owned by
 * @pepedawn_bot. It is the default rather than a required setting on purpose:
 * `.env` is not deployed (docs/PROMOTION.md), so a feature that needed a new
 * variable on the droplet would ship switched off while its WHATS_NEW section
 * announced it to 1,250 people. Each bot reads the pack with its own token, so
 * the file_ids always belong to whoever is about to send one.
 */
export const DEFAULT_PACK = 'fakerares_by_pepedawn_bot';

export function stickerConfig(env: NodeJS.ProcessEnv = process.env): StickerConfig {
  const num = (v: string | undefined, d: number) =>
    v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
  const pack = (env.STICKER_PACK || '').trim() || DEFAULT_PACK;
  return {
    enabled: env.STICKER_ENABLED !== 'false' && !!pack,
    pack,
    // A tenth of the GIF rate. A sticker costs nothing to make, which is
    // exactly why it needs a tighter leash than the things that do.
    rate: Math.max(0, Math.min(1, num(env.STICKER_RATE, 0.06))),
    cooldownMs: num(env.STICKER_COOLDOWN_MIN, 90) * 60_000,
  };
}

export interface PackSticker {
  fileId: string;
  /** The emoji the pack itself files this sticker under. */
  emoji: string;
}

// ---------------------------------------------------------------------------
// The pack, as Telegram holds it
// ---------------------------------------------------------------------------

/** Long enough that a boot costs one call; short enough that a new sticker lands the same day. */
export const PACK_TTL_MS = 6 * 60 * 60 * 1000;

let packCache: { name: string; at: number; stickers: PackSticker[] } | null = null;

export function resetPackCache(): void {
  packCache = null;
}

/**
 * The pack's stickers, cached. An empty list is a valid answer and the only
 * one on failure: a pack that cannot be read must leave the bot exactly as it
 * was, never turn into an error in the room.
 */
export async function loadPack(token: string, name: string, now = Date.now()): Promise<PackSticker[]> {
  if (!token || !name) return [];
  if (packCache && packCache.name === name && now - packCache.at < PACK_TTL_MS) return packCache.stickers;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getStickerSet?name=${encodeURIComponent(name)}`);
    const body: any = await res.json().catch(() => null);
    if (!body?.ok) {
      logger.warn(`[Stickers] cannot read pack ${name}: ${String(body?.description ?? res.status).slice(0, 120)}`);
      packCache = { name, at: now, stickers: [] };
      return [];
    }
    const stickers: PackSticker[] = (body.result?.stickers ?? [])
      .map((s: any) => ({ fileId: s.file_id as string, emoji: (s.emoji as string) || '' }))
      .filter((s: PackSticker) => !!s.fileId);
    packCache = { name, at: now, stickers };
    logger.info(`[Stickers] pack ${name}: ${stickers.length} stickers (${[...new Set(stickers.map((s) => s.emoji))].join(' ')})`);
    return stickers;
  } catch (error) {
    logger.warn({ error }, '[Stickers] pack fetch failed');
    packCache = { name, at: now, stickers: [] };
    return [];
  }
}

// ---------------------------------------------------------------------------
// Which one
// ---------------------------------------------------------------------------

/**
 * What a post is about, in the emoji the pack files its stickers under. This
 * names emoji the pack may not have; a miss falls through to the whole pack,
 * so the mapping never has to be kept in step with what has been drawn.
 */
export const STICKER_KEYWORDS: Array<{ pattern: RegExp; emoji: string }> = [
  { pattern: /\b(birthday|anniversar\w*|\d+ ?years?|cake|congrats)\b/i, emoji: '🎂' },
  { pattern: /\b(based|drip|fit|clean|sharp|cool|slick)\b/i, emoji: '🕶️' },
  { pattern: /\b(gm|good morning|fam|frog|pepe|fake ?rare|wagmi)\b/i, emoji: '🐸' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * A sticker that fits the post. Keyed off the text so the same post always
 * gets the same sticker — the room reads a repeat as a catchphrase, and a
 * reroll on every retry as a glitch.
 */
export function stickerFor(text: string, pack: PackSticker[]): PackSticker | undefined {
  if (pack.length === 0) return undefined;
  const seed = hashString(text || `${Date.now()}`);
  for (const entry of STICKER_KEYWORDS) {
    if (!entry.pattern.test(text || '')) continue;
    const fitting = pack.filter((s) => s.emoji === entry.emoji);
    if (fitting.length > 0) return fitting[seed % fitting.length];
  }
  return pack[seed % pack.length];
}

// ---------------------------------------------------------------------------
// How often
// ---------------------------------------------------------------------------

const lastStickerAt = new Map<string, number>();

export function resetStickerCooldowns(): void {
  lastStickerAt.clear();
}

/** May this room have a sticker now? Does not record the grant; markStickerPosted does. */
export function mayPostSticker(
  roomId: string,
  config: StickerConfig,
  now = Date.now(),
  rng: () => number = Math.random,
): boolean {
  if (!config.enabled) return false;
  const last = lastStickerAt.get(roomId);
  if (last !== undefined && now - last < config.cooldownMs) return false;
  return rng() < config.rate;
}

export function markStickerPosted(roomId: string, now = Date.now()): void {
  lastStickerAt.set(roomId, now);
}

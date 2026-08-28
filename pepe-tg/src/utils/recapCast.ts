/**
 * Casting: every frog in the room gets played by a Fake Rare.
 *
 * The joke only works if it is stable — @dispenser_goblin has to be the same
 * card tomorrow, or nobody becomes a character. So the card is a pure function
 * of the handle, not a draw. Two people can share a card; with 500-odd usable
 * cards and a channel this size that is rare enough to be funny rather than
 * confusing.
 *
 * Only cards with a still image can be cast. A quarter of the index is gif and
 * mp4, which sharp cannot composite into a panel without a decode pass that
 * costs more than the whole strip.
 */

import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';

export interface CastCard {
  asset: string;
  series: number;
  ext: string;
  artist: string;
  url: string;
}

const STILL = new Set(['jpg', 'jpeg', 'png']);
const BASE = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

let pool: CastCard[] | null = null;

export function castingPool(): CastCard[] {
  if (pool) return pool;
  pool = (FULL_CARD_INDEX as CardInfo[])
    .filter((c) => STILL.has(String(c.ext || '').toLowerCase()) && c.artist)
    .map((c) => ({
      asset: c.asset,
      series: c.series,
      ext: c.ext,
      artist: c.artist as string,
      url: `${BASE}/${c.series}/${c.asset}.${c.ext}`,
    }))
    .sort((a, b) => a.asset.localeCompare(b.asset));
  return pool!;
}

/** FNV-1a. Small, stable across processes, and not a security boundary. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The card that plays this handle.
 *
 * `avoid` keeps two people in the same strip from being played by the same
 * card — the one place where a collision actually reads as a mistake.
 */
export function castFor(handle: string, avoid: Set<string> = new Set()): CastCard {
  const cards = castingPool();
  const key = handle.toLowerCase().replace(/^@/, '').trim();
  const start = hash(key) % cards.length;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[(start + i) % cards.length];
    if (!avoid.has(card.asset)) return card;
  }
  return cards[start];
}

/** PEPEDAWN plays itself, when the index has it as a still. */
export function castForBot(avoid: Set<string> = new Set()): CastCard {
  const self = castingPool().find((c) => c.asset === 'PEPEDAWN');
  return self && !avoid.has(self.asset) ? self : castFor('pepedawn-the-bot', avoid);
}

export function _resetPool(): void {
  pool = null;
}

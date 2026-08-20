/**
 * One index across all three collections.
 *
 * The card indexes are per-collection — Fake Rares, Fake Commons, Rare Pepes —
 * and every structured lookup was wired to the Fake Rares one alone. That is
 * how "who created djpepe?" was answered "rabbidfly": DJPEPE is a Rare Pepe,
 * series 4, by Rare Scrilla, and the Fake Rares index simply does not contain
 * it, so the lookup fell through to whatever else the sentence matched.
 *
 * The three files carry the same shape with different optional-ness, so this
 * flattens them to the fields every lookup actually reads, plus the collection
 * the card came from — series numbering restarts per collection, so a series
 * number without its collection is not an answer.
 *
 * Asset names do not collide across collections (verified over all 4,484: zero
 * duplicates), so a single map by name is unambiguous. Should that ever change,
 * `COLLECTION_ORDER` decides, and this bot is a Fake Rares bot first.
 */

import { FULL_CARD_INDEX } from './fullCardIndex';
import { COMMONS_CARD_INDEX } from './fakeCommonsIndex';
import { RARE_PEPES_CARD_INDEX } from './rarePepesIndex';

export type Collection = 'fake-rares' | 'fake-commons' | 'rare-pepes';

/** How each collection is named in a sentence the bot says out loud. */
export const COLLECTION_LABEL: Record<Collection, string> = {
  'fake-rares': 'Fake Rares',
  'fake-commons': 'Fake Commons',
  'rare-pepes': 'Rare Pepes',
};

/** Precedence when a name somehow exists in more than one collection. */
const COLLECTION_ORDER: Collection[] = ['fake-rares', 'fake-commons', 'rare-pepes'];

export interface AnyCardInfo {
  asset: string;
  series: number;
  card: number;
  artist: string | null;
  supply: number | null;
  issuance?: string | null;
  collection: Collection;
}

function flatten(cards: readonly any[], collection: Collection): AnyCardInfo[] {
  return cards
    .filter((c) => c?.asset)
    .map((c) => ({
      asset: String(c.asset),
      series: c.series,
      card: c.card,
      artist: c.artist ?? null,
      supply: typeof c.supply === 'number' ? c.supply : null,
      issuance: c.issuance ?? null,
      collection,
    }));
}

export const ALL_CARDS: AnyCardInfo[] = [
  ...flatten(FULL_CARD_INDEX, 'fake-rares'),
  ...flatten(COMMONS_CARD_INDEX, 'fake-commons'),
  ...flatten(RARE_PEPES_CARD_INDEX, 'rare-pepes'),
];

export const ALL_CARDS_MAP: Record<string, AnyCardInfo> = (() => {
  const map: Record<string, AnyCardInfo> = {};
  for (const card of ALL_CARDS) {
    const key = card.asset.toUpperCase();
    const held = map[key];
    if (
      !held ||
      COLLECTION_ORDER.indexOf(card.collection) < COLLECTION_ORDER.indexOf(held.collection)
    ) {
      map[key] = card;
    }
  }
  return map;
})();

/** Look a card up by name in any collection. */
export function getAnyCardInfo(asset: string): AnyCardInfo | undefined {
  return ALL_CARDS_MAP[asset.toUpperCase()];
}

/**
 * How to name a card's home when it is not the default one.
 *
 * Fake Rares are the unmarked case — this is a Fake Rares bot and saying so on
 * every answer would be noise. Anything else is worth stating, because "series
 * 4" means a different thing in each collection.
 */
export function collectionSuffix(card: AnyCardInfo): string {
  return card.collection === 'fake-rares' ? '' : ` (${COLLECTION_LABEL[card.collection]})`;
}

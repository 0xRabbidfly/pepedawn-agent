/**
 * Render a card's structured facts as prose.
 *
 * The card index (fake-rares-data.json and friends) holds artist, series, card
 * number, supply and issuance for every asset. None of that is in the vector
 * store, so retrieval alone could answer "tell me about FREEDOMKEK" with
 * whatever thin note happened to be embedded — in one live test, a stub memory
 * reading "FREEDOMKEK is Series 0 Card 1", which is true and useless.
 *
 * This gives the answer real material to work with.
 */

import { getCardInfo, type CardInfo } from '../data/fullCardIndex';

function findCard(asset: string): CardInfo | undefined {
  const upper = asset.toUpperCase();
  const direct = getCardInfo(upper);
  if (direct) return direct;
  // Commons and Rare Pepes live in their own indexes; look them up lazily so a
  // missing data file degrades to "no facts" rather than throwing.
  for (const path of ['../data/fakeCommonsIndex', '../data/rarePepesIndex']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(path);
      const lookup = mod.getCommonsCardInfo ?? mod.getRarePepeInfo ?? mod.getCardInfo;
      const found = typeof lookup === 'function' ? lookup(upper) : undefined;
      if (found) return found;
    } catch {
      // Index not available; keep going.
    }
  }
  return undefined;
}

/** Human phrasing for supply, which is the number people actually care about. */
function describeSupply(supply: number | null | undefined): string | null {
  if (supply === null || supply === undefined) return null;
  if (supply === 1) return 'a 1/1';
  return `supply ${supply}`;
}

/**
 * One or two sentences of real fact about a card, or null when unknown.
 *
 * Deliberately plain: this is grounding material handed to the model, not the
 * final reply, so it states what is true and leaves the voice to the composer.
 */
export function describeCard(asset: string): string | null {
  const card = findCard(asset);
  if (!card) return null;

  const name = card.asset.toUpperCase();
  const bits: string[] = [];

  if (card.artist) bits.push(`by ${card.artist}`);
  if (typeof card.series === 'number' && typeof card.card === 'number') {
    bits.push(`series ${card.series}, card ${card.card}`);
  } else if (typeof card.series === 'number') {
    bits.push(`series ${card.series}`);
  }
  const supply = describeSupply(card.supply);
  if (supply) bits.push(supply);
  if (card.issuance) bits.push(`issued ${card.issuance}`);

  if (bits.length === 0) return null;
  return `${name} — ${bits.join(', ')}.`;
}

/** Structured form, for callers that want to compose their own phrasing. */
export function cardFacts(asset: string): CardInfo | null {
  return findCard(asset) ?? null;
}

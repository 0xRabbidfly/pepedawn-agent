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

import { FULL_CARD_INDEX, getCardInfo, type CardInfo } from '../data/fullCardIndex';
import { COMMONS_CARD_INDEX } from '../data/fakeCommonsIndex';
import { RARE_PEPES_CARD_INDEX } from '../data/rarePepesIndex';

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

/** Which collection a question is about. */
export type Collection = 'fake-rares' | 'fake-commons' | 'rare-pepes';

/**
 * Which collection the wording points at.
 *
 * "What's your favourite fake commons card?" was answered with a Fake Rare,
 * because every pool in this file is the Fake Rares index. Commons and Rare
 * Pepes are separate collections with their own indexes.
 */
export function detectCollection(text: string): Collection {
  if (/\b(fake\s*commons?|commons?)\b/i.test(text)) return 'fake-commons';
  if (/\brare\s*pepes?\b/i.test(text)) return 'rare-pepes';
  return 'fake-rares';
}

function poolFor(collection: Collection): CardInfo[] {
  const index =
    collection === 'fake-commons'
      ? COMMONS_CARD_INDEX
      : collection === 'rare-pepes'
      ? RARE_PEPES_CARD_INDEX
      : FULL_CARD_INDEX;
  const pool = (index as unknown as CardInfo[]).filter((c) => c?.asset);
  // Falling back silently would answer a Commons question with a Fake Rare,
  // which is the bug this exists to prevent - so only fall back if the index is
  // genuinely empty.
  return pool.length > 0 ? pool : FULL_CARD_INDEX.filter((c) => c.asset);
}

/**
 * One card, drawn uniformly at random from the collection.
 *
 * Used for questions of taste. Ranking cards is against the etiquette of this
 * community, so rather than nominating a favourite the bot offers something at
 * random and says why it is worth a look. Drawing here rather than asking the
 * model to choose is also the only source of variety available: gpt-5.6-luna
 * rejects temperature, top_p, presence_penalty and frequency_penalty outright,
 * so identical context produces near-identical answers.
 */
export function randomCard(
  collection: Collection = 'fake-rares',
  constraint?: CardConstraint
): CardInfo | null {
  const pool = constrain(poolFor(collection), constraint);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * What the question asked for beyond "a card".
 *
 * "What is your favourite Memeticx card?" was answered GREENBEANZ by VVD: the
 * draw was uniform over the whole collection and the artist in the question was
 * simply dropped. A constraint someone states has to constrain the answer, or
 * the answer is about a different question than the one asked.
 */
export interface CardConstraint {
  /** Credited names, any of which counts - one person can hold several credits. */
  artists?: string[];
  series?: number;
}

function constrain(pool: CardInfo[], constraint?: CardConstraint): CardInfo[] {
  if (!constraint) return pool;
  let filtered = pool;
  if (constraint.artists && constraint.artists.length > 0) {
    const wanted = new Set(constraint.artists.map((a) => a.toLowerCase()));
    filtered = filtered.filter((c) => c.artist && wanted.has(c.artist.toLowerCase()));
  }
  if (typeof constraint.series === 'number') {
    filtered = filtered.filter((c) => c.series === constraint.series);
  }
  // Deliberately no fallback to the unconstrained pool: offering a card by
  // someone else is worse than saying there is nothing to offer.
  return filtered;
}

/** Every card in every collection - the widest pool an artist can be found in. */
export const ALL_COLLECTION_CARDS: CardInfo[] = [
  ...FULL_CARD_INDEX,
  ...(COMMONS_CARD_INDEX as unknown as CardInfo[]),
  ...(RARE_PEPES_CARD_INDEX as unknown as CardInfo[]),
].filter((c) => c?.asset);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Artists credited on cards in this pool who are named in the text, longest
 * name first so "Rare Scrilla" wins over a hypothetical "Rare".
 *
 * Matching is on word boundaries, never substrings: an artist called "RC" hides
 * inside "scarcest", which once made "pepenardo's scarcest card" answer about
 * the wrong person entirely.
 *
 * The pool is a parameter because callers mean different things by "artist".
 * Offering someone a card means every collection; artist *statistics* are
 * quoted from the Fake Rares index and say so out loud.
 */
export function artistsIn(text: string, pool: readonly CardInfo[] = ALL_COLLECTION_CARDS): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const card of pool) {
    const artist = card.artist;
    if (!artist || seen.has(artist)) continue;
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(artist)}(?![\\p{L}\\p{N}])`,
      'iu'
    );
    if (pattern.test(text)) {
      seen.add(artist);
      names.push(artist);
    }
  }
  return names.sort((a, b) => b.length - a.length);
}

/**
 * The credited artist a name refers to, or null.
 *
 * People use the short form: "scrilla" for "Rare Scrilla", "pepenardo" for
 * "Pepenardo x Fake Annie". An exact match wins; failing that a whole-word
 * appearance inside exactly one credited name is unambiguous enough to use. Two
 * or more candidates is a guess, and guessing is what put the wrong artist's
 * card in front of someone in the first place.
 */
export function resolveArtist(name: string): string[] {
  const wanted = name.trim().toLowerCase();
  if (wanted.length < 3) return [];

  const credited = new Set<string>();
  for (const card of ALL_COLLECTION_CARDS) {
    if (card.artist) credited.add(card.artist);
  }

  for (const artist of credited) {
    if (artist.toLowerCase() === wanted) return [artist];
  }

  const word = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(wanted)}(?![\\p{L}\\p{N}])`, 'iu');
  const partial = [...credited].filter((a) => word.test(a));
  // A handful of credits is one person under collaboration names; a long list
  // is a word that happens to appear in a lot of them, and that is a guess.
  return partial.length <= MAX_CREDITS_FOR_ONE_NAME ? partial : [];
}

/**
 * How many credited names a short form may expand to before it is too vague.
 *
 * Collaboration credits mean one person holds several: "scrilla" is Rare
 * Scrilla, DJ Q-Bert x Rare Scrilla, Rare Scrilla and Ghostface Killah, AWRALPH
 * x Rare Scrilla, Ill Bill x VIVALAVANDAL x Rare Scrilla, and Rare Scrilla x
 * VLAD COSTEA - six credits, one artist, and a card under any of them answers
 * "your favourite scrilla card".
 *
 * Across all 964 credited names the most widely shared distinctive word appears
 * in six of them; the only tokens above that are "and", "pepe", "rare" and
 * "the", none of which reach here. Eight leaves room without letting a common
 * word stand in for a person.
 */
const MAX_CREDITS_FOR_ONE_NAME = 8;

/** How many cards this artist has in the collection, across every collection. */
export function cardCountForArtist(artist: string): number {
  const wanted = artist.toLowerCase();
  return ALL_COLLECTION_CARDS.filter((c) => c.artist?.toLowerCase() === wanted).length;
}

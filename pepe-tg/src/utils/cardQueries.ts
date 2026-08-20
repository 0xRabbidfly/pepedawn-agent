/**
 * Structured answers from the card index.
 *
 * Questions like "who is the artist for UNTITLEDFROG?", "when was FREEDOMKEK
 * issued?" or "what is the largest supply among Pepenardo's cards?" have exact
 * answers sitting in the card manifest. Semantic retrieval is the wrong tool:
 * it returns whatever text happens to be similar, which is how the bot ended up
 * asserting things it could simply have looked up.
 *
 * These lookups produce a plain factual sentence. The conversational wrapper is
 * added by the model — the fact itself is never generated.
 */

import { FULL_CARD_INDEX, getCardInfo, type CardInfo } from '../data/fullCardIndex';
import {
  ALL_CARDS_MAP,
  COLLECTION_LABEL,
  collectionSuffix,
  getAnyCardInfo,
  type AnyCardInfo,
} from '../data/allCardsIndex';

export interface CardQueryAnswer {
  /** Plain statement of fact, for the model to wrap conversationally. */
  fact: string;
  /** Which lookup produced it, for logging. */
  kind: string;
  /** The card the answer is about, when it is about exactly one. */
  asset?: string;
}

/**
 * Assets named in the text, longest first so PEPEDAWN2 beats PEPEDAWN.
 *
 * Matching is on whole words across all three collections. It used to be a
 * substring scan of the Fake Rares index alone, which failed in both
 * directions: a card named inside another word matched when it should not
 * have, and every Rare Pepe and Fake Common - two thirds of the 4,484 assets -
 * was invisible to every structured lookup.
 *
 * Tokenising and looking each token up is also cheaper than testing 4,484
 * regexes per message, which is what mirroring `artistsIn` would have cost.
 */
function assetsIn(text: string): AnyCardInfo[] {
  const found = new Map<string, AnyCardInfo>();
  // Assets are Counterparty names: A-Z, digits, and '.' or '-' in the
  // sub-asset forms ("DJPEPEBADGER.MC-PEPE-BADGER"). Four is the shortest real
  // asset name, and a shorter token cannot be one.
  for (const raw of text.toUpperCase().match(/[A-Z0-9][A-Z0-9.\-]{3,}/g) ?? []) {
    // "FREEDOMKEK." at the end of a sentence, "DJPEPE," mid-list.
    for (const token of [raw, raw.replace(/^[.\-]+|[.\-]+$/g, '')]) {
      const card = token && ALL_CARDS_MAP[token];
      if (card) found.set(card.asset, card);
    }
  }
  return [...found.values()].sort((a, b) => b.asset.length - a.asset.length);
}

/**
 * True when "pepedawn" in this text means the card, not the bot.
 *
 * PEPEDAWN is both the bot's name and one of its cards, and people address it
 * by plain name constantly. Card-shaped phrasing either asks who made it or
 * pairs the name with an attribute - "PEPEDAWN's supply", "who created
 * PEPEDAWN". A bare vocative - "pepedawn who created djpepe?" - is neither.
 *
 * The two halves are deliberately not symmetric. A creation verb counts only
 * when it comes *before* the name, because "pepedawn who created djpepe?" has
 * the verb after it and is a question about another card entirely - that exact
 * sentence made the bot answer "DJPepe was created by rabbidfly" in the
 * official channel on 2026-08-20.
 */
export function pepedawnMeansTheCard(text: string): boolean {
  if (!text) return false;
  if (/\bpepedawn['\u2019]s\b/i.test(text)) return true;
  const madeBefore =
    /\b(who\s+(?:made|created|drew|did)|artist|supply|issued|issuance|series|card\s+number)\b[^.?!]*\bpepedawn\b/i;
  const attributeAfter =
    /\bpepedawn\b[^.?!]*\b(supply|artist|issued|issuance|series|card\s+number)\b/i;
  return madeBefore.test(text) || attributeAfter.test(text);
}

/**
 * The card a question is about, or undefined.
 *
 * PEPEDAWN never wins over another named card, and only counts on its own when
 * the phrasing is genuinely about the card. Both guards exist because the bot's
 * own name is in the index: the router has five separate guards for this, all
 * of them downstream of this lookup, which short-circuits ahead of them.
 */
function subjectCard(text: string): AnyCardInfo | undefined {
  const named = assetsIn(text);
  const others = named.filter((c) => c.asset !== 'PEPEDAWN');
  if (others.length > 0) return others[0];
  return pepedawnMeansTheCard(text) ? named[0] : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Artists named in the text, longest name first.
 *
 * Matching is on word boundaries, not substrings. Short artist names otherwise
 * match inside ordinary words - an artist called "RC" hides in "scarcest", which
 * made "pepenardo's scarcest card" answer about the wrong person entirely.
 */
function artistsIn(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const card of FULL_CARD_INDEX) {
    const artist = card.artist;
    if (!artist || seen.has(artist)) continue;
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(artist)}(?![\\p{L}\\p{N}])`, 'iu');
    if (pattern.test(text)) {
      seen.add(artist);
      names.push(artist);
    }
  }
  // Longest first, so "Rare Scrilla" wins over a hypothetical "Rare".
  return names.sort((a, b) => b.length - a.length);
}

function cardsByArtist(artist: string): CardInfo[] {
  return FULL_CARD_INDEX.filter((c) => c.artist?.toLowerCase() === artist.toLowerCase());
}

/**
 * The ways people ask who made a card.
 *
 * The list was `artist`, `who made`, `who drew`, `who created`, `created by`.
 * "who is the true creator of that card?" matched none of them, so the question
 * fell through to retrieval and was answered from chat prose - which by then
 * contained the bot's own earlier mistake. Attribution is the one thing in this
 * community that must never be guessed at, so the vocabulary is broad and the
 * gate below is closed rather than left to fall through.
 */
const ATTRIBUTION_WORDS = [
  'artist',
  'who made',
  'who created',
  'who drew',
  'who did',
  'who is behind',
  "who's behind",
  'creator',
  'created by',
  'made by',
  'drawn by',
  'whose card',
];

/** True when the message asks who made something. */
export function asksAttribution(text: string): boolean {
  const lower = text.toLowerCase();
  return ATTRIBUTION_WORDS.some((w) => lower.includes(w));
}

/**
 * True when attribution is asked of a card the text gestures at but does not
 * name - "who is the true creator of that card?".
 *
 * Distinct from a general question like "who created Fake Rares?", which has no
 * card in view and is perfectly answerable from lore.
 */
export function asksAttributionOfAnUnnamedCard(text: string): boolean {
  if (!asksAttribution(text)) return false;
  if (subjectCard(text)) return false;
  return /\b(that|this|the|it|its|it's)\s+(card|one|asset|piece)\b|\bof\s+it\b|\bmade\s+it\b|\bcreated\s+it\b/i.test(
    text
  );
}

/**
 * Answer a factual card question from the index, or null if it isn't one.
 *
 * Deliberately conservative — anything it cannot answer exactly falls through
 * to normal retrieval rather than guessing.
 *
 * `subject` is the card already under discussion, for follow-ups that lean on a
 * pronoun ("and who made it?"). It is used only when the question itself names
 * no card, and the caller is responsible for having resolved it.
 */
export function answerCardQuery(text: string, subject?: string): CardQueryAnswer | null {
  const lower = text.toLowerCase();
  const card = subjectCard(text) ?? (subject ? getAnyCardInfo(subject) : undefined);
  const artists = artistsIn(text);

  const asks = (...words: string[]) => words.some((w) => lower.includes(w));

  // --- Artist of a specific card -----------------------------------------
  if (card && ATTRIBUTION_WORDS.some((w) => lower.includes(w))) {
    return card.artist
      ? {
          fact: `${card.asset}${collectionSuffix(card)} is by ${card.artist}.`,
          kind: 'artist_of_card',
          asset: card.asset,
        }
      : { fact: `${card.asset} has no artist recorded in the index.`, kind: 'artist_of_card' };
  }

  // --- Issuance date -------------------------------------------------------
  if (card && asks('issued', 'issuance', 'released', 'release date', 'when was', 'what year')) {
    return card.issuance
      ? {
          fact: `${card.asset}${collectionSuffix(card)} was issued ${card.issuance}.`,
          kind: 'issuance',
          asset: card.asset,
        }
      : { fact: `No issuance date is recorded for ${card.asset}.`, kind: 'issuance' };
  }

  // --- Supply of a specific card ------------------------------------------
  if (card && asks('supply', 'how many', 'issuance size', 'edition size')) {
    return typeof card.supply === 'number'
      ? {
          fact: `${card.asset}${collectionSuffix(card)} has a supply of ${card.supply}.`,
          kind: 'supply_of_card',
          asset: card.asset,
        }
      : { fact: `No supply is recorded for ${card.asset}.`, kind: 'supply_of_card' };
  }

  // --- Series / card number ------------------------------------------------
  if (card && asks('series', 'card number', 'which series')) {
    // Series numbering restarts in each collection, so "series 4" on its own is
    // not an answer for anything outside Fake Rares.
    const where =
      card.collection === 'fake-rares' ? '' : ` in ${COLLECTION_LABEL[card.collection]}`;
    return {
      fact: `${card.asset} is series ${card.series}, card ${card.card}${where}.`,
      kind: 'series_of_card',
      asset: card.asset,
    };
  }

  // --- Extremes across an artist's cards -----------------------------------
  if (
    artists.length > 0 &&
    asks(
      'largest', 'biggest', 'highest', 'most common', 'commonest', 'most plentiful',
      'smallest', 'lowest', 'rarest', 'scarcest', 'hardest to find'
    )
  ) {
    const artist = artists[0];
    const withSupply = cardsByArtist(artist).filter(
      (c): c is CardInfo & { supply: number } => typeof c.supply === 'number'
    );
    if (withSupply.length > 0) {
      const wantsSmallest = asks('smallest', 'lowest', 'rarest', 'scarcest', 'hardest to find');
      const pick = withSupply.reduce((best, c) =>
        wantsSmallest ? (c.supply < best.supply ? c : best) : c.supply > best.supply ? c : best
      );
      const label = wantsSmallest ? 'smallest' : 'largest';
      return {
        fact: `${artist}'s ${label} supply is ${pick.asset} at ${pick.supply} (Fake Rares).`,
        kind: 'artist_supply_extreme',
        asset: pick.asset,
      };
    }
  }

  // --- How many cards an artist has ----------------------------------------
  if (artists.length > 0 && asks('how many', 'number of cards', 'count')) {
    const artist = artists[0];
    const all = cardsByArtist(artist);
    return {
      fact: `${artist} has ${all.length} card${all.length === 1 ? '' : 's'} in the Fake Rares index.`,
      kind: 'artist_card_count',
    };
  }

  // --- Everything by an artist ---------------------------------------------
  if (
    artists.length > 0 &&
    asks('what cards', 'which cards', 'cards by', 'made by', 'all of', 'all the', "'s cards", 'list')
  ) {
    const artist = artists[0];
    const all = cardsByArtist(artist);
    if (all.length > 0) {
      const listed = all
        .slice(0, 12)
        .map((c) => c.asset)
        .join(', ');
      const more = all.length > 12 ? `, and ${all.length - 12} more` : '';
      return { fact: `${artist}: ${listed}${more}.`, kind: 'artist_cards' };
    }
  }

  return null;
}

/** True when the text names something the index can answer exactly. */
export function isStructuredCardQuery(text: string): boolean {
  return answerCardQuery(text) !== null;
}

export { getCardInfo };

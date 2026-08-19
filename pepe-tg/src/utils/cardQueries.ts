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

export interface CardQueryAnswer {
  /** Plain statement of fact, for the model to wrap conversationally. */
  fact: string;
  /** Which lookup produced it, for logging. */
  kind: string;
}

/** Assets mentioned in the text, longest first so PEPEDAWN2 beats PEPEDAWN. */
function assetsIn(text: string): CardInfo[] {
  const upper = text.toUpperCase();
  return FULL_CARD_INDEX.filter((c) => c.asset && upper.includes(c.asset.toUpperCase())).sort(
    (a, b) => b.asset.length - a.asset.length
  );
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
 * Answer a factual card question from the index, or null if it isn't one.
 *
 * Deliberately conservative — anything it cannot answer exactly falls through
 * to normal retrieval rather than guessing.
 */
export function answerCardQuery(text: string): CardQueryAnswer | null {
  const lower = text.toLowerCase();
  const cards = assetsIn(text);
  const card = cards[0];
  const artists = artistsIn(text);

  const asks = (...words: string[]) => words.some((w) => lower.includes(w));

  // --- Artist of a specific card -----------------------------------------
  if (card && asks('artist', 'who made', 'who drew', 'who created', 'created by')) {
    return card.artist
      ? { fact: `${card.asset} is by ${card.artist}.`, kind: 'artist_of_card' }
      : { fact: `${card.asset} has no artist recorded in the index.`, kind: 'artist_of_card' };
  }

  // --- Issuance date -------------------------------------------------------
  if (card && asks('issued', 'issuance', 'released', 'release date', 'when was', 'what year')) {
    return card.issuance
      ? { fact: `${card.asset} was issued ${card.issuance}.`, kind: 'issuance' }
      : { fact: `No issuance date is recorded for ${card.asset}.`, kind: 'issuance' };
  }

  // --- Supply of a specific card ------------------------------------------
  if (card && asks('supply', 'how many', 'issuance size', 'edition size')) {
    return typeof card.supply === 'number'
      ? { fact: `${card.asset} has a supply of ${card.supply}.`, kind: 'supply_of_card' }
      : { fact: `No supply is recorded for ${card.asset}.`, kind: 'supply_of_card' };
  }

  // --- Series / card number ------------------------------------------------
  if (card && asks('series', 'card number', 'which series')) {
    return {
      fact: `${card.asset} is series ${card.series}, card ${card.card}.`,
      kind: 'series_of_card',
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
        fact: `${artist}'s ${label} supply is ${pick.asset} at ${pick.supply}.`,
        kind: 'artist_supply_extreme',
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

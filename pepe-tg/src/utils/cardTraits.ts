/**
 * Visual trait search over what the /fv vision pass actually saw.
 *
 * "Which fake rare has the most red?" is a descriptive question with a real
 * answer — the vision pass recorded colours, styles and subjects per card. It is
 * not a matter of taste, and it should not be answered by semantic similarity
 * over prose, which is how "grantfly" came back for red: the word happened to
 * embed nearby, but the card is barely red at all.
 *
 * Traits come from `card-visual-traits.json`, built by
 * `scripts/build-card-traits.ts` from the /fv embedding dump.
 */

import { getCardInfo } from '../data/fullCardIndex';
import traitsJson from '../data/card-visual-traits.json';

const TRAITS: Record<string, string[]> = traitsJson as Record<string, string[]>;

/** Words that carry no descriptive weight in a trait query. */
const STOP = new Set([
  'the','a','an','of','in','on','with','and','or','is','are','has','have','most','more','which',
  'what','card','cards','fake','fakes','rare','rares','pepe','pepes','show','me','find','one','that',
  'best','top','you','your','it','its','to','for','about','any','some','got','give','tell','looks',
  'look','like','something','thing','really','very','much','lot','lots','full','all',
]);

/** Loose synonyms so ordinary phrasing reaches the vision vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  red: ['red', 'crimson', 'scarlet', 'blood'],
  blue: ['blue', 'azure', 'cyan', 'teal'],
  green: ['green', 'emerald', 'lime'],
  purple: ['purple', 'violet', 'magenta'],
  pink: ['pink', 'rose'],
  orange: ['orange', 'amber'],
  yellow: ['yellow', 'gold', 'golden'],
  black: ['black', 'dark', 'noir'],
  white: ['white', 'pale'],
  sexy: ['sexy', 'sensual', 'seductive', 'alluring', 'provocative', 'erotic', 'nude', 'lingerie'],
  sexiest: ['sexy', 'sensual', 'seductive', 'alluring', 'provocative', 'erotic', 'nude', 'lingerie'],
  ugly: ['ugly', 'grotesque', 'hideous', 'crude', 'gross'],
  ugliest: ['ugly', 'grotesque', 'hideous', 'crude', 'gross'],
  scary: ['scary', 'horror', 'creepy', 'sinister', 'dark', 'menacing'],
  weird: ['weird', 'surreal', 'bizarre', 'abstract', 'psychedelic'],
  weirdest: ['weird', 'surreal', 'bizarre', 'abstract', 'psychedelic'],
  funny: ['funny', 'humorous', 'comic', 'silly', 'absurd'],
  colourful: ['colorful', 'colourful', 'vibrant', 'vivid', 'rainbow'],
  colorful: ['colorful', 'colourful', 'vibrant', 'vivid', 'rainbow'],
  psychedelic: ['psychedelic', 'trippy', 'surreal', 'kaleidoscope'],
  retro: ['retro', 'vintage', 'nostalgic', '8-bit', 'pixel'],
  dark: ['dark', 'black', 'noir', 'shadow', 'gothic'],
  bright: ['bright', 'vivid', 'vibrant', 'neon'],
};

export interface TraitMatch {
  asset: string;
  score: number;
  /** Trait strings that matched, for explaining the pick. */
  matched: string[];
}

function expand(term: string): string[] {
  return SYNONYMS[term] ?? [term];
}

/** Descriptive terms in a query, expanded through the synonym table. */
export function traitTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const terms = new Set<string>();
  for (const w of words) for (const e of expand(w)) terms.add(e);
  return [...terms];
}

/**
 * Cards whose recorded visual traits match the query, best first.
 *
 * Scoring rewards a whole-word hit over an incidental substring, and counts
 * every distinct matching trait, so a card described as "red tones, crimson
 * background" outranks one that merely mentions red once.
 */
export function findCardsByTrait(query: string, limit = 5): TraitMatch[] {
  const terms = traitTerms(query);
  if (terms.length === 0) return [];

  const results: TraitMatch[] = [];
  for (const [asset, traits] of Object.entries(TRAITS)) {
    if (traits.length === 0) continue;
    let score = 0;
    const matched: string[] = [];
    for (const trait of traits) {
      for (const term of terms) {
        if (trait === term) {
          score += 3;
          matched.push(trait);
        } else if (new RegExp(`\\b${term}\\b`).test(trait)) {
          score += 2;
          matched.push(trait);
        }
        // No substring tier: "incredible" contains "red" and would score a card
        // that has nothing red about it — the same class of error that returned
        // "grantfly" for a red query.
      }
    }
    if (score > 0) {
      results.push({ asset, score, matched: [...new Set(matched)] });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.asset.localeCompare(b.asset))
    .slice(0, limit);
}

/** A plain sentence naming the best match, for the model to wrap. */
export function describeTraitMatch(query: string): { fact: string; asset: string } | null {
  const [best] = findCardsByTrait(query, 1);
  if (!best) return null;
  const info = getCardInfo(best.asset);
  const by = info?.artist ? ` by ${info.artist}` : '';
  const traits = best.matched.slice(0, 4).join(', ');
  return {
    asset: best.asset,
    fact: `${best.asset}${by} — the vision pass recorded: ${traits}.`,
  };
}

/** How many cards have any recorded traits at all. */
export function traitCoverage(): number {
  return Object.values(TRAITS).filter((t) => t.length > 0).length;
}

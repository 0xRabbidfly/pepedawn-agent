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
  // Ordinary conversation words. Without these, "i get really awkward in small
  // places when scrilla is there" matched a card whose recorded traits include
  // the word "get", and the bot answered "the vision pass recorded: get."
  'get','got','when','where','there','here','then','than','this','that','these','those',
  'oh','no','yes','not','but','so','just','now','too','also','been','being','was','were',
  'they','them','their','his','her','our','who','whom','why','how','can','could','would',
  'should','will','shall','may','might','do','does','did','done','make','made','take',
  'small','big','little','places','place','people','person','time','day','way','know',
  'think','feel','feels','said','say','says','going','goes','come','came','want','need',
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
  for (const w of words) {
    for (const e of expand(w)) {
      if (DESCRIPTIVE_VOCABULARY.has(e)) terms.add(e);
    }
  }
  return [...terms];
}

/**
 * Cards whose recorded visual traits match the query, best first.
 *
 * Scoring rewards a whole-word hit over an incidental substring, and counts
 * every distinct matching trait, so a card described as "red tones, crimson
 * background" outranks one that merely mentions red once.
 */
/**
 * Minimum score for a trait match to be offered.
 *
 * One exact hit scores 3, which let a single incidental word decide the answer.
 * Requiring more means a card has to match the description in more than one
 * way before it is named.
 */
const MIN_TRAIT_SCORE = 3;

/**
 * The only vocabulary trait search will match on.
 *
 * Scoring arbitrary words against recorded traits is what produced "the vision
 * pass recorded: get." for "i get really awkward in small places". A term has to
 * be a recognised description - a colour, a mood, a style - before it can decide
 * which card gets named.
 */
const DESCRIPTIVE_VOCABULARY: ReadonlySet<string> = new Set(
  Object.values(SYNONYMS).flat().concat([
    'cubist','geometric','angular','portrait','landscape','cartoon','anime','pixel',
    'glitch','collage','sketch','painterly','monochrome','sepia','metallic','glossy',
    'skull','frog','crown','fire','water','space','city','forest','ocean','moon','sun',
  ])
);

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
    if (score >= MIN_TRAIT_SCORE) {
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

/**
 * Traits that describe nothing about the card.
 *
 * The vision pass read the artwork *and* whatever text was printed on it, so
 * alongside "gold background" and "charging bull" the file holds "pepe", "nft",
 * "atk", "spd" and the odd word lifted straight off the card face. Naming a
 * card's look from those produces "the vision pass recorded: get."
 */
const NON_DESCRIPTIVE: ReadonlySet<string> = new Set([
  'art', 'artwork', 'artistic', 'digital', 'digital art', 'image', 'picture', 'illustration',
  'pepe', 'pepes', 'pepe the frog', 'frog', 'meme', 'memes', 'culture', 'character', 'creator',
  'card', 'cards', 'fake', 'fakes', 'rare', 'rares', 'nft', 'nfts', 'crypto', 'style', 'design',
  'color', 'colors', 'colour', 'colours', 'background', 'text', 'logo', 'existence', 'rareness',
  'score', 'atk', 'spd', 'ele', 'hp', 'def',
  // Ordinary words read off the card face rather than seen in the art.
  'one', 'out', 'back', 'real', 'way', 'word', 'build', 'ban', 'attack', 'edition', 'level',
  'solve', 'pull', 'turned', 'whole', 'call', 'put', 'men', 'our', 'run', 'sold', 'live',
  'value', 'off', 'raw',
]);

/**
 * True for a trait that should never reach a reply: a digit-bearing token, a
 * long unbroken string (the asset-hash artefacts in the file), something with
 * almost no vowels, a phrase made entirely of filler - or a word that is just
 * the card's own name read back.
 */
function isUndescriptive(trait: string, flatAsset: string): boolean {
  if (/\d/.test(trait)) return true;
  if (NON_DESCRIPTIVE.has(trait) || STOP.has(trait)) return true;
  if (!trait.includes(' ') && trait.length > 12) return true;
  const letters = trait.replace(/[^a-z]/g, '');
  const vowels = (trait.match(/[aeiou]/g) || []).length;
  if (letters.length > 0 && vowels / letters.length < 0.25) return true;
  if (trait.split(/\s+/).every((w) => NON_DESCRIPTIVE.has(w) || STOP.has(w))) return true;
  return flatAsset.includes(trait.replace(/[^a-z0-9]/g, ''));
}

/**
 * A short line on what a card actually looks like, or null when nothing usable
 * was recorded.
 *
 * For a card nobody has written lore about, the specs alone are a thin reply -
 * artist, series, supply and nothing of the art itself. The vision pass already
 * looked at all 858 of them, so this contributes what it saw.
 *
 * Phrases come first because they are almost always genuine vision output
 * ("charging bull", "gold background"); single words are ranked behind them,
 * recognised description before anything else. Three at most: this rides along
 * with the facts, it does not become the answer.
 */
export function describeLook(asset: string, limit = 3): string | null {
  const traits = TRAITS[asset.toUpperCase()];
  if (!traits || traits.length === 0) return null;

  const flatAsset = asset.toLowerCase().replace(/[^a-z0-9]/g, '');
  const usable = traits.filter((t) => !isUndescriptive(t, flatAsset));
  const phrases = usable.filter((t) => t.includes(' '));
  const known = usable.filter((t) => !t.includes(' ') && DESCRIPTIVE_VOCABULARY.has(t));
  const rest = usable.filter((t) => !t.includes(' ') && !DESCRIPTIVE_VOCABULARY.has(t));

  const picked = [...phrases, ...known, ...rest].slice(0, limit);
  if (picked.length === 0) return null;

  const line = picked.join(', ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/** How many cards have any recorded traits at all. */
export function traitCoverage(): number {
  return Object.values(TRAITS).filter((t) => t.length > 0).length;
}

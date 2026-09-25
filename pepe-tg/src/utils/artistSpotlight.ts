/**
 * KEK-001, the first ticket on the fake backlog, asked for by rabbidfly on
 * 24 September 2026: "pick a random artist spotlight each day - every few
 * hours show a card of theirs - tag them - write a fake haiku poem that pays
 * homage to their card from your /fv visual data - and then use a cattle
 * prod to send them to the new site to establish their profile - low
 * voltage for now".
 *
 * Each UTC day one artist from the directory: up to three of their cards,
 * one per scheduled hour, each with a haiku written from what the vision
 * pass recorded on that card. The prod - a low-voltage line and a button to
 * the claim form - goes only to artists whose directory page is still bare,
 * and only until the claim window closes.
 *
 * "Tag them" is honest about what we know. A Telegram @handle only when
 * artist-aliases.json maps one (so the mention reaches the right person); an
 * X profile as a link, from pepe.wtf's curated handles only - never a bare
 * "@handle", which Telegram would link to whoever owns that name there.
 *
 * Pure: the service owns the clock, the model and the channel.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { CardInfo } from '../data/fullCardIndex';
import type { DirectoryArtist } from './directoryLinks';
import { DIRECTORY_ORIGIN, directoryCardUrl } from './directoryLinks';
import { factsDir } from './cardVisualFacts';

export const CLAIM_URL = `${DIRECTORY_ORIGIN}/artists/submit`;

export interface SpotlightConfig {
  enabled: boolean;
  /** UTC hours for the day's posts, in order. */
  hoursUtc: number[];
  /** No two spotlight posts closer than this, however late the bot came up. */
  minGapMs: number;
  /** Do not spotlight the same artist again within this many days. */
  repeatDays: number;
  /** Last UTC day the claim prod runs (YYYY-MM-DD). */
  prodUntil: string;
  model: string;
}

export function spotlightConfig(env: NodeJS.ProcessEnv = process.env): SpotlightConfig {
  const hours = (env.SPOTLIGHT_HOURS_UTC || '15,19,23')
    .split(',')
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h < 24)
    .sort((a, b) => a - b);
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    enabled: env.SPOTLIGHT_ENABLED !== 'false',
    hoursUtc: hours.length ? hours : [15, 19, 23],
    minGapMs: num(env.SPOTLIGHT_MIN_GAP_HOURS, 2) * 3_600_000,
    repeatDays: num(env.SPOTLIGHT_REPEAT_DAYS, 60),
    prodUntil: env.SPOTLIGHT_PROD_UNTIL || '2026-10-22',
    model: env.SPOTLIGHT_MODEL || env.GIF_CONCEPT_MODEL || 'gpt-5.6-terra',
  };
}

export interface SpotlightState {
  day?: string;
  artist?: string;
  slug?: string;
  hasProfile?: boolean;
  /** Assets planned for the day, in posting order. */
  cards: string[];
  posted: string[];
  lastPostAt?: number;
  history: Array<{ day: string; artist: string }>;
}

export function emptyState(): SpotlightState {
  return { cards: [], posted: [], history: [] };
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The artist's live cards: those credited to their name or an alias, case-insensitively. */
export function cardsForArtist(artist: Pick<DirectoryArtist, 'name' | 'aliases'>, index: CardInfo[]): CardInfo[] {
  const names = new Set([artist.name, ...(artist.aliases ?? [])].map((n) => n.trim().toLowerCase()));
  return index.filter((c) => !c.retired && !!c.artist && names.has(c.artist.trim().toLowerCase()));
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Today's artist: one with live cards, not spotlighted within repeatDays.
 */
export function pickArtist(
  artists: DirectoryArtist[],
  index: CardInfo[],
  history: SpotlightState['history'],
  now: Date,
  cfg: SpotlightConfig,
  rng: () => number = Math.random,
): { artist: DirectoryArtist; cards: CardInfo[] } | null {
  const cutoff = new Date(now.getTime() - cfg.repeatDays * 86_400_000).toISOString().slice(0, 10);
  const recent = new Set(history.filter((h) => h.day >= cutoff).map((h) => h.artist.toLowerCase()));
  const eligible = artists
    .filter((a) => !recent.has(a.name.toLowerCase()))
    .map((a) => ({ artist: a, cards: cardsForArtist(a, index) }))
    .filter((x) => x.cards.length > 0);
  if (eligible.length === 0) return null;
  // Preference, first non-empty wins: a bare page with two or more cards
  // (so "every few hours" is more than one post), a bare page, two or more
  // cards, anyone. Bare pages only count while the prod runs.
  const prodding = utcDay(now) <= cfg.prodUntil;
  const several = (x: { cards: CardInfo[] }) => x.cards.length >= 2;
  const bare = (x: { artist: DirectoryArtist }) => prodding && !x.artist.hasProfile;
  const pools = [eligible.filter((x) => bare(x) && several(x)), eligible.filter(bare), eligible.filter(several), eligible];
  const pool = pools.find((p) => p.length > 0)!;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** A fresh plan for a new day, or the state as it is when today is already planned. */
export function planDay(
  state: SpotlightState,
  artists: DirectoryArtist[],
  index: CardInfo[],
  now: Date,
  cfg: SpotlightConfig,
  rng: () => number = Math.random,
): SpotlightState {
  const today = utcDay(now);
  if (state.day === today) return state;
  const choice = pickArtist(artists, index, state.history, now, cfg, rng);
  if (!choice) return { ...state, day: today, artist: undefined, cards: [], posted: [] };
  const cards = shuffle(choice.cards, rng).slice(0, cfg.hoursUtc.length).map((c) => c.asset);
  return {
    day: today,
    artist: choice.artist.name,
    slug: choice.artist.slug,
    hasProfile: !!choice.artist.hasProfile,
    cards,
    posted: [],
    lastPostAt: state.lastPostAt,
    history: [...state.history, { day: today, artist: choice.artist.name }].slice(-200),
  };
}

/**
 * The next card to post, if one is due: its slot's hour has come, and the
 * last spotlight post was at least minGap ago - so a bot that was down for
 * two slots posts one, not a burst.
 */
export function nextDue(state: SpotlightState, cfg: SpotlightConfig, now: Date): string | null {
  if (state.day !== utcDay(now) || !state.artist) return null;
  const i = state.posted.length;
  if (i >= state.cards.length) return null;
  if (now.getUTCHours() < cfg.hoursUtc[i]) return null;
  if (state.lastPostAt !== undefined && now.getTime() - state.lastPostAt < cfg.minGapMs) return null;
  return state.cards[i];
}

// ---------------------------------------------------------------------------
// The haiku
// ---------------------------------------------------------------------------

export interface CardLook {
  visualSummary?: string;
  textOnCard?: string[];
  memeticReferences?: string[];
}

/** What the vision pass recorded on this card, from its committed fact file. */
export function readCardLook(asset: string, dir = factsDir()): CardLook | null {
  const path = join(dir, `${asset.toUpperCase()}.json`);
  if (!existsSync(path)) return null;
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'));
    return { visualSummary: m.visualSummaryShort || m.visualSummary, textOnCard: m.textOnCard, memeticReferences: m.memeticReferences };
  } catch {
    return null;
  }
}

export function buildHaikuPrompt(card: Pick<CardInfo, 'asset' | 'series' | 'card'>, artist: string, look: CardLook | null): string {
  const seen = look
    ? [
        look.visualSummary ? `What is on it: ${look.visualSummary}` : '',
        look.textOnCard?.length ? `Text on the card: ${look.textOnCard.join(' | ')}` : '',
        look.memeticReferences?.length ? `References: ${look.memeticReferences.slice(0, 4).join('; ')}` : '',
      ].filter(Boolean).join('\n')
    : 'No visual notes: write from the name alone.';
  return `Write one haiku - three lines, five, seven and five syllables - paying homage to the Fake Rares card ${card.asset} by ${artist} (Series ${card.series}, Card ${card.card}).
${seen}

Voice: PEPEDAWN, the resident frog of the Fake Rares Telegram group. Reverent but dank: deadpan, a little absurd, at home on Counterparty. Ground every line in what is actually on the card. No title, no hashtags, no emoji, no quotation marks, no line numbers.
Reply with the three lines only.`;
}

/** Three short lines, or null. Numbering, quotes and blank lines are forgiven. */
export function parseHaiku(raw: string): string[] | null {
  const lines = (raw || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim())
    .filter(Boolean);
  if (lines.length !== 3) return null;
  if (lines.some((l) => l.length > 70)) return null;
  return lines;
}

// ---------------------------------------------------------------------------
// Tagging, the prod, and the caption
// ---------------------------------------------------------------------------

/** pepe.wtf's curated X handle for the artist; inferred handles are not trusted. */
export function xHandleFor(artist: string, handles: Array<{ artist: string; handle: string; source?: string }>): string | null {
  const a = artist.trim().toLowerCase();
  const hit = handles.find((h) => h.artist.trim().toLowerCase() === a && h.source === 'pepe.wtf' && /^[A-Za-z0-9_]{1,15}$/.test(h.handle));
  return hit ? hit.handle : null;
}

/** A Telegram @handle mapped to this artist in artist-aliases.json, if any. Numeric-id keys are not handles. */
export function telegramHandleFor(artist: string, aliases: Record<string, unknown>): string | null {
  const a = artist.trim().toLowerCase();
  for (const [key, value] of Object.entries(aliases)) {
    if (!key.startsWith('@')) continue;
    const names = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string').map((v) => v.trim().toLowerCase());
    if (names.includes(a) && /^@[A-Za-z0-9_]{5,32}$/.test(key)) return key;
  }
  return null;
}

const PRODS = [
  (a: string, until: string) => `⚡ low voltage: ${a}, your page on the directory is still bare. Bio, links, wallet - claim it by ${until}.`,
  (a: string, until: string) => `⚡ bzzt. ${a}, the directory has a card waiting for you if you claim your page by ${until}.`,
  (a: string, until: string) => `⚡ gentle prod: ${a}, fakeraredirectory.com wants your bio. Claim by ${until}.`,
];

function prettyDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export interface CaptionInput {
  artist: string;
  card: Pick<CardInfo, 'asset' | 'series' | 'card'>;
  index: number;
  total: number;
  haiku: string[] | null;
  telegramHandle: string | null;
  xHandle: string | null;
  prod: boolean;
  prodUntil: string;
}

/** The caption under each card. Plain text; the sender adds no parse_mode. */
export function composeCaption(i: CaptionInput): string {
  const who = i.telegramHandle ? `${i.artist} (${i.telegramHandle})` : i.artist;
  const head = i.index === 0 ? `🔦 Today's artist spotlight: ${who}` : `🔦 ${who}, ${i.index + 1} of ${i.total}`;
  const lines = [head, `${i.card.asset} · Series ${i.card.series}, Card ${i.card.card}`];
  if (i.haiku) lines.push('', ...i.haiku);
  const tail: string[] = [];
  if (i.xHandle) tail.push(`𝕏 x.com/${i.xHandle}`);
  if (i.prod) tail.push(PRODS[i.index % PRODS.length](i.artist, prettyDay(i.prodUntil)));
  if (tail.length) lines.push('', ...tail);
  return lines.join('\n');
}

export function spotlightButtons(card: Pick<CardInfo, 'series' | 'card'>, slug: string | undefined, prod: boolean): Array<{ text: string; url: string }> {
  const out: Array<{ text: string; url: string }> = [];
  const page = directoryCardUrl(card);
  if (page) out.push({ text: '🗂 Directory', url: page });
  if (prod) out.push({ text: '⚡ Claim your page', url: CLAIM_URL });
  else if (slug) out.push({ text: '👨‍🎨 Artist page', url: `${DIRECTORY_ORIGIN}/artists/${slug}` });
  return out;
}

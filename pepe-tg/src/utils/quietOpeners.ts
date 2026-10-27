/**
 * Quiet-room openers: when the room has gone quiet, PEPEDAWN asks it
 * something. They replace the quiet-room jokes of 5.27.0. The owner, 27
 * October: "the telegram jokes are annoying - replace it with casual
 * conversation openers for the community", then "it has to be topical, fake
 * rare related and something a member would ask honestly".
 *
 * Topical means the question starts from a fact, not from the model. Every
 * opener is built on one hook the bot can vouch for: a card that just
 * dropped, a card that sold in the last few days, how far the current series
 * has got, or a card issued on this date in an earlier year. The model gets
 * that hook and nothing else to go on, and every card or artist it names must
 * be one the hook gave it. Each hook is used once.
 *
 * Honest means a question somebody in the room might really ask: not a quiz,
 * not a host's "drop your favourite below", nothing about prices, and never
 * a claim the bot cannot make - it holds nothing, bought nothing, was not
 * there. A local check and a cold second call stand between it and the room.
 *
 * Restraint is what the jokes lacked - 45 of them in 16 days. An opener goes
 * out at most once a day per room, and only when somebody has spoken since
 * the bot last volunteered anything: a question nobody answered is not
 * followed by another. With nothing fresh to ask about, the slot goes to the
 * X post, or to silence.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';
import { readCardLook } from './artistSpotlight';

// ---------------------------------------------------------------- settings

/** On unless QUIET_OPENERS=off. */
export function quietOpenersOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.QUIET_OPENERS || 'on').toLowerCase() !== 'off';
}

/** The least time between two openers in one room. A day unless QUIET_OPENER_GAP_HOURS says otherwise. */
export function openerGapMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseFloat(env.QUIET_OPENER_GAP_HOURS ?? '');
  return (Number.isFinite(n) && n > 0 ? n : 24) * 3600_000;
}

export function quietOpenersPath(): string {
  return process.env.QUIET_OPENERS_PATH || join(process.cwd(), 'src', 'data', 'quiet-openers.jsonl');
}

/** A failed opener backs off for an hour, rather than retrying every check. */
export const OPENER_RETRY_MS = 60 * 60 * 1000;

/**
 * Whether a quiet slot (already open, see quietSlotOpen) may go to an opener.
 * Somebody must have spoken since the bot last volunteered anything, the last
 * opener in this room must be a gap ago, and the last failure an hour ago.
 */
export function openerDue(opts: {
  lastUserAt?: number;
  lastVolunteerAt?: number;
  lastOpenerAt?: number;
  failedAt?: number;
  now?: number;
  gapMs?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  if (opts.lastUserAt === undefined) return false;
  if (opts.lastVolunteerAt !== undefined && opts.lastUserAt <= opts.lastVolunteerAt) return false;
  if (opts.lastOpenerAt !== undefined && now - opts.lastOpenerAt < (opts.gapMs ?? openerGapMs())) return false;
  if (opts.failedAt !== undefined && now - opts.failedAt < OPENER_RETRY_MS) return false;
  return true;
}

// ---------------------------------------------------------------- hooks

export type HookKind = 'new-card' | 'sale' | 'series' | 'birthday';

/** One real, current thing to ask about. */
export interface OpenerHook {
  /** Never asked about twice: 'new:CAKERARE', 'sale:FAKEASF:2026-10-26', 'series:18:42', 'birthday:FAKEASF:2026'. */
  key: string;
  kind: HookKind;
  /** Why it comes up today, which the question carries: "it was issued 5 years ago today". */
  why: string;
  /** Everything the model may state, one fact per line. */
  facts: string[];
  /** The cards the opener may name; the first is the one it is about. */
  cards: string[];
  /** The artists the opener may name. */
  artists: string[];
}

/** A sale, as much of it as an opener needs: never the price, never the buyer. */
export interface RecentSale {
  asset: string;
  /** Epoch ms. */
  at: number;
  type: 'DIS_SALE' | 'DEX_SALE';
}

export const NEW_CARD_DAYS = 45;
export const SALE_DAYS = 3;
/** A card asked about is left alone for this long, whatever the hook. */
export const CARD_REST_DAYS = 30;

const DAY = 24 * 3600_000;

function liveCards(index: CardInfo[]): CardInfo[] {
  return index.filter((c) => !c.retired && c.collection !== 'fake-commons');
}

/** The index has an artist or two with scraped HTML on the end. */
export function cleanArtist(a: string | null | undefined): string | null {
  const s = (a || '').split('<')[0].trim();
  return s && !/^(unknown|anonymous|n\/a)$/i.test(s) ? s : null;
}

function longDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** In calendar days, UTC: a sale at 19:00 is "yesterday" at 15:00 the next day. */
function daysAgo(ms: number, now: number): string {
  const day = (t: number) => Math.floor(t / DAY);
  const d = day(now) - day(ms);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/** The card itself, in the lines every hook about one card starts with. */
export function cardFacts(card: CardInfo, look = readCardLook(card.asset)): string[] {
  const artist = cleanArtist(card.artist);
  const issued = card.issuanceCount ?? card.supply;
  const lines = [
    `${card.asset}: Fake Rares series ${card.series}, card ${card.card}, ${artist ? `by ${artist}` : 'artist unknown'}.`,
  ];
  if (card.release?.date) lines.push(`Issued on Counterparty ${longDate(card.release.date)}.`);
  if (issued) lines.push(`${issued.toLocaleString('en-US')} issued.`);
  if (look?.visualSummary) lines.push(`What is on it: ${look.visualSummary}`);
  return lines;
}

function cardHook(kind: HookKind, key: string, why: string, card: CardInfo, lead: string[], look?: ReturnType<typeof readCardLook>): OpenerHook {
  const artist = cleanArtist(card.artist);
  return {
    key,
    kind,
    why,
    facts: [...lead, ...cardFacts(card, look === undefined ? readCardLook(card.asset) : look)],
    cards: [card.asset],
    artists: artist ? [artist] : [],
  };
}

/**
 * Everything there is to ask about right now. Pure but for the card notes it
 * reads from disk; `look` replaces that read in tests.
 */
export function openerHooks(opts: {
  index?: CardInfo[];
  sales?: RecentSale[];
  now?: number;
  look?: (asset: string) => ReturnType<typeof readCardLook>;
}): OpenerHook[] {
  const now = opts.now ?? Date.now();
  const look = opts.look ?? ((asset: string) => readCardLook(asset));
  const cards = liveCards(opts.index ?? FULL_CARD_INDEX);
  const byAsset = new Map(cards.map((c) => [c.asset.toUpperCase(), c]));
  const hooks: OpenerHook[] = [];

  const released = cards
    .filter((c) => c.release?.date)
    .sort((a, b) => b.release!.date.localeCompare(a.release!.date));
  const newest = released[0]?.asset;

  // Just dropped.
  for (const c of released) {
    const at = Date.parse(`${c.release!.date}T00:00:00Z`);
    if (now - at > NEW_CARD_DAYS * DAY) break;
    const lead = [`A new fake rare, issued ${daysAgo(at, now)}${c.asset === newest ? ' - the newest card there is' : ''}.`];
    const why = c.asset === newest ? 'it is the newest fake rare' : `it is new, issued ${daysAgo(at, now)}`;
    hooks.push(cardHook('new-card', `new:${c.asset}`, why, c, lead, look(c.asset)));
  }

  // Sold in the last few days, one hook per card.
  const sold = new Map<string, RecentSale[]>();
  for (const s of opts.sales ?? []) {
    const asset = s.asset.toUpperCase();
    if (!byAsset.has(asset) || now - s.at > SALE_DAYS * DAY || s.at > now) continue;
    sold.set(asset, [...(sold.get(asset) ?? []), s]);
  }
  for (const [asset, sales] of sold) {
    const last = sales.reduce((a, b) => (b.at > a.at ? b : a));
    const where = last.type === 'DIS_SALE' ? 'from a dispenser' : 'on the Counterparty DEX';
    const lead = [
      sales.length > 1
        ? `It sold ${sales.length} times in the last ${SALE_DAYS} days, most recently ${daysAgo(last.at, now)} ${where}.`
        : `It sold ${daysAgo(last.at, now)}, ${where}.`,
    ];
    const day = new Date(last.at).toISOString().slice(0, 10);
    const why = sales.length > 1
      ? `${sales.length} of them sold in the last few days`
      : `one ${last.type === 'DIS_SALE' ? 'went from a dispenser' : 'sold on the DEX'} ${daysAgo(last.at, now)}`;
    hooks.push(cardHook('sale', `sale:${asset}:${day}`, why, byAsset.get(asset)!, lead, look(asset)));
  }

  // The series still coming out.
  const series = Math.max(...cards.map((c) => c.series));
  const count = cards.filter((c) => c.series === series).length;
  const latest = released.filter((c) => c.series === series).slice(0, 4);
  if (Number.isFinite(series) && latest.length > 0 && count < 50) {
    hooks.push({
      key: `series:${series}:${count}`,
      kind: 'series',
      why: `series ${series} is still coming out, ${count} cards so far`,
      facts: [
        `Fake Rares series ${series} is still coming out: ${count} cards so far. Most earlier series ended at 50.`,
        `Its newest: ${latest.map((c) => `${c.asset}${cleanArtist(c.artist) ? ` by ${cleanArtist(c.artist)}` : ''} (${longDate(c.release!.date)})`).join('; ')}.`,
      ],
      cards: latest.map((c) => c.asset),
      artists: latest.map((c) => cleanArtist(c.artist)).filter((a): a is string => !!a),
    });
  }

  // Issued on this day in an earlier year. The date is the asset's issuance
  // on chain, which for the early series came before the series was put out.
  const today = new Date(now).toISOString().slice(5, 10);
  const year = new Date(now).getUTCFullYear();
  for (const c of released) {
    const [y, md] = [Number(c.release!.date.slice(0, 4)), c.release!.date.slice(5, 10)];
    if (md !== today || y >= year) continue;
    const n = year - y;
    const lead = [`Issued on this day ${n} year${n === 1 ? '' : 's'} ago.`];
    hooks.push(cardHook('birthday', `birthday:${c.asset}:${year}`, `it turns ${n} today`, c, lead, look(c.asset)));
  }

  return hooks;
}

/**
 * The hook to ask about: never one used before, never a card asked about in
 * the last CARD_REST_DAYS. A new card first, then a recent sale, then the
 * series or a birthday.
 */
export function pickHook(hooks: OpenerHook[], history: OpenerRecord[], rng: () => number = Math.random, now = Date.now()): OpenerHook | null {
  const used = new Set(history.map((r) => r.hook));
  const resting = new Set(history.filter((r) => now - r.at < CARD_REST_DAYS * DAY).flatMap((r) => r.cards ?? []));
  const fresh = hooks.filter((h) => !used.has(h.key) && !(h.kind !== 'series' && resting.has(h.cards[0])));
  for (const tier of [['new-card'], ['sale'], ['series', 'birthday']]) {
    const these = fresh.filter((h) => tier.includes(h.kind));
    if (these.length) return these[Math.floor(rng() * these.length) % these.length];
  }
  return null;
}

// ---------------------------------------------------------------- angles

/**
 * What the question is after. Drawn, never one used for the last few hooks
 * of its kind, so the room is not asked the same thing about each card.
 */
export const ANGLES: Record<HookKind, string[]> = {
  'new-card': [
    'did anyone get one',
    'what do people make of the art',
    'does anyone know what it is about, or what the artist was going for',
    'how does it sit next to the rest of the series so far',
  ],
  sale: [
    'was it somebody in here who picked it up',
    'has anyone else had their eye on it',
    'what do people think of the card itself',
    'has anyone here held one, and since when',
  ],
  series: [
    'who is going for the whole series',
    'what is everyone\'s favourite in it so far',
    'which one in it so far is the most slept on',
    'what do people hope the rest of the series brings',
  ],
  birthday: [
    'who has held it since it came out',
    'does anyone remember it coming out',
    'does it still hold up',
    'does anyone know the story behind it',
    'how did people end up with theirs',
  ],
};

/**
 * How the message is put together. Drawn too: given only the why and the
 * angle, ten birthdays in a row came out "X was issued 5 years ago today -
 * does anyone remember it coming out?".
 */
export const SHAPES = [
  'just the question, with why it comes up worked into it',
  'the question first, then why it comes up, in a few words',
  'why it comes up, in a few words, then the question',
  'a short, plain reaction of your own to why it comes up, then the question',
];

export function drawShape(history: OpenerRecord[], rng: () => number = Math.random): string {
  const recent = new Set(history.slice(-2).map((r) => r.shape));
  const fresh = SHAPES.filter((x) => !recent.has(x));
  return fresh[Math.floor(rng() * fresh.length) % fresh.length];
}

export function drawAngle(kind: HookKind, history: OpenerRecord[], rng: () => number = Math.random): string {
  const pool = ANGLES[kind];
  const recent = new Set(history.filter((r) => r.kind === kind).slice(-(pool.length - 1)).map((r) => r.angle));
  const fresh = pool.filter((a) => !recent.has(a));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rng() * from.length) % from.length];
}

// ---------------------------------------------------------------- prompts

export const OPENER_SYSTEM =
  "You are PEPEDAWN, a regular in the Fake Rares Telegram chat - collectors of Fake Rares, the Rare Pepe-style cards on Counterparty. Casual, plain-spoken, a bit dank, never metaphors. You talk like a collector in the chat, not a host or a brand account.";

export function buildOpenerPrompt(hook: OpenerHook, angle: string, shape: string, history: OpenerRecord[]): string {
  const asked = history.slice(-20).map((r) => `- ${oneLine(r.text)}`);
  return [
    'The Fake Rares chat has gone quiet. Ask the room ONE question about this - the kind of',
    'thing a collector in the chat would honestly want to know:',
    '',
    ...hook.facts.map((f) => `  ${f}`),
    '',
    `What to ask, in your own words: ${angle}?`,
    `Why it comes up today, which the message should make clear: ${hook.why}.`,
    `How to put it: ${shape}.`,
    '',
    '* One or two short lines, 30 words at most, ending in the question. lowercase is fine.',
    '* Leave out dates and numbers unless they are why it comes up today.',
    '* Do not describe the card back to the room - one detail of what is on it at most.',
    hook.kind === 'series'
      ? `* Say which series you mean.`
      : `* Name the card, written as ${hook.cards[0]}, so everyone knows which one you mean.`,
    '* Use only the facts above. Name no other card or artist, and add nothing about the card,',
    '  the artist or the story behind it that is not written there.',
    '* Sound like someone in the chat, not a host: no "hey everyone", no "drop your ... below",',
    '  no "let\'s discuss", no quiz, no "fun fact", no hashtags.',
    '* You are a bot, so ask - never claim. You do not own, hold, buy, sell, watch or remember anything.',
    '* Nothing about prices, the floor, value, or whether to buy or sell. No amounts of XCP, BTC or sats.',
    '* Plain words, no metaphors. Emoji: none, or one at most. Slang only if it comes naturally.',
    '* Do not say the chat is quiet or dead.',
    '',
    'Already asked - do not repeat any of these, or the way they were put:',
    ...(asked.length ? asked : ['(nothing yet)']),
    '',
    'Return only the message.',
  ].join('\n');
}

/** The cold second opinion: is this a real question, and only true? */
export function buildJudgePrompt(text: string, hook: OpenerHook): string {
  return [
    'A Telegram bot is about to post this into a chat of Fake Rares collectors, to get a conversation going:',
    '',
    `"""${text}"""`,
    '',
    'The only facts it was given:',
    ...hook.facts.map((f) => `  ${f}`),
    '',
    'Asking the room who holds a card, who got one, what they think of it or what they remember is ordinary',
    'collector talk and fine. Questions never count against it - judge only what it states as true.',
    '',
    'Answer ok:false if ANY of these is true:',
    '- it reads like a quiz with a right answer, an ad, a giveaway or a host\'s "drop your favourite below"',
    '- it states as true anything about a card, an artist or an event that is not in the facts above',
    '- it claims the bot owns, holds, bought, sold, watched or remembers something',
    '- it mentions a price, the floor or value, or asks whether to buy or sell',
    '- it does not read as plain, natural English',
    '- it mentions seed phrases, private keys or giveaways, or asks anyone to send or click anything',
    '- it is sexual, political, religious or hateful, or mocks anyone',
    '',
    'Return STRICT JSON: {"ok": true|false, "why": "<five words>"}',
  ].join('\n');
}

export function parseJudge(raw: string): { ok: boolean; why: string } {
  try {
    const m = /\{[\s\S]*\}/.exec(raw);
    const j = JSON.parse(m ? m[0] : raw);
    return { ok: j.ok === true, why: String(j.why ?? '') };
  } catch {
    return { ok: false, why: 'unparseable judge reply' };
  }
}

// ---------------------------------------------------------------- the checks

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

/** Slang tacked on the end, which is where the habit shows. */
const TAIL_SLANG = /(?:[\s,.;:!-]+(?:kek|ser|fren|frens|lfg|lol|lmao|ngl|tbh|gm|wagmi|ngmi))+([\s\p{Extended_Pictographic}️‍]*)$/iu;

function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, ' / ').trim();
}

/** Quotes and labels off, at most two lines, at most one emoji, no "kek" tacked on the end. */
export function cleanOpener(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
  s = s.replace(/^(?:message|opener|question)\s*:\s*/i, '');
  let kept = 0;
  s = s.replace(EMOJI_RE, (e) => (kept++ === 0 ? e : ''));
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
  s = s.replace(TAIL_SLANG, '$1');
  return s.replace(/\s+([.,!?])/g, '$1').trim();
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'me',
  'i', 'im', 'is', 'it', 'its', 'just', 'so', 'that', 'this', 'be', 'was', 'are', 'am', 'now',
  'still', 'up', 'out', 'like', 'your', 'you', 'ur', 'all', 'no', 'not', 'from', 'into', 'as',
  'anyone', 'here', 'who', 'what', 'did', 'do', 'does', 'has', 'have', 'got', 'one', 'any',
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(EMOJI_RE, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/'/g, ''))
    .filter(Boolean);
}

function contentWords(s: string): Set<string> {
  return new Set(words(s).filter((w) => !STOP.has(w) && w.length > 1));
}

export function similarity(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/** Room slang and plain words that happen to be card names too. */
const CAPS_OK = new Set(['GM', 'GN', 'KEK', 'HODL', 'WAGMI', 'NGMI', 'LFG', 'XCP', 'BTC', 'PEPECASH', 'NFT', 'IRL', 'ATH', 'FOMO', 'FUD', 'LOL', 'LMAO', 'RARE', 'RARES', 'FAKE', 'FAKES', 'PEPE', 'PEPES', 'DEX', 'OTC']);

/** Common words that happen to be artists' names, which openers may use. */
const ARTIST_WORDS_OK = new Set([
  'coasters', 'optimist', 'riven', 'costa', 'worm', 'easy b', 'ford', 'indelible', 'mellow', 'unknown',
  'chaotic', 'aquatic', 'peeps', 'porkchop', 'pinocchio', 'megatron', 'naples', 'odious', 'hues',
]);

let cardNames: Set<string> | null = null;
let artistNames: string[] | null = null;

function names(): { cards: Set<string>; artists: string[] } {
  if (!cardNames) cardNames = new Set(FULL_CARD_INDEX.map((c) => c.asset.toUpperCase()));
  if (!artistNames) {
    artistNames = [...new Set(FULL_CARD_INDEX.map((c) => (cleanArtist(c.artist) || '').toLowerCase()).filter((a) => a.length >= 4))]
      .filter((a) => !ARTIST_WORDS_OK.has(a));
  }
  return { cards: cardNames, artists: artistNames };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BAIT = /\b(seed ?phrase|recovery phrase|private key|send me|dm me|airdrop|giveaway|free (?:pepe|xcp|btc|sats)|connect (?:your|ur) wallet|click|t\.me|https?:|www\.)/i;
const OFF_LIMITS = /\b(sex\w*|nude\w*|naked|horny|porn\w*|weed|cocaine|meth|drugs?|stoned|nazi\w*|hitler|trump|biden|maga|jesus|allah|church|suicid\w*|rape\w*)\b/i;
const PRICE = /(\$\s?\d)|(\b\d[\d,.]*\s*(?:k\s*)?(?:xcp|btc|sats?|pepecash|usd|eth|dollars?|bucks)\b)/i;
const VALUE = /\b(floor|prices?|priced|pricing|worth|cheap|expensive|pump\w*|dump\w*|moon\w*|under-?valued|over-?valued|bargain|profit\w*|flip\w*|invest\w*|nfa)\b/i;
/** The bot holds nothing and bought nothing. */
const CLAIM = /\b(?:i|ive|i've|im|i'm|we)\s+(?:just\s+|finally\s+|also\s+|still\s+)?(?:bought|got|grabbed|own|hold|holding|picked|sold|scooped|aped|minted|snagged|remember|watched|was there)\b|\bmy\s+(?:copy|bag|bags|wallet|collection|set|binder|stack)\b/i;
const HOST = /\b(hey (?:everyone|fam|frens|folks|guys|all)|drop (?:your|ur|a|them)|let'?s discuss|sound off|comment below|fun fact|quiz|trivia|poll time)\b|👇/i;

/**
 * Why this line cannot go out, or null when it can. Everything here is
 * cheap and local; the judge call comes after.
 */
export function openerProblem(text: string, hook: OpenerHook, history: OpenerRecord[]): string | null {
  if (!text || text.length < 12) return 'too short';
  if (text.length > 240) return 'too long';
  if (words(text).length > 40) return 'too many words';
  if (!text.includes('?')) return 'not a question';
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text.replace(EMOJI_RE, ''))) return 'not latin script';
  if (/[\[\]{}<>|\\_^~`#*=]/.test(text)) return 'junk characters';
  if (/\S{28,}/.test(text.replace(EMOJI_RE, ''))) return 'a run-on word';
  if (/@\w/.test(text)) return 'mentions someone';
  if (BAIT.test(text)) return 'scam bait';
  if (OFF_LIMITS.test(text)) return 'off limits';
  if (PRICE.test(text) || VALUE.test(text)) return 'about price';
  if (CLAIM.test(text)) return 'claims something the bot did not do';
  if (HOST.test(text)) return 'sounds like a host';
  if ((text.match(EMOJI_RE) ?? []).length > 1) return 'too many emoji';
  if (/\b(quiet|dead|silent|silence)\b.*\b(chat|room|here|group)\b|\b(chat|room|group)\b.*\b(quiet|dead|silent)\b/i.test(text)) return 'about the quiet';

  const upper = text.toUpperCase();
  if (hook.kind !== 'series' && !new RegExp(`(^|[^A-Z0-9])${escapeRe(hook.cards[0].toUpperCase())}($|[^A-Z0-9])`).test(upper)) {
    return `does not name ${hook.cards[0]}`;
  }
  const { cards, artists } = names();
  const allowedCards = new Set(hook.cards.map((c) => c.toUpperCase()));
  for (const w of text.match(/\b[A-Z][A-Z0-9.]{3,}\b/g) ?? []) {
    if (!CAPS_OK.has(w) && cards.has(w) && !allowedCards.has(w)) return `names another card, ${w}`;
  }
  const lower = text.toLowerCase();
  const allowedArtists = new Set(hook.artists.map((a) => a.toLowerCase()));
  for (const a of artists) {
    if (allowedArtists.has(a)) continue;
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(a)}($|[^a-z0-9])`).test(lower)) return `names another artist, ${a}`;
  }

  const w = words(text);
  const opening = w.slice(0, 4).join(' ');
  for (const past of history.slice(-10)) {
    const pw = words(past.text);
    if (w.length >= 4 && pw.length >= 4 && pw.slice(0, 4).join(' ') === opening) return 'same opening as a recent opener';
  }
  for (const past of history) {
    if (similarity(text, past.text) >= 0.5) return `too close to "${oneLine(past.text).slice(0, 60)}"`;
  }
  return null;
}

// ---------------------------------------------------------------- the store

export interface OpenerRecord {
  at: number;
  text: string;
  hook?: string;
  kind?: HookKind;
  angle?: string;
  shape?: string;
  cards?: string[];
  chatId?: string;
}

export function readOpeners(path = quietOpenersPath()): OpenerRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as OpenerRecord; } catch { return null; } })
    .filter((r): r is OpenerRecord => !!r && typeof r.text === 'string');
}

export function recordOpener(rec: OpenerRecord, path = quietOpenersPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(rec) + '\n', 'utf8');
}

export function openersBetween(from: number, to: number, path = quietOpenersPath()): OpenerRecord[] {
  return readOpeners(path).filter((r) => r.at >= from && r.at < to);
}

// ---------------------------------------------------------------- compose

export interface ComposeDeps {
  hooks: OpenerHook[];
  history: OpenerRecord[];
  /** The writing call: returns the model's raw text. */
  generate: (prompt: string, system: string) => Promise<string>;
  /** The cold call: returns the judge's raw reply. */
  judge: (prompt: string) => Promise<string>;
  rng?: () => number;
  now?: number;
  log?: (line: string) => void;
  attempts?: number;
}

export interface ComposedOpener {
  text: string;
  hook: OpenerHook;
  angle: string;
  shape: string;
}

/**
 * One opener that passed both gates - or null when there is nothing fresh to
 * ask about, or every attempt was thrown out. A hook gets two tries, each
 * from a different angle, before the next one is taken.
 */
export async function composeQuietOpener(deps: ComposeDeps): Promise<ComposedOpener | null> {
  const rng = deps.rng ?? Math.random;
  const log = deps.log ?? (() => {});
  const attempts = deps.attempts ?? 4;
  const tries = new Map<string, number>();
  // Rejected angles count as recent too, so a retry asks it another way.
  const tried: OpenerRecord[] = [];
  for (let i = 0; i < attempts; i++) {
    const hook = pickHook(deps.hooks.filter((h) => (tries.get(h.key) ?? 0) < 2), deps.history, rng, deps.now);
    if (!hook) {
      if (i === 0) log('nothing fresh to ask about');
      return null;
    }
    tries.set(hook.key, (tries.get(hook.key) ?? 0) + 1);
    const angle = drawAngle(hook.kind, [...deps.history, ...tried], rng);
    const shape = drawShape([...deps.history, ...tried], rng);
    tried.push({ at: 0, text: '', kind: hook.kind, angle, shape });
    let text: string;
    try {
      text = cleanOpener(await deps.generate(buildOpenerPrompt(hook, angle, shape, deps.history), OPENER_SYSTEM));
    } catch (error) {
      log(`generate failed: ${String(error).slice(0, 120)}`);
      continue;
    }
    const problem = openerProblem(text, hook, deps.history);
    if (problem) {
      log(`rejected (${problem}): ${oneLine(text).slice(0, 120)}`);
      continue;
    }
    let verdict: { ok: boolean; why: string };
    try {
      verdict = parseJudge(await deps.judge(buildJudgePrompt(text, hook)));
    } catch (error) {
      log(`judge failed: ${String(error).slice(0, 120)}`);
      continue;
    }
    if (!verdict.ok) {
      log(`judge rejected (${verdict.why}): ${oneLine(text).slice(0, 120)}`);
      continue;
    }
    return { text, hook, angle, shape };
  }
  return null;
}

/** For Telegram's HTML parse mode, which the quiet-room send uses. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

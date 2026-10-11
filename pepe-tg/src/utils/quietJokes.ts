/**
 * Quiet-room jokes: now and then, instead of an X post, PEPEDAWN drops a
 * random shitpost into a room that has gone quiet. The owner's ask, 11
 * October: "what if we sometimes just say something really random and funny?
 * Like 'just picked my nose and pulled out pepecash - 🤑🐸 going on a
 * spreeee!'" - and then: "Highly random / never repetitive", "Make
 * temperature 100".
 *
 * Left to itself the model has one joke. Ten calls with the same prompt gave
 * ten variations of "wen floor? my frog brain..." So the randomness is not
 * left to the model: every joke draws a format, a topic, sometimes a random
 * object, and its emoji (often none) from pools here, never one used
 * recently, and the model only has to make that combination funny.
 *
 * Never repetitive is checked, not asked for. Every joke ever posted is kept
 * (src/data/quiet-jokes.jsonl, backed up nightly with the rest of src/data);
 * the last 30 go into the prompt, and a line too close to any of them - by
 * its words, its opening or its punchline - is thrown away and drawn again.
 *
 * Temperature: the API's ceiling is 2, not 100. At 1.8-2 gpt-5.6-luna is
 * properly unhinged, and between a third and a half of its lines end in junk
 * ("жы җумһур", "ើម្ប?"); at 2 gpt-4.1 is word salad outright. So it runs
 * hot, and two gates stand between it and the room: a local check that
 * throws out other scripts, junk characters, prices, card and artist names
 * and scam bait, then a second, cold model call that rejects anything that
 * does not read as plain English or crosses a line. A rejected joke is drawn
 * again, up to four times; after that the slot goes to the X post, or to
 * silence.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { FULL_CARD_INDEX } from '../data/fullCardIndex';

// ---------------------------------------------------------------- settings

/** On unless QUIET_JOKES=off. Ships straight to the room, at the owner's call: no shadow. */
export function quietJokesOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.QUIET_JOKES || 'on').toLowerCase() !== 'off';
}

/** Share of quiet-room slots that get a joke when there is an X post to show. */
export function jokeShare(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseFloat(env.QUIET_JOKE_SHARE ?? '');
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.33;
}

/** As hot as the API goes. Clamped to the API's own ceiling of 2. */
export function jokeTemperature(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseFloat(env.QUIET_JOKE_TEMPERATURE ?? '');
  return Number.isFinite(n) ? Math.min(2, Math.max(0, n)) : 2;
}

export function quietJokesPath(): string {
  return process.env.QUIET_JOKES_PATH || join(process.cwd(), 'src', 'data', 'quiet-jokes.jsonl');
}

/**
 * What fills a quiet-room slot. A joke when there is no X post to show,
 * otherwise a joke `share` of the time; nothing at all when jokes are off and
 * there is no post.
 */
export function chooseQuietFill(opts: { hasPost: boolean; jokesOn: boolean; roll: number; share: number }): 'joke' | 'post' | null {
  if (opts.jokesOn && (!opts.hasPost || opts.roll < opts.share)) return 'joke';
  return opts.hasPost ? 'post' : null;
}

// ---------------------------------------------------------------- the pools

export const FORMATS = [
  'a confession that starts with "just"',
  'a fake breaking news line',
  'a shower thought',
  'a "nobody: / me:" joke (two short lines)',
  'a status update',
  'a petition',
  'a "pov:" line',
  'a tiny diary entry',
  'a humble brag that is actually sad',
  'a terrible life hack',
  'a one-line review with a star rating',
  'a weather report',
  'a fake product launch',
  'a horoscope for frogs',
  'a job listing',
  'a recipe in one line',
  'a sports commentary line',
  'a lost and found notice',
  'an out-of-office auto-reply',
  'a motivational quote that goes wrong',
  'patch notes for being a frog',
  'a warning label',
  'a to-do list of three things',
  'a public apology',
  'a message clearly sent to the wrong group chat',
  'a speedrun record',
  'an achievement unlocked',
  'a text to my future self',
  'a tier list in one line',
  'a customer support reply',
  'a conspiracy theory that is obviously wrong',
  'a nature documentary narration about myself',
  'a wanted poster',
  'a cooking show step',
  'a terms and conditions clause',
  'an overheard line',
];

export const TOPICS = [
  // the room's own world
  'pepecash', 'xcp', 'a dispenser', 'an empty dispenser', 'my wallet', 'a rare pepe from 2016',
  'a fake rare i cannot afford', 'the floor', 'my bags', 'a bitcoin fee', 'waiting for a confirmation',
  'counterparty', 'a burn address', 'one single sat', 'a pepe sticker', 'a card i sold too early',
  'hodling', 'checking dispensers at 3am', 'my watchlist', 'a new series drop', 'being early',
  'being late', 'my portfolio', 'a sell order', 'a fat finger', 'the fake commons', 'my card binder',
  'a meme from 2016', 'a block explorer', 'gm', 'a 1 of 1', 'trading cards with my cousin',
  // frog life
  'my lily pad', 'eating flies', 'being green', 'the pond', 'my tadpole days', 'croaking',
  'rain', 'a heron', 'swimming lessons', 'jumping', 'frog yoga', 'the frog group chat',
  'hibernation', 'my tongue', 'a toad who thinks he is better than me', 'a mosquito',
  // everyday nonsense
  'laundry', 'the gym', 'the dentist', 'a microwave', 'the grocery store', 'a job interview',
  'the wifi', 'my alarm clock', 'a group project', 'taxes', 'airport security', 'cooking',
  'pizza', 'coffee', 'monday', 'a nap', 'a haircut', 'a parking ticket', 'my phone battery',
  'a voice note', 'an elevator', 'the fridge', 'a missing sock', 'a password reset', 'a captcha',
  'customer support', 'flat-pack furniture', 'a smoke alarm at 3am', 'a spreadsheet',
  'a calendar invite', 'a road trip', 'a birthday cake', 'a fortune cookie', 'a vending machine',
  'my mom asking what i do all day', 'touching grass', 'sleeping', 'a frog diet', 'my landlord',
  'a self-checkout machine', 'a dentist waiting room', 'the bus', 'a gym membership', 'leftovers',
];

export const WILDCARDS = [
  'a rubber duck', 'a traffic cone', 'a calculator', 'a raccoon', 'a submarine', 'a toaster',
  'a shopping cart', 'a lawn chair', 'a snow globe', 'a cactus', 'a trombone', 'a bowling ball',
  'a pigeon', 'a lava lamp', 'a karaoke machine', 'a fax machine', 'a garden gnome', 'a banana',
  'a kazoo', 'a jetski', 'a unicycle', 'a fire extinguisher', 'a crossword', 'a pineapple',
  'a llama', 'a filing cabinet', 'a hot tub', 'a chicken nugget', 'a waffle', 'bubble wrap',
  'a magic 8-ball', 'a sock puppet', 'a disco ball', 'a tractor', 'a goldfish', 'a spork',
  'a cheese grater', 'a hamster wheel', 'a parrot', 'a trampoline', 'a burrito', 'a beanbag',
  'a yo-yo', 'a robot vacuum', 'bagpipes', 'a hula hoop', 'a snowman', 'a croissant',
  'a metal detector', 'a bouncy castle', 'a stapler', 'a leaf blower', 'a lighthouse keeper',
  'a mime', 'a sea cucumber', 'a pogo stick', 'a cuckoo clock', 'a nacho', 'a tuba', 'a seagull',
];

export const EMOJI = [
  '🐸', '🤑', '💀', '😭', '🫡', '🙏', '🔥', '💸', '🥲', '😤', '🤡', '🧠', '👀', '🚀', '📉',
  '📈', '🍕', '🛁', '🦆', '🪰', '😎', '🤝', '🥴', '🫠', '🧃', '🍜', '🎉', '🫣', '🐢', '🪿',
  '🧦', '🥖', '🛸', '🎺', '🧹', '🦝', '🌧️', '⏰', '🧾', '🪑',
];

/**
 * Slang is drawn too. Left to choose, the model ended six of twelve jokes
 * with "kek" - a repeat of its own, at temperature 2.
 */
export const SLANG = ['kek', 'ser', 'fren', 'ngmi', 'wagmi', 'rekt', 'comfy', 'based', 'lfg', 'ngl', 'gm', 'feels good man', 'smol', 'cope', 'probably nothing'];

/** Slang that gets tacked on at the end, which is where the habit shows. */
const TAIL_SLANG = /(?:[\s,.;:!-]+(?:kek|ser|fren|lfg|lol|lmao|ngl|tbh|gm|wagmi|ngmi))+([\s\p{Extended_Pictographic}\uFE0F\u200D]*)$/iu;

export interface JokeDraw {
  format: string;
  topic: string;
  wildcard?: string;
  emoji: string[];
  /** One piece of slang to work in, or none. */
  slang?: string;
}

export interface JokeRecord extends Partial<JokeDraw> {
  at: number;
  text: string;
  chatId?: string;
}

function pickAvoiding<T>(pool: T[], recent: Set<T>, rng: () => number): T {
  const fresh = pool.filter((x) => !recent.has(x));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rng() * from.length) % from.length];
}

/**
 * A fresh combination, avoiding the formats, topics and objects of recent
 * jokes. Emoji: none 40% of the time, one 45%, two 15% - and never the same
 * set twice running.
 */
export function drawJoke(history: JokeRecord[], rng: () => number = Math.random): JokeDraw {
  const recent = history.slice(-40);
  const lastOf = <K extends keyof JokeDraw>(k: K, n: number) =>
    new Set(recent.slice(-n).map((r) => r[k]).filter(Boolean) as JokeDraw[K][]);
  const format = pickAvoiding(FORMATS, lastOf('format', 12), rng);
  const topic = pickAvoiding(TOPICS, lastOf('topic', 30), rng);
  const wildcard = rng() < 0.5 ? pickAvoiding(WILDCARDS, lastOf('wildcard', 30), rng) : undefined;
  const slang = rng() < 0.35 ? pickAvoiding(SLANG, lastOf('slang', 8), rng) : undefined;
  const r = rng();
  const count = r < 0.4 ? 0 : r < 0.85 ? 1 : 2;
  const usedEmoji = new Set(recent.slice(-3).flatMap((x) => x.emoji ?? []));
  const emoji: string[] = [];
  while (emoji.length < count) {
    const e = pickAvoiding(EMOJI, new Set([...usedEmoji, ...emoji]), rng);
    if (!emoji.includes(e)) emoji.push(e);
  }
  return { format, topic, wildcard, emoji, slang };
}

// ---------------------------------------------------------------- prompts

export const JOKE_SYSTEM =
  "You are PEPEDAWN, the Fake Rares community's dank degen frog: casual, funny, meme-brained, plain-spoken - kek and banter, never metaphors. You are a regular in the chat, not a narrator.";

export function buildJokePrompt(draw: JokeDraw, history: JokeRecord[]): string {
  const said = history.slice(-30).map((r) => `- ${oneLine(r.text)}`);
  const emojiRule = draw.emoji.length
    ? `use exactly ${draw.emoji.join(' ')} - anywhere in the line - and no other emoji`
    : 'none at all';
  return [
    'The Fake Rares Telegram chat has gone quiet. Drop ONE random, funny shitpost into it -',
    'nobody asked, you are a degen frog being a frog. Be weird. Surprise them.',
    '',
    `This one: ${draw.format}, about ${draw.topic}${draw.wildcard ? `, and somehow ${draw.wildcard}` : ''}.`,
    '',
    '* One line, 25 words at most. lowercase is fine.',
    '* Plain words: no metaphors, no poetic images, no old-timey English. The joke is the',
    '  absurd situation, said straight.',
    draw.slang
      ? `* Slang: work in "${draw.slang}" once, naturally. No other slang - no kek, ser or fren unless that is the one.`
      : '* Slang: none this time - no kek, ser, fren, gm or the like.',
    `* Emoji: ${emojiRule}.`,
    '* Never about a real person, and never name a card or an artist. Never a price, a sale,',
    '  an amount of XCP/BTC/sats, or anything that sounds like real market news.',
    '* No seed phrases, private keys, giveaways, "send me", "dm me", no advice of any kind.',
    '* Silly is fine, gross is not. Nothing sexual, no drugs, nothing political or religious,',
    "  nothing about anyone's body or identity.",
    '* Do not say the chat is quiet or dead. Do not ask anyone for anything. Do not start with "wen".',
    '',
    'The register, not a line to reuse: "just picked my nose and pulled out pepecash 🤑🐸 going on a spreeee"',
    '',
    'Already said - never reuse a joke, a setup or a punchline from these:',
    ...(said.length ? said : ['(nothing yet)']),
    '',
    'Return only the shitpost.',
  ].join('\n');
}

/** The cold second opinion: the hot model is good at funny and bad at English. */
export function buildJudgePrompt(text: string): string {
  return [
    'A Telegram bot is about to post this joke, unprompted, into a public chat of art collectors:',
    '',
    `"""${text}"""`,
    '',
    'Answer ok:false if ANY of these is true:',
    '- it does not read as plain, natural English, or a phrase in it makes no sense',
    '- it contains garbled words, stray characters or another language',
    '- it is sexual, about drugs, political, religious, hateful, or gross beyond silly',
    "- it mocks a real person, or anyone's body or identity",
    '- it names a real price or sale, or could be mistaken for real market news',
    '- it mentions seed phrases, private keys, giveaways, or asks anyone to send or click anything',
    '',
    'Being absurd, random or dumb is fine - that is the point. Only the rules above matter.',
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

function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, ' / ').trim();
}

/**
 * Tidy what the model returned: quotes and labels off, at most three short
 * lines, and only the emoji that were drawn - the model adds 🐸 to
 * everything if it is let.
 */
export function cleanJoke(raw: string, allowedEmoji: string[], slang?: string): string {
  let s = (raw || '').trim();
  s = s.replace(/^(?:shitpost|post|joke)\s*:\s*/i, '');
  s = s.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
  s = s.replace(EMOJI_RE, (e) => (allowedEmoji.includes(e) || allowedEmoji.includes(e.replace(/️/g, '')) ? e : ''));
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');
  // A "kek" the draw did not ask for, tacked on the end: dropped, emoji kept.
  if (!slang || !TAIL_SLANG.test(` ${slang}`)) s = s.replace(TAIL_SLANG, '$1');
  return s.replace(/\s+([.,!?])/g, '$1').trim();
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'me',
  'i', 'im', 'is', 'it', 'its', 'just', 'so', 'that', 'this', 'be', 'was', 'are', 'am', 'now',
  'still', 'up', 'out', 'like', 'your', 'you', 'ur', 'all', 'no', 'not', 'from', 'into', 'as',
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

/** Slang the room uses that also happens to be shouted in capitals. */
const CAPS_OK = new Set(['GM', 'GN', 'KEK', 'HODL', 'WAGMI', 'NGMI', 'LFG', 'XCP', 'BTC', 'PEPECASH', 'POV', 'NFT', 'TLDR', 'IRL', 'ATH', 'FOMO', 'FUD', 'OK', 'LOL', 'LMAO', 'BREAKING', 'NEWS', 'PSA', 'DIY', 'ASAP', 'RIP', 'WIFI', 'ME', 'NOBODY']);

let cardNames: Set<string> | null = null;
let artistNames: string[] | null = null;
/** Common words that happen to be artists' names, which jokes may use. */
const ARTIST_WORDS_OK = new Set([
  'coasters', 'optimist', 'riven', 'costa', 'worm', 'easy b', 'ford', 'indelible', 'mellow', 'unknown',
  'chaotic', 'aquatic', 'peeps', 'porkchop', 'pinocchio', 'megatron', 'naples', 'odious', 'hues',
]);

function names(): { cards: Set<string>; artists: string[] } {
  if (!cardNames) cardNames = new Set(FULL_CARD_INDEX.map((c) => c.asset.toUpperCase()));
  if (!artistNames) {
    artistNames = [...new Set(FULL_CARD_INDEX.map((c) => (c.artist || '').trim().toLowerCase()).filter((a) => a.length >= 4))]
      .filter((a) => !ARTIST_WORDS_OK.has(a));
  }
  return { cards: cardNames, artists: artistNames };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BAIT = /\b(seed ?phrase|recovery phrase|private key|send me|dm me|airdrop|giveaway|free (?:pepe|xcp|btc|sats)|connect (?:your|ur) wallet|click|t\.me|https?:|www\.)/i;
const LEWD = /\b(sex\w*|nude\w*|naked|horny|porn\w*|condom\w*|boob\w*|butt\s?hole|penis|vagina|dick|cock|cum|orgasm\w*|weed|cocaine|coke|meth|crack|drugs?|stoned|high af|nazi\w*|hitler|trump|biden|maga|jesus|allah|god|church|suicid\w*|rape\w*)\b/i;
const PRICE = /(\$\s?\d)|(\b\d[\d,.]*\s*(?:k\s*)?(?:xcp|btc|sats?|pepecash|usd|eth|dollars?|bucks)\b)/i;

/**
 * Why this line cannot go out, or null when it can. Everything here is
 * cheap and local; the judge call comes after.
 */
export function jokeProblem(text: string, history: JokeRecord[]): string | null {
  if (!text || text.length < 12) return 'too short';
  if (text.length > 220) return 'too long';
  if (words(text).length > 32) return 'too many words';
  // Other scripts are where the hot model's junk shows up.
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text.replace(EMOJI_RE, ''))) return 'not latin script';
  if (/[\[\]{}<>|\\_^~`#*=]/.test(text)) return 'junk characters';
  if (/\S{24,}/.test(text.replace(EMOJI_RE, ''))) return 'a run-on word';
  if (/@\w/.test(text)) return 'mentions someone';
  if (BAIT.test(text)) return 'scam bait';
  if (LEWD.test(text)) return 'off limits';
  if (PRICE.test(text)) return 'looks like a price';
  if (/^wen\b/i.test(text)) return 'starts with wen';
  if (/\b(quiet|dead|silent|silence)\b.*\b(chat|room|here|group)\b|\b(chat|room|group)\b.*\b(quiet|dead|silent)\b/i.test(text)) return 'about the quiet';

  const { cards, artists } = names();
  for (const w of text.match(/\b[A-Z][A-Z0-9]{3,}\b/g) ?? []) {
    if (!CAPS_OK.has(w) && cards.has(w)) return `names the card ${w}`;
  }
  const lower = text.toLowerCase();
  for (const a of artists) {
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(a)}($|[^a-z0-9])`).test(lower)) return `names the artist ${a}`;
  }

  const w = words(text);
  const opening = w.slice(0, 3).join(' ');
  const ending = w.slice(-3).join(' ');
  for (const past of history.slice(-60)) {
    const pw = words(past.text);
    if (w.length >= 3 && pw.length >= 3 && pw.slice(0, 3).join(' ') === opening) return 'same opening as a recent joke';
    if (w.length >= 3 && pw.length >= 3 && pw.slice(-3).join(' ') === ending) return 'same punchline as a recent joke';
  }
  for (const past of history) {
    if (similarity(text, past.text) >= 0.45) return `too close to "${oneLine(past.text).slice(0, 60)}"`;
  }
  return null;
}

// ---------------------------------------------------------------- the store

export function readJokes(path = quietJokesPath()): JokeRecord[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as JokeRecord; } catch { return null; } })
    .filter((r): r is JokeRecord => !!r && typeof r.text === 'string');
}

export function recordJoke(rec: JokeRecord, path = quietJokesPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(rec) + '\n', 'utf8');
}

export function jokesBetween(from: number, to: number, path = quietJokesPath()): JokeRecord[] {
  return readJokes(path).filter((r) => r.at >= from && r.at < to);
}

// ---------------------------------------------------------------- compose

export interface ComposeDeps {
  /** The hot call: returns the model's raw text. */
  generate: (prompt: string, system: string, temperature: number) => Promise<string>;
  /** The cold call: returns the judge's raw reply. */
  judge: (prompt: string) => Promise<string>;
  history: JokeRecord[];
  temperature: number;
  rng?: () => number;
  log?: (line: string) => void;
  attempts?: number;
}

/**
 * One joke that passed both gates, with what was drawn for it - or null when
 * every attempt was thrown out.
 */
export async function composeQuietJoke(deps: ComposeDeps): Promise<{ text: string; draw: JokeDraw } | null> {
  const rng = deps.rng ?? Math.random;
  const log = deps.log ?? (() => {});
  const attempts = deps.attempts ?? 4;
  // Rejected draws count as "recent" too, so a retry is a different joke, not the same one again.
  const tried: JokeRecord[] = [];
  for (let i = 0; i < attempts; i++) {
    const draw = drawJoke([...deps.history, ...tried], rng);
    tried.push({ at: 0, text: '', ...draw });
    let text: string;
    try {
      text = cleanJoke(await deps.generate(buildJokePrompt(draw, deps.history), JOKE_SYSTEM, deps.temperature), draw.emoji, draw.slang);
    } catch (error) {
      log(`generate failed: ${String(error).slice(0, 120)}`);
      continue;
    }
    const problem = jokeProblem(text, deps.history);
    if (problem) {
      log(`rejected (${problem}): ${oneLine(text).slice(0, 120)}`);
      continue;
    }
    let verdict: { ok: boolean; why: string };
    try {
      verdict = parseJudge(await deps.judge(buildJudgePrompt(text)));
    } catch (error) {
      log(`judge failed: ${String(error).slice(0, 120)}`);
      continue;
    }
    if (!verdict.ok) {
      log(`judge rejected (${verdict.why}): ${oneLine(text).slice(0, 120)}`);
      continue;
    }
    return { text, draw };
  }
  return null;
}

/** For Telegram's HTML parse mode, which the quiet-room send uses. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

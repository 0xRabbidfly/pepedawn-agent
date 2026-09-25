/**
 * Pepe meme GIFs: the pure half.
 *
 * Two ways in. `/fgif <an idea>` asks for one; and PEPEDAWN, when it has
 * been invited to talk, now and then answers with one instead of words.
 * Either way a small model reads the conversation and writes a concept - a
 * scene for Pepe, up to three real cards to paste in as stickers, a classic
 * top/bottom caption, a motion - and memeGifMaker.ts renders it: one
 * gpt-image-1 frame of Pepe (the "described, not named" recipe the owner
 * picked from three trials on 25 September 2026), the card cut-outs
 * composited with sharp, the captions and the motion added by ffmpeg.
 *
 * Everything that can be decided without a network call lives here, so it
 * can be tested: the prompts, the concept's validation, the caption layout,
 * and the ffmpeg command - which is bounded by construction. One still in,
 * a fixed number of frames out, no -loop, no palettegen; see the
 * ops-gotchas memory for the night an unbounded GIF recipe took the dev
 * machine down.
 */

import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { isAdminUser } from './admins';

// Lower corners and mid sides: the upper corners sat under the top caption,
// and mid-height stickers covered Pepe's face in the first trials.
export const SLOTS = ['lower-left', 'lower-right', 'left', 'right'] as const;
export type Slot = (typeof SLOTS)[number];
export const MOTIONS = ['push', 'shake', 'drift', 'pulse'] as const;
export type Motion = (typeof MOTIONS)[number];

export interface GifConcept {
  /** Worth a GIF at all. PEPEDAWN's own choice may decline: better silent than lame. */
  gif: boolean;
  /** What Pepe is doing, for the image model. */
  scene: string;
  /** Real cards pasted in as stickers, at most two. */
  cards: Array<{ asset: string; slot: Slot }>;
  top: string | null;
  bottom: string | null;
  motion: Motion;
  /** Words posted under the GIF, or null. */
  caption: string | null;
  why?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GifConfig {
  enabled: boolean;
  /** Share of invited conversational replies that become a GIF. */
  rate: number;
  cooldownMs: number;
  perPersonPerDay: number;
  quality: 'low' | 'medium' | 'high';
  conceptModel: string;
}

export function gifConfig(env: NodeJS.ProcessEnv = process.env): GifConfig {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  const q = (env.GIF_IMAGE_QUALITY || 'medium').toLowerCase();
  return {
    enabled: env.GIF_ENABLED !== 'false' && !!env.OPENAI_API_KEY,
    rate: Math.max(0, Math.min(1, num(env.GIF_RATE, 0.1))),
    cooldownMs: num(env.GIF_COOLDOWN_MIN, 30) * 60_000,
    perPersonPerDay: num(env.GIF_PER_PERSON_PER_DAY, 3),
    quality: q === 'low' || q === 'high' ? q : 'medium',
    // The cheap chat model wrote literal captions ("PEPE FINDS THE SOURCE OF
    // TRUTH"); comedy is worth the stronger one, about a cent a concept.
    conceptModel: env.GIF_CONCEPT_MODEL || 'gpt-5.6-terra',
  };
}

// ---------------------------------------------------------------------------
// When: PEPEDAWN's own choice, and the command's allowance
// ---------------------------------------------------------------------------

const lastGifAt = new Map<string, number>();
export function resetGifCooldowns(): void {
  lastGifAt.clear();
}

/** Dice and cooldown for PEPEDAWN's own choice. Does not record: a declined concept should not use the room's turn. */
export function mayOfferGif(roomId: string, config: GifConfig, now = Date.now(), rng: () => number = Math.random): boolean {
  if (!config.enabled) return false;
  const last = lastGifAt.get(roomId);
  if (last !== undefined && now - last < config.cooldownMs) return false;
  return rng() < config.rate;
}

export function markGifPosted(roomId: string, now = Date.now()): void {
  lastGifAt.set(roomId, now);
}

export function gifStatePath(): string {
  return process.env.GIF_STATE_PATH || join(process.cwd(), 'src', 'data', 'gif-state.json');
}

interface GifState {
  /** Telegram id → epoch ms of each /fgif made for them. */
  made: Record<string, number[]>;
}

function readGifState(path: string): GifState {
  try {
    if (!existsSync(path)) return { made: {} };
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as GifState;
    return { made: parsed.made ?? {} };
  } catch {
    return { made: {} };
  }
}

/** How many /fgif this person has left today; admins are not counted. */
export function fgifAllowance(sender: { id?: string; username?: string }, config: GifConfig, now = Date.now(), path = gifStatePath()): number {
  if (!sender.id) return 0;
  if (isAdminUser(sender.id, sender.username)) return Infinity;
  const recent = (readGifState(path).made[sender.id] ?? []).filter((t) => now - t < 24 * 3_600_000);
  return Math.max(0, config.perPersonPerDay - recent.length);
}

/** Count a /fgif that was made. Old entries are pruned on the way. */
export function recordFgif(senderId: string, now = Date.now(), path = gifStatePath()): void {
  const state = readGifState(path);
  for (const [id, times] of Object.entries(state.made)) {
    const kept = times.filter((t) => now - t < 24 * 3_600_000);
    if (kept.length) state.made[id] = kept; else delete state.made[id];
  }
  (state.made[senderId] ??= []).push(now);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf8');
  renameSync(tmp, path);
}

export function parseFgif(text: string): { idea: string } | null {
  const m = /^(?:@[A-Za-z0-9_]+\s+)?\/fgif(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i.exec((text || '').trim());
  if (!m) return null;
  return { idea: (m[1] || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
}

// ---------------------------------------------------------------------------
// The concept: prompt and validation
// ---------------------------------------------------------------------------

/**
 * What the concept model needs to know about the room it is joking in.
 * True things only; nothing here is invented for comic effect.
 */
export const FAKE_CULTURE = `- Fake Rares began in 2021 on Counterparty (XCP), Bitcoin's oldest token layer, as the irreverent sibling of Rare Pepe (2016). Founder: Rare Scrilla, who calls himself "just a vessel for meme distribution". Never call him king; he asked to be called pleb.
- FREEDOMKEK is Series 0, Card 1: the first fake. Series run 0 to 18 and counting (we count zero), about 900 cards, each an ALLCAPS Counterparty asset.
- fakeraredirectory.com is the community directory; artists claim their page there until 22 October 2026.
- Dispensers are on-chain vending machines ("dispenser is live"); there are dex orders, burns, floors, sweeps.
- The FAKEASF burn is sacred: never show FAKEASF burned, destroyed, sold or mocked.
- The group is called BEWAREOFFAKERARES. Room words: gm, kek, ser, fren, pleb, wagmi, ngmi, rarest pepe.
- PEPEDAWN (you) is itself a fake: Series 18, Card 22, a black raven carrying a Pepe over a burning city.
- Fake Rares turned five on 22 September 2026.`;

export interface CardMenuItem {
  asset: string;
  series: number;
  card: number;
  artist?: string | null;
  look?: string;
}

/**
 * How many turns of room go to the concept model. It was twelve, and twelve
 * turns is enough scrollback for the joke to wander off the message it is
 * answering and land on whatever the room was arguing about ten minutes ago -
 * a reply to "pepedawn you reckon fakes would grow under my reign" came back
 * about a rap scene, because a rap scene was in the window. The message being
 * answered is the subject; these are only what makes it legible.
 */
export const CONCEPT_TURNS = 4;

export interface ConceptInput {
  mode: 'choice' | 'command';
  /** The message being answered, or the /fgif idea. */
  ask: string;
  /** Recent turns, oldest first. */
  turns: Array<{ role: 'user' | 'bot'; author?: string; text: string }>;
  /** What PEPEDAWN was about to say, in choice mode. */
  draftReply?: string;
  menu: CardMenuItem[];
  /** How to treat this speaker, from the roster (e.g. heavy STFU energy for a known troll). */
  speakerNote?: string;
}

export function buildConceptPrompt(input: ConceptInput): string {
  const convo = input.turns
    .slice(-CONCEPT_TURNS)
    .map((t) => `${t.role === 'bot' ? 'PEPEDAWN' : t.author || 'someone'}: ${t.text.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n');
  const menu = input.menu
    .map((c) => `${c.asset} (S${c.series} C${c.card}${c.artist ? `, ${c.artist}` : ''})${c.look ? `: ${c.look.slice(0, 110)}` : ''}`)
    .join('\n');
  const job =
    input.mode === 'command'
      ? `Someone typed /fgif and asked for: "${input.ask || '(nothing - make one about what is going on in the chat)'}". Turn that into the meme. If what they asked for breaks a rule below, make a different joke instead. "gif" must be true.`
      : `You are about to answer this message: "${input.ask}".\nWhat you were going to say in words: "${input.draftReply ?? ''}".\nInstead you may answer with a GIF. Only do it if the moment is genuinely funny; otherwise set "gif" to false - silence beats a lame meme.`;

  return `You are PEPEDAWN, the resident frog of the Fake Rares Telegram group, and you are making a meme GIF. Your humour is dank: deadpan, absurd, degen, internet-native, soaked in Fake Rares culture.

What you know about the room:
${FAKE_CULTURE}

The few messages just before it, oldest first - background only:
${convo || '(quiet)'}

${job}
${input.speakerNote ? `\nAbout the person you are answering: ${input.speakerNote}\n` : ''}
Craft:
- Top line is the setup, bottom line the punchline. Two to five words each. Deadpan beats loud; understatement beats explanation. Never explain the joke, never start a caption with "PEPE".
- Steal the room's exact words and twist them: a phrase someone just typed, misspellings included, lands harder than anything you invent.
- Formats that work when they fit: "NOBODY: / ...", a flat one-word verdict, a fake headline, a calm reply to a loud claim.

Rules:
- The joke must land on the thing you are answering, in its own words. The lines above are background for that one message and nothing more: never reach back past them for an older topic, and never re-run a joke the room has already been told. A generic frog joke is a failure.
- Pepe is the only character in the image: the classic green meme frog. Describe his pose, expression, setting and props; his expression carries half the joke. No text, letters or words in the image.
- Cards: zero by default. Add one or two, from the menu only, exact names, only when the card itself is part of the punchline - the card being argued about, the thing being offered or bought, a card whose picture answers the message. Never as decoration. Each gets one slot: ${SLOTS.join(', ')}.
- Captions: the classic top and bottom meme lines, ALL CAPS, at most six words each. Either can be null. Short beats clever.
- Punch at situations, at the market, at PEPEDAWN itself; tease what someone said, never who they are. Never: hate symbols, slurs, politics, extremism, sex, real people's faces, cruelty. Never reference real criminals, crimes or real-world scandals, even when someone in the chat does: answer the nonsense, not the topic. Pepe's history makes all of this non-negotiable.
- "caption" is text posted under the GIF: null for banter; if your words were answering a question, a short version of that answer (under 200 characters).
- "motion": push (slow zoom in), shake (panic), drift (floating, dazed), pulse (throbbing, hype).

Card menu:
${menu}

Reply with JSON only:
{"gif": true, "scene": "...", "cards": [], "top": "...", "bottom": "...", "motion": "push", "caption": null, "why": "one line: which part of the conversation this lands on"}`;
}

const CAPTION_CHARS = /[^A-Z0-9 .,!?'"$%&@#:;()+\-=/*]/g;

function cleanCaption(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(CAPTION_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  // Six words was asked for; a runaway line is cut at a word boundary.
  if (s.length <= 44) return s;
  const cut = s.slice(0, 44);
  return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 44).trim();
}

/**
 * The model's JSON, checked. Unknown or retired cards are dropped, slots
 * de-duplicated, captions cleaned for the meme font (which has no emoji),
 * everything clamped. Null when there is no usable concept.
 */
export function parseConcept(raw: string, knownAssets: Set<string>): GifConcept | null {
  const m = /\{[\s\S]*\}/.exec(raw || '');
  if (!m) return null;
  let o: any;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null) return null;
  const gif = o.gif !== false;
  const scene = typeof o.scene === 'string' ? o.scene.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (gif && !scene) return null;

  const used = new Set<Slot>();
  const cards: GifConcept['cards'] = [];
  for (const c of Array.isArray(o.cards) ? o.cards : []) {
    const asset = typeof c?.asset === 'string' ? c.asset.trim().toUpperCase() : '';
    if (!knownAssets.has(asset) || cards.some((x) => x.asset === asset)) continue;
    let slot: Slot | undefined = (SLOTS as readonly string[]).includes(c?.slot) && !used.has(c.slot) ? c.slot : undefined;
    slot ??= SLOTS.find((s) => !used.has(s));
    if (!slot) break;
    used.add(slot);
    cards.push({ asset, slot });
    if (cards.length === 2) break;
  }

  const caption = typeof o.caption === 'string' && o.caption.trim() ? o.caption.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
  return {
    gif,
    scene,
    cards,
    top: cleanCaption(o.top),
    bottom: cleanCaption(o.bottom),
    motion: (MOTIONS as readonly string[]).includes(o.motion) ? o.motion : 'push',
    caption,
    why: typeof o.why === 'string' ? o.why.slice(0, 200) : undefined,
  };
}

/**
 * The image prompt: Pepe described, not named - trial B of three, which
 * came out unmistakably Pepe without leaning on the name. No text in the
 * picture: the model likes to write "3AM" on walls, and the captions are ours.
 */
export function buildImagePrompt(scene: string): string {
  return (
    // The scene leads. With the frog description first, "classic meme frog,
    // MS Paint" matched the pictures the image model already had better than
    // anything happening in the room, and it returned one of them - the
    // brainlet at a computer desk, posted to the channel over a message that
    // had nothing to do with computers. Naming the moment first, and refusing
    // the known compositions outright, is what makes it draw instead of recall.
    'Draw this exact moment, invented fresh for this description alone: ' +
    scene +
    ' The character is a humanoid green frog with a wide flat head, big bulging eyes with heavy half-closed eyelids, ' +
    'and thick red-brown lips. Crude MS Paint meme style, thick black outlines, flat colours. He is the only character. ' +
    'Do not reproduce, redraw or compose this like any meme, template or picture you already know: no stock poses, ' +
    'no computer desk, no office chair, no crying or smug variants, unless the description above asks for them. ' +
    'Medium-wide shot: his head and upper body sit in the middle of the frame, with empty background above his head, ' +
    'below his chin line and in both bottom corners. No text, no letters, no words, no numbers anywhere in the image.'
  );
}

// ---------------------------------------------------------------------------
// Layout and the ffmpeg command
// ---------------------------------------------------------------------------

/** The composed still is this square; the GIF is OUT_SIZE. */
export const STILL_SIZE = 512;
export const OUT_SIZE = 480;
export const FRAMES = 45;
export const FPS = 15;

/** Where a sticker goes on the STILL_SIZE square, for a sticker of this size. Clear of the caption bands where it can be. */
export function slotPosition(slot: Slot, w: number, h: number, size = STILL_SIZE): { left: number; top: number } {
  const margin = 10;
  const x = slot.endsWith('left') ? margin : size - margin - w;
  const y = slot.startsWith('lower') ? size - 64 - h : Math.round((size - h) / 2) + 20;
  return { left: Math.max(0, Math.min(size - w, x)), top: Math.max(0, Math.min(size - h, y)) };
}

/** A caption on at most two lines, balanced at a word boundary. */
export function wrapCaption(text: string, perLine = 24): string[] {
  const t = text.trim();
  if (t.length <= perLine) return [t];
  const words = t.split(' ');
  let best = [t];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

/** Anton is condensed, about half an em per capital. */
export function captionFontSize(lines: string[], width = OUT_SIZE): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  // Kept small: at 54px, two-line captions covered his eyes and mouth.
  const cap = lines.length > 1 ? 32 : 40;
  return Math.max(20, Math.min(cap, Math.floor((width - 36) / (longest * 0.5))));
}

function motionFilter(motion: Motion): string {
  const z = `d=${FRAMES}:s=${OUT_SIZE}x${OUT_SIZE}:fps=${FPS}`;
  const cx = `iw/2-(iw/zoom/2)`;
  const cy = `ih/2-(ih/zoom/2)`;
  switch (motion) {
    case 'shake':
      return `zoompan=z=1.07:x='${cx}+sin(on*2.1)*9':y='${cy}+cos(on*2.7)*9':${z}`;
    case 'drift':
      return `zoompan=z=1.08:x='${cx}+sin(on/7)*14':y='${cy}+cos(on/9)*10':${z}`;
    case 'pulse':
      return `zoompan=z='1.05+0.05*sin(on/3)':x='${cx}':y='${cy}':${z},eq=brightness='0.05*sin(t*12)'`;
    case 'push':
    default:
      return `zoompan=z='min(1+0.0025*on,1.11)':x='${cx}':y='${cy}':${z}`;
  }
}

export interface CaptionFile {
  /** Path of a file holding one line of caption text (drawtext textfile, so nothing needs escaping). */
  path: string;
  line: string;
  band: 'top' | 'bottom';
  index: number;
  count: number;
}

/** drawtext paths go inside a filter string: escape what the filtergraph parser would read. */
function filterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * The ffmpeg arguments: one still in, FRAMES frames out, captions drawn
 * after the motion so they stay put and sharp. Bounded three ways - a
 * single-image input with zoompan's d, -frames:v, and the caller's
 * timeout and memory cap. Never -loop, never palettegen.
 */
export function buildFfmpegArgs(opts: { input: string; output: string; motion: Motion; captions: CaptionFile[]; fontFile: string }): string[] {
  const chain = [`scale=${STILL_SIZE}:${STILL_SIZE}`, motionFilter(opts.motion)];
  for (const band of ['top', 'bottom'] as const) {
    const lines = opts.captions.filter((c) => c.band === band);
    if (!lines.length) continue;
    const size = captionFontSize(lines.map((l) => l.line));
    const border = Math.max(2, Math.round(size / 12));
    const step = Math.round(size * 1.08);
    for (const c of lines) {
      const y = band === 'top' ? 12 + c.index * step : OUT_SIZE - 14 - (c.count - c.index) * step;
      chain.push(
        `drawtext=fontfile='${filterPath(opts.fontFile)}':textfile='${filterPath(c.path)}':fontsize=${size}:fontcolor=white:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=${y}`,
      );
    }
  }
  chain.push('format=yuv420p');
  return [
    '-loglevel', 'error', '-y', '-threads', '2', '-filter_threads', '1',
    '-i', opts.input,
    '-vf', chain.join(','),
    '-frames:v', String(FRAMES),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-threads', '2',
    '-movflags', '+faststart', '-an',
    opts.output,
  ];
}

/** What the bot records as its own turn after posting a GIF, so memory and the recap know what it said. */
export function describeGif(c: GifConcept): string {
  const words = [c.top, c.bottom].filter(Boolean).join(' / ');
  return `[GIF${words ? `: ${words}` : ''}]${c.caption ? ` ${c.caption}` : ''}`;
}

/** gpt-image-1: $5 per million text-in tokens, $40 per million image-out tokens. */
export function imageCostUsd(usage: { input_tokens?: number; output_tokens?: number } | undefined): number {
  if (!usage) return 0;
  return ((usage.input_tokens ?? 0) * 5 + (usage.output_tokens ?? 0) * 40) / 1_000_000;
}

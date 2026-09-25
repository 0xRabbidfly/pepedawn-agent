/**
 * Pepe meme GIFs, the parts that need no network: what a concept may
 * contain, how the picture is asked for, where captions and stickers go,
 * that the ffmpeg command is bounded by construction, and when PEPEDAWN
 * may draw instead of typing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  FRAMES, OUT_SIZE, SLOTS, STILL_SIZE,
  CONCEPT_TURNS,
  buildConceptPrompt, buildFfmpegArgs, buildImagePrompt, captionFontSize, describeGif, fgifAllowance, gifConfig,
  imageCostUsd, markGifPosted, mayOfferGif, parseConcept, parseFgif, recordFgif, resetGifCooldowns, slotPosition, wrapCaption,
} from '../../utils/memeGif';

const known = new Set(['FREEDOMKEK', 'PEPEDAWN', 'DJPEPEBADGER']);
const cfg = gifConfig({ OPENAI_API_KEY: 'sk-test' });

describe('config', () => {
  it('defaults: on with a key, one in ten, half an hour, three a day, the stronger concept model', () => {
    expect(cfg).toMatchObject({ enabled: true, rate: 0.1, cooldownMs: 30 * 60_000, perPersonPerDay: 3, quality: 'medium', conceptModel: 'gpt-5.6-terra' });
    expect(gifConfig({}).enabled).toBe(false);
    expect(gifConfig({ OPENAI_API_KEY: 'k', GIF_ENABLED: 'false' }).enabled).toBe(false);
    expect(gifConfig({ OPENAI_API_KEY: 'k', GIF_RATE: '3', GIF_IMAGE_QUALITY: 'ultra' })).toMatchObject({ rate: 1, quality: 'medium' });
  });
});

describe('the concept', () => {
  it('keeps what is valid: known cards only, two at most, one per slot; captions cleaned for the meme font', () => {
    const c = parseConcept(
      'sure! {"gif": true, "scene": "Pepe stamps a form.", "cards": [{"asset": "freedomkek", "slot": "left"}, {"asset": "NOTACARD", "slot": "right"}, {"asset": "PEPEDAWN", "slot": "left"}, {"asset": "DJPEPEBADGER", "slot": "right"}], "top": "coit foundation 🐸", "bottom": "low iq yutes", "motion": "wobble", "caption": null, "why": "x"}',
      known,
    )!;
    expect(c.cards).toEqual([{ asset: 'FREEDOMKEK', slot: 'left' }, { asset: 'PEPEDAWN', slot: 'lower-left' }]);
    expect(c.top).toBe('COIT FOUNDATION');
    expect(c.bottom).toBe('LOW IQ YUTES');
    expect(c.motion).toBe('push');
  });

  it('a declined moment is a valid answer; nonsense is not', () => {
    expect(parseConcept('{"gif": false}', known)).toMatchObject({ gif: false, cards: [] });
    expect(parseConcept('{"gif": true, "scene": ""}', known)).toBeNull();
    expect(parseConcept('no json here', known)).toBeNull();
  });

  it('a runaway caption is cut at a word', () => {
    const c = parseConcept(`{"gif": true, "scene": "s", "top": "${'WORD '.repeat(20)}"}`, known)!;
    expect(c.top!.length).toBeLessThanOrEqual(44);
    expect(c.top!.endsWith(' ')).toBe(false);
  });

  it('the prompt carries the conversation, the room, the rules, and the roster note', () => {
    const p = buildConceptPrompt({
      mode: 'choice', ask: 'pepedawn you reckon fakes would grow under my reign', draftReply: 'No.',
      turns: [{ role: 'user', author: 'coit', text: 'scrilla ill give you a djpepe' }, { role: 'bot', text: 'Massively.' }],
      menu: [{ asset: 'DJPEPEBADGER', series: 15, card: 6, artist: 'x', look: 'a badger' }],
      speakerNote: 'heavy deadpan STFU energy',
    });
    expect(p).toContain('coit: scrilla ill give you a djpepe');
    expect(p).toContain('PEPEDAWN: Massively.');
    expect(p).toContain('FREEDOMKEK is Series 0, Card 1');
    expect(p).toContain('The FAKEASF burn is sacred');
    expect(p).toContain('Never reference real criminals');
    expect(p).toContain('heavy deadpan STFU energy');
    expect(p).toContain('DJPEPEBADGER (S15 C6, x): a badger');
    expect(p).toContain('silence beats a lame meme');
    expect(p).toContain('background only');
    expect(p).toContain('never reach back past them for an older topic');
  });

  it('carries only the last few turns, so the joke cannot wander off onto an older topic', () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, author: 'someone', text: `turn ${i}` }));
    const p = buildConceptPrompt({ mode: 'choice', ask: 'the message being answered', turns, menu: [] });
    expect(CONCEPT_TURNS).toBe(4);
    expect(p).toContain('turn 11');
    expect(p).toContain('turn 8');
    expect(p).not.toContain('turn 7');
    expect(p).not.toContain('turn 0');
  });

  it('asks for Pepe by description, framed with room for captions, and no text in the picture', () => {
    const p = buildImagePrompt('He stamps a form.');
    for (const bit of ['heavy half-closed eyelids', 'thick red-brown lips', 'He stamps a form.', 'MS Paint', 'Medium-wide shot', 'No text']) expect(p).toContain(bit);
    expect(p).not.toMatch(/pepe the frog/i);
  });

  it('leads with the scene and refuses the memes it already knows', () => {
    const p = buildImagePrompt('He stamps a form.');
    // The moment comes before the frog, or the model matches on the frog.
    expect(p.indexOf('He stamps a form.')).toBeLessThan(p.indexOf('half-closed eyelids'));
    expect(p).toContain('invented fresh for this description alone');
    expect(p).toContain('Do not reproduce, redraw or compose this like any meme, template or picture you already know');
    expect(p).toContain('no computer desk');
  });
});

describe('layout', () => {
  it('captions: one line when it fits, balanced two when not, and small enough to leave his face', () => {
    expect(wrapCaption('MUTE LIST')).toEqual(['MUTE LIST']);
    expect(wrapCaption('SHIPPED THE RELEASE NOTES INSTEAD')).toEqual(['SHIPPED THE RELEASE', 'NOTES INSTEAD']);
    expect(captionFontSize(['MUTE LIST'])).toBe(40);
    expect(captionFontSize(['SHIPPED THE RELEASE', 'NOTES INSTEAD'])).toBeLessThanOrEqual(32);
  });

  it('stickers stay inside the still, in the lower corners or mid-sides', () => {
    for (const slot of SLOTS) {
      const { left, top } = slotPosition(slot, 110, 150);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + 110).toBeLessThanOrEqual(STILL_SIZE);
      expect(top).toBeGreaterThan(90);
      expect(top + 150).toBeLessThanOrEqual(STILL_SIZE);
    }
  });

  it('ffmpeg is bounded by construction: one still in, FRAMES out, no -loop, no palettegen, captions from files', () => {
    const args = buildFfmpegArgs({
      input: '/tmp/x/still.png', output: '/tmp/x/out.mp4', motion: 'shake', fontFile: '/f/Anton-Regular.ttf',
      captions: [{ path: '/tmp/x/top-0.txt', line: 'COIT FOUNDATION', band: 'top', index: 0, count: 1 }],
    });
    const line = args.join(' ');
    expect(args.slice(args.indexOf('-frames:v'), args.indexOf('-frames:v') + 2)).toEqual(['-frames:v', String(FRAMES)]);
    expect(args.indexOf('-i')).toBeLessThan(args.indexOf('-vf'));
    expect(line).not.toContain('-loop');
    expect(line).not.toContain('palettegen');
    expect(line).toContain(`s=${OUT_SIZE}x${OUT_SIZE}`);
    expect(line).toContain(`d=${FRAMES}`);
    expect(line).toContain("textfile='/tmp/x/top-0.txt'");
    expect(line).toContain("fontfile='/f/Anton-Regular.ttf'");
  });

  it('records what it posted, and what the frame cost', () => {
    expect(describeGif({ gif: true, scene: 's', cards: [], top: 'COIT FOUNDATION', bottom: 'LOW IQ YUTES', motion: 'push', caption: 'I can draw too.' }))
      .toBe('[GIF: COIT FOUNDATION / LOW IQ YUTES] I can draw too.');
    expect(imageCostUsd({ input_tokens: 1000, output_tokens: 1000 })).toBeCloseTo(0.045, 6);
  });
});

describe('when', () => {
  let dir: string;
  const savedAdmins = process.env.TELEGRAM_ADMIN_IDS;
  beforeEach(() => {
    resetGifCooldowns();
    dir = mkdtempSync(join(tmpdir(), 'gif-'));
    process.env.TELEGRAM_ADMIN_IDS = '1013723568';
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedAdmins === undefined) delete process.env.TELEGRAM_ADMIN_IDS; else process.env.TELEGRAM_ADMIN_IDS = savedAdmins;
  });

  it("PEPEDAWN's own choice: the dice, then half an hour's rest for the room once one is posted", () => {
    expect(mayOfferGif('r1', cfg, 1_000, () => 0.05)).toBe(true);
    expect(mayOfferGif('r1', cfg, 1_000, () => 0.5)).toBe(false);
    markGifPosted('r1', 1_000);
    expect(mayOfferGif('r1', cfg, 1_000 + 60_000, () => 0)).toBe(false);
    expect(mayOfferGif('r1', cfg, 1_000 + 31 * 60_000, () => 0)).toBe(true);
    expect(mayOfferGif('r2', { ...cfg, rate: 0.5 }, 1_000, () => 0.4)).toBe(true);
    expect(mayOfferGif('r3', { ...cfg, enabled: false }, 1_000, () => 0)).toBe(false);
  });

  it('/fgif: three a day each, admins uncapped, old ones forgotten', () => {
    const path = join(dir, 'gif-state.json');
    const me = { id: '424242' };
    expect(fgifAllowance(me, cfg, 1_000, path)).toBe(3);
    for (let i = 0; i < 3; i++) recordFgif('424242', 1_000 + i, path);
    expect(fgifAllowance(me, cfg, 2_000, path)).toBe(0);
    expect(fgifAllowance(me, cfg, 1_000 + 25 * 3_600_000, path)).toBe(3);
    expect(fgifAllowance({ id: '1013723568' }, cfg, 2_000, path)).toBe(Infinity);
    expect(fgifAllowance({}, cfg, 2_000, path)).toBe(0);
    expect(parseFgif('/fgif@pepedawn_bot  pepe crying  over a burn')).toEqual({ idea: 'pepe crying over a burn' });
    expect(parseFgif('/fgif')).toEqual({ idea: '' });
    expect(parseFgif('/fgifs')).toBeNull();
  });
});

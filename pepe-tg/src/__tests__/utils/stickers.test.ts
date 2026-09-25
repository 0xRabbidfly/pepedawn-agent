/**
 * Stickers used as emoji: what turns the feature on, which sticker a post
 * gets, and how hard the room is protected from a second one. No network —
 * the pack is handed in, as loadPack would have returned it.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_PACK,
  PACK_TTL_MS,
  markStickerPosted,
  mayPostSticker,
  resetStickerCooldowns,
  stickerConfig,
  stickerFor,
  type PackSticker,
} from '../../utils/stickers';

const PACK: PackSticker[] = [
  { fileId: 'frog', emoji: '🐸' },
  { fileId: 'cake', emoji: '🎂' },
  { fileId: 'shades', emoji: '🕶️' },
];

afterEach(() => resetStickerCooldowns());

describe('config', () => {
  it('falls back to the community pack, so no droplet variable is needed', () => {
    expect(stickerConfig({})).toMatchObject({ enabled: true, pack: DEFAULT_PACK, rate: 0.06, cooldownMs: 90 * 60_000 });
    expect(stickerConfig({ STICKER_PACK: '  ' }).pack).toBe(DEFAULT_PACK);
    expect(stickerConfig({ STICKER_PACK: 'other_by_bot' }).pack).toBe('other_by_bot');
  });

  it('turns off on the one switch, and clamps the rate', () => {
    expect(stickerConfig({ STICKER_ENABLED: 'false' }).enabled).toBe(false);
    expect(stickerConfig({ STICKER_RATE: '9' }).rate).toBe(1);
    expect(stickerConfig({ STICKER_RATE: '-1' }).rate).toBe(0);
    expect(stickerConfig({ STICKER_RATE: 'nonsense' }).rate).toBe(0.06);
    expect(stickerConfig({ STICKER_COOLDOWN_MIN: '5' }).cooldownMs).toBe(5 * 60_000);
  });

  it('caches the pack for hours, not for the process', () => {
    expect(PACK_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('which sticker', () => {
  it('reads the post and answers in the pack emoji that fits', () => {
    expect(stickerFor('happy 5 year anniversary fam', PACK)?.emoji).toBe('🎂');
    expect(stickerFor('that fit is clean', PACK)?.emoji).toBe('🕶️');
    expect(stickerFor('gm', PACK)?.emoji).toBe('🐸');
  });

  it('falls through to the whole pack when the mapped emoji was never drawn', () => {
    const thin: PackSticker[] = [{ fileId: 'frog', emoji: '🐸' }];
    expect(stickerFor('happy birthday', thin)?.fileId).toBe('frog');
  });

  it('gives the same post the same sticker — a repeat is a catchphrase, a reroll is a glitch', () => {
    const a = stickerFor('some unmapped chatter here', PACK);
    const b = stickerFor('some unmapped chatter here', PACK);
    expect(a?.fileId).toBe(b!.fileId);
  });

  it('has nothing to say when the pack is empty', () => {
    expect(stickerFor('gm', [])).toBeUndefined();
  });
});

describe('how often', () => {
  const cfg = stickerConfig({ STICKER_RATE: '1' });

  it('never fires while disabled, whatever the dice say', () => {
    expect(mayPostSticker('room', stickerConfig({ STICKER_ENABLED: 'false' }), Date.now(), () => 0)).toBe(false);
  });

  it('holds the room quiet for the whole cooldown after one goes out', () => {
    const t0 = 1_000_000;
    expect(mayPostSticker('room', cfg, t0, () => 0)).toBe(true);
    markStickerPosted('room', t0);
    expect(mayPostSticker('room', cfg, t0 + 89 * 60_000, () => 0)).toBe(false);
    expect(mayPostSticker('room', cfg, t0 + 91 * 60_000, () => 0)).toBe(true);
  });

  it('cools down one room at a time', () => {
    const t0 = 2_000_000;
    markStickerPosted('a', t0);
    expect(mayPostSticker('a', cfg, t0 + 60_000, () => 0)).toBe(false);
    expect(mayPostSticker('b', cfg, t0 + 60_000, () => 0)).toBe(true);
  });

  it('asking does not itself count as posting — only the send records the grant', () => {
    const t0 = 3_000_000;
    expect(mayPostSticker('room', cfg, t0, () => 0)).toBe(true);
    expect(mayPostSticker('room', cfg, t0, () => 0)).toBe(true);
  });

  it('loses the dice roll at the default rate far more often than it wins', () => {
    const low = stickerConfig({});
    expect(mayPostSticker('room', low, Date.now(), () => 0.5)).toBe(false);
    expect(mayPostSticker('room', low, Date.now(), () => 0.01)).toBe(true);
  });
});

/**
 * Talk or type: the ask wins, then the reply must be short and speakable,
 * the room must not have heard it lately, and the rate decides. Off means
 * off, and no key means off.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { DEFAULT_RATE, DEFAULT_STYLE, DEFAULT_VOICE, resetVoiceCooldowns, shouldSpeak, speakable, voiceConfig, voiceCostUsd } from '../../utils/voice';

const cfg = voiceConfig({ OPENAI_API_KEY: 'sk-test', VOICE_RATE: '0.25' });
const always = () => 0;
const never = () => 0.99;

describe('voice config', () => {
  it('reads the env, with the odd voice by default and off without a key', () => {
    expect(voiceConfig({ OPENAI_API_KEY: 'sk' })).toMatchObject({ enabled: true, rate: DEFAULT_RATE, voice: DEFAULT_VOICE, style: DEFAULT_STYLE });
    expect(voiceConfig({}).enabled).toBe(false);
    expect(voiceConfig({ OPENAI_API_KEY: 'sk', VOICE_ENABLED: 'false' }).enabled).toBe(false);
    expect(voiceConfig({ OPENAI_API_KEY: 'sk', VOICE_RATE: '2', VOICE_NAME: 'onyx', VOICE_COOLDOWN_MIN: '3' })).toMatchObject({ rate: 1, voice: 'onyx', cooldownMs: 180_000 });
  });
});

describe('talk or type', () => {
  beforeEach(() => resetVoiceCooldowns());

  it('the ask wins: "say it" speaks, "write it" types, whatever the dice', () => {
    expect(shouldSpeak('dawn say it out loud', 'A short line.', 'r1', cfg, 1_000, never)).toBe(true);
    expect(shouldSpeak('dawn write it, no voice', 'A short line.', 'r2', cfg, 1_000, always)).toBe(false);
  });

  it('otherwise: short, speakable, not lately, and the rate', () => {
    expect(shouldSpeak('gm dawn', 'A short line.', 'r3', cfg, 1_000, always)).toBe(true);
    expect(shouldSpeak('gm dawn', 'A short line.', 'r3', cfg, 2_000, always)).toBe(false); // cooldown
    expect(shouldSpeak('gm dawn', 'A short line.', 'r4', cfg, 1_000, never)).toBe(false); // dice
    expect(shouldSpeak('gm dawn', 'x'.repeat(500), 'r5', cfg, 1_000, always)).toBe(false); // too long
    expect(shouldSpeak('gm dawn', 'See https://x.com/a', 'r6', cfg, 1_000, always)).toBe(false); // a link
    expect(shouldSpeak('gm dawn', 'One\n- two\n- three', 'r7', cfg, 1_000, always)).toBe(false); // a list
    expect(shouldSpeak('gm dawn', '', 'r8', cfg, 1_000, always)).toBe(false);
    expect(shouldSpeak('gm dawn', 'A short line.', 'r9', { ...cfg, enabled: false }, 1_000, always)).toBe(false);
  });

  it('reads aloud without the markdown, and costs what OpenAI charges per character', () => {
    expect(speakable('*Bold* and _quiet_, `code`, [a link](https://x.com)  spaced')).toBe('Bold and quiet, code, a link spaced');
    expect(voiceCostUsd(1_000_000)).toBe(0.6);
  });
});

describe('the knobs that are off', () => {
  it('slur is deterministic and light; warp with no chain returns the audio untouched', async () => {
    const { slur, warpVoice } = await import('../../utils/voice');
    const a = slur('The directory is the community\'s. Fine.');
    expect(slur('The directory is the community\'s. Fine.')).toBe(a);
    expect(a.replace(/hic|\.\.\.|([a-z])\1/gi, '').length).toBeGreaterThan(20);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await warpVoice(bytes, '')).toBe(bytes);
  });
});

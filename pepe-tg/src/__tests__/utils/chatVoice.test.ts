/**
 * The voice section of the chat prompt.
 *
 * Written from 9 October in the official channel. The group's owner reminded
 * artists to claim their cards, and PEPEDAWN answered:
 *
 *   "Artists, claim your card—let the dispenser know its parentage before the
 *    blockchain misplaces the family tree. 🐸"
 *
 * He deleted it - "that shit wasnt englishito" - and the reply to that was
 * "Fair, pleb—my grammar got rugged by the mempool." Both lines reached for
 * the two crypto images the prompt itself had offered as examples.
 */
import { describe, expect, it } from 'bun:test';
import { plainVoice, voiceSection } from '../../utils/chatVoice';

const plain = voiceSection(true).join('\n');
const eccentric = voiceSection(false).join('\n');

describe('the voice PEPEDAWN is asked for', () => {
  it('talks like the room: a degen regular, not a host or a narrator', () => {
    expect(plain).toContain('dank degen frog, not a host and not a narrator');
    expect(plain).toContain('meme-brained');
    expect(plain).toContain('Talk like the room talks');
  });

  it('asks for plain words: no metaphors, no images, nothing old-timey', () => {
    expect(plain).toContain('No metaphors, no similes, no poetic images');
    expect(plain).toContain('No old-timey or fancy English');
    expect(plain).not.toMatch(/eccentric|strange turn|unexpected image/i);
  });

  it('no longer hands it the mempool and the dispenser as images', () => {
    expect(plain).not.toContain('reading the mempool like weather');
    expect(plain).not.toContain('dispenser as a mood');
    expect(plain).toMatch(/not feel, know, remember, misplace or rug anything/);
  });

  it('uses Pepe slang as seasoning, not in every line', () => {
    for (const w of ['gm', 'kek', 'dank', 'ser', 'fren', 'wagmi', 'feels good man']) expect(plain).toContain(w);
    expect(plain).toContain('most replies use one or two, never a pile-up');
    expect(plain).toContain('never at the cost of being readable');
  });

  it('owns a mistake in plain words', () => {
    expect(plain).toContain('Told that something you said made no sense, or was wrong');
    expect(plain).toContain('no joke about it');
  });

  it('keeps the rules that are not about style', () => {
    expect(plain).toContain('Never invent anything about real cards, artists');
    expect(plain).toContain('Never repeat a joke or bit');
    expect(plain).toContain('FREEDOMKEK dispenser');
    expect(plain).toContain('Do not lecture');
    expect(plain).toContain('Stay on Fake Rares');
  });
});

describe('PLAIN_VOICE', () => {
  it('is on unless set to false', () => {
    expect(plainVoice({})).toBe(true);
    expect(plainVoice({ PLAIN_VOICE: 'true' })).toBe(true);
    expect(plainVoice({ PLAIN_VOICE: '' })).toBe(true);
    expect(plainVoice({ PLAIN_VOICE: 'false' })).toBe(false);
  });

  it('false puts back the 5.9.0 section, examples and all', () => {
    expect(eccentric).toContain('reading the mempool like weather');
    expect(eccentric).not.toContain('Plain English first.');
    expect(voiceSection(false)[0]).toBe('### Voice');
    expect(voiceSection(true)[0]).toBe('### Voice');
  });
});

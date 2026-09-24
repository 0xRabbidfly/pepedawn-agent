/**
 * "can you fix my artist name on the site its wrong" got a card and a raw
 * knowledge block. It is a request the bot cannot carry out; the answer is
 * the claim form. These pin what counts as one, and that a card question
 * does not.
 */
import { describe, expect, it } from 'bun:test';
import { CLAIM_URL, directoryEditFact, isActionRequest, isDirectoryEditRequest } from '../../utils/directoryHelp';

describe('directory edit requests', () => {
  it('recognises the two asks from the room, and their kin', () => {
    for (const t of [
      'can you fix my artist name on the site its wrong',
      "@pepedawn_bot can you update my name on the new website please. I've completed my claim",
      'my credit is wrong on the directory',
      'how do I change my bio on fakeraredirectory.com',
      'my artist name is misspelled',
      'pepedawn my wallet on my artist page is old, can u update it',
    ]) {
      expect(isDirectoryEditRequest(t)).toBe(true);
    }
  });

  it('leaves card questions, commands and unrelated requests alone', () => {
    for (const t of [
      'who made FAKEFAKEBAN',
      'what is the artist name on PEPEDAWN',
      '/f PEPEDAWN',
      'can you fix the counter',
      'my name is Le Hues, nice to meet you',
      'the site is down',
      'what site do I buy fakes on',
    ]) {
      expect(isDirectoryEditRequest(t)).toBe(false);
    }
  });

  it('the answer names the claim form and nothing the bot cannot do', () => {
    const fact = directoryEditFact();
    expect(fact).toContain(CLAIM_URL);
    expect(fact).toMatch(/^I can't edit the directory/);
    expect(fact).not.toMatch(/\bdone\b/i);
  });

  it('an action request is not a card question', () => {
    for (const t of [
      'can you fix my artist name on the site its wrong',
      'pepedawn can u pin that',
      'could you please remove that post',
      'update my bio',
      'Please update yer memory to remove my name from ownership',
    ]) {
      expect(isActionRequest(t)).toBe(true);
    }
    for (const t of ['which fake has the most red', 'can you show me FREEDOMKEK', 'who made PEPEDAWN', 'is the site up']) {
      expect(isActionRequest(t)).toBe(false);
    }
  });
});

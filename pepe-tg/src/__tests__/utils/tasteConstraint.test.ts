import { describe, expect, it } from 'bun:test';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import { randomCard, detectCollection, resolveArtist, cardCountForArtist } from '../../utils/cardFacts';

/**
 * Live regression, 2026-08-23: "Pepedawn what is your favourite Memeticx card?"
 * was answered "GREENBEANZ by VVD". The draw was uniform over the whole
 * collection and the artist in the question was dropped, so the answer was to a
 * question nobody asked. A constraint someone states has to constrain the
 * answer, or the bot has to say it cannot honour it.
 */
function router(): any {
  return new (SmartRouterService as any)({
    agentId: 'test',
    getService: () => null,
  } as unknown as IAgentRuntime);
}

/** What the taste path would actually offer for this question. */
function offer(question: string): { asset: string; artist: string | null } | null {
  const r = router();
  const constraint = r.tasteConstraint(question);
  const card = randomCard(detectCollection(question), constraint.filter);
  return card ? { asset: card.asset, artist: card.artist ?? null } : null;
}

describe('a question of taste honours what it asked for', () => {
  it('offers a card by the artist named, every time', () => {
    // Memeticx has seven cards across the collections - six Fake Rares and one
    // Fake Common. Uniform over the Fake Rares pool it was one in 914.
    expect(cardCountForArtist('Memeticx')).toBe(7);
    for (let i = 0; i < 100; i++) {
      const card = offer('Pepedawn what is your favourite Memeticx card?');
      expect(card?.artist).toBe('Memeticx');
    }
  });

  it('reads the artist however the question is phrased', () => {
    expect(offer("what's your favourite memeticx card")?.artist).toBe('Memeticx');
    expect(offer('do you like Memeticx cards?')?.artist).toBe('Memeticx');
  });

  it('expands a short form to the credits that person holds', () => {
    // One artist, six credits: Rare Scrilla, DJ Q-Bert x Rare Scrilla, and so on.
    const card = offer('what is your favourite scrilla card?');
    expect(card?.artist?.toLowerCase()).toContain('scrilla');
  });

  it('stays inside a series when one is named', () => {
    const r = router();
    const constraint = r.tasteConstraint('what is your favourite series 18 card');
    for (let i = 0; i < 50; i++) {
      const card = randomCard('fake-rares', constraint.filter);
      expect(card?.series).toBe(18);
    }
  });

  it('offers nothing rather than a card by somebody else', () => {
    // The failure mode this exists to prevent: an unknown name answered with
    // whatever the random draw produced, presented as though it were an answer.
    expect(offer('what is your favourite Zorblax card?')).toBeNull();
    const r = router();
    expect(r.tasteConstraint('what is your favourite Zorblax card?').described).toBe('Zorblax');
  });

  it('leaves an unqualified question unconstrained', () => {
    const r = router();
    for (const q of [
      'what is your favourite card?',
      "what's your favourite fake rares card",
      'what is your favourite all time card',
      // A colour is a descriptive question with a real answer, not a person.
      'what is your favourite green card',
    ]) {
      expect(r.tasteConstraint(q).filter).toBeUndefined();
      expect(offer(q)).not.toBeNull();
    }
  });
});

describe('resolveArtist', () => {
  it('prefers an exact credit', () => {
    expect(resolveArtist('Memeticx')).toEqual(['Memeticx']);
    expect(resolveArtist('memeticx')).toEqual(['Memeticx']);
  });

  it('expands a short form to every credit that holds it', () => {
    const scrilla = resolveArtist('scrilla');
    expect(scrilla.length).toBeGreaterThan(1);
    expect(scrilla).toContain('Rare Scrilla');
    for (const name of scrilla) expect(name.toLowerCase()).toContain('scrilla');
  });

  it('returns nothing for a name nobody is credited under', () => {
    expect(resolveArtist('Zorblax')).toEqual([]);
    expect(resolveArtist('xy')).toEqual([]);
  });

  it('never matches a name hiding inside a word', () => {
    // The "RC in scarcest" class of error - word boundaries, never substrings.
    for (const name of resolveArtist('rc')) expect(name.toLowerCase()).not.toBe('scarcest');
  });
});

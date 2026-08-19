import { describe, expect, it } from 'bun:test';
import { getCardInfo } from '../../data/fullCardIndex';
import { answerCardQuery } from '../../utils/cardQueries';

/**
 * PEPEDAWN naming a card and not showing it is the most jarring gap in the
 * experience — this is a card collection. These guard the two inputs the
 * display path relies on: the plan knowing which card an answer is about, and
 * the fallback that spots an asset named in free text.
 */
const firstKnownAssetIn = (text: string): string | undefined => {
  for (const word of text.toUpperCase().match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []) {
    if (getCardInfo(word)) return word;
  }
  return undefined;
};

describe('card shown alongside an answer', () => {
  it('structured lookups report the card they are about', () => {
    expect(answerCardQuery('who is the artist for untitledfrog?')?.asset).toBe('UNTITLEDFROG');
    expect(answerCardQuery('when was freedomkek issued?')?.asset).toBe('FREEDOMKEK');
    expect(answerCardQuery('what is the supply of PEPEDAWN?')?.asset).toBe('PEPEDAWN');
  });

  it("reports the winning card for an artist's extreme, not the artist", () => {
    // The answer is about PEPERMINE, so that is the card to show.
    expect(answerCardQuery("which of pepenardo's cards has the biggest supply?")?.asset).toBe(
      'PEPERMINE'
    );
  });

  it('finds a card named in free-form prose', () => {
    expect(firstKnownAssetIn('FREEDOMKEK is the one that started it all')).toBe('FREEDOMKEK');
    expect(firstKnownAssetIn('honestly PEPERMINE is underrated')).toBe('PEPERMINE');
  });

  it('does not mistake ordinary shouting for a card', () => {
    expect(firstKnownAssetIn('GM EVERYONE HOW ARE WE')).toBeUndefined();
    expect(firstKnownAssetIn('no cards here')).toBeUndefined();
  });
});

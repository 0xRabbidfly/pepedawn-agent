import { describe, expect, it } from 'bun:test';
import { getCardInfo } from '../../data/fullCardIndex';
import { getAnyCardInfo } from '../../data/allCardsIndex';
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

describe('the card is shown from its own collection', () => {
  /**
   * Production, 2026-08-20 17:26. "who created DJPEPE ?" was answered
   * correctly - "DJPEPE (Rare Pepes) is by Rare Scrilla" - and then a second
   * message told the room: "Could not find DJPEPE in the Fake Rares
   * collection." Every automatic display went through `/f`, which only knows
   * Fake Rares, so any card outside that collection produced an answer and a
   * contradiction of it.
   */
  const commandFor = (asset: string): string | undefined => {
    const info = getAnyCardInfo(asset);
    if (!info) return undefined;
    return info.collection === 'rare-pepes' ? '/p' : info.collection === 'fake-commons' ? '/c' : '/f';
  };

  it('sends a Rare Pepe to /p, not /f', () => {
    expect(commandFor('DJPEPE')).toBe('/p');
    expect(getCardInfo('DJPEPE')).toBeUndefined(); // not a Fake Rare, hence the bug
  });

  it('sends a Fake Common to /c and a Fake Rare to /f', () => {
    expect(commandFor('MASTERDJPEPE')).toBe('/c');
    expect(commandFor('FREEDOMKEK')).toBe('/f');
    expect(commandFor('PEPEDAWN')).toBe('/f');
  });

  it('shows nothing at all for an asset in no collection', () => {
    // A display nobody asked for must never announce a miss: the "could not
    // find" text belongs to an explicit /f, not to a volunteered image.
    expect(commandFor('NOTACARD')).toBeUndefined();
    expect(commandFor('HELLAPAPELLA2')).toBeUndefined();
  });
});

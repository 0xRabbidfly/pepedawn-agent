import { describe, expect, it } from 'bun:test';
import { answerCardQuery, isStructuredCardQuery } from '../../utils/cardQueries';
import { randomCard, describeCard } from '../../utils/cardFacts';

describe('structured card queries', () => {
  it('answers who made a card', () => {
    const a = answerCardQuery('who is the artist for untitledfrog?');
    expect(a?.kind).toBe('artist_of_card');
    expect(a?.fact).toContain('UNTITLEDFROG');
    expect(a?.fact).toContain('nicedayJULES');
  });

  it('answers when a card was issued', () => {
    const a = answerCardQuery('when was freedomkek issued?');
    expect(a?.kind).toBe('issuance');
    expect(a?.fact).toContain('October 2017');
  });

  it("answers an artist's largest supply", () => {
    const a = answerCardQuery("largest collection size of one of pepenardo's cards?");
    expect(a?.kind).toBe('artist_supply_extreme');
    expect(a?.fact).toMatch(/largest supply is [A-Z0-9]+ at \d+/);
  });

  it('answers supply and series of a named card', () => {
    expect(answerCardQuery('what is the supply of PEPEDAWN?')?.kind).toBe('supply_of_card');
    expect(answerCardQuery('what series is FAKEASF?')?.kind).toBe('series_of_card');
  });

  it('counts an artist\'s cards', () => {
    const a = answerCardQuery('how many cards does Rare Scrilla have?');
    expect(a?.kind).toBe('artist_card_count');
    expect(a?.fact).toMatch(/has \d+ cards?/);
  });

  it('declines anything it cannot answer exactly', () => {
    // Taste and chatter must fall through to normal retrieval, not be guessed at.
    expect(answerCardQuery('what is the best fake rare?')).toBeNull();
    expect(answerCardQuery('gm everyone')).toBeNull();
    expect(answerCardQuery('anyone selling?')).toBeNull();
    expect(isStructuredCardQuery('what do you think of series 5')).toBe(false);
  });
});

describe('random card for taste questions', () => {
  it('returns a real card', () => {
    const c = randomCard();
    expect(c).not.toBeNull();
    expect(describeCard(c!.asset)).toContain(c!.asset);
  });

  it('is not fixed to one card', () => {
    // 40 uniform draws from ~898 cards landing on one asset would be absurd.
    const seen = new Set(Array.from({ length: 40 }, () => randomCard()?.asset));
    expect(seen.size).toBeGreaterThan(1);
  });
});

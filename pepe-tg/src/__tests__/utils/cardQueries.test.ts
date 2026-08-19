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

describe('phrasing and matching robustness', () => {
  it("handles the natural phrasing of an artist's largest card", () => {
    const a = answerCardQuery(
      "look at all pepenardo's cards, and tell me which has the highest collection size?"
    );
    expect(a?.kind).toBe('artist_supply_extreme');
    expect(a?.fact).toContain('Pepenardo');
    expect(a?.fact).toContain('largest');
  });

  it('treats "most common" as largest and "scarcest" as smallest', () => {
    expect(answerCardQuery('which pepenardo card is most common?')?.fact).toContain('largest');
    expect(answerCardQuery("what's pepenardo's scarcest card?")?.fact).toContain('smallest');
  });

  it('matches artist names on word boundaries, not substrings', () => {
    // An artist named "RC" hides inside "scarcest"; substring matching answered
    // about the wrong person entirely.
    const a = answerCardQuery("what's pepenardo's scarcest card?");
    expect(a?.fact.startsWith('Pepenardo')).toBe(true);
    expect(a?.fact.startsWith('RC')).toBe(false);
  });

  it('lists an artist catalogue from a natural request', () => {
    const a = answerCardQuery("show me all of pepenardo's cards");
    expect(a?.kind).toBe('artist_cards');
    expect(a?.fact).toContain('Pepenardo:');
  });
});

describe('routing: structured queries reach the lookup', () => {
  const makeRouter = async () => {
    const { SmartRouterService } = await import('../../services/SmartRouterService');
    const router: any = new (SmartRouterService as any)({
      agentId: 'test',
      getService: () => null,
    } as any);
    // Capture the plan instead of calling a model.
    router.buildChatPlan = async (_t: string, _r: string, _x: any, _c: any, o: any) => ({
      kind: 'CHAT',
      knownFact: o?.knownFact,
    });
    return router;
  };

  it('answers before card-discovery can hijack the query', async () => {
    // "cards" in the text makes the plugin set forceCardFacts, and planRouting
    // used to hand that straight to buildCardRecommendPlan - which answered
    // PEPEPOSSE (a Gonkulator card, supply 23) for a question whose answer is
    // PEPERMINE at 150.
    const router = await makeRouter();
    const plan = await router.planRouting(
      "look at all pepenardo's cards, and tell me which has the highest collection size?",
      'room'
    );
    expect(plan.knownFact).toContain('PEPERMINE');
    expect(plan.knownFact).toContain('150');
  });

  it('routes other exact questions to the lookup too', async () => {
    const router = await makeRouter();
    for (const [q, expected] of [
      ['who is the artist for untitledfrog?', 'nicedayJULES'],
      ['when was freedomkek issued?', 'October 2017'],
      ["what's pepenardo's scarcest card?", 'WAKEMEUPEPE'],
    ] as const) {
      const plan = await router.planRouting(q, 'room');
      expect(plan.knownFact).toContain(expected);
    }
  });
});

import { describe, expect, it } from 'bun:test';
import {
  answerCardQuery,
  asksAttributionOfAnUnnamedCard,
  isStructuredCardQuery,
} from '../../utils/cardQueries';
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

describe('production regression 2026-08-20: "pepedawn who created djpepe ?"', () => {
  /**
   * Answered "DJPepe was created by rabbidfly." in the official channel.
   *
   * Two faults met: the lookup scanned the Fake Rares index only, so DJPEPE - a
   * Rare Pepe by Rare Scrilla - was invisible; and "pepedawn", typed only to
   * address the bot, was matched as a card and its artist handed to the model
   * as "THIS IS THE ANSWER, and it is exact".
   */
  it('answers about the card asked for, not the bot being addressed', () => {
    const a = answerCardQuery('pepedawn who created djpepe ?');
    expect(a?.asset).toBe('DJPEPE');
    expect(a?.fact).toContain('Rare Scrilla');
    expect(a?.fact).not.toContain('rabbidfly');
  });

  it('never lets PEPEDAWN outrank another card named in the same message', () => {
    // The old tie-break was name length, so the bot's own name won at 8
    // characters against DJPEPE at 6 - even had DJPEPE been in the index.
    const a = answerCardQuery('pepedawn what is the supply of freedomkek?');
    expect(a?.asset).toBe('FREEDOMKEK');
    expect(a?.fact).toContain('298');
  });

  it('still answers when PEPEDAWN genuinely is the subject', () => {
    expect(answerCardQuery('who made PEPEDAWN?')?.fact).toContain('rabbidfly');
    expect(answerCardQuery('who created pepedawn?')?.fact).toContain('rabbidfly');
    expect(answerCardQuery("what is PEPEDAWN's supply?")?.fact).toContain('133');
  });

  it('treats a bare vocative as no card question at all', () => {
    expect(answerCardQuery('hey pepedawn how are you')).toBeNull();
    expect(answerCardQuery('pepedawn what do you think about life')).toBeNull();
  });
});

describe('all three collections are reachable', () => {
  it('answers about a Rare Pepe and names the collection', () => {
    const a = answerCardQuery('who is the artist for DJPEPE?');
    expect(a?.fact).toBe('DJPEPE (Rare Pepes) is by Rare Scrilla.');
  });

  it('answers about a Fake Common', () => {
    const a = answerCardQuery('who made MASTERDJPEPE?');
    expect(a?.fact).toContain('Fake Commons');
    expect(a?.fact).toContain('Crimson Rider');
  });

  it('leaves Fake Rares unmarked, since that is the default here', () => {
    expect(answerCardQuery('who made FREEDOMKEK?')?.fact).toBe('FREEDOMKEK is by Rare Scrilla.');
  });

  it('qualifies a series number, which restarts per collection', () => {
    expect(answerCardQuery('what series is DJPEPE?')?.fact).toContain('in Rare Pepes');
    expect(answerCardQuery('what series is FAKEASF?')?.fact).not.toContain(' in ');
  });
});

describe('assets match as whole words', () => {
  it('does not match a card name buried inside another word', () => {
    // Substring matching pulled a card out of any word that contained one.
    expect(answerCardQuery('who made this thing')).toBeNull();
    expect(answerCardQuery('what is the supply of hopium')).toBeNull();
  });

  it('still matches around ordinary punctuation', () => {
    expect(answerCardQuery('who made freedomkek.')?.asset).toBe('FREEDOMKEK');
    expect(answerCardQuery('the artist for "FREEDOMKEK", anyone?')?.asset).toBe('FREEDOMKEK');
  });
});

describe('production regression 2026-08-20: attribution answered from chat prose', () => {
  /**
   * The bot's own wrong answer became its source.
   *
   * 10:32 the bot said "DJPepe was created by rabbidfly" (the lookup bug). A
   * user repeated it back, the bot restated it, and both turns stayed in the
   * room transcript. At 11:44 "who is the true creator of that card?" matched
   * none of the attribution words, fell through to retrieval - which composes
   * from prose, transcript included - and the bot quoted itself.
   */
  const PRODUCTION_MESSAGE =
    'Umm pepedawn - now that you have been code cleansed under the church of djpepe- ' +
    'who is the true creator of that card?';

  it('answers the exact message from the channel out of the index', () => {
    const a = answerCardQuery(PRODUCTION_MESSAGE);
    expect(a?.asset).toBe('DJPEPE');
    expect(a?.fact).toContain('Rare Scrilla');
    expect(a?.fact).not.toContain('rabbidfly');
  });

  it('recognises the ways people actually ask who made a card', () => {
    for (const q of [
      'who is the creator of djpepe?',
      'whose card is djpepe?',
      'djpepe was made by who?',
      'who is behind djpepe?',
      'who drew djpepe?',
      'who did djpepe?',
    ]) {
      expect(answerCardQuery(q)?.fact).toContain('Rare Scrilla');
    }
  });

  it('leaves a general origin question to lore', () => {
    // "who created Fake Rares?" has no card in view and is not the index's to
    // answer - it must still reach retrieval.
    expect(answerCardQuery('who created fake rares?')).toBeNull();
    expect(asksAttributionOfAnUnnamedCard('who created fake rares?')).toBe(false);
  });

  it('flags attribution asked of a card it cannot resolve', () => {
    expect(asksAttributionOfAnUnnamedCard('who is the true creator of that card?')).toBe(true);
    expect(asksAttributionOfAnUnnamedCard('who made it?')).toBe(true);
    expect(asksAttributionOfAnUnnamedCard('gm everyone')).toBe(false);
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

  it('asks which card when attribution cannot be resolved, instead of guessing', async () => {
    // The 11:44 shape: attribution asked of "that card", nothing the index can
    // resolve. Retrieval must not get the chance to answer it from prose.
    const router = await makeRouter();
    const plan = await router.planRouting('who is the true creator of that card?', 'room');
    expect(plan.knownFact).toContain('Which card');
    expect(plan.knownFact).not.toContain('rabbidfly');
  });

  it('routes the djpepe question to the right card end to end', async () => {
    // The whole path, not just the lookup: planRouting hands knownFact to the
    // model as an exact answer, so a wrong subject here becomes a confident
    // false statement in the channel.
    const router = await makeRouter();
    const plan = await router.planRouting('pepedawn who created djpepe ?', 'room');
    expect(plan.knownFact).toContain('Rare Scrilla');
    expect(plan.knownFact).not.toContain('rabbidfly');
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

describe('follow-up questions resolve the card in play', () => {
  const makeRouter = async () => {
    const { SmartRouterService } = await import('../../services/SmartRouterService');
    const router: any = new (SmartRouterService as any)({
      agentId: 'test',
      getService: () => null,
    } as any);
    router.buildChatPlan = async (_t: string, _a: any, _b: any, _c: any, o: any) => ({
      kind: 'CHAT',
      knownFact: o?.knownFact,
    });
    router.buildFactsPlan = async () => ({ kind: 'FACTS' });
    router.classifyIntent = async () => ({ intent: 'FACTS', raw: '{}' });
    return router;
  };

  it('answers "who made it?" from the card just discussed', async () => {
    // Live test showed this reaching retrieval with no subject and coming back
    // "Which card do you mean?".
    const router = await makeRouter();
    router.recordUserTurn('room', 'what is freedomkek supply?', 'bob');
    router.recordBotTurn('room', 'FREEDOMKEK has a supply of 298.');
    const plan = await router.planRouting('who made it?', 'room');
    expect(plan.knownFact).toContain('Rare Scrilla');
  });

  it('carries the subject across several follow-ups', async () => {
    const router = await makeRouter();
    router.recordBotTurn('room', 'FREEDOMKEK has a supply of 298.');
    expect((await router.planRouting('what series is it?', 'room')).knownFact).toContain('series 0');
    expect((await router.planRouting('when was it issued?', 'room')).knownFact).toContain(
      'October 2017'
    );
  });

  it('prefers an explicitly named card over the pronoun subject', async () => {
    const router = await makeRouter();
    router.recordBotTurn('room', 'FREEDOMKEK has a supply of 298.');
    const plan = await router.planRouting('and who made PEPEDAWN?', 'room');
    expect(plan.knownFact).toContain('PEPEDAWN');
    expect(plan.knownFact).not.toContain('FREEDOMKEK');
  });

  it('asks which card rather than inventing a subject', async () => {
    // It used to fall through to retrieval, which answers from prose - and
    // prose includes the room transcript. Asking is the only answer that
    // cannot be poisoned by what was said earlier.
    const router = await makeRouter();
    const plan = await router.planRouting('who made it?', 'empty-room');
    expect(plan.knownFact).toContain('Which card');
    expect(plan.card).toBeUndefined();
  });
});

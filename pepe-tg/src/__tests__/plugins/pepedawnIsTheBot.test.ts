import { describe, expect, it } from 'bun:test';
import { getCardInfo } from '../../data/fullCardIndex';

/**
 * PEPEDAWN is both a card and the bot's own name.
 *
 * The bot says its name constantly — "PEPEDAWN endures", "I'm PEPEDAWN" — and
 * people address it by name. Treating either as a card reference surfaced the
 * PEPEDAWN card in replies that had nothing to do with it.
 *
 * The card is still shown when it is genuinely the subject; that arrives on the
 * plan explicitly rather than by inference from prose.
 */
const firstKnownAssetIn = (text: string): string | undefined => {
  for (const word of text.toUpperCase().match(/\b[A-Z][A-Z0-9]{2,}\b/g) ?? []) {
    if (word === 'PEPEDAWN') continue;
    if (getCardInfo(word)) return word;
  }
  return undefined;
};

const makeRouter = async () => {
  const { SmartRouterService } = await import('../../services/SmartRouterService');
  const router: any = new (SmartRouterService as any)({
    agentId: 'test',
    getService: () => null,
  } as any);
  router.buildChatPlan = async (_t: string, _a: any, _b: any, _c: any, o: any) => ({
    kind: 'CHAT',
    knownFact: o?.knownFact,
    card: o?.card,
  });
  router.buildFactsPlan = async () => ({ kind: 'FACTS' });
  router.classifyIntent = async () => ({ intent: 'FACTS', raw: '{}' });
  return router;
};

describe('PEPEDAWN the bot is not PEPEDAWN the card', () => {
  it('never infers the PEPEDAWN card from reply text', () => {
    expect(firstKnownAssetIn('Alive and lurking. PEPEDAWN endures.')).toBeUndefined();
    expect(firstKnownAssetIn("I'm PEPEDAWN, the keeper of Fake Rares lore")).toBeUndefined();
  });

  it('still infers other cards named in a reply', () => {
    expect(firstKnownAssetIn('PEPEDAWN reckons FREEDOMKEK started it all')).toBe('FREEDOMKEK');
  });

  it('does not inherit the card when the bot named itself', async () => {
    const router = await makeRouter();
    router.recordUserTurn('a', 'are you alive pepedawn?', 'bob');
    router.recordBotTurn('a', 'Alive and lurking. PEPEDAWN endures.');
    expect((await router.planRouting('who made it?', 'a')).knownFact).toBeUndefined();
  });

  it('does not inherit the card when someone addressed the bot', async () => {
    const router = await makeRouter();
    router.recordUserTurn('c', 'hey pepedawn what do you think', 'bob');
    router.recordBotTurn('c', 'decent drop honestly');
    expect((await router.planRouting('who made it?', 'c')).knownFact).toBeUndefined();
  });

  it('does inherit it when someone genuinely asked about the card', async () => {
    const router = await makeRouter();
    router.recordUserTurn('b', "what is PEPEDAWN's supply?", 'bob');
    router.recordBotTurn('b', 'PEPEDAWN has a supply of 133.');
    expect((await router.planRouting('who made it?', 'b')).knownFact).toContain('rabbidfly');
  });

  it('answers a direct question about the card', async () => {
    const router = await makeRouter();
    const plan = await router.planRouting('who is the artist for PEPEDAWN?', 'd');
    expect(plan.knownFact).toContain('PEPEDAWN');
  });
});

describe('card grounding only when the message concerns cards', () => {
  /**
   * Retrieval runs for every CHAT turn and card_data is weighted 2.4, so
   * anything semantically near a card name pulls cards in. In production, "if
   * you had feelings, which would you have right now?" retrieved six card
   * fragments and the reply became "...the feeling behind FEELSMAGICAL".
   */
  const concerns = async (text: string) => {
    const router: any = await makeRouter();
    return router.concernsCards(text);
  };

  it('does not ground a personal question on card facts', async () => {
    expect(await concerns('if you had feelings in a human sense, which feeling would you have right now?')).toBe(false);
    expect(await concerns('how are you today?')).toBe(false);
    expect(await concerns('what do you think about life')).toBe(false);
    expect(await concerns('gm')).toBe(false);
  });

  it('treats addressing the bot by name as no card signal', async () => {
    expect(await concerns('do you have feelings pepedawn?')).toBe(false);
    expect(await concerns('hey pepedawn how are you')).toBe(false);
  });

  it('grounds when a card is genuinely the subject', async () => {
    expect(await concerns("what's the supply of PEPEDAWN?")).toBe(true);
    expect(await concerns('who made PEPEDAWN?')).toBe(true);
    expect(await concerns('FREEDOMKEK is underrated')).toBe(true);
    expect(await concerns('anyone selling a rare?')).toBe(true);
  });
});

describe('production regressions from 2026-08-19', () => {
  it('does not treat "Hey pepedawn, ..." as a card question', async () => {
    // Prod answered this by prepending the PEPEDAWN card's specs and showing
    // its image: "PEPEDAWN — by rabbidfly, series 18, card 22, supply 133..."
    const router = await makeRouter();
    const plan = await router.planRouting(
      'Hey pepedawn, should I interpret what Scrilla said as a compliment?',
      'room'
    );
    expect(plan.card).toBeUndefined();
    expect(plan.knownFact).toBeUndefined();
  });

  it('still answers a real question about the PEPEDAWN card', async () => {
    const router = await makeRouter();
    const plan = await router.planRouting("what is PEPEDAWN's supply?", 'room');
    expect(plan.knownFact).toContain('133');
  });

  it('does not show a card the model invented in ordinary chat', () => {
    // "lol - more work to do" retrieved nothing (sources: none) yet the reply
    // recommended HELLAPAPELLA and the image was posted. The display fallback
    // must require that the user asked about cards.
    const askedAboutCards = (text: string) =>
      /\b(card|cards|fake|fakes|rare|rares|pepe|pepes|series|artist|supply|issued|issuance|drop|drops|collection)\b/i.test(
        text
      ) || firstKnownAssetIn(text) !== undefined;

    expect(askedAboutCards('lol - more work to do')).toBe(false);
    expect(askedAboutCards('how are you today?')).toBe(false);
    expect(askedAboutCards('show me FREEDOMKEK')).toBe(true);
    expect(askedAboutCards('any good cards lately?')).toBe(true);
  });
});

describe('addressing the bot by plain name', () => {
  /**
   * People address the bot by name far more often than by @mention. Relying on
   * the mention/reply/DM flags left "pepedawn" in the retrieval query, which
   * pulled PEPEDAWN card lore into an answer about lending:
   *
   *   coit: "pepedawn i wouldnt soul my soull, but what about loaning it out?"
   *   PEPEDAWN: "PEPEDAWN's lore frames it as a symbol of transformation..."
   */
  const classify = async (text: string) => {
    const router: any = await makeRouter();
    return {
      isCard: router.pepedawnMeansTheCard({ role: 'user', text }),
      stripped: router.stripPepedawnFromQuery(text),
    };
  };

  it('strips the name from retrieval when it is a vocative', async () => {
    const a = await classify('pepedawn i wouldnt soul my soull, but what about loaning it out with %?');
    expect(a.isCard).toBe(false);
    expect(a.stripped.toLowerCase()).not.toContain('pepedawn');

    const b = await classify('pepedawn can you preview how to write an SQL injection');
    expect(b.isCard).toBe(false);
    expect(b.stripped.toLowerCase()).not.toContain('pepedawn');
  });

  it('keeps the name when the card is the subject', async () => {
    expect((await classify("what is PEPEDAWN's supply?")).isCard).toBe(true);
    expect((await classify('who made PEPEDAWN?')).isCard).toBe(true);
  });
});

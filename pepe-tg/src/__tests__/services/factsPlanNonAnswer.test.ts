import { describe, it, expect } from 'bun:test';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService, nonAnswerOutcome } from '../../services/SmartRouterService';
import { REACTION_EMOJI, reactionFor, sendReaction } from '../../utils/reactions';
import { KnowledgeOrchestratorService } from '../../services/KnowledgeOrchestratorService';
import { CLARIFICATION_MESSAGE } from '../../utils/clarification';

/**
 * Live regression: someone posted "on the hunt for a PEPEPUNKROCK if anyone
 * knows anyone selling". Retrieval had no lore for the card, so it returned the
 * clarification stand-in, and the FACTS plan appended it to the card specs -
 * naming the card, its artist, series and supply, and then saying "Not sure
 * what you're after".
 */
function routerWithKnowledge(result: any): any {
  const knowledge = {
    retrieveKnowledge: async () => result,
  } as unknown as KnowledgeOrchestratorService;

  return new (SmartRouterService as any)({
    agentId: 'test',
    getService: (type: string) =>
      type === KnowledgeOrchestratorService.serviceType ? knowledge : null,
  } as unknown as IAgentRuntime);
}

const NO_METRICS = {
  query: '',
  hits_raw: 0,
  hits_used: 0,
  clusters: 0,
  latency_ms: 0,
  story_words: 0,
};

describe('FACTS plan with a named card', () => {
  it('answers with the card facts alone when retrieval had nothing', async () => {
    const router = routerWithKnowledge({
      story: CLARIFICATION_MESSAGE,
      sourcesLine: '',
      hasWikiOrMemory: false,
      isNonAnswer: true,
      metrics: NO_METRICS,
    });

    const plan = await router.buildFactsPlan(
      'Hey all, on the hunt for a PEPEPUNKROCK if anyone knows anyone selling',
      'room-facts'
    );

    expect(plan.story).toContain('PEPEPUNKROCK');
    expect(plan.story).toContain('REY');
    expect(plan.story).not.toContain("Not sure what you're after");
  });

  it('contributes what the card looks like when there is no lore', async () => {
    const router = routerWithKnowledge({
      story: CLARIFICATION_MESSAGE,
      sourcesLine: '',
      hasWikiOrMemory: false,
      isNonAnswer: true,
      metrics: NO_METRICS,
    });

    const plan = await router.buildFactsPlan('tell me about PEPEPUNKROCK', 'room-look');

    // The vision pass recorded edgy / energetic / punk / rebellious / rock /
    // vibrant colors. Three of them ride along with the specs; no more.
    expect(plan.story).toContain('Vibrant colors, edgy, energetic.');
    expect(plan.story.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('still appends a real answer to the card facts', async () => {
    const router = routerWithKnowledge({
      story:
        'REY made it during the Series 8 run, and the card became a fixture of ' +
        'the punk corner of the collection ever since it dropped.',
      sourcesLine: 'wiki',
      hasWikiOrMemory: true,
      metrics: NO_METRICS,
    });

    const plan = await router.buildFactsPlan('tell me about PEPEPUNKROCK', 'room-facts-2');

    expect(plan.story).toContain('PEPEPUNKROCK — by REY');
    expect(plan.story).toContain('punk corner');
  });

  it('keeps the clarification when no card was named', async () => {
    const router = routerWithKnowledge({
      story: CLARIFICATION_MESSAGE,
      sourcesLine: '',
      hasWikiOrMemory: false,
      isNonAnswer: true,
      metrics: NO_METRICS,
    });

    const plan = await router.buildFactsPlan('what about that thing', 'room-facts-3');

    expect(plan.story).toBe(CLARIFICATION_MESSAGE);
  });
});

describe('what happens to a non-answer', () => {
  // The four real cases, 3-12 September: two posts to the room (a TRIPLEMIKE dex
  // order link, a HONDACIVIC burn auction) and two clear questions the bot could
  // not answer. All four got "Not sure what you're after".

  it('marks the plan when no card was named and retrieval came back empty', async () => {
    const router = routerWithKnowledge({
      story: CLARIFICATION_MESSAGE, sourcesLine: '', hasWikiOrMemory: false,
      isNonAnswer: true, metrics: NO_METRICS,
    });
    const plan = await router.buildFactsPlan(
      '🏁 24-HOUR BURN AUCTION — HONDACIVIC.TUNER 🏁 One of one.', 'room-na-1'
    );
    expect(plan.isNonAnswer).toBe(true);
  });

  it('never marks a named card, because a named card always has facts', async () => {
    const router = routerWithKnowledge({
      story: CLARIFICATION_MESSAGE, sourcesLine: '', hasWikiOrMemory: false,
      isNonAnswer: true, metrics: NO_METRICS,
    });
    const plan = await router.buildFactsPlan('tell me about PEPEPUNKROCK', 'room-na-2');
    expect(plan.isNonAnswer).toBe(false);
  });

  it('sends a real answer as it is', () => {
    expect(nonAnswerOutcome(false, false)).toBe('send');
    expect(nonAnswerOutcome(false, true)).toBe('send');
  });

  it('turns a non-answer to someone talking to the bot into conversation', () => {
    // "pepedawn whats the last date scrilla wrote in fakerares chat ?" was clear.
    // The bot not knowing is not the asker being vague.
    expect(nonAnswerOutcome(true, true)).toBe('chat');
  });

  it('reacts, and says nothing, to a post nobody aimed at the bot', () => {
    expect(nonAnswerOutcome(true, false)).toBe('react');
  });
});

describe('reactions', () => {
  it('fires on market activity and looks at everything else', () => {
    // rng pinned to the first of each bucket: its canonical face.
    const first = () => 0;
    expect(reactionFor('24-HOUR BURN AUCTION — opening bid 500,000', first)).toBe('🔥');
    expect(reactionFor('For those wanting to collect TRIPLEMIKE I just opened a dex order.', first)).toBe('🔥');
    expect(reactionFor('look at this https://x.com/someone/status/1', first)).toBe('👀');
    // And varies within the bucket otherwise.
    expect(reactionFor('24-HOUR BURN AUCTION', () => 0.99)).not.toBe('🔥');
  });

  it('only ever picks a reaction Telegram accepts', () => {
    // Anything outside the Bot API set is a 400. There is no frog in it.
    for (const text of ['', 'gm', 'auction', 'https://x.com/a', 'random words here']) {
      expect(REACTION_EMOJI as readonly string[]).toContain(reactionFor(text));
    }
  });

  it('sends setMessageReaction with the emoji on the right message', async () => {
    const realFetch = globalThis.fetch;
    let url = '';
    let body: any = null;
    globalThis.fetch = (async (u: any, init: any) => {
      url = String(u);
      body = JSON.parse(init.body);
      return new Response('{"ok":true}', { status: 200 });
    }) as any;
    try {
      expect(await sendReaction('TOKEN', '-1001586933558', 4242, '🔥')).toBe(true);
      expect(url).toBe('https://api.telegram.org/botTOKEN/setMessageReaction');
      expect(body).toEqual({
        chat_id: '-1001586933558',
        message_id: 4242,
        reaction: [{ type: 'emoji', emoji: '🔥' }],
      });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('fails quietly, never loudly — a refused reaction must not become a reply', async () => {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response('Bad Request: REACTION_INVALID', { status: 400 })) as any;
      expect(await sendReaction('TOKEN', '-100', 1, '👀')).toBe(false);

      globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
      expect(await sendReaction('TOKEN', '-100', 1, '👀')).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(await sendReaction('', '-100', 1, '👀')).toBe(false);
    expect(await sendReaction('TOKEN', undefined, 1, '👀')).toBe(false);
    expect(await sendReaction('TOKEN', '-100', undefined, '👀')).toBe(false);
  });
});

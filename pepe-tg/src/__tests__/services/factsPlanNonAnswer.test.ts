import { describe, it, expect } from 'bun:test';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
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

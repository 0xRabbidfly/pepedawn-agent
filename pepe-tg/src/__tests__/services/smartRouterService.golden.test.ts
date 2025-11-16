import { describe, it, expect, vi, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService, type ConversationIntent } from '../../services/SmartRouterService';
import { KnowledgeOrchestratorService } from '../../services/KnowledgeOrchestratorService';
import * as modelGateway from '../../utils/modelGateway';

const FIXTURE_DIR = path.resolve(__dirname, '../__fixtures__/smart-router');

function readFixture(fileName: string): string {
  return readFileSync(path.join(FIXTURE_DIR, fileName), 'utf8');
}

function createRuntimeStub(): IAgentRuntime {
  return {
    // Minimal stubs for retrieval pipeline
    searchMemories: async () => [],
    useModel: async () => [0.1, 0.2, 0.3],
    getService: (serviceType: string) => {
      if (serviceType === KnowledgeOrchestratorService.serviceType) {
        // Very small stub that satisfies buildFactsPlan / buildCardRecommendPlan
        return {
          retrieveKnowledge: async () => ({
            story: 'Test story about a very cold pepe.',
            sourcesLine: 'test-source',
            cardSummary: null,
            metrics: {
              countsBySource: { wiki: 1 },
              totalPassages: 1,
              totalCandidates: 1,
              weightedBySource: { wiki: 1 },
            },
          }),
        } as any;
      }
      return null;
    },
  } as unknown as IAgentRuntime;
}

function createRouter(): SmartRouterService {
  return new SmartRouterService(createRuntimeStub());
}

describe('SmartRouterService golden fixtures', () => {
  const mockModelResult = {
    text: '{"intent":"LORE","command":""}',
    tokensIn: 0,
    tokensOut: 0,
    model: 'test-model',
    cost: 0,
    duration: 0,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the expected classifier prompt', async () => {
    const router = createRouter();
    const roomId = 'golden-room';

    router.recordUserTurn(roomId, '   gm fam   ', ' Coit ');
    router.recordBotTurn(roomId, 'Morning sunshine 🌞');
    router.recordUserTurn(roomId, 'remind me about PURPLEPEPE lore later', 'Coit');

    const classifierSpy = vi
      .spyOn(modelGateway, 'callTextModel')
      .mockResolvedValue(mockModelResult);

    await (router as unknown as {
      classifyIntent: (room: string, message: string) => Promise<unknown>;
    }).classifyIntent(roomId, 'tell me a story about purplepepe');

    expect(classifierSpy).toHaveBeenCalledTimes(1);
    const [, options] = classifierSpy.mock.calls[0];
    const expectedPrompt = readFixture('classifier-prompt.txt').trim();
    expect(options.prompt).toBe(expectedPrompt);
  });

  it('overrides NORESPONSE to FACTS for card descriptor-style queries', async () => {
    const router = createRouter();
    const roomId = 'descriptor-room';

    // Simulate a prior bit of chat to populate history (not strictly required)
    router.recordUserTurn(roomId, 'gm fam', 'User');

    // Force the classifier to say NORESPONSE even though the query looks like a descriptor
    const descriptorQuery = 'what is the coldest af pepe in the collection?';
    const classifierSpy = vi
      .spyOn(modelGateway, 'callTextModel')
      .mockResolvedValue({
        ...mockModelResult,
        text: '{"intent":"NORESPONSE","command":""}',
      });

    const plan = await router.planRouting(descriptorQuery, roomId);

    expect(classifierSpy).toHaveBeenCalledTimes(1);
    expect(plan.intent).toBe('FACTS');
    expect(plan.kind === 'FACTS' || plan.kind === 'CARD_RECOMMEND').toBe(true);
  });

  it('returns mode presets matching golden fixtures', () => {
    const expected = JSON.parse(readFixture('mode-presets.json')) as Record<
      Exclude<ConversationIntent, 'NORESPONSE' | 'CMDROUTE'>,
      any
    >;

    const router = createRouter();

    const actual: Record<string, unknown> = {};
    (['LORE', 'FACTS', 'CHAT'] as const).forEach((intent) => {
      const retrieveOptions = (router as unknown as {
        getRetrieveOptions: (intent: ConversationIntent) => unknown;
      }).getRetrieveOptions(intent);
      actual[intent] = retrieveOptions;
    });

    expect(actual).toEqual(expected);
  });
});


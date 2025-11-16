import { describe, it, expect, vi, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService, type ConversationIntent } from '../../services/SmartRouterService';
import { KnowledgeOrchestratorService } from '../../services/KnowledgeOrchestratorService';
import * as modelGateway from '../../utils/modelGateway';
import * as retrieveCandidatesModule from '../../router/retrieveCandidates';

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

describe('SmartRouterService planRouting intent and fallback behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns CMDROUTE plan when classifier selects CMDROUTE with a valid command', async () => {
    const router = createRouter();
    const roomId = 'cmdroute-room';

    const classifierSpy = vi
      .spyOn(modelGateway, 'callTextModel')
      .mockResolvedValue({
        text: '{"intent":"CMDROUTE","command":"/fl"}',
        tokensIn: 0,
        tokensOut: 0,
        model: 'test-model',
        cost: 0,
        duration: 0,
      });

    const retrieveSpy = vi.spyOn(retrieveCandidatesModule, 'retrieveCandidates');

    const plan = await router.planRouting('please run lore', roomId);

    expect(classifierSpy).toHaveBeenCalledTimes(1);
    expect(retrieveSpy).not.toHaveBeenCalled();
    expect(plan.kind).toBe('CMDROUTE');
    expect(plan.intent).toBe('CMDROUTE');
    expect(plan.command).toBe('/fl');
  });

  it('falls back to NORESPONSE when CMDROUTE has no usable command', async () => {
    const router = createRouter();

    vi.spyOn(modelGateway, 'callTextModel').mockResolvedValue({
      text: '{"intent":"CMDROUTE","command":""}',
      tokensIn: 0,
      tokensOut: 0,
      model: 'test-model',
      cost: 0,
      duration: 0,
    });

    const plan = await router.planRouting('do something', 'room-cmd-empty');

    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');
    expect(plan.reason).toBe('classifier_noreply');
  });

  it('overrides non-FACTS classifier intent to FACTS when a known card is mentioned', async () => {
    const router = createRouter();

    // Force classifier to say CHAT even though a card is clearly mentioned
    vi.spyOn(modelGateway, 'callTextModel').mockResolvedValue({
      text: '{"intent":"CHAT","command":""}',
      tokensIn: 0,
      tokensOut: 0,
      model: 'test-model',
      cost: 0,
      duration: 0,
    });

    const plan = await router.planRouting('tell me about FAKEPARTY', 'room-card');

    // We only assert that the router normalises the intent to FACTS;
    // the specific plan.kind can be FACTS, CARD_RECOMMEND, or FAST_PATH_CARD.
    expect(plan.intent).toBe('FACTS');
  });

  it('returns NORESPONSE with empty_text reason for empty input', async () => {
    const router = createRouter();
    const plan = await router.planRouting('   ', 'room-empty');

    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');
    expect(plan.reason).toBe('empty_text');
    expect(plan.retrieval).toBeNull();
  });

  it('returns NORESPONSE when classifier chooses NORESPONSE for a non-descriptor message', async () => {
    const router = createRouter();

    vi.spyOn(modelGateway, 'callTextModel').mockResolvedValue({
      text: '{"intent":"NORESPONSE","command":""}',
      tokensIn: 0,
      tokensOut: 0,
      model: 'test-model',
      cost: 0,
      duration: 0,
    });

    const plan = await router.planRouting('lol', 'room-noreply');

    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');
    expect(plan.reason).toBe('classifier_noreply');
  });

  it('returns NORESPONSE with knowledge_unavailable when KnowledgeOrchestratorService is missing for FACTS', async () => {
    const runtimeWithoutKnowledge = {
      searchMemories: async () => [],
      useModel: async () => [0.1, 0.2, 0.3],
      getService: () => null,
    } as unknown as IAgentRuntime;
    const router = new SmartRouterService(runtimeWithoutKnowledge);

    vi.spyOn(modelGateway, 'callTextModel').mockResolvedValue({
      text: '{"intent":"FACTS","command":""}',
      tokensIn: 0,
      tokensOut: 0,
      model: 'test-model',
      cost: 0,
      duration: 0,
    });

    const plan = await router.planRouting('what is FAKEPARTY?', 'room-no-knowledge');

    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');
    expect(plan.reason).toBe('knowledge_unavailable');
  });

  it('falls back to NORESPONSE with chat_generation_failed when CHAT generation throws', async () => {
    const router = createRouter();

    vi.spyOn(modelGateway, 'callTextModel')
      // First call: classifier → CHAT
      .mockResolvedValueOnce({
        text: '{"intent":"CHAT","command":""}',
        tokensIn: 0,
        tokensOut: 0,
        model: 'test-model',
        cost: 0,
        duration: 0,
      })
      // Second call: CHAT generation → throw
      .mockRejectedValueOnce(new Error('CHAT model failure'));

    // Avoid hitting real retrieval; return an empty retrieval result
    vi.spyOn(retrieveCandidatesModule, 'retrieveCandidates').mockResolvedValue({
      expandedQuery: 'gm fam',
      candidates: [],
      passagesById: new Map(),
      metrics: {
        latencyMs: 0,
        totalPassages: 0,
        totalCandidates: 0,
        countsBySource: {
          memory: 0,
          wiki: 0,
          card_data: 0,
          telegram: 0,
          unknown: 0,
        },
        weightedBySource: {
          memory: 0,
          wiki: 0,
          card_data: 0,
          telegram: 0,
          unknown: 0,
        },
      },
    } as any);

    const plan = await router.planRouting('gm fam', 'room-chat');

    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');
    expect(plan.reason).toBe('chat_generation_failed');
  });
});


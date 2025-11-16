import { describe, it, expect, spyOn } from 'bun:test';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import { KnowledgeOrchestratorService } from '../../services/KnowledgeOrchestratorService';
import { callTextModel } from '../../utils/modelGateway';

function createRouter(): SmartRouterService {
  const runtimeStub = {} as unknown as IAgentRuntime;
  return new SmartRouterService(runtimeStub);
}

function getRecentTurns(router: SmartRouterService, roomId: string, count: number) {
  return (router as unknown as { getRecentTurns: (room: string, count: number) => any[] }).getRecentTurns(
    roomId,
    count
  );
}

function formatTranscript(router: SmartRouterService, turns: any[]) {
  return (router as unknown as { formatTranscript: (turns: any[]) => string }).formatTranscript(turns);
}

describe('SmartRouterService conversation history', () => {
  it('records user and bot turns with sanitised output', () => {
    const router = createRouter();
    const roomId = 'room-1';

    router.recordUserTurn(roomId, '   gm fam  ', '  Alice   Wonderland  ');
    router.recordBotTurn(roomId, '  Good morning!  ');

    const turns = getRecentTurns(router, roomId, 10);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      role: 'user',
      author: 'Alice   Wonderland',
      text: 'gm fam',
    });
    expect(turns[1]).toMatchObject({
      role: 'bot',
      author: 'PEPEDAWN',
      text: 'Good morning!',
    });

    const transcript = formatTranscript(router, turns);
    expect(transcript).toContain('[USER] Alice   Wonderland: gm fam');
    expect(transcript).toContain('[BOT] PEPEDAWN: Good morning!');
  });

  it('clamps history to the configured limit', () => {
    const router = createRouter();
    const roomId = 'overflow-room';

    for (let i = 0; i < 75; i += 1) {
      router.recordUserTurn(roomId, `message ${i + 1}`, `User${i + 1}`);
    }

    const turns = getRecentTurns(router, roomId, 100);
    expect(turns.length).toBeLessThanOrEqual(60);
    expect(turns[0].text).toBe('message 16');
    expect(turns[turns.length - 1].text).toBe('message 75');
  });

  it('includes only available turns when history shorter than requested', () => {
    const router = createRouter();
    const roomId = 'short-room';

    router.recordUserTurn(roomId, 'First', 'UserOne');
    router.recordBotTurn(roomId, 'Reply One');

    const turns = getRecentTurns(router, roomId, 20);
    expect(turns).toHaveLength(2);

    const transcript = formatTranscript(router, turns);
    expect(transcript.split('\n')).toHaveLength(2);
  });
});

describe('SmartRouterService card recommend formatting', () => {
  function createRouterWithKnowledge(mockResult: any): SmartRouterService {
    const runtimeStub = {
      getService: (serviceType: string) => {
        if (serviceType === SmartRouterService.serviceType) return null;
        if (serviceType === (KnowledgeOrchestratorService as any).serviceType) {
          return {
            retrieveKnowledge: async () => mockResult,
          };
        }
        return null;
      },
    } as unknown as IAgentRuntime;
    return new SmartRouterService(runtimeStub);
  }

  it('strips duplicate card names and annotations from summaries and reasons', async () => {
    const mockResult = {
      primaryCardAsset: 'DJPEPEBADGER.GORILLA-GLUE-MONEY-BADGER',
      cardSummary: '',
      story: '',
      cardMatches: [
        {
          asset: 'DJPEPEBADGER.GORILLA-GLUE-MONEY-BADGER',
          reason: '**DJPEPEBADGER.GORILLA-GLUE-MONEY-BADGER** fits because [CARD:DJPEPEBADGER.GORILLA-GLUE-MONEY-BADGER] it flexes the fattest stacks.',
        },
        {
          asset: 'BIGTIMEWOW',
          reason: '**BIGTIMEWOW** fits because [CARDFACT:COMBINED CARD FACT] enormous collage energy.',
        },
      ],
    };

    const router = createRouterWithKnowledge(mockResult);
    const plan = await (router as any).buildCardRecommendPlan('what is the biggest pepe?', 'room-1', null, '{}');

    expect(plan?.cardSummary).toBe('DJPEPEBADGER.GORILLA-GLUE-MONEY-BADGER — fits because it flexes the fattest stacks.');
    expect(plan?.cardMatches?.[0]?.reason).toBe('fits because it flexes the fattest stacks.');
    expect(plan?.cardMatches?.[1]?.reason).toBe('fits because enormous collage energy.');
  });
});

describe('SmartRouterService PEPEDAWN disambiguation', () => {
  it('does not treat conversational PEPEDAWN message as named-card intent when classifier returns NORESPONSE', async () => {
    const classifySpy = spyOn(
      SmartRouterService.prototype as any,
      'classifyIntent'
    ).mockResolvedValue({
      intent: 'NORESPONSE',
      raw: '{"intent":"NORESPONSE","command":""}',
    });

    const pepedawnUsageSpy = spyOn(
      SmartRouterService.prototype as any,
      'classifyPepedawnUsage'
    ).mockResolvedValue('BOT_CHAT');

    const runtimeStub = {} as unknown as IAgentRuntime;
    const router = new SmartRouterService(runtimeStub);

    const plan = await router.planRouting(
      'pepedawn will be a bit more chatty now - but it should feel more conversational and smarter',
      'room-pepe'
    );

    expect(classifySpy).toHaveBeenCalled();
    expect(pepedawnUsageSpy).toHaveBeenCalled();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.intent).toBe('NORESPONSE');

    classifySpy.mockRestore();
    pepedawnUsageSpy.mockRestore();
  });
});




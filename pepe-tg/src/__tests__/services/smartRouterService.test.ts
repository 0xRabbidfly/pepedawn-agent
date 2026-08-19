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


describe('SmartRouterService PEPEDAWN disambiguation', () => {
  it('treats PEPEDAWN as the bot when the message addressed it', async () => {
    const { SmartRouterService } = await import('../../services/SmartRouterService');
    const router: any = new (SmartRouterService as any)({
      agentId: 'test',
      getService: () => null,
    } as any);
    // The dedicated disambiguator LLM call is gone: the caller already knows
    // whether the bot was addressed, so it passes that in.
    let seen: string | undefined;
    router.buildChatPlan = async (t: string) => {
      seen = t;
      return { kind: 'CHAT' };
    };
    router.classifyIntent = async () => ({ intent: 'CHAT', raw: '{}' });
    await router.planRouting('hey pepedawn what do you think', 'room', true);
    expect(seen).not.toContain('pepedawn');
  });
});




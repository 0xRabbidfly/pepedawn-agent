/**
 * "dawn" is the bot's name too, since 5.16.2 - except when it is the time
 * of day. And a message that says "dawn" is an invitation, the same as
 * "pepedawn": in a quiet room it gets answered, not silenced.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import { namesTheBot } from '../../utils/botName';

describe('the bot hears its short name', () => {
  it('pepedawn, @pepedawn_bot and dawn all name it', () => {
    for (const t of ['pepedawn what do you think', '@pepedawn_bot gm', 'dawn is this all fakes?', 'yo Dawn, who made FREEDOMKEK', 'DAWN', 'thanks dawn']) {
      expect(namesTheBot(t)).toBe(true);
    }
  });
  it('the time of day does not', () => {
    for (const t of ['woke up at dawn', 'the crack of dawn', 'the dawn of the fakes', 'from dusk till dawn', 'dawn breaks over the pond', 'new dawn for pepe', 'early dawn mint']) {
      expect(namesTheBot(t)).toBe(false);
    }
    expect(namesTheBot('gm everyone')).toBe(false);
  });
});

describe('the router treats "dawn" as being addressed', () => {
  let dir: string;
  const savedShadowDir = process.env.V5_SHADOW_DIR;
  const savedVolunteer = process.env.VOLUNTEER_REPLIES;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-dawn-'));
    process.env.V5_SHADOW_DIR = dir;
    process.env.VOLUNTEER_REPLIES = 'false';
  });
  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (savedShadowDir === undefined) delete process.env.V5_SHADOW_DIR; else process.env.V5_SHADOW_DIR = savedShadowDir;
    if (savedVolunteer === undefined) delete process.env.VOLUNTEER_REPLIES; else process.env.VOLUNTEER_REPLIES = savedVolunteer;
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers "dawn, ..." in a quiet room where the same words without the name would be silence', async () => {
    const prompts: string[] = [];
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
      const isClassifier = String(options.prompt).includes('Return STRICT JSON');
      if (!isClassifier) prompts.push(String(options.prompt));
      return { text: isClassifier ? '{"intent":"CHAT","command":""}' : 'a reply', tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0 } as any;
    });
    const runtime = { agentId: 'test', getService: () => null, searchMemories: async () => [], useModel: async () => [], getSetting: () => undefined } as unknown as IAgentRuntime;
    const service = new SmartRouterService(runtime);
    const silent = await service.planRouting('what a week that was', 'room-dawn-1', false, '111');
    const named = await service.planRouting('dawn, what a week that was', 'room-dawn-2', false, '111');
    spy.mockRestore();
    expect(silent.kind).toBe('NORESPONSE');
    expect(named.kind).toBe('CHAT');
    // The name is stripped from what the model is asked, as it is for "pepedawn".
    expect(prompts.some((p) => /what a week that was/.test(p))).toBe(true);
  });
});

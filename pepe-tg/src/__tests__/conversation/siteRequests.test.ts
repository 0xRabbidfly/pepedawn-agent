/**
 * The two messages from 24 September 2026, end to end through the router:
 * "can you fix my artist name on the site its wrong" (a reply to the bot's
 * release note) got FAKEFAKEBAN and a raw knowledge block. It must get the
 * claim form, stated exactly, and never a card.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import { CLAIM_URL } from '../../utils/directoryHelp';

const LE_HUES = '424242';

describe('a request to fix something on the directory', () => {
  let dir: string;
  const savedShadowDir = process.env.V5_SHADOW_DIR;

  function router() {
    const prompts: string[] = [];
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
      const isClassifier = String(options.prompt).includes('Return STRICT JSON');
      if (!isClassifier) prompts.push(String(options.prompt));
      return {
        text: isClassifier ? '{"intent":"FACTS","command":""}' : 'a reply',
        tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0,
      } as any;
    });
    const runtime = {
      agentId: 'test',
      getService: () => null,
      searchMemories: async () => [],
      useModel: async () => [],
      getSetting: () => undefined,
    } as unknown as IAgentRuntime;
    return { service: new SmartRouterService(runtime), prompts, spy };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-siterq-'));
    process.env.V5_SHADOW_DIR = dir;
  });

  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (savedShadowDir === undefined) delete process.env.V5_SHADOW_DIR;
    else process.env.V5_SHADOW_DIR = savedShadowDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers with the claim form, exactly, and shows no card', async () => {
    const { service, prompts, spy } = router();
    for (const text of [
      'can you fix my artist name on the site its wrong',
      "@pepedawn_bot can you update my name on the new website please. I've completed my claim form",
    ]) {
      const plan = await service.planRouting(text, 'room-site-1', true, LE_HUES);
      expect(plan.kind).toBe('CHAT');
      expect(plan.kind).not.toBe('FAST_PATH_CARD');
      expect(plan.reason).not.toMatch(/card_fast_path/);
    }
    spy.mockRestore();
    // The reply prompt carries the exact answer, with the form, and nothing to retrieve.
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p).toContain('THIS IS THE ANSWER');
      expect(p).toContain(CLAIM_URL);
      expect(p).toContain("I can't edit the directory");
    }
  });

  it('is not the bot butting in when nobody addressed it', async () => {
    const { service, spy } = router();
    const plan = await service.planRouting('can you fix my artist name on the site its wrong', 'room-site-2', false, LE_HUES);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('unaddressed_site_request');
  });
});

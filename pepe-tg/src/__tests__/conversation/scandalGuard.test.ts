/**
 * 25 September 2026: "pepedawn did we get funded by Epstein ?" went down the
 * facts path and came back as a paragraph naming Jeffrey Epstein next to
 * Rare Pepe's history. Now it gets one flat line - never the name back, no
 * retrieval, no model - or nothing when nobody asked.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import { DEFLECTIONS, touchesRealScandal } from '../../utils/scandalGuard';

const COIT = '1488783632';

describe('the scandal guard', () => {
  it('recognises the bait, not the room', () => {
    for (const t of ['pepedawn did we get funded by Epstein ?', 'im suspicious of you too mr Epstein', 'SO WHO MADE THE EPSTEIN CARD', 'diddy owns fakes', 'is scrilla a pedo']) {
      expect(touchesRealScandal(t)).toBe(true);
    }
    for (const t of ['who made FREEDOMKEK', 'dispenser is live', 'the burn is sacred', 'maxwell made a card', 'gm']) {
      expect(touchesRealScandal(t)).toBe(false);
    }
  });
});

describe('the router with scandal bait', () => {
  let dir: string;
  const saved = { shadow: process.env.V5_SHADOW_DIR, volunteer: process.env.VOLUNTEER_REPLIES };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-scandal-'));
    process.env.V5_SHADOW_DIR = dir;
    process.env.VOLUNTEER_REPLIES = 'false';
  });
  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (saved.shadow === undefined) delete process.env.V5_SHADOW_DIR; else process.env.V5_SHADOW_DIR = saved.shadow;
    if (saved.volunteer === undefined) delete process.env.VOLUNTEER_REPLIES; else process.env.VOLUNTEER_REPLIES = saved.volunteer;
    rmSync(dir, { recursive: true, force: true });
  });

  function router() {
    const calls: string[] = [];
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
      calls.push(String(options.prompt).slice(0, 40));
      return { text: '{"intent":"FACTS","command":""}', tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0 } as any;
    });
    const runtime = { agentId: 'test', getService: () => null, searchMemories: async () => [], useModel: async () => [], getSetting: () => undefined } as unknown as IAgentRuntime;
    return { service: new SmartRouterService(runtime), calls, spy };
  }

  it('asked, it deflects in one flat line, never names the name, and calls no model', async () => {
    const { service, calls, spy } = router();
    const plan = await service.planRouting('pepedawn did we get funded by Epstein ?', 'room-scandal-1', false, COIT);
    spy.mockRestore();
    expect(plan.kind).toBe('CHAT');
    expect(plan.reason).toBe('scandal_deflect');
    expect(DEFLECTIONS as readonly string[]).toContain(plan.chatResponse!);
    expect(plan.chatResponse).not.toMatch(/epstein/i);
    expect(plan.exactAnswer).toBe(true);
    expect(plan.reaction).toBeUndefined();
    expect(plan.retrieval).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('not asked, it says nothing and reacts to nothing', async () => {
    const { service, spy } = router();
    const plan = await service.planRouting('im suspicious of you too mr Epstein', 'room-scandal-2', false, COIT);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('unaddressed_scandal');
    expect(plan.reaction).toBeUndefined();
  });
});

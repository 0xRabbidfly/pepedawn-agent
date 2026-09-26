/**
 * 25 September 2026: "Pepedawn how do you submit a fake application to join
 * the collection ?" got FAKESUBMIT - a card - instead of the submission
 * rules. v3.13.0 answered with the canonical wiki link; this pins that it
 * does again, only for someone asking how to submit a fake, and only when
 * asked.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import {
  SUBMISSION_RULES_URL,
  fakeSubmissionAnswer,
  isFakeSubmissionQuestion,
} from '../../utils/submissionHelp';

describe('fake submission questions', () => {
  it('recognises the question from the room, and its kin', () => {
    for (const t of [
      'Pepedawn how do you submit a fake application to join the collection ?',
      'Can i submit for fake rare collection',
      'how do I submit a fake rare?',
      'what are the fake rares submission rules?',
      'where do I apply to get my fake in',
    ]) {
      expect(isFakeSubmissionQuestion(t)).toBe(true);
    }
  });

  it('leaves everything else that says "submit" alone', () => {
    for (const t of [
      // Not about a fake.
      'how do I submit a card?',
      'did he ever do commission work? does he submit commissions ?',
      "@pepedawn_bot can you update my name on the new website please. I've completed my profile and submitted.",
      // A report, not a question about the process.
      'I\'m getting the error message "Invalid Token Please Try Again" when attempting to submit a Fake. Can devs do something?',
      'gm, just submitted my fake, fingers crossed',
      // Other things one submits, other collections.
      'how do I submit lore for a fake',
      'how do I submit a fake common?',
      '/fr FREEDOMKEK submitted during the fork week',
      // The card is not the question.
      'who made FAKESUBMIT',
    ]) {
      expect(isFakeSubmissionQuestion(t)).toBe(false);
    }
  });

  it('the answer is the v3.13.0 link, bold in legacy Markdown', () => {
    expect(fakeSubmissionAnswer()).toBe(`*Fake Rares Submission Rules*\n${SUBMISSION_RULES_URL}`);
  });
});

describe('the router with a fake submission question', () => {
  let dir: string;
  const saved = { shadow: process.env.V5_SHADOW_DIR, volunteer: process.env.VOLUNTEER_REPLIES };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-submit-'));
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

  it('asked, it sends the submission rules as is: no card, no retrieval, no model', async () => {
    const { service, calls, spy } = router();
    const plan = await service.planRouting(
      'Pepedawn how do you submit a fake application to join the collection ?',
      'room-submit-1',
      false,
    );
    spy.mockRestore();
    expect(plan.kind).toBe('CHAT');
    expect(plan.reason).toBe('submission_rules');
    expect(plan.chatResponse).toBe(fakeSubmissionAnswer());
    expect(plan.exactAnswer).toBe(true);
    expect(plan.primaryCardAsset).toBeUndefined();
    expect(plan.retrieval).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('not asked, it stays out', async () => {
    const { service, spy } = router();
    const plan = await service.planRouting('how do you submit a fake?', 'room-submit-2', false);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('unaddressed_submission');
  });
});

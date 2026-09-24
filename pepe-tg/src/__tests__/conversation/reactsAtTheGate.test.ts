/**
 * PEPEDAWN never once reacted with an emoji in production: the only branch
 * that asked for one sat behind retrieval, and since 5.14.0 every unaddressed
 * post is silenced before retrieval runs (0 reactions in 1,524 silences).
 * Now the gate decides: a post worth a look gets an emoji that fits it,
 * chatter gets nothing, a really good post never waits, and ordinary ones
 * share a short per-room cooldown.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import {
  REACTION_BUCKETS, REACTION_COOLDOWN_MS, REACTION_EMOJI, bucketFor, reactionAllowed, reactionFor, reactionScore, resetReactionCooldowns,
} from '../../utils/reactions';

const CRYPSI = '111';
const TELEGRAM_ALLOWED = new Set(['👍','👎','❤','🔥','🥰','👏','😁','🤔','🤯','😱','🤬','😢','🎉','🤩','🤮','💩','🙏','👌','🕊','🤡','🥱','🥴','😍','🐳','❤‍🔥','🌚','🌭','💯','🤣','⚡','🍌','🏆','💔','🤨','😐','🍓','🍾','💋','🖕','😈','😴','😭','🤓','👻','👨‍💻','👀','🎃','🙈','😇','😨','🤝','✍','🤗','🫡','🎅','🎄','☃','💅','🤪','🗿','🆒','💘','🙉','🦄','😘','💊','🙊','😎','👾','🤷‍♂','🤷','🤷‍♀','😡']);

describe('what a post deserves', () => {
  it('scores: chatter 0, worth a look 1, really good 2+', () => {
    for (const t of ['gm', 'lol', 'based', 'anyone around?', '/f PEPEDAWN', '']) expect(reactionScore(t, false)).toBe(0);
    expect(reactionScore('look at this https://x.com/someone/status/1', false)).toBe(1);
    expect(reactionScore('24-HOUR BURN AUCTION opening bid 500k', false)).toBe(1);
    expect(reactionScore('just picked up a FREEDOMKEK', true)).toBe(1);
    expect(reactionScore('new fake dropped, FREEDOMKEK dispenser is live https://xchain.io/asset/FREEDOMKEK', true)).toBeGreaterThanOrEqual(3);
    expect(reactionScore('x'.repeat(140), false)).toBe(1);
  });

  it('picks a bucket that fits, and only faces Telegram accepts', () => {
    expect(bucketFor('24-HOUR BURN AUCTION')).toBe('market');
    expect(bucketFor('new fake just minted, series 19')).toBe('market'); // "minted" is a market word first
    expect(bucketFor('fresh artwork for the next series submission')).toBe('art');
    expect(bucketFor('lmao that card')).toBe('funny');
    expect(bucketFor('rip to a legend')).toBe('sad');
    expect(bucketFor('this is insane')).toBe('mind');
    expect(bucketFor('look at this')).toBe('look');
    for (const e of REACTION_EMOJI) expect(TELEGRAM_ALLOWED.has(e)).toBe(true);
    for (const pool of Object.values(REACTION_BUCKETS)) for (let i = 0; i < 20; i++) expect(REACTION_EMOJI).toContain(reactionFor('look', () => i / 20));
  });

  it('a really good post never waits; ordinary ones share the room cooldown', () => {
    resetReactionCooldowns();
    expect(reactionAllowed('r1', 1, 1_000_000)).toBe(true);
    expect(reactionAllowed('r1', 1, 1_000_000 + 60_000)).toBe(false);
    expect(reactionAllowed('r1', 2, 1_000_000 + 61_000)).toBe(true);
    expect(reactionAllowed('r2', 1, 1_000_000 + 60_000)).toBe(true);
    expect(reactionAllowed('r1', 1, 1_000_000 + 61_000 + REACTION_COOLDOWN_MS)).toBe(true);
  });
});

describe('the router reacts at the gate', () => {
  let dir: string;
  const savedShadowDir = process.env.V5_SHADOW_DIR;
  const savedVolunteer = process.env.VOLUNTEER_REPLIES;

  function router() {
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async () => ({
      text: '{"intent":"CHAT","command":""}', tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0,
    }) as any);
    const runtime = {
      agentId: 'test', getService: () => null, searchMemories: async () => [], useModel: async () => [], getSetting: () => undefined,
    } as unknown as IAgentRuntime;
    return { service: new SmartRouterService(runtime), spy };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-react-'));
    process.env.V5_SHADOW_DIR = dir;
    process.env.VOLUNTEER_REPLIES = 'false';
    resetReactionCooldowns();
  });

  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (savedShadowDir === undefined) delete process.env.V5_SHADOW_DIR; else process.env.V5_SHADOW_DIR = savedShadowDir;
    if (savedVolunteer === undefined) delete process.env.VOLUNTEER_REPLIES; else process.env.VOLUNTEER_REPLIES = savedVolunteer;
    rmSync(dir, { recursive: true, force: true });
  });

  it('an unaddressed market post gets a market face, silently; an ordinary one right after waits', async () => {
    const { service, spy } = router();
    // Not FAKEASF: burning that one has its own reply, sacred rules and all.
    const first = await service.planRouting('24-HOUR BURN AUCTION on a FREEDOMKEK, opening bid 500k', 'room-react-1', false, CRYPSI);
    const second = await service.planRouting('look at this https://x.com/someone/status/1', 'room-react-1', false, CRYPSI);
    spy.mockRestore();
    expect(first.kind).toBe('NORESPONSE');
    expect(first.reason).toBe('unaddressed_statement_react');
    expect(REACTION_BUCKETS.market as readonly string[]).toContain(first.reaction!);
    expect(second.kind).toBe('NORESPONSE');
    expect(second.reaction).toBeUndefined();
  });

  it('"dispenser is live <link>" reads as a question to the gate and still gets a look', async () => {
    const { service, spy } = router();
    const plan = await service.planRouting('dispenser is live https://xchain.io/asset/FREEDOMKEK', 'room-react-3', false, CRYPSI);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('unaddressed_question_not_exact_react');
    expect(plan.reaction).toBeDefined();
  });

  it('chatter is silence, not a reaction', async () => {
    const { service, spy } = router();
    const plan = await service.planRouting('gm everyone', 'room-react-2', false, CRYPSI);
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reaction).toBeUndefined();
  });
});

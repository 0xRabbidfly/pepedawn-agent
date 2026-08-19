/**
 * Shadow mode integration test.
 *
 * The unit tests exercise the v5 axes directly. This drives the REAL
 * fakeRaresPlugin MESSAGE_RECEIVED handler with Telegram-shaped messages and
 * asserts that the shadow hooks fire correctly through the live wiring — which
 * is the part a unit test cannot cover and the part most likely to silently
 * break (a missed call site logs nothing and looks exactly like "no traffic").
 *
 * This is the closest available substitute for deploying to a test bot: the
 * production message path, driven locally, with no Telegram connection.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fakeRaresPlugin } from '../../plugins/fakeRaresPlugin';
import { KnowledgeOrchestratorService } from '../../services/KnowledgeOrchestratorService';
import { TelemetryService } from '../../services/TelemetryService';
import { MemoryStorageService } from '../../services/MemoryStorageService';
import { resetEngagementTracking } from '../../utils/engagementScorer';
import { flushShadow, resetShadowState } from '../../conversation/shadow';

const BOT_ID = 12345;
const ROOM = 'room-integration';

let shadowDir: string;

const createMockRuntime = () => {
  const knowledgeService = {
    serviceType: 'knowledge-orchestrator',
    retrieveKnowledge: mock().mockResolvedValue({
      story: '',
      sourcesLine: '',
      hasWikiOrMemory: false,
      metrics: { hits_used: 0, latency_ms: 1 },
    }),
  };
  const telemetryService = {
    serviceType: 'telemetry',
    logModelUsage: mock(),
    logConversation: mock().mockResolvedValue(undefined),
    logCommandUsage: mock().mockResolvedValue(undefined),
    logSmartRouterDecision: mock().mockResolvedValue(undefined),
  };
  const memoryService = {
    serviceType: 'memory-storage',
    storeMemory: mock().mockResolvedValue({ success: true, memoryId: 'm' }),
  };

  return {
    agentId: 'test-agent',
    useModel: mock().mockResolvedValue([0.1, 0.2, 0.3]),
    searchMemories: mock().mockResolvedValue([]),
    createMemory: mock().mockResolvedValue(undefined),
    getService: mock((serviceType: string) => {
      if (serviceType === KnowledgeOrchestratorService.serviceType) return knowledgeService;
      if (serviceType === TelemetryService.serviceType) return telemetryService;
      if (serviceType === MemoryStorageService.serviceType) return memoryService;
      return null;
    }),
    services: [{ serviceType: 'telegram', bot: { botInfo: { id: BOT_ID } } }],
  };
};

/** A Telegram-shaped MESSAGE_RECEIVED payload. */
const makeParams = (
  text: string,
  opts: { replyToBot?: boolean; author?: string } = {}
) => ({
  runtime: createMockRuntime(),
  message: {
    id: `msg-${Math.abs(hash(text))}`,
    roomId: ROOM,
    entityId: 'user-1',
    content: {
      text,
      source: 'telegram',
      inReplyTo: opts.replyToBot ? 'prev-bot-msg' : undefined,
    },
    metadata: { entityName: opts.author ?? 'alice' },
  },
  state: {},
  callback: mock().mockResolvedValue([]),
  ctx: {
    botInfo: { id: BOT_ID },
    message: opts.replyToBot ? { reply_to_message: { from: { id: BOT_ID } } } : undefined,
  },
});

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

const readShadowLog = (): any[] => {
  const file = join(shadowDir, 'shadow-logs.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};

describe('shadow mode through the real message path', () => {
  const handler = fakeRaresPlugin.events?.MESSAGE_RECEIVED?.[0] as
    | ((params: any) => Promise<any>)
    | undefined;

  beforeEach(() => {
    shadowDir = mkdtempSync(join(tmpdir(), 'pepedawn-shadow-'));
    process.env.V5_SHADOW = 'true';
    process.env.V5_SHADOW_DIR = shadowDir;
    process.env.SUPPRESS_BOOTSTRAP = 'true';
    resetShadowState();
    resetEngagementTracking();
  });

  afterEach(async () => {
    await flushShadow();
    delete process.env.V5_SHADOW;
    delete process.env.V5_SHADOW_DIR;
    delete process.env.SUPPRESS_BOOTSTRAP;
    resetShadowState();
    try {
      rmSync(shadowDir, { recursive: true, force: true });
    } catch {}
  });

  it('registers a MESSAGE_RECEIVED handler', () => {
    expect(typeof handler).toBe('function');
  });

  it('records an observation for an ordinary message', async () => {
    await handler!(makeParams('gm everyone'));
    await flushShadow();

    const entries = readShadowLog().filter((e) => e.kind === 'user');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const entry = entries[0];
    expect(entry.roomId).toBe(ROOM);
    expect(entry).toHaveProperty('temperatureCap');
    expect(entry).toHaveProperty('cadenceCap');
    expect(entry).toHaveProperty('wouldSpeak');
    expect(entry.cadenceReason).toBeTruthy();
  });

  it('marks a reply to the bot as addressed and exempts it', async () => {
    await handler!(makeParams('what about FREEDOMKEK', { replyToBot: true }));
    await flushShadow();

    const entry = readShadowLog().find((e) => e.kind === 'user');
    expect(entry.addressedBot).toBe(true);
    expect(entry.cadenceReason).toBe('addressed_exempt');
    expect(entry.wouldSpeak).toBe(true);
  });

  it('does not treat an ordinary message as addressed', async () => {
    await handler!(makeParams('just chatting about pepes'));
    await flushShadow();

    const entry = readShadowLog().find((e) => e.kind === 'user');
    expect(entry.addressedBot).toBe(false);
  });

  it('writes nothing at all when the flag is off', async () => {
    delete process.env.V5_SHADOW;
    resetShadowState();
    await handler!(makeParams('gm with shadow disabled'));
    await flushShadow();
    expect(readShadowLog()).toHaveLength(0);
  });

  it('accumulates history across messages in a room', async () => {
    await handler!(makeParams('first', { author: 'alice' }));
    await handler!(makeParams('second', { author: 'bob' }));
    await handler!(makeParams('third', { author: 'carol' }));
    await flushShadow();

    const users = readShadowLog().filter((e) => e.kind === 'user');
    expect(users.length).toBeGreaterThanOrEqual(3);
    // The last observation must have seen the earlier turns.
    const last = users[users.length - 1];
    expect(last.metrics.totalTurnsInWindow).toBeGreaterThanOrEqual(2);
  });

  it('never throws out of the handler when shadow state is broken', async () => {
    // Point the shadow output at an unwritable path; the handler must survive.
    process.env.V5_SHADOW_DIR = '/proc/nonexistent/cannot-create';
    resetShadowState();
    await expect(handler!(makeParams('resilience check'))).resolves.toBeUndefined();
  });
});

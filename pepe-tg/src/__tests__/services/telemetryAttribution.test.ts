/**
 * Telemetry attribution and embedding accounting
 *
 * Both of these fed the `/fc` cost report and were silently broken:
 *   - `TokenLog.actionName` was declared and aggregated but never written by
 *     any caller, so the report's "By Action" section could never render.
 *   - Embedding calls were skipped by the runtime patch with a comment saying
 *     they were "tracked separately", and nothing tracked them, so every /fc
 *     total understated real spend.
 *
 * TELEMETRY_DATA_DIR redirects the service's JSONL files into a scratch
 * directory. Without it these tests append fixtures to the production logs under
 * src/data, which is exactly what happened while writing them.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let sandbox: string;
let originalDataDir: string | undefined;
let telemetry: any;
let runWithAction: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
let executeCommand: any;
let UNATTRIBUTED_ACTION: string;

const log = (over: Record<string, any> = {}) =>
  telemetry.logModelUsage({
    timestamp: new Date().toISOString(),
    model: 'gpt-5.6-luna',
    tokensIn: 1000,
    tokensOut: 100,
    cost: 0.001,
    source: 'Lore calls',
    duration: 10,
    ...over,
  });

const readEntries = () =>
  readFileSync(join(sandbox, 'token-logs.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

beforeAll(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'pepedawn-telemetry-'));
  originalDataDir = process.env.TELEMETRY_DATA_DIR;
  process.env.TELEMETRY_DATA_DIR = sandbox;

  const ctx = await import('../../utils/actionContext');
  runWithAction = ctx.runWithAction;
  UNATTRIBUTED_ACTION = ctx.UNATTRIBUTED_ACTION;
  executeCommand = (await import('../../utils/commandHandler')).executeCommand;
  const { TelemetryService } = await import('../../services/TelemetryService');
  telemetry = new (TelemetryService as any)({} as any);
});

afterAll(() => {
  if (originalDataDir === undefined) delete process.env.TELEMETRY_DATA_DIR;
  else process.env.TELEMETRY_DATA_DIR = originalDataDir;
  rmSync(sandbox, { recursive: true, force: true });
});

describe('log location', () => {
  it('writes to TELEMETRY_DATA_DIR, not the production src/data', async () => {
    await log();
    expect(existsSync(join(sandbox, 'token-logs.jsonl'))).toBe(true);
  });
});

describe('action attribution', () => {
  it('stamps the ambient action onto model usage', async () => {
    await runWithAction('/fl', () => log());
    expect(readEntries().at(-1).actionName).toBe('/fl');
  });

  it('survives await boundaries inside the action', async () => {
    await runWithAction('/fm', async () => {
      await new Promise((r) => setTimeout(r, 5));
      await log();
    });
    expect(readEntries().at(-1).actionName).toBe('/fm');
  });

  it('lets the innermost label win, so a routed command bills to the command', async () => {
    await runWithAction('smart-router', () => runWithAction('/f', () => log()));
    expect(readEntries().at(-1).actionName).toBe('/f');
  });

  it('keeps an explicit actionName over the ambient one', async () => {
    await runWithAction('/fl', () => log({ actionName: 'EXPLICIT' }));
    expect(readEntries().at(-1).actionName).toBe('EXPLICIT');
  });

  it('buckets unlabelled calls rather than dropping them', async () => {
    await log();
    expect(readEntries().at(-1).actionName).toBe(UNATTRIBUTED_ACTION);
  });

  it('labels a command dispatched through executeCommand', async () => {
    const action = {
      validate: async () => true,
      handler: async () => {
        await log({ source: 'Card Discovery Summary' });
      },
    };
    const message: any = { content: { text: '/f PEPE' }, roomId: 'r', entityId: 'e' };
    const runtime: any = { getService: () => null };

    await executeCommand(action, { runtime, message, state: {} }, '/f');
    expect(readEntries().at(-1).actionName).toBe('/f');
  });
});

describe('cost report breakdowns', () => {
  it('separates the same source by what asked for it', async () => {
    // Distinct labels so the assertion does not depend on what earlier tests logged.
    await runWithAction('/lore-explicit', () => log({ cost: 0.02 }));
    await runWithAction('/lore-routed', () => log({ cost: 0.03 }));

    const stats = await telemetry.getCostReport();

    // One "Lore calls" line in bySource, two distinct actions behind it.
    expect(stats.bySource['Lore calls'].calls).toBeGreaterThan(1);
    expect(stats.byAction['/lore-explicit'].cost).toBeCloseTo(0.02, 6);
    expect(stats.byAction['/lore-routed'].cost).toBeCloseTo(0.03, 6);
  });

  it('has a By Action breakdown that sums to the reported total', async () => {
    const stats = await telemetry.getCostReport();
    const summed = Object.values(stats.byAction as Record<string, { cost: number }>).reduce(
      (acc, a) => acc + a.cost,
      0
    );
    expect(summed).toBeCloseTo(stats.totalCost, 6);
  });
});

describe('embedding accounting', () => {
  it('prices the embedding models the bot actually uses', () => {
    // text-embedding-3-small is $0.02 per 1M input tokens.
    expect(telemetry.calculateCost('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02, 6);
    expect(telemetry.calculateCost('text-embedding-3-large', 1_000_000, 0)).toBeCloseTo(0.13, 6);
    expect(telemetry.calculateCost('text-embedding-ada-002', 1_000_000, 0)).toBeCloseTo(0.1, 6);
  });

  it('does not fall back to chat pricing for embeddings', () => {
    const embedding = telemetry.calculateCost('text-embedding-3-small', 1_000_000, 0);
    const chatFallback = telemetry.calculateCost('a-model-nobody-priced', 1_000_000, 0);
    expect(embedding).toBeLessThan(chatFallback);
  });

  it('bills embeddings on input only', () => {
    expect(telemetry.calculateCost('text-embedding-3-small', 0, 1_000_000)).toBe(0);
  });

  it('counts embedding spend into the report totals', async () => {
    const before = (await telemetry.getCostReport()).totalCost;
    await log({
      model: 'text-embedding-3-small',
      source: 'Embeddings',
      tokensIn: 500_000,
      tokensOut: 0,
      cost: telemetry.calculateCost('text-embedding-3-small', 500_000, 0),
    });
    const after = await telemetry.getCostReport();

    expect(after.totalCost).toBeCloseTo(before + 0.01, 6);
    expect(after.bySource['Embeddings'].calls).toBe(1);
  });
});

/**
 * Shadow mode — validate v5 against live traffic without changing behaviour.
 *
 * PEPEDAWN serves a real community that has already been annoyed once by this
 * bot talking too much. Shipping a restraint redesign straight to them would be
 * an experiment on users. Instead the v5 axes run in parallel: they observe
 * every message, record what they WOULD have decided, and never send anything.
 *
 * Enable with V5_SHADOW=true. Everything here is wrapped so a failure can only
 * lose a log line, never affect a response.
 *
 * Compare the resulting shadow-logs.jsonl against actual behaviour with
 * scripts/replay-cadence.ts, which reports the same metrics.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { evaluateCadence } from './cadenceGovernor';
import { readRoomTemperature } from './roomTemperature';
import { FileRoomHistoryStore } from './fileRoomHistoryStore';
import { RoomHistory } from './roomHistory';
import { REGISTER_RANK, type ConversationTurn } from './types';

/**
 * Output directory. Overridable so tests (and a future separate volume) do not
 * write into the live src/data/ alongside production telemetry.
 */
function shadowDir(): string {
  return process.env.V5_SHADOW_DIR || join(process.cwd(), 'src', 'data');
}

function shadowLogFile(): string {
  return join(shadowDir(), 'shadow-logs.jsonl');
}

export function shadowEnabled(): boolean {
  return process.env.V5_SHADOW === 'true' || enforceEnabled();
}

/**
 * When true the cadence verdict actually gates replies instead of only being
 * recorded. Intended for the test bot, so the new behaviour can be felt rather
 * than read off a log.
 */
export function enforceEnabled(): boolean {
  return process.env.V5_ENFORCE === 'true';
}

let history: RoomHistory | null = null;

function getHistory(): RoomHistory {
  if (!history) {
    history = new RoomHistory(new FileRoomHistoryStore(join(shadowDir(), 'room-history.json')));
  }
  return history;
}

/** Test hook: drop cached state so a fresh directory is picked up. */
export function resetShadowState(): void {
  history = null;
}

function write(record: Record<string, unknown>): void {
  try {
    // Create the directory first. Without this every write throws ENOENT into
    // the catch below and shadow mode silently produces no data at all.
    const file = shadowLogFile();
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(file)) writeFileSync(file, '', 'utf8');
    appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // Shadow logging is best effort by definition.
  }
}

/**
 * Record an incoming user message and log what v5 would have decided.
 *
 * Called from the live message path but purely observational — the return
 * value is ignored by production code.
 */
export async function observeUserMessage(input: {
  roomId: string;
  text: string;
  author?: string;
  addressedBot: boolean;
  /** What the existing pipeline went on to do, for comparison. */
  actualHandled?: boolean;
  now?: number;
}): Promise<ShadowVerdict> {
  const allow: ShadowVerdict = { suppress: false, register: 'DEEP', reason: 'shadow_disabled' };
  if (!shadowEnabled()) return allow;
  try {
    const now = input.now ?? Date.now();
    const h = getHistory();
    // Read and append atomically, or a fast room observes a stale history.
    return await h.withRoom(input.roomId, (turns) =>
      observeWithTurns(h, input, turns, now)
    );
  } catch {
    // Never let shadow mode interfere with a real response.
    return allow;
  }
}

export interface ShadowVerdict {
  /** True only when enforcement is on AND the register collapsed to SILENT. */
  suppress: boolean;
  register: string;
  reason: string;
}

function observeWithTurns(
  h: RoomHistory,
  input: {
    roomId: string;
    text: string;
    author?: string;
    addressedBot: boolean;
    actualHandled?: boolean;
  },
  turns: ConversationTurn[],
  now: number
): ShadowVerdict {
    const temperature = readRoomTemperature(
      turns,
      now,
      { text: input.text, addressedBot: input.addressedBot }
    );
    const cadence = evaluateCadence(turns, now, { addressed: input.addressedBot });

    write({
      timestamp: new Date(now).toISOString(),
      kind: 'user',
      roomId: input.roomId,
      textLength: input.text.length,
      addressedBot: input.addressedBot,
      temperature: temperature.label,
      temperatureCap: temperature.cap,
      cadenceCap: cadence.cap,
      cadenceReason: cadence.reason,
      wouldSpeak: cadence.cap !== 'SILENT',
      actualHandled: input.actualHandled ?? null,
      signals: temperature.signals,
      metrics: cadence.metrics,
    });

    h.commit(input.roomId, turns, {
      role: 'user',
      text: input.text,
      author: input.author,
      at: now,
      addressedBot: input.addressedBot,
    });

    // Room temperature caps how much to say; only cadence decides whether to
    // speak at all. Suppression is therefore driven by the cadence verdict.
    const register = REGISTER_RANK[temperature.cap] <= REGISTER_RANK[cadence.cap]
      ? temperature.cap
      : cadence.cap;
    return {
      suppress: enforceEnabled() && cadence.cap === 'SILENT',
      register,
      reason: cadence.reason,
    };
}

/** Record that the live bot actually replied, so history stays truthful. */
export async function observeBotMessage(input: {
  roomId: string;
  text: string;
  now?: number;
}): Promise<void> {
  if (!shadowEnabled()) return;
  try {
    const now = input.now ?? Date.now();
    await getHistory().append(input.roomId, { role: 'bot', text: input.text, at: now });
    write({
      timestamp: new Date(now).toISOString(),
      kind: 'bot',
      roomId: input.roomId,
      textLength: input.text.length,
    });
  } catch {
    // As above.
  }
}

/** Flush pending history writes. Call on shutdown. */
export async function flushShadow(): Promise<void> {
  try {
    await history?.flushAll();
  } catch {
    // As above.
  }
}

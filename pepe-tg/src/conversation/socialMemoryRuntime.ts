/**
 * Wires social memory into a running bot.
 *
 * Holds the pieces together — store, session tracking, capture, recall — with
 * the model call injected so everything below stays testable without a runtime.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  CallbackLimiter,
  formatForPrompt,
  rankMemories,
  recallForPerson,
  type MemoryRecord,
  type ScoredMemory,
  type SocialMemoryStore,
} from './socialMemory';
import {
  DEFAULT_CAPTURE_CONFIG,
  buildCapturePrompt,
  formatSession,
  parseCaptureResponse,
  sessionClosed,
  worthCapturing,
  type CaptureConfig,
} from './memoryCapture';
import type { ConversationTurn } from './types';

/** File-backed store. Swappable for pgvector without touching callers. */
export class FileSocialStore implements SocialMemoryStore {
  private cache: MemoryRecord[] | null = null;

  constructor(private path: string) {}

  private read(): MemoryRecord[] {
    if (this.cache) return this.cache;
    try {
      this.cache = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : [];
    } catch {
      this.cache = [];
    }
    return this.cache!;
  }

  private write(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cache ?? [], null, 2), 'utf8');
    renameSync(tmp, this.path);
  }

  async add(record: MemoryRecord): Promise<void> {
    this.read().push(record);
    this.write();
  }

  async all(roomId: string): Promise<MemoryRecord[]> {
    return this.read().filter((r) => r.roomId === roomId);
  }

  async remove(id: string): Promise<boolean> {
    const before = this.read().length;
    this.cache = this.read().filter((r) => r.id !== id);
    this.write();
    return this.cache.length < before;
  }

  async forgetPerson(personId: string): Promise<number> {
    const before = this.read().length;
    this.cache = this.read().filter(
      (r) => !r.participants.some((p) => p.id === personId && p.role !== 'reactor')
    );
    for (const r of this.cache) {
      r.participants = r.participants.filter((p) => p.id !== personId);
    }
    this.write();
    return before - this.cache.length;
  }
}

/** Runs a capture prompt. Injected so tests need no model. */
export type CaptureModel = (prompt: string) => Promise<string>;

export interface SocialMemoryOptions {
  store: SocialMemoryStore;
  model?: CaptureModel;
  capture?: CaptureConfig;
  /** Minimum gap between memory callbacks, per room. */
  callbackGapMs?: number;
  /** Optional audit log of captured records. */
  logPath?: string;
}

export class SocialMemory {
  private store: SocialMemoryStore;
  private model?: CaptureModel;
  private captureConfig: CaptureConfig;
  private limiter: CallbackLimiter;
  private logPath?: string;
  /** Turns not yet folded into a captured session, per room. */
  private pending = new Map<string, ConversationTurn[]>();
  /** Ids seen per display name, so captures can be attributed. */
  private authorIds = new Map<string, string>();

  constructor(opts: SocialMemoryOptions) {
    this.store = opts.store;
    this.model = opts.model;
    this.captureConfig = opts.capture ?? DEFAULT_CAPTURE_CONFIG;
    this.limiter = new CallbackLimiter(opts.callbackGapMs ?? 30 * 60 * 1000);
    this.logPath = opts.logPath;
  }

  /** Note who a display name belongs to, so quotes can be attributed. */
  noteAuthor(name: string | undefined, id: string | undefined): void {
    if (name && id) this.authorIds.set(name, id);
  }

  /** Record a turn and capture the previous session if this one closed it. */
  async observe(roomId: string, turn: ConversationTurn, now: number): Promise<MemoryRecord[]> {
    const buffered = this.pending.get(roomId) ?? [];
    let captured: MemoryRecord[] = [];

    if (buffered.length > 0 && sessionClosed(buffered, now, this.captureConfig)) {
      captured = await this.capture(roomId, buffered, now);
      this.pending.set(roomId, [turn]);
    } else {
      buffered.push(turn);
      this.pending.set(roomId, buffered.slice(-this.captureConfig.maxTurns));
    }
    return captured;
  }

  /** Force capture of whatever is buffered. Call on shutdown. */
  async flush(roomId: string, now: number): Promise<MemoryRecord[]> {
    const buffered = this.pending.get(roomId) ?? [];
    if (buffered.length === 0) return [];
    this.pending.set(roomId, []);
    return this.capture(roomId, buffered, now);
  }

  private async capture(
    roomId: string,
    turns: ConversationTurn[],
    now: number
  ): Promise<MemoryRecord[]> {
    if (!this.model) return [];
    if (!worthCapturing(turns, this.captureConfig)) return [];
    try {
      const raw = await this.model(buildCapturePrompt(formatSession(turns, this.captureConfig)));
      const records = parseCaptureResponse(raw, { roomId, at: now, authorIds: this.authorIds });
      for (const record of records) {
        await this.store.add(record);
        this.log(record);
      }
      return records;
    } catch {
      // A failed capture must never disturb a conversation.
      return [];
    }
  }

  /**
   * Memories worth mentioning right now.
   *
   * Returns [] when the callback limiter says the room has heard one recently.
   */
  async recall(
    roomId: string,
    presentIds: Set<string>,
    now: number,
    similarity: (record: MemoryRecord) => number = () => 1,
    limit = 3
  ): Promise<ScoredMemory[]> {
    if (!this.limiter.allowed(roomId, now)) return [];
    const records = await this.store.all(roomId);
    const ranked = rankMemories(records, similarity, presentIds, now).slice(0, limit);
    if (ranked.length > 0) this.limiter.record(roomId, now);
    return ranked;
  }

  /** Everything known about one person, ignoring the callback limiter. */
  async aboutPerson(roomId: string, personId: string, now: number, limit = 5) {
    return recallForPerson(await this.store.all(roomId), personId, now, limit);
  }

  /** Prompt block for recalled memories, or '' when there is nothing to say. */
  static renderForPrompt(memories: ScoredMemory[]): string {
    if (memories.length === 0) return '';
    return memories.map(formatForPrompt).join('\n');
  }

  private log(record: MemoryRecord): void {
    if (!this.logPath) return;
    try {
      const dir = dirname(this.logPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      appendFileSync(
        this.logPath,
        JSON.stringify({ capturedAt: new Date(record.at).toISOString(), ...record }) + '\n',
        'utf8'
      );
    } catch {
      // Auditing is best effort.
    }
  }
}

/** Default store location, honouring the shadow directory override. */
export function defaultSocialStorePath(): string {
  const dir = process.env.V5_SHADOW_DIR || join(process.cwd(), 'src', 'data');
  return join(dir, 'social-memory.json');
}

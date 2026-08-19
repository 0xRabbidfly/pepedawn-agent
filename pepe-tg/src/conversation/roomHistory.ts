/**
 * Persistent room history.
 *
 * The bot currently keeps conversation state in an in-memory Map that is lost
 * on every restart — and PM2 cron-restarts nightly at 02:00, plus every deploy
 * runs `pm2 delete`. So PEPEDAWN wakes each morning with no recollection of the
 * community. Nothing else in the v5 design works without fixing that: room
 * temperature, the cadence governor and decaying recall all read history.
 *
 * Storage is behind a tiny interface so the core stays free of ElizaOS and of
 * any particular database, and so tests run against an in-memory store with no
 * mocking.
 *
 * See telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md §6 step 1
 */

import type { ConversationTurn } from './types';

/** Minimal persistence contract. Implementations may be sync or async. */
export interface RoomHistoryStore {
  load(roomId: string): Promise<ConversationTurn[]>;
  save(roomId: string, turns: ConversationTurn[]): Promise<void>;
}

export interface RoomHistoryConfig {
  /** Turns retained per room. */
  limit: number;
  /** Turns older than this are dropped on write. */
  maxAgeMs: number;
  /** Write-behind debounce; 0 flushes on every append. */
  flushDebounceMs: number;
}

export const DEFAULT_HISTORY_CONFIG: RoomHistoryConfig = {
  limit: 120,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  flushDebounceMs: 2000,
};

/** In-memory store. Used by tests and as a fallback when no store is wired. */
export class MemoryRoomHistoryStore implements RoomHistoryStore {
  private data = new Map<string, ConversationTurn[]>();

  async load(roomId: string): Promise<ConversationTurn[]> {
    return this.data.get(roomId) ?? [];
  }

  async save(roomId: string, turns: ConversationTurn[]): Promise<void> {
    this.data.set(roomId, turns);
  }

  /** Test helper. */
  clear(): void {
    this.data.clear();
  }
}

/**
 * Read-through cache over a RoomHistoryStore.
 *
 * Appends are applied to the cache immediately so the governor always sees the
 * turn it just recorded, and flushed to the store on a debounce so a busy room
 * does not cause a write per message.
 */
export class RoomHistory {
  private cache = new Map<string, ConversationTurn[]>();
  private dirty = new Set<string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Per-room serialization. Appends are fire-and-forget at the call site, so
   * without this two messages arriving together both read the same base array
   * and the second overwrites the first — losing turns precisely in the busy
   * rooms where the cadence governor matters most.
   */
  private chains = new Map<string, Promise<unknown>>();

  constructor(
    private store: RoomHistoryStore,
    private config: RoomHistoryConfig = DEFAULT_HISTORY_CONFIG
  ) {}

  /** Load a room's history, from cache when warm. */
  async get(roomId: string): Promise<ConversationTurn[]> {
    const cached = this.cache.get(roomId);
    if (cached) return cached;
    const loaded = await this.store.load(roomId);
    this.cache.set(roomId, loaded);
    return loaded;
  }

  /**
   * Run `fn` with exclusive access to a room's history, passing the current
   * turns. Readers that then append must use this, otherwise the read races
   * with queued appends and observes a stale (often empty) room.
   */
  async withRoom<T>(
    roomId: string,
    fn: (turns: ConversationTurn[]) => Promise<T> | T
  ): Promise<T> {
    const previous = this.chains.get(roomId) ?? Promise.resolve();
    const next = previous.then(async () => fn(await this.get(roomId)));
    this.chains.set(
      roomId,
      next.catch(() => undefined)
    );
    return next;
  }

  /** Append a turn and schedule a flush. Serialized per room. */
  async append(roomId: string, turn: ConversationTurn): Promise<ConversationTurn[]> {
    return this.withRoom(roomId, (turns) => this.commit(roomId, turns, turn));
  }

  /** Apply a turn to the cached array. Must be called under withRoom(). */
  commit(
    roomId: string,
    turns: ConversationTurn[],
    turn: ConversationTurn
  ): ConversationTurn[] {
    const next = this.prune([...turns, turn], turn.at);
    this.cache.set(roomId, next);
    this.dirty.add(roomId);
    this.scheduleFlush(roomId);
    return next;
  }

  /** Drop turns beyond the limit or older than maxAge. */
  private prune(turns: ConversationTurn[], now: number): ConversationTurn[] {
    const fresh = turns.filter((t) => now - t.at <= this.config.maxAgeMs);
    return fresh.length > this.config.limit ? fresh.slice(-this.config.limit) : fresh;
  }

  private scheduleFlush(roomId: string): void {
    if (this.config.flushDebounceMs <= 0) {
      void this.flush(roomId);
      return;
    }
    if (this.timers.has(roomId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      void this.flush(roomId);
    }, this.config.flushDebounceMs);
    // Never hold the process open for a pending history write.
    (timer as any).unref?.();
    this.timers.set(roomId, timer);
  }

  /** Force a write for one room. */
  async flush(roomId: string): Promise<void> {
    if (!this.dirty.has(roomId)) return;
    const turns = this.cache.get(roomId);
    if (!turns) return;
    this.dirty.delete(roomId);
    await this.store.save(roomId, turns);
  }

  /** Force a write for every dirty room. Call on shutdown. */
  async flushAll(): Promise<void> {
    // Let queued appends land before flushing, otherwise a pending turn is lost.
    await Promise.all([...this.chains.values()].map((c) => c.catch(() => undefined)));
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all([...this.dirty].map((roomId) => this.flush(roomId)));
  }
}

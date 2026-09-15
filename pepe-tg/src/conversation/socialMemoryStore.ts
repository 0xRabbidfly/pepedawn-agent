/**
 * Where social memory lives: one JSON file, keyed by Telegram id.
 *
 * A flat file rather than a PGlite table, for the reason the day log gives:
 * the database is the thing that corrupts when the process is killed
 * mid-write, and nothing about remembering people should be able to take
 * retrieval down with it. Writes are atomic (temp file, then rename).
 *
 * The file is gitignored and stays on the server. The repository is public,
 * and a file of attributed quotes keyed by Telegram id would unmask people to
 * anyone browsing it.
 *
 * Re-read when the file changes on disk, so a hand edit on the droplet — say,
 * deleting one memory — takes effect on the next message. A file that will
 * not parse is left alone rather than overwritten: the next write would
 * otherwise replace everyone's memories with nothing.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '@elizaos/core';
import {
  admit,
  reinforce,
  type AdmitOutcome,
  type MemoryPolicy,
  type MemoryRecord,
  type PersonMemory,
} from './socialMemory';

interface SocialMemoryFile {
  version: 2;
  people: Record<string, PersonMemory>;
  /** Per chat: capture has read the day log up to (not including) this time. */
  watermarks: Record<string, number>;
}

export function socialMemoryPath(): string {
  return process.env.SOCIAL_MEMORY_PATH || join(process.cwd(), 'src', 'data', 'social-memory.json');
}

function empty(): SocialMemoryFile {
  return { version: 2, people: {}, watermarks: {} };
}

export class SocialMemoryStore {
  private cache: SocialMemoryFile | null = null;
  private mtimeMs = -1;
  private unreadable = false;

  constructor(readonly path: string) {}

  private load(): SocialMemoryFile {
    let mtimeMs = 0;
    try {
      if (existsSync(this.path)) mtimeMs = statSync(this.path).mtimeMs;
    } catch {
      // Racing a rename; the next call reads it.
    }
    if (this.cache && mtimeMs === this.mtimeMs) return this.cache;

    let data = empty();
    this.unreadable = false;
    if (mtimeMs) {
      try {
        const raw = JSON.parse(readFileSync(this.path, 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a social memory file');
        data = { version: 2, people: raw.people ?? {}, watermarks: raw.watermarks ?? {} };
      } catch (error) {
        this.unreadable = true;
        logger.warn({ error, path: this.path }, '[SocialMemory] file unreadable; not writing until it is fixed');
      }
    }
    this.cache = data;
    this.mtimeMs = mtimeMs;
    return data;
  }

  private persist(): void {
    if (this.unreadable || !this.cache) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.cache, null, 1), 'utf8');
      renameSync(tmp, this.path);
      this.mtimeMs = statSync(this.path).mtimeMs;
    } catch (error) {
      logger.warn({ error, path: this.path }, '[SocialMemory] could not write');
    }
  }

  person(id: string): PersonMemory | undefined {
    return this.load().people[id];
  }

  people(): PersonMemory[] {
    return Object.values(this.load().people);
  }

  admit(personId: string, name: string, record: MemoryRecord, policy: MemoryPolicy, now: number): AdmitOutcome {
    const data = this.load();
    if (this.unreadable) return { status: 'rejected', reason: 'not_captured' };
    const existing = data.people[personId];
    const person: PersonMemory = existing ?? { id: personId, name, records: [] };
    const before = person.records.length;
    const outcome = admit(person, record, policy, now);
    if (outcome.status !== 'rejected') {
      if (name) person.name = name;
      data.people[personId] = person;
      this.persist();
    } else if (existing && person.records.length !== before) {
      this.persist();
    }
    return outcome;
  }

  reinforce(personId: string, recordId: string, at: number, salience?: number): boolean {
    const person = this.load().people[personId];
    if (!person || this.unreadable) return false;
    if (!reinforce(person, recordId, at, salience)) return false;
    this.persist();
    return true;
  }

  markUsed(personId: string, recordId: string, at: number): void {
    const record = this.load().people[personId]?.records.find((r) => r.id === recordId);
    if (!record) return;
    record.lastUsedAt = at;
    this.persist();
  }

  remove(personId: string, recordId: string): MemoryRecord | undefined {
    const person = this.load().people[personId];
    const index = person?.records.findIndex((r) => r.id === recordId) ?? -1;
    if (!person || index < 0) return undefined;
    const [removed] = person.records.splice(index, 1);
    this.persist();
    return removed;
  }

  /** Drop everything held about a person, and stop capturing them. */
  forget(personId: string, name?: string): number {
    const data = this.load();
    const person = data.people[personId];
    const removed = person?.records.length ?? 0;
    data.people[personId] = { id: personId, name: name || person?.name || '', records: [], optedOut: true };
    this.persist();
    return removed;
  }

  /** Undo an opt-out. Returns false when there was nothing to undo. */
  resume(personId: string): boolean {
    const person = this.load().people[personId];
    if (!person?.optedOut) return false;
    delete person.optedOut;
    this.persist();
    return true;
  }

  watermark(chatId: string): number | undefined {
    return this.load().watermarks[chatId];
  }

  setWatermark(chatId: string, at: number): void {
    const data = this.load();
    if (data.watermarks[chatId] === at) return;
    data.watermarks[chatId] = at;
    this.persist();
  }
}

let shared: SocialMemoryStore | null = null;

export function socialStore(): SocialMemoryStore {
  const path = socialMemoryPath();
  if (!shared || shared.path !== path) shared = new SocialMemoryStore(path);
  return shared;
}

export function _resetSocialStore(): void {
  shared = null;
}

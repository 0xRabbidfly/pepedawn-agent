/**
 * File-backed room history store.
 *
 * Deliberately writes to a plain JSON file rather than the PGlite database:
 * shadow mode must be incapable of affecting production data, and history is
 * small, bounded and cheap to rewrite. When the v5 path goes live this can be
 * swapped for a DB-backed store by implementing the same two-method interface —
 * nothing else in src/conversation/ changes.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { ConversationTurn } from './types';
import type { RoomHistoryStore } from './roomHistory';

export class FileRoomHistoryStore implements RoomHistoryStore {
  private path: string;
  private data: Record<string, ConversationTurn[]> | null = null;

  constructor(path?: string) {
    this.path = path ?? join(process.cwd(), 'src', 'data', 'room-history.json');
  }

  private read(): Record<string, ConversationTurn[]> {
    if (this.data) return this.data;
    try {
      if (existsSync(this.path)) {
        this.data = JSON.parse(readFileSync(this.path, 'utf8'));
      } else {
        this.data = {};
      }
    } catch {
      // A corrupt history file must never take the bot down; start fresh.
      this.data = {};
    }
    return this.data!;
  }

  async load(roomId: string): Promise<ConversationTurn[]> {
    return this.read()[roomId] ?? [];
  }

  async save(roomId: string, turns: ConversationTurn[]): Promise<void> {
    const data = this.read();
    data[roomId] = turns;
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Write-and-rename so a crash mid-write cannot leave a truncated file.
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, this.path);
  }
}

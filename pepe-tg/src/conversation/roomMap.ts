/**
 * Which ElizaOS rooms belong to which Telegram chat, remembered across restarts.
 *
 * `noteRoom` in xHarvest keeps this pairing in a Map, learned from the first
 * real message after boot. That is fine for the harvest, which only volunteers
 * into a room that has been quiet for 90 minutes — by then a message has been
 * seen. It is useless to the nightly recap, which runs 90 seconds after the
 * 02:00 restart, when nothing has arrived yet.
 *
 * The consequence was silent and total: the recap looked up the day log under
 * the raw chat id, found nothing under that key, and reported "nothing to
 * recap" on a day with 16 turns in it. Twice, on consecutive nights, while
 * `/recap` in the same room worked perfectly — because a command arrives with
 * the room id already attached.
 *
 * A chat maps to several rooms when it has forum topics, so this keeps a list
 * rather than the single value the in-memory map holds.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

type ChatRooms = Record<string, string[]>;

let cache: ChatRooms | null = null;

export function roomMapPath(): string {
  return process.env.ROOM_MAP_PATH || join(process.cwd(), 'src', 'data', 'room-map.json');
}

function read(): ChatRooms {
  if (cache) return cache;
  try {
    const path = roomMapPath();
    cache = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ChatRooms) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

/** Records that `roomId` belongs to `chatId`. Cheap and idempotent. */
export function rememberRoom(chatId: string, roomId: string): void {
  if (!chatId || !roomId) return;
  const map = read();
  const rooms = map[chatId] ?? [];
  if (rooms.includes(roomId)) return;

  // Newest first, and bounded: a forum with many topics should not grow this
  // file without limit, and the recap only ever needs the active ones.
  map[chatId] = [roomId, ...rooms].slice(0, 20);
  try {
    const path = roomMapPath();
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(map, null, 1), 'utf8');
    renameSync(tmp, path);
  } catch {
    // Losing the pairing costs a recap, never a reply.
  }
}

/** Every room seen for this chat, newest first. Empty when never observed. */
export function roomsForChat(chatId: string): string[] {
  return read()[chatId] ?? [];
}

export function _resetRoomMap(): void {
  cache = null;
}

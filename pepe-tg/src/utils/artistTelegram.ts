/**
 * Which Telegram account is which artist - learned from the admins.
 *
 * 25 September 2026: the first live spotlight went out for Gus Grillasca
 * with no tag, and rabbidfly typed "@GusGrillasca" under it by hand. Nothing
 * the bot has maps a directory artist to a Telegram account: the alias file
 * was empty, the participant registry keeps display names only, and an X
 * handle is not a Telegram handle - printing one as "@" would ping whoever
 * owns that name on Telegram, often a stranger.
 *
 * So the people who know teach it. An admin who replies to a spotlight post
 * with nothing but an @handle - or posts one within 45 minutes of a
 * spotlight post - has told the bot today's artist's handle. It is kept in
 * src/data/artist-telegram.json, on the server only (gitignored: this repo
 * is public and the file ties people to accounts), and every later
 * spotlight for that artist tags them.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export const LEARN_WINDOW_MS = 45 * 60 * 1000;

export interface ArtistTelegramFile {
  /** Lowercased artist name → { handle: "@Name", by, at }. */
  handles: Record<string, { handle: string; by?: string; at?: number }>;
}

export function artistTelegramPath(): string {
  return process.env.ARTIST_TELEGRAM_PATH || join(process.cwd(), 'src', 'data', 'artist-telegram.json');
}

let cache: { path: string; mtimeMs: number; file: ArtistTelegramFile } | null = null;

export function readArtistTelegram(path = artistTelegramPath()): ArtistTelegramFile {
  try {
    if (!existsSync(path)) return { handles: {} };
    const mtimeMs = statSync(path).mtimeMs;
    if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.file;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ArtistTelegramFile;
    const file = { handles: parsed.handles ?? {} };
    cache = { path, mtimeMs, file };
    return file;
  } catch {
    return { handles: {} };
  }
}

export function recordArtistTelegram(artist: string, handle: string, by: string | undefined, now = Date.now(), path = artistTelegramPath()): void {
  const file = readArtistTelegram(path);
  const next: ArtistTelegramFile = { handles: { ...file.handles, [artist.trim().toLowerCase()]: { handle, by, at: now } } };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 1), 'utf8');
  renameSync(tmp, path);
  cache = null;
}

export function learnedHandleFor(artist: string, path = artistTelegramPath()): string | null {
  return readArtistTelegram(path).handles[artist.trim().toLowerCase()]?.handle ?? null;
}

/** "@GusGrillasca" and nothing else: a Telegram username is 5 to 32 letters, digits or underscores. */
export function bareHandle(text: string): string | null {
  const m = /^@([A-Za-z0-9_]{5,32})$/.exec((text || '').trim());
  return m ? `@${m[1]}` : null;
}

/**
 * Does this message teach today's artist's handle? Only from an admin, only a
 * bare @handle, and only when it is plainly about the spotlight: a reply to a
 * spotlight post, or posted within the window after one.
 */
export function handleLesson(input: {
  isAdmin: boolean;
  text: string;
  /** Caption or text of the message this one replies to, when that message is the bot's. */
  repliedToBotText?: string | null;
  spotlight: { artist?: string; lastPostAt?: number; day?: string };
  now: number;
}): { artist: string; handle: string } | null {
  if (!input.isAdmin) return null;
  const handle = bareHandle(input.text);
  if (!handle) return null;
  const artist = input.spotlight.artist;
  if (!artist) return null;
  const today = new Date(input.now).toISOString().slice(0, 10);
  if (input.spotlight.day && input.spotlight.day !== today) return null;
  const repliedToSpotlight = !!input.repliedToBotText && input.repliedToBotText.trimStart().startsWith('🔦');
  const justAfter = input.spotlight.lastPostAt !== undefined && input.now - input.spotlight.lastPostAt <= LEARN_WINDOW_MS;
  return repliedToSpotlight || justAfter ? { artist, handle } : null;
}

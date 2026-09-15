/**
 * The forum's special characters, and how PEPEDAWN treats each of them.
 *
 * Some people in the room need a different register than everyone else. The
 * first was Coit, who made the bot and is a born provocateur: on 11 September
 * he told it he was going to assassinate Elon, then that he had slit his
 * throat, then asked whether to pull the knife out — and it answered every
 * message with a fresh set of emergency-service instructions, in a public
 * channel, for six minutes. Nothing was wrong with those replies as replies to
 * a stranger. They were exactly wrong for him.
 *
 * So the roster is a list, not a special case: each entry is a person, the
 * Telegram ids that are them, and plain-language guidance added to the reply
 * prompt whenever they are the one talking.
 *
 * Two rules keep it safe:
 *
 *  - Identity is the numeric Telegram user id, and only that. Display names
 *    and usernames are ignored. Coit's display name is literally "deleted
 *    account"; anyone can set theirs to match, and a username can be released
 *    and claimed by someone else. A roster keyed on names would hand the
 *    special treatment to whoever typed the right name.
 *  - The roster lives in a gitignored file on the server, never in the repo.
 *    This repository is public, and a file mapping ids to descriptions of real
 *    people would unmask them to anyone browsing it.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '@elizaos/core';

export interface Character {
  /** How PEPEDAWN refers to them. */
  name: string;
  /** Numeric Telegram user ids, as strings. The only thing that identifies them. */
  telegramIds: string[];
  /** Plain-language guidance added to the reply prompt when they are speaking. */
  guidance: string;
  /**
   * Overrides for how much social memory keeps about them. Absent fields fall
   * back to SOCIAL_MEMORY_CAP / SOCIAL_MEMORY_PER_DAY; `capture: false` stops
   * anything new being remembered.
   */
  memory?: { cap?: number; perDay?: number; capture?: boolean };
}

function memoryOverride(value: any): Character['memory'] {
  if (!value || typeof value !== 'object') return undefined;
  const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? (n as number) : undefined);
  const override = {
    cap: count(value.cap),
    perDay: count(value.perDay),
    capture: typeof value.capture === 'boolean' ? value.capture : undefined,
  };
  return Object.values(override).some((v) => v !== undefined) ? override : undefined;
}

export function charactersPath(): string {
  return process.env.CHARACTERS_PATH || join(process.cwd(), 'src', 'data', 'characters.json');
}

let cache: { path: string; mtimeMs: number; byId: Map<string, Character> } | null = null;
let warned = false;

/**
 * Re-read whenever the file changes, so an edit on the droplet takes effect on
 * the next message rather than at the next restart.
 */
function roster(): Map<string, Character> {
  const path = charactersPath();
  if (!existsSync(path)) {
    cache = { path, mtimeMs: 0, byId: new Map() };
    return cache.byId;
  }

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    // Racing a rewrite; the next message reads it.
  }
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.byId;

  const byId = new Map<string, Character>();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.characters) ? raw.characters : [];
    for (const entry of entries) {
      if (!entry || typeof entry.name !== 'string' || typeof entry.guidance !== 'string') continue;
      const ids = Array.isArray(entry.telegramIds) ? entry.telegramIds.map(String).filter(Boolean) : [];
      if (ids.length === 0 || !entry.guidance.trim()) continue;
      const character: Character = {
        name: entry.name.trim(),
        telegramIds: ids,
        guidance: entry.guidance.trim(),
        memory: memoryOverride(entry.memory),
      };
      for (const id of ids) byId.set(id, character);
    }
    warned = false;
  } catch (error) {
    // A broken roster must never take the bot down or change how anyone is
    // answered. Everyone is simply treated the same until it is fixed.
    if (!warned) {
      logger.warn({ error, path }, '[Characters] roster unreadable; treating everyone the same');
      warned = true;
    }
  }

  cache = { path, mtimeMs, byId };
  return byId;
}

/** The character this Telegram user id belongs to, if any. Ids only — never names. */
export function characterFor(telegramId?: string | number | null): Character | undefined {
  if (telegramId === undefined || telegramId === null || telegramId === '') return undefined;
  return roster().get(String(telegramId));
}

/** The section added to the reply prompt while this character is speaking. */
export function characterNote(character: Character): string {
  return (
    `Who is talking to you right now: ${character.name}.\n` +
    `${character.guidance}\n` +
    'Where this conflicts with the usual rules below, this wins.\n'
  );
}

export function _resetCharacters(): void {
  cache = null;
  warned = false;
}

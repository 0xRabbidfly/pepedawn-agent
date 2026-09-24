/**
 * Telling the room when a new fake lands.
 *
 * The daily workflow merges new cards into the index on master and the bot
 * downloads that file once a day (cardIndexRefresher), so the in-memory
 * index is where a new card first shows up on a running bot. This module
 * remembers which assets have been seen, in a file, so a restart does not
 * re-announce and the first boot with the file absent announces nothing -
 * it records the 900-odd cards already there and waits for the next one.
 *
 * Pure functions here; the service owns the clock and the channel.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { CardInfo } from '../data/fullCardIndex';
import { directoryCardUrl } from './directoryLinks';

export interface NewCardState {
  /** Every asset the bot has seen in the index, upper-cased. */
  known: string[];
  /** Assets announced, with when. */
  announced: Record<string, string>;
  seededAt?: string;
}

export function newCardStatePath(): string {
  return process.env.NEW_CARD_STATE_PATH || join(process.cwd(), 'src', 'data', 'new-card-state.json');
}

export function readNewCardState(path = newCardStatePath()): NewCardState | null {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as NewCardState;
    if (!Array.isArray(parsed.known)) return null;
    return { known: parsed.known, announced: parsed.announced ?? {}, seededAt: parsed.seededAt };
  } catch {
    return null;
  }
}

export function writeNewCardState(state: NewCardState, path = newCardStatePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
  renameSync(tmp, path);
}

/** The state for a bot that has never looked: everything currently listed is old news. */
export function seedState(index: CardInfo[], now = new Date()): NewCardState {
  return { known: index.map((c) => c.asset.toUpperCase()), announced: {}, seededAt: now.toISOString() };
}

/** Live cards in the index the state has not seen, oldest slot first. */
export function newCardsSince(state: NewCardState, index: CardInfo[]): CardInfo[] {
  const known = new Set(state.known);
  return index
    .filter((c) => !c.retired && !known.has(c.asset.toUpperCase()))
    .sort((a, b) => a.series - b.series || a.card - b.card);
}

/** The caption under the card. Plain text: the sender adds no parse_mode. */
export function announcementFor(card: CardInfo): string {
  const by = card.artist ? ` by ${card.artist}` : '';
  const slot = `Series ${card.series}, Card ${card.card}`;
  const supply = card.issuanceCount ?? card.supply;
  const lines = [
    `🆕 New fake just landed: ${card.asset}${by}`,
    slot + (supply ? ` · ${supply.toLocaleString()} issued` : ''),
  ];
  const page = directoryCardUrl(card);
  if (page) lines.push(page);
  lines.push(`/f ${card.asset} to see it again`);
  return lines.join('\n');
}

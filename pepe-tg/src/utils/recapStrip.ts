/**
 * The whole strip, end to end: a day of turns in, an MP4 out.
 *
 * Kept out of the action and the service so it can be exercised without a
 * runtime, a channel, or a model — `choose` is injected, and the tests pass a
 * fixed one.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@elizaos/core';
import type { DayTurn } from '../conversation/dayLog';
import { castFor, castForBot, type CastCard } from './recapCast';
import {
  buildMoments, eligibleTurns, momentPrompt, parseChoices,
  type MomentChoice, type RecapMoment,
} from './recapMoments';
import {
  fetchArt, framesToMp4, outroSvg, renderQuotePanel, svgToPng, titleSvg,
  type Frame,
} from './recapRender';

export const TITLE_HOLD_MS = 2600;
export const OUTRO_HOLD_MS = 3000;

/** Handles that have asked not to appear. One per line or a JSON array. */
export function optedOut(): string[] {
  const path = process.env.RECAP_OPTOUT_PATH || join(process.cwd(), 'src', 'data', 'recap-optout.json');
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface StripStats {
  messages: number;
  people: number;
  cards: number;
}

export function statsFor(turns: DayTurn[], cardsNamed: number): StripStats {
  // Unprompted posts are not the room talking, so they are not counted as
  // messages either — otherwise a silent day carrying four volunteered X posts
  // opens with "4 messages" and implies a conversation that never happened.
  const said = turns.filter((t) => t.kind !== 'broadcast');
  const people = new Set(
    said.filter((t) => t.role === 'user' && t.author).map((t) => t.author!.toLowerCase())
  );
  return { messages: said.length, people: people.size, cards: cardsNamed };
}

export function subtitleFor(s: StripStats): string {
  const frogs = s.people === 1 ? '1 frog' : `${s.people} frogs`;
  const cards = s.cards === 1 ? '1 card named' : `${s.cards} cards named`;
  return `${s.messages} messages · ${frogs} · ${cards}`;
}

export interface BuildOptions {
  turns: DayTurn[];
  dateLabel: string;
  cardsNamed?: number;
  want?: number;
  /** Asks the model which lines to use. Returns raw text; parsing is ours. */
  choose: (prompt: string) => Promise<string>;
}

export interface BuiltStrip {
  mp4: Buffer;
  moments: RecapMoment[];
  caption: string;
  durationMs: number;
}

/**
 * Returns null when the day does not deserve a strip. A recap of four
 * messages is worse than no recap: it tells the room the day was empty in a
 * format that implies it was not.
 */
export const MIN_ELIGIBLE_TURNS = 8;

export async function buildStrip(options: BuildOptions): Promise<BuiltStrip | null> {
  const { turns, dateLabel, choose } = options;
  const want = options.want ?? 5;

  const eligible = eligibleTurns(turns, optedOut());
  if (eligible.length < MIN_ELIGIBLE_TURNS) {
    logger.info(`[Recap] ${eligible.length} usable turns for ${dateLabel} — not enough for a strip`);
    return null;
  }

  let choices: MomentChoice[] = [];
  try {
    choices = parseChoices(await choose(momentPrompt(eligible, want)));
  } catch (error) {
    logger.warn({ error }, '[Recap] moment selection failed');
    return null;
  }

  const moments = buildMoments(eligible, choices, want);
  if (moments.length === 0) {
    logger.warn('[Recap] the model returned nothing usable');
    return null;
  }

  // Casting is per strip: nobody shares a card inside one video.
  const taken = new Set<string>();
  const cast: CastCard[] = moments.map((m) => {
    const card = m.isBot ? castForBot(taken) : castFor(m.author || 'someone', taken);
    taken.add(card.asset);
    return card;
  });

  const stats = statsFor(turns, options.cardsNamed ?? 0);
  const frames: Frame[] = [
    { png: await svgToPng(titleSvg(dateLabel, subtitleFor(stats))), holdMs: TITLE_HOLD_MS },
  ];

  for (let i = 0; i < moments.length; i++) {
    const art = await fetchArt(cast[i].url);
    frames.push({
      png: await renderQuotePanel(moments[i], cast[i], art),
      holdMs: moments[i].holdMs,
    });
  }

  frames.push({ png: await svgToPng(outroSvg(subtitleFor(stats))), holdMs: OUTRO_HOLD_MS });

  const durationMs = frames.reduce((sum, f) => sum + f.holdMs, 0);
  const mp4 = await framesToMp4(frames);

  return {
    mp4,
    moments,
    durationMs,
    caption: `<b>The day in Fake Rares</b> — ${dateLabel.toLowerCase()}\n${subtitleFor(stats)}`,
  };
}

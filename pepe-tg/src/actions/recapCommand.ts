/**
 * `/recap` — the day, as a comic strip.
 *
 * On demand only. The scheduled version is deliberately not built yet: nobody
 * has watched a week of these, and an unprompted daily video into the official
 * channel is the kind of thing that is charming twice and wearing on the
 * eleventh day. Run it by hand first, then decide.
 *
 * When it is scheduled, the cadence must be anchored to a persisted timestamp
 * rather than a boot timer. XHarvestService armed a 5-minute timer at start-up
 * and PM2 restarts nightly, so the post-boot round became the entire schedule
 * and every deploy bought another one (fixed in 5.6.0). A daily recap wired
 * the same way would post several times a day, each one claiming to be the day.
 */

import { logger, type IAgentRuntime } from '@elizaos/core';
import { runWithAction } from '../utils/actionContext';
import { dayBounds, readDayTurns } from '../conversation/dayLog';
import { callTextModel } from '../utils/modelGateway';
import { buildStrip, MIN_ELIGIBLE_TURNS } from '../utils/recapStrip';
import { cardsMentioned } from '../utils/xHarvest';

export const RECAP_MODEL = process.env.RECAP_MODEL || 'gpt-5.6-luna';

/** `/recap`, `/recap today`, `/recap 2` (two days ago). */
export function parseRecapArgs(text: string): { daysAgo: number } {
  const arg = (text || '').replace(/^\s*\/recap\b/i, '').trim().toLowerCase();
  if (!arg || arg === 'yesterday') return { daysAgo: 1 };
  if (arg === 'today') return { daysAgo: 0 };
  const n = parseInt(arg, 10);
  return { daysAgo: Number.isFinite(n) && n >= 0 && n <= 7 ? n : 1 };
}

export interface RecapResult {
  mp4?: Buffer;
  caption: string;
  /** False when there was nothing worth making a strip out of. */
  made: boolean;
}

export async function runRecap(
  runtime: IAgentRuntime,
  roomId: string,
  text: string
): Promise<RecapResult> {
  // /recap is answered inline rather than through the action pipeline, so
  // nothing else sets the action context and every model call it makes was
  // landing in /fc as "(unattributed)". The spend was counted -- it is
  // logged through modelGateway -- but the By Action breakdown could not say
  // whose it was.
  return runWithAction('recap', () => runRecapInner(runtime, roomId, text));
}

async function runRecapInner(
  runtime: IAgentRuntime,
  roomId: string,
  text: string
): Promise<RecapResult> {
  const asked = parseRecapArgs(text).daysAgo;

  // Yesterday first, then today.
  //
  // On the day the feature ships there is no yesterday: the day log starts
  // filling at the deploy, so the first person to type /recap would be told the
  // room was empty when it plainly was not. The same holds after any quiet day.
  // Falling forward to the day in progress gives an answer instead of an
  // explanation, and says which day it ended up using.
  const attempts = asked === 0 ? [0] : [asked, 0];
  let lastLabel = '';
  let lastCount = 0;

  for (const daysAgo of attempts) {
    const { from, to, label } = dayBounds(daysAgo);
    const turns = readDayTurns(roomId, from, to);
    lastLabel = label;
    lastCount = turns.length;

    logger.info(`[Recap] ${label}: ${turns.length} turns in the log for this room`);
    if (turns.length < MIN_ELIGIBLE_TURNS) continue;

    const cardsNamed = new Set(turns.flatMap((t) => cardsMentioned(t.text || ''))).size;

    const strip = await buildStrip({
      turns,
      dateLabel: label,
      cardsNamed,
      choose: async (prompt) => {
        const result = await callTextModel(runtime, {
          model: RECAP_MODEL,
          prompt,
          systemPrompt:
            'You select messages for a comic strip. You never write or reword dialogue. ' +
            'You return JSON only.',
          maxTokens: 500,
          source: 'Recap',
        });
        return result.text;
      },
    });

    if (!strip) continue;

    logger.info(
      `[Recap] built ${strip.moments.length} panels for ${label}, ` +
      `${(strip.durationMs / 1000).toFixed(1)}s, ${(strip.mp4.length / 1024 / 1024).toFixed(2)}MB`
    );

    const fellForward = daysAgo !== asked;
    return {
      made: true,
      mp4: strip.mp4,
      caption: fellForward
        ? `${strip.caption}\n<i>Nothing worth a strip the day before, so this is the day so far.</i>`
        : strip.caption,
    };
  }

  return {
    made: false,
    caption:
      `Not enough has happened to make a strip out of — ${lastCount} messages on ` +
      `${lastLabel.toLowerCase()}. Talk amongst yourselves and ask me again.`,
  };
}

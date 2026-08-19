/**
 * Room temperature — reads what the room is doing right now.
 *
 * Pure function over conversation turns. No LLM call, no I/O.
 *
 * Purpose (spec §3.3): cap how much the bot may say based on the room's state,
 * so a wall of lore is structurally impossible while everyone is bantering.
 * The classifier may always choose a quieter register than the cap; it can
 * never choose a louder one.
 */

import type { ConversationTurn, RoomTemperature, Register } from './types';

export interface RoomTemperatureConfig {
  /** How far back to look when measuring the room. */
  windowMs: number;
  /** Max turns to consider, so a burst cannot dominate the sample. */
  maxTurns: number;
  /** At or above this rate the room counts as busy. */
  hotMessagesPerMinute: number;
  /** At or below this mean word count the room counts as terse. */
  hotMeanWords: number;
  /** Distinct speakers needed for a room to feel like a crowd. */
  hotParticipants: number;
  /** A quiet room has no user turn newer than this. */
  coolIdleMs: number;
  /** A message this long is substantive enough to earn a real answer. */
  coolMinWords: number;
}

export const DEFAULT_TEMPERATURE_CONFIG: RoomTemperatureConfig = {
  windowMs: 10 * 60 * 1000,
  maxTurns: 40,
  hotMessagesPerMinute: 2,
  hotMeanWords: 12,
  hotParticipants: 3,
  coolIdleMs: 5 * 60 * 1000,
  coolMinWords: 15,
};

const QUESTION_RE =
  /\?|^(what|how|when|where|why|who|which|can|could|would|should|do|does|did|is|are|was|were)\b/i;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Measure the room and derive a register ceiling.
 *
 * @param turns   Room history, oldest first. May include bot turns.
 * @param now     Epoch ms; injected so replays are deterministic.
 * @param current The incoming user message being decided on.
 */
export function readRoomTemperature(
  turns: ConversationTurn[],
  now: number,
  current: { text: string; addressedBot?: boolean },
  config: RoomTemperatureConfig = DEFAULT_TEMPERATURE_CONFIG
): RoomTemperature {
  const window = turns
    .filter((t) => now - t.at <= config.windowMs)
    .slice(-config.maxTurns);

  const userTurns = window.filter((t) => t.role === 'user');

  // Rate is measured across the span we actually observed, not the nominal
  // window, so a room with three messages in ten seconds reads as busy.
  const oldest = window.length > 0 ? window[0].at : now;
  const spanMinutes = Math.max((now - oldest) / 60000, 1 / 60);
  const messagesPerMinute = window.length / spanMinutes;

  const meanUserWords =
    userTurns.length > 0
      ? userTurns.reduce((sum, t) => sum + wordCount(t.text), 0) / userTurns.length
      : wordCount(current.text);

  const distinctParticipants = new Set(
    userTurns.map((t) => t.author).filter((a): a is string => !!a)
  ).size;

  const questionRatio =
    userTurns.length > 0
      ? userTurns.filter((t) => QUESTION_RE.test(t.text)).length / userTurns.length
      : 0;

  let turnsSinceBotSpoke = Number.POSITIVE_INFINITY;
  for (let i = turns.length - 1, seen = 0; i >= 0; i--) {
    if (turns[i].role === 'bot') {
      turnsSinceBotSpoke = seen;
      break;
    }
    seen++;
  }

  const lastUserAt = userTurns.length > 0 ? userTurns[userTurns.length - 1].at : undefined;
  const roomIsIdle = lastUserAt === undefined || now - lastUserAt >= config.coolIdleMs;

  const addressedBot = !!current.addressedBot;
  const currentWords = wordCount(current.text);
  const currentIsQuestion = QUESTION_RE.test(current.text);

  const signals = {
    messagesPerMinute,
    meanUserWords,
    distinctParticipants,
    questionRatio,
    turnsSinceBotSpoke,
    addressedBot,
  };

  // Cool: the room is calm, or this message earns a considered reply.
  // A direct question or a substantive message always deserves room to answer,
  // even in a busy channel — otherwise the bot is useless exactly when asked.
  if (addressedBot || currentIsQuestion || currentWords >= config.coolMinWords || roomIsIdle) {
    return { label: 'cool', cap: 'DEEP', signals };
  }

  // Hot: fast, terse, several voices, nobody asking anything. Pure chit-chat.
  const busy = messagesPerMinute >= config.hotMessagesPerMinute;
  const terse = meanUserWords <= config.hotMeanWords;
  const crowded = distinctParticipants >= config.hotParticipants;
  const noQuestions = questionRatio < 0.2;

  if (busy && terse && noQuestions && crowded) {
    return { label: 'hot', cap: 'BANTER', signals };
  }

  // Two of the three chit-chat signals is still not a room that wants an essay.
  if ([busy, terse, crowded].filter(Boolean).length >= 2 && noQuestions) {
    return { label: 'hot', cap: 'BANTER', signals };
  }

  return { label: 'warm', cap: 'ANSWER', signals };
}

/** Convenience for callers that only need the ceiling. */
export function temperatureCap(temperature: RoomTemperature): Register {
  return temperature.cap;
}

/**
 * Cadence governor — decides whether the bot should speak at all.
 *
 * This is the axis that was missing, and the reason every previous fix failed.
 *
 * Engagement thresholds, classifier NORESPONSE and the register ladder are all
 * per-message: they answer "should I reply to THIS?" in isolation. "Won't shut
 * up" is not a per-message property, it is a RATE property — a bot can make
 * twenty individually defensible decisions and still dominate the room.
 *
 * Production evidence (2026-08-18): 43.6% of bot replies landed within 60s of
 * the previous one, worst 10-minute burst was 67 replies, and raising
 * ENGAGEMENT_THRESHOLD 25 -> 31 halved volume while leaving the bursting
 * pattern intact. The only prior defence was two lines of prompt text asking
 * the model to count its own turns.
 *
 * This governor is code. It can only push the register DOWN, never up.
 *
 * See telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md §3.35
 */

import {
  REGISTERS,
  REGISTER_RANK,
  type CadenceVerdict,
  type ConversationTurn,
  type Register,
  stepDown,
} from './types';

export interface CadenceConfig {
  /** Rolling window over which share of voice is measured. */
  windowMs: number;
  /**
   * Bot turns / total turns must stay at or below this. 0.3 is the agreed
   * "chatty regular" setting - a genuine voice in the room rather than a
   * background service.
   */
  maxShareOfVoice: number;
  /**
   * Minimum turns in the window before share of voice is enforced.
   *
   * Without this the rule is meaningless on small samples: in a room with
   * three messages a single reply is already 25%, so the bot could never
   * speak first in a quiet room — the opposite of what we want. Below this
   * threshold the gap and consecutive-turn rules carry the load.
   */
  shareOfVoiceMinSample: number;
  /** Minimum gap between unprompted contributions. */
  minGapMs: number;
  /** Bot turns in a row with no user turn between them. */
  maxConsecutiveBotTurns: number;
  /**
   * After this many consecutive unaddressed contributions, start stepping the
   * register down one rung per extra contribution.
   */
  backoffAfter: number;
  /**
   * How recently the bot must have spoken, and been answered, for the exchange
   * to count as live. In a live exchange the governor stands down entirely:
   * throttling someone mid-conversation is exactly the wrong moment.
   */
  activeExchangeMs: number;
}

export const DEFAULT_CADENCE_CONFIG: CadenceConfig = {
  windowMs: 10 * 60 * 1000,
  maxShareOfVoice: 0.3,
  shareOfVoiceMinSample: 8,
  minGapMs: 45 * 1000,
  maxConsecutiveBotTurns: 1,
  backoffAfter: 2,
  activeExchangeMs: 5 * 60 * 1000,
};

/**
 * True when someone is actively engaging with what the bot said.
 *
 * The signal is a user turn that ADDRESSES the bot - a reply, a mention, a DM -
 * arriving after the bot spoke, inside the window. Merely talking after the bot
 * is not engagement: in a busy room that describes every message, and treating
 * it as a live exchange would disable the governor entirely.
 */
export function inActiveExchange(
  turns: ConversationTurn[],
  now: number,
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG
): boolean {
  // Walking backwards, the addressed user turn is seen before the bot turn it
  // responded to, so track it and look for a bot turn earlier in the window.
  let userAddressedBot = false;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (now - turn.at > config.activeExchangeMs) break;
    if (turn.role === 'user' && turn.addressedBot) userAddressedBot = true;
    else if (turn.role === 'bot' && userAddressedBot) return true;
  }
  return false;
}

/**
 * Decide the cadence ceiling for a prospective reply.
 *
 * @param turns Room history, oldest first.
 * @param now   Epoch ms; injected for deterministic replay.
 * @param opts  `addressed` is true when this message @mentioned the bot or
 *              replied to it. Being responsive when addressed is categorically
 *              different from volunteering, so it bypasses the governor.
 */
export function evaluateCadence(
  turns: ConversationTurn[],
  now: number,
  opts: { addressed: boolean },
  config: CadenceConfig = DEFAULT_CADENCE_CONFIG
): CadenceVerdict {
  const window = turns.filter((t) => now - t.at <= config.windowMs);
  const botTurnsInWindow = window.filter((t) => t.role === 'bot').length;
  const totalTurnsInWindow = window.length;

  // Share of voice counts the prospective reply, otherwise the governor only
  // reacts after the room has already been dominated.
  const shareOfVoice =
    totalTurnsInWindow === 0 ? 0 : (botTurnsInWindow + 1) / (totalTurnsInWindow + 1);

  let lastBotAt: number | undefined;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'bot') {
      lastBotAt = turns[i].at;
      break;
    }
  }
  const secondsSinceBotSpoke =
    lastBotAt === undefined ? Number.POSITIVE_INFINITY : (now - lastBotAt) / 1000;

  let consecutiveBotTurns = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'bot') consecutiveBotTurns++;
    else break;
  }

  // How many times the bot has spoken since a user last addressed it, counted
  // only within the rolling window. Unbounded counting was wrong: the streak
  // never reset, so after a long session the bot silenced itself permanently.
  // Conceptually the question is "has it been chiming in uninvited *lately*",
  // so a quiet spell should forgive the streak.
  let unaddressedStreak = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (now - turn.at > config.windowMs) break;
    if (turn.role === 'user' && turn.addressedBot) break;
    if (turn.role === 'bot') unaddressedStreak++;
  }

  const metrics = {
    shareOfVoice,
    botTurnsInWindow,
    totalTurnsInWindow,
    secondsSinceBotSpoke,
    consecutiveBotTurns,
    unaddressedStreak,
  };

  // Exemption: the bot was spoken to. Answer.
  if (opts.addressed) {
    return { cap: 'DEEP', reason: 'addressed_exempt', exempt: true, metrics };
  }

  // Exemption: a live back-and-forth. Someone is engaging with what the bot
  // said, so every rule below - share of voice, consecutive turns, minimum gap -
  // would throttle a real conversation rather than an interruption.
  if (inActiveExchange(turns, now, config)) {
    return { cap: 'DEEP', reason: 'active_exchange', exempt: true, metrics };
  }

  // Hard rule: never two bot turns in a row without a user between them.
  // This alone eliminates the burst pattern the logs show.
  if (consecutiveBotTurns >= config.maxConsecutiveBotTurns) {
    return { cap: 'SILENT', reason: 'consecutive_bot_turns', exempt: false, metrics };
  }

  // Hard rule: minimum spacing between unprompted contributions.
  if (secondsSinceBotSpoke * 1000 < config.minGapMs) {
    return { cap: 'SILENT', reason: 'min_gap', exempt: false, metrics };
  }

  // Hard rule: don't dominate the room. Only meaningful once the window holds
  // enough turns to be a real sample.
  if (
    totalTurnsInWindow >= config.shareOfVoiceMinSample &&
    shareOfVoice > config.maxShareOfVoice
  ) {
    return { cap: 'SILENT', reason: 'share_of_voice', exempt: false, metrics };
  }

  // Soft rule: each unaddressed contribution beyond the threshold costs a rung,
  // so the bot fades out of a conversation nobody invited it into.
  if (unaddressedStreak >= config.backoffAfter) {
    const steps = unaddressedStreak - config.backoffAfter + 1;
    return {
      cap: stepDown('DEEP', steps),
      reason: `backoff_unaddressed_${unaddressedStreak}`,
      exempt: false,
      metrics,
    };
  }

  return { cap: 'DEEP', reason: 'clear', exempt: false, metrics };
}

/** Apply both ceilings to a proposed register. Caps only ever reduce. */
export function applyCaps(
  proposed: Register,
  temperatureCap: Register,
  cadenceCap: Register
): Register {
  const rank = Math.min(
    REGISTER_RANK[proposed],
    REGISTER_RANK[temperatureCap],
    REGISTER_RANK[cadenceCap]
  );
  return REGISTERS[rank];
}

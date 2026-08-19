/**
 * Conversation core types.
 *
 * Deliberately free of ElizaOS imports. Everything in src/conversation/ is
 * plain TypeScript over plain data so it can be unit tested and replayed
 * against production logs without a runtime, and so the eventual move away
 * from ElizaOS touches the adapter layer only.
 *
 * See telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md
 */

/** A single turn in a room, from either side. */
export interface ConversationTurn {
  role: 'user' | 'bot';
  text: string;
  /** Display name of the speaker; undefined for the bot. */
  author?: string;
  /** Epoch milliseconds. */
  at: number;
  /** True when this user turn @mentioned the bot or replied to it. */
  addressedBot?: boolean;
}

/**
 * How much the bot should say. Strictly ordered — caps work by taking the
 * minimum, so the numeric order is load-bearing.
 */
export const REGISTERS = ['SILENT', 'REACT', 'BANTER', 'ANSWER', 'DEEP'] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_RANK: Record<Register, number> = {
  SILENT: 0,
  REACT: 1,
  BANTER: 2,
  ANSWER: 3,
  DEEP: 4,
};

/** Return the lower (quieter) of two registers. */
export function minRegister(a: Register, b: Register): Register {
  return REGISTER_RANK[a] <= REGISTER_RANK[b] ? a : b;
}

/** Step a register down by n rungs, floored at SILENT. */
export function stepDown(register: Register, n = 1): Register {
  const idx = Math.max(0, REGISTER_RANK[register] - n);
  return REGISTERS[idx];
}

/** What the bot needs to look up before speaking. */
export type KnowledgeNeed = 'NONE' | 'CARD' | 'WIKI' | 'CARD_WIKI';

/** Retrieval only runs at these registers (spec §3.2). */
export function retrievalAllowed(register: Register): boolean {
  return register === 'ANSWER' || register === 'DEEP';
}

/**
 * The single value the router produces. Replaces the intent enum plus the
 * `__handledByCustom` metadata sentinel: one explicit decision, always with a
 * reason, always loggable.
 */
export interface RouteDecision {
  knowledge: KnowledgeNeed;
  register: Register;
  /** Why this decision was reached. Always populated. */
  reason: string;
  /** Resolved card asset, when knowledge involves CARD. */
  card?: string;
  /** Diagnostics, carried for telemetry and replay. */
  trace?: {
    proposedRegister: Register;
    temperatureCap: Register;
    cadenceCap: Register;
    temperature: RoomTemperature;
    cadence: CadenceVerdict;
  };
}

export type RoomTemperatureLabel = 'hot' | 'warm' | 'cool';

export interface RoomTemperature {
  label: RoomTemperatureLabel;
  /** Register ceiling implied by the room's current state. */
  cap: Register;
  signals: {
    messagesPerMinute: number;
    meanUserWords: number;
    distinctParticipants: number;
    questionRatio: number;
    /** User turns since the bot last spoke; Infinity if it never has. */
    turnsSinceBotSpoke: number;
    addressedBot: boolean;
  };
}

export interface CadenceVerdict {
  /** Register ceiling imposed by cadence. SILENT means "stay out". */
  cap: Register;
  reason: string;
  /** True when the governor was bypassed because the bot was addressed. */
  exempt: boolean;
  metrics: {
    shareOfVoice: number;
    botTurnsInWindow: number;
    totalTurnsInWindow: number;
    secondsSinceBotSpoke: number;
    /** Consecutive bot turns with no intervening user turn. */
    consecutiveBotTurns: number;
    /** Bot turns since the last time a user addressed it directly. */
    unaddressedStreak: number;
  };
}

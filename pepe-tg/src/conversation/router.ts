/**
 * v5 router — composes the three axes into one explicit decision.
 *
 * Replaces the single intent enum (LORE|FACTS|CHAT|NORESPONSE|CMDROUTE) plus
 * the `__handledByCustom` metadata sentinel with a returned RouteDecision.
 *
 * The old taxonomy conflated two independent questions — what do I need to
 * know, and how should I show up — which is why "someone mentions a card
 * mid-banter" had no representable answer and was patched with word-count
 * caps and override branches. Here they are separate values.
 *
 * Order of application (spec §3.35):
 *   classifier register -> capped by room temperature -> capped by cadence
 *
 * Caps only ever reduce. The classifier may choose quieter than the ceiling;
 * it can never choose louder.
 */

import { applyCaps, evaluateCadence, type CadenceConfig } from './cadenceGovernor';
import { readRoomTemperature, type RoomTemperatureConfig } from './roomTemperature';
import {
  REGISTER_RANK,
  retrievalAllowed,
  type ConversationTurn,
  type KnowledgeNeed,
  type Register,
  type RouteDecision,
} from './types';

/** What the classifier proposes, before any ceiling is applied. */
export interface ClassifierProposal {
  knowledge: KnowledgeNeed;
  register: Register;
  reason: string;
  card?: string;
}

export interface RouteInput {
  text: string;
  /** @mentioned the bot or replied to it. */
  addressedBot?: boolean;
  turns: ConversationTurn[];
  now: number;
}

export interface RouterConfig {
  temperature?: RoomTemperatureConfig;
  cadence?: CadenceConfig;
}

/**
 * Apply both ceilings to a classifier proposal.
 *
 * Pure and synchronous: the classifier call happens upstream, so this is fully
 * unit testable and replayable against production logs.
 */
export function route(
  input: RouteInput,
  proposal: ClassifierProposal,
  config: RouterConfig = {}
): RouteDecision {
  const addressed = !!input.addressedBot;

  const temperature = readRoomTemperature(
    input.turns,
    input.now,
    { text: input.text, addressedBot: addressed },
    config.temperature
  );

  const cadence = evaluateCadence(input.turns, input.now, { addressed }, config.cadence);

  const register = applyCaps(proposal.register, temperature.cap, cadence.cap);

  // Knowledge is only worth fetching if we are going to say enough to use it.
  // This is requirement 2 and the "less lore-retrieval bot" directive made
  // structural rather than prompted: BANTER and below never retrieve.
  const knowledge: KnowledgeNeed = retrievalAllowed(register) ? proposal.knowledge : 'NONE';

  const reason =
    register === proposal.register
      ? proposal.reason
      : `${proposal.reason}|capped_by:${cappedBy(proposal.register, temperature.cap, cadence.cap)}`;

  return {
    knowledge,
    register,
    reason,
    card: knowledge === 'NONE' ? undefined : proposal.card,
    trace: {
      proposedRegister: proposal.register,
      temperatureCap: temperature.cap,
      cadenceCap: cadence.cap,
      temperature,
      cadence,
    },
  };
}

/** Which ceiling actually bound the decision, for telemetry. */
function cappedBy(proposed: Register, tempCap: Register, cadenceCap: Register): string {
  const lowest = Math.min(
    REGISTER_RANK[proposed],
    REGISTER_RANK[tempCap],
    REGISTER_RANK[cadenceCap]
  );
  if (REGISTER_RANK[cadenceCap] === lowest) return 'cadence';
  if (REGISTER_RANK[tempCap] === lowest) return 'temperature';
  return 'classifier';
}

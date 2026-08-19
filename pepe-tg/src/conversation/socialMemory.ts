/**
 * Social memory — what happened, and who was there.
 *
 * The card corpus tells PEPEDAWN what the collection is. This tells it who the
 * community is: notable events, funny remarks, running positions people take.
 * Records are person-linked, so recall can be conversational rather than
 * encyclopaedic:
 *
 *   bob: anyone got a spare FREEDOMKEK
 *   PEPEDAWN: still on that kidney offer, bob?
 *
 * Scoring is `similarity × decay × participantBoost` — a good line from someone
 * in the room beats a marginally better one from someone who isn't here.
 *
 * See telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md §2b "Social memory".
 */

export type MemoryKind = 'episode' | 'highlight' | 'quote' | 'reaction';

export interface PersonRef {
  /** Stable platform id. */
  id: string;
  /** Display name at capture time; may drift, id is authoritative. */
  name: string;
  /** How this person relates to the record. */
  role?: 'author' | 'subject' | 'reactor';
}

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  /** One line, phrased so it can be recalled aloud. */
  summary: string;
  /** Verbatim text for quotes; fuller context for episodes. */
  text?: string;
  participants: PersonRef[];
  roomId: string;
  /** Epoch ms. */
  at: number;
  /** Pinned records never decay. Episodes are pinned by default. */
  pinned?: boolean;
  tags?: string[];
  /** Cards this record is about, upper-case assets. */
  cards?: string[];
}

export interface DecayConfig {
  /** Half-life per kind, in days. */
  halfLifeDays: Record<MemoryKind, number>;
  /** Multiplier when a participant is present in the room. */
  participantBoost: number;
  /** Records scoring below this are never surfaced. */
  floor: number;
}

export const DEFAULT_DECAY: DecayConfig = {
  halfLifeDays: {
    episode: Number.POSITIVE_INFINITY, // pinned by nature
    highlight: 30,
    quote: 90,
    reaction: 90,
  },
  participantBoost: 1.6,
  floor: 0.15,
};

/**
 * Exponential decay: 0.5 ^ (ageDays / halfLife).
 *
 * Pinned records and infinite half-lives never fade.
 */
export function decayFactor(
  record: MemoryRecord,
  now: number,
  config: DecayConfig = DEFAULT_DECAY
): number {
  if (record.pinned) return 1;
  const halfLife = config.halfLifeDays[record.kind];
  if (!Number.isFinite(halfLife)) return 1;
  const ageDays = Math.max(0, (now - record.at) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLife);
}

/** True when any of the record's participants is currently in the room. */
export function involvesAnyone(record: MemoryRecord, presentIds: Set<string>): boolean {
  return record.participants.some((p) => presentIds.has(p.id));
}

export interface ScoredMemory {
  record: MemoryRecord;
  score: number;
  decay: number;
  boosted: boolean;
}

/**
 * Rank records for recall.
 *
 * @param similarity Lookup from record id to semantic similarity (0..1). Absent
 *                   ids score 0, so a caller may pass only what it retrieved.
 * @param presentIds Platform ids of people currently in the conversation.
 */
export function rankMemories(
  records: MemoryRecord[],
  similarity: (record: MemoryRecord) => number,
  presentIds: Set<string>,
  now: number,
  config: DecayConfig = DEFAULT_DECAY
): ScoredMemory[] {
  return records
    .map((record) => {
      const decay = decayFactor(record, now, config);
      const boosted = involvesAnyone(record, presentIds);
      const score = similarity(record) * decay * (boosted ? config.participantBoost : 1);
      return { record, score, decay, boosted };
    })
    .filter((s) => s.score >= config.floor)
    .sort((a, b) => b.score - a.score);
}

/** Everything known about one person, most relevant first. */
export function recallForPerson(
  records: MemoryRecord[],
  personId: string,
  now: number,
  limit = 5,
  config: DecayConfig = DEFAULT_DECAY
): ScoredMemory[] {
  const theirs = records.filter((r) => r.participants.some((p) => p.id === personId));
  return rankMemories(theirs, () => 1, new Set([personId]), now, config).slice(0, limit);
}

/**
 * Persistence contract. Deliberately tiny so the store can be a file today and
 * a pgvector table later without touching callers.
 */
export interface SocialMemoryStore {
  add(record: MemoryRecord): Promise<void>;
  all(roomId: string): Promise<MemoryRecord[]>;
  /** Remove one record. Quotes are attributed, so removal must be possible. */
  remove(id: string): Promise<boolean>;
  /** Remove everything attributed to a person, for opt-out requests. */
  forgetPerson(personId: string): Promise<number>;
}

export class InMemorySocialStore implements SocialMemoryStore {
  private records: MemoryRecord[] = [];

  async add(record: MemoryRecord): Promise<void> {
    this.records.push(record);
  }

  async all(roomId: string): Promise<MemoryRecord[]> {
    return this.records.filter((r) => r.roomId === roomId);
  }

  async remove(id: string): Promise<boolean> {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    return this.records.length < before;
  }

  async forgetPerson(personId: string): Promise<number> {
    const before = this.records.length;
    // Drop records the person authored or is the subject of. Records where they
    // merely reacted survive with the reference stripped.
    this.records = this.records.filter(
      (r) => !r.participants.some((p) => p.id === personId && p.role !== 'reactor')
    );
    for (const r of this.records) {
      r.participants = r.participants.filter((p) => p.id !== personId);
    }
    return before - this.records.length;
  }
}

/**
 * How often the bot may reference an old memory, per room.
 *
 * A bot that constantly quotes what you said six weeks ago is unsettling rather
 * than warm, so callbacks are rate-limited the same way the /fr gap-prompt is.
 */
export class CallbackLimiter {
  private lastAt = new Map<string, number>();

  constructor(private minGapMs = 30 * 60 * 1000) {}

  allowed(roomId: string, now: number): boolean {
    const last = this.lastAt.get(roomId);
    return last === undefined || now - last >= this.minGapMs;
  }

  record(roomId: string, now: number): void {
    this.lastAt.set(roomId, now);
  }
}

/** Render a record for inclusion in a prompt. */
export function formatForPrompt(scored: ScoredMemory): string {
  const { record } = scored;
  const who = record.participants
    .filter((p) => p.role !== 'reactor')
    .map((p) => p.name)
    .join(', ');
  const when = new Date(record.at).toISOString().slice(0, 10);
  const subject = record.cards?.length ? ` [${record.cards.join(', ')}]` : '';
  return `- (${record.kind}, ${when}${who ? `, ${who}` : ''})${subject} ${record.summary}`;
}

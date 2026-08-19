/**
 * Community vouching for third-party lore.
 *
 * The artist gate alone is too tight: credited artist names match a Telegram
 * handle for roughly a fifth of the roster, so most genuine contributors were
 * being turned away. Vouching restores the open path without restoring the open
 * door - a non-artist may propose lore, and the community decides.
 *
 *   artist or admin  -> stored immediately, as before
 *   anyone else      -> proposed, needs VOUCHES_REQUIRED vouches to land
 *
 * What makes this safe rather than theatre:
 *
 *  - Quality and card gates still run BEFORE a proposal is created. Vouching
 *    decides whether a plausible claim is true, not whether junk is junk;
 *    without this the room gets asked to adjudicate spam.
 *  - Vouchers need standing that predates the proposal (utils/participants.ts),
 *    so an account created to rubber-stamp cannot.
 *  - A proposal is a broadcast to the whole room, so it is itself an
 *    amplification vector: one open proposal per person, a few per card.
 *  - The credited artist's vouch is decisive. They are the authority on their
 *    own card, and requiring them to find a second voucher is absurd.
 *  - Proposals expire. An unanswered proposal is a "no".
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface Vouch {
  userId: string;
  name?: string;
  at: number;
}

export interface Proposal {
  id: string;
  card: string;
  lore: string;
  proposerId: string;
  proposerName?: string;
  roomId: string;
  createdAt: number;
  vouches: Vouch[];
}

export interface VouchConfig {
  required: number;
  expiryMs: number;
  /** Open proposals one person may have at once. */
  maxOpenPerUser: number;
  /** Open proposals one card may have at once. */
  maxOpenPerCard: number;
}

export const DEFAULT_VOUCH_CONFIG: VouchConfig = {
  required: 2,
  expiryMs: 24 * 60 * 60 * 1000,
  maxOpenPerUser: 1,
  maxOpenPerCard: 3,
};

/* ---------------------------------------------------------------- storage */

function storePath(): string {
  return process.env.PROPOSALS_PATH || join(process.cwd(), 'src', 'data', 'lore-proposals.json');
}

let cache: Proposal[] | null = null;

function read(): Proposal[] {
  if (cache) return cache;
  const path = storePath();
  try {
    cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(next: Proposal[]): void {
  cache = next;
  const path = storePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  renameSync(tmp, path);
}

/* ------------------------------------------------------------------ ids */

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

/**
 * Short, typeable proposal id derived from content and time.
 *
 * Deterministic rather than random: workflow replays and tests need stable
 * ids, and a collision only matters among *open* proposals, which is a handful.
 */
export function proposalId(card: string, lore: string, at: number): string {
  let hash = 2166136261;
  for (const ch of `${card}|${lore}|${at}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ID_ALPHABET[hash % ID_ALPHABET.length];
    hash = Math.floor(hash / ID_ALPHABET.length);
  }
  return out;
}

/* -------------------------------------------------------------- lifecycle */

export function openProposals(now: number = Date.now(), config = DEFAULT_VOUCH_CONFIG): Proposal[] {
  return read().filter((p) => now - p.createdAt < config.expiryMs);
}

/** Drop expired proposals from storage. */
export function pruneExpired(now: number = Date.now(), config = DEFAULT_VOUCH_CONFIG): number {
  const all = read();
  const live = all.filter((p) => now - p.createdAt < config.expiryMs);
  if (live.length !== all.length) write(live);
  return all.length - live.length;
}

export type ProposeRefusal = 'too_many_open' | 'card_busy' | 'duplicate_open';

export interface ProposeResult {
  ok: boolean;
  proposal?: Proposal;
  refusal?: ProposeRefusal;
  message?: string;
}

export function propose(
  input: { card: string; lore: string; proposerId: string; proposerName?: string; roomId: string },
  now: number = Date.now(),
  config = DEFAULT_VOUCH_CONFIG
): ProposeResult {
  pruneExpired(now, config);
  const open = openProposals(now, config);

  if (open.some((p) => p.proposerId === input.proposerId && p.card === input.card && p.lore === input.lore)) {
    return { ok: false, refusal: 'duplicate_open', message: 'That one is already up for vouching.' };
  }
  if (open.filter((p) => p.proposerId === input.proposerId).length >= config.maxOpenPerUser) {
    return {
      ok: false,
      refusal: 'too_many_open',
      message: 'You already have lore waiting on vouches — let that one land first.',
    };
  }
  if (open.filter((p) => p.card === input.card).length >= config.maxOpenPerCard) {
    return {
      ok: false,
      refusal: 'card_busy',
      message: `${input.card} already has proposals waiting. Give those a chance first.`,
    };
  }

  const proposal: Proposal = {
    id: proposalId(input.card, input.lore, now),
    card: input.card.toUpperCase(),
    lore: input.lore,
    proposerId: input.proposerId,
    proposerName: input.proposerName,
    roomId: input.roomId,
    createdAt: now,
    vouches: [],
  };
  write([...read(), proposal]);
  return { ok: true, proposal };
}

export function findProposal(id: string, now: number = Date.now(), config = DEFAULT_VOUCH_CONFIG) {
  return openProposals(now, config).find((p) => p.id.toUpperCase() === id.toUpperCase());
}

export type VouchRefusal =
  | 'unknown_proposal'
  | 'own_proposal'
  | 'already_vouched'
  | 'no_standing';

export interface VouchResult {
  ok: boolean;
  refusal?: VouchRefusal;
  message?: string;
  /** True when this vouch met the threshold and the lore should be stored. */
  approved?: boolean;
  proposal?: Proposal;
  remaining?: number;
}

/**
 * Record a vouch.
 *
 * `decisive` is for the credited artist and for admins: their word alone
 * settles it.
 */
export function vouch(
  input: {
    proposalId: string;
    userId: string;
    name?: string;
    hasStanding: boolean;
    decisive?: boolean;
  },
  now: number = Date.now(),
  config = DEFAULT_VOUCH_CONFIG
): VouchResult {
  const proposal = findProposal(input.proposalId, now, config);
  if (!proposal) {
    return { ok: false, refusal: 'unknown_proposal', message: 'No open proposal with that code.' };
  }
  if (proposal.proposerId === input.userId) {
    return { ok: false, refusal: 'own_proposal', message: 'You can’t vouch for your own lore.' };
  }
  if (proposal.vouches.some((v) => v.userId === input.userId)) {
    return { ok: false, refusal: 'already_vouched', message: 'You’ve already vouched for that one.' };
  }
  if (!input.decisive && !input.hasStanding) {
    return {
      ok: false,
      refusal: 'no_standing',
      message: 'You need a bit more history here before you can vouch.',
    };
  }

  proposal.vouches.push({ userId: input.userId, name: input.name, at: now });
  const approved = input.decisive || proposal.vouches.length >= config.required;

  const all = read();
  write(approved ? all.filter((p) => p.id !== proposal.id) : all.map((p) => (p.id === proposal.id ? proposal : p)));

  return {
    ok: true,
    approved,
    proposal,
    remaining: Math.max(0, config.required - proposal.vouches.length),
  };
}

/** Remove a proposal outright. For an admin reject. */
export function dropProposal(id: string): Proposal | undefined {
  const all = read();
  const found = all.find((p) => p.id.toUpperCase() === id.toUpperCase());
  if (found) write(all.filter((p) => p !== found));
  return found;
}

/** Testing seam. */
export function _resetCache(): void {
  cache = null;
}

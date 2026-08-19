/**
 * Vouching tests.
 *
 * The threat model is the one that actually turned up on 2026-08-19: an
 * automated account pushing false lore. A vouch threshold is only worth having
 * if it survives that account bringing friends, so the sockpuppet cases below
 * are the point of the file, not an extra.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

process.env.PROPOSALS_PATH = join(tmpdir(), `proposals-test-${process.pid}.json`);
process.env.PARTICIPANTS_PATH = join(tmpdir(), `participants-test-${process.pid}.json`);

import {
  propose,
  vouch,
  findProposal,
  openProposals,
  pruneExpired,
  dropProposal,
  proposalId,
  DEFAULT_VOUCH_CONFIG,
  _resetCache as _resetProposals,
} from '../../utils/vouching';
import {
  noteParticipant,
  hasStanding,
  flushParticipants,
  _resetCache as _resetParticipants,
  DEFAULT_STANDING,
} from '../../utils/participants';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const base = { card: 'FREEDOMKEK', lore: 'drawn the week fees spiked', roomId: 'room1' };

beforeEach(() => {
  rmSync(process.env.PROPOSALS_PATH!, { force: true });
  rmSync(process.env.PARTICIPANTS_PATH!, { force: true });
  _resetProposals();
  _resetParticipants();
});

/** Give someone enough history to be allowed to vouch. */
function establish(id: string, firstSeen: number) {
  for (let i = 0; i < DEFAULT_STANDING.minMessages; i++) {
    noteParticipant(id, id, firstSeen + i);
  }
  flushParticipants();
}

describe('proposing', () => {
  it('creates an open proposal', () => {
    const r = propose({ ...base, proposerId: 'bob' }, T);
    expect(r.ok).toBe(true);
    expect(openProposals(T)).toHaveLength(1);
    expect(findProposal(r.proposal!.id, T)).toBeDefined();
  });

  it('allows only one open proposal per person — a proposal is a broadcast', () => {
    propose({ ...base, proposerId: 'bob' }, T);
    const second = propose({ ...base, lore: 'a different story entirely', proposerId: 'bob' }, T);
    expect(second.ok).toBe(false);
    expect(second.refusal).toBe('too_many_open');
  });

  it('caps how many proposals one card can be carrying', () => {
    for (let i = 0; i < DEFAULT_VOUCH_CONFIG.maxOpenPerCard; i++) {
      propose({ ...base, lore: `story number ${i}`, proposerId: `user${i}` }, T);
    }
    const extra = propose({ ...base, lore: 'one too many', proposerId: 'latecomer' }, T);
    expect(extra.ok).toBe(false);
    expect(extra.refusal).toBe('card_busy');
  });

  it('expires unanswered proposals', () => {
    propose({ ...base, proposerId: 'bob' }, T);
    expect(openProposals(T + DEFAULT_VOUCH_CONFIG.expiryMs + 1)).toHaveLength(0);
    expect(pruneExpired(T + DEFAULT_VOUCH_CONFIG.expiryMs + 1)).toBe(1);
  });

  it('gives typeable ids with no lookalike characters', () => {
    const id = proposalId('FREEDOMKEK', 'some lore', T);
    expect(id).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });
});

describe('vouching', () => {
  const openOne = () => propose({ ...base, proposerId: 'bob' }, T).proposal!;

  it('stores after the required number of vouches', () => {
    const p = openOne();
    establish('alice', T - 10 * DAY);
    establish('carol', T - 10 * DAY);

    const first = vouch({ proposalId: p.id, userId: 'alice', hasStanding: hasStanding('alice', p.createdAt, T) }, T);
    expect(first.ok).toBe(true);
    expect(first.approved).toBe(false);
    expect(first.remaining).toBe(1);

    const second = vouch({ proposalId: p.id, userId: 'carol', hasStanding: hasStanding('carol', p.createdAt, T) }, T);
    expect(second.approved).toBe(true);
    // Approved proposals leave the open list.
    expect(openProposals(T)).toHaveLength(0);
  });

  it('lets the credited artist settle it alone', () => {
    const p = openOne();
    const r = vouch({ proposalId: p.id, userId: 'scrilla', hasStanding: false, decisive: true }, T);
    expect(r.approved).toBe(true);
  });

  it('refuses a proposer vouching for themselves', () => {
    const p = openOne();
    const r = vouch({ proposalId: p.id, userId: 'bob', hasStanding: true }, T);
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('own_proposal');
  });

  it('refuses the same person vouching twice', () => {
    const p = openOne();
    establish('alice', T - 10 * DAY);
    vouch({ proposalId: p.id, userId: 'alice', hasStanding: true }, T);
    const again = vouch({ proposalId: p.id, userId: 'alice', hasStanding: true }, T);
    expect(again.ok).toBe(false);
    expect(again.refusal).toBe('already_vouched');
  });

  it('refuses an unknown code', () => {
    expect(vouch({ proposalId: 'ZZZZ', userId: 'alice', hasStanding: true }, T).refusal).toBe('unknown_proposal');
  });

  it('lets an admin drop a proposal', () => {
    const p = openOne();
    expect(dropProposal(p.id)?.id).toBe(p.id);
    expect(openProposals(T)).toHaveLength(0);
  });
});

describe('sockpuppet resistance', () => {
  it('refuses an account created after the proposal', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    // The attacker spins up an account once the proposal is up and talks a lot.
    establish('puppet', T + 60_000);
    expect(hasStanding('puppet', p.createdAt, T + 2 * DAY)).toBe(false);
  });

  it('refuses an account with no history at all', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    expect(hasStanding('ghost', p.createdAt, T)).toBe(false);
  });

  it('refuses a long-lived account that has barely spoken', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    noteParticipant('lurker', 'lurker', T - 30 * DAY);
    flushParticipants();
    expect(hasStanding('lurker', p.createdAt, T)).toBe(false);
  });

  it('refuses an account that is old enough but only started talking today', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    establish('fresh', T - 60 * 60 * 1000); // an hour old
    expect(hasStanding('fresh', p.createdAt, T)).toBe(false);
  });

  it('accepts an established member', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    establish('regular', T - 30 * DAY);
    expect(hasStanding('regular', p.createdAt, T)).toBe(true);
  });

  it('a puppet ring cannot approve its own lore', () => {
    const p = propose({ ...base, proposerId: 'bob' }, T).proposal!;
    for (const puppet of ['p1', 'p2', 'p3']) establish(puppet, T + 1000);

    // Inside the expiry window, so the refusal is standing rather than expiry.
    const at = T + 60_000;
    const results = ['p1', 'p2', 'p3'].map((id) =>
      vouch({ proposalId: p.id, userId: id, hasStanding: hasStanding(id, p.createdAt, at) }, at)
    );
    expect(results.every((r) => r.refusal === 'no_standing')).toBe(true);
    expect(openProposals(at)).toHaveLength(1);
  });
});

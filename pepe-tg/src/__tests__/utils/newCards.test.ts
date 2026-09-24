/**
 * New-card announcements: a first boot records everything and says nothing;
 * afterwards only cards the state has not seen are new, retired ones never;
 * the caption is plain text with the directory page.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CardInfo } from '../../data/fullCardIndex';
import { announcementFor, newCardsSince, readNewCardState, seedState, writeNewCardState } from '../../utils/newCards';

const card = (over: Partial<CardInfo>): CardInfo =>
  ({ asset: 'X', series: 18, card: 32, ext: 'gif', artist: 'A', artistSlug: 'a', supply: 10, ...over }) as CardInfo;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('new cards', () => {
  it('seeds with every card in the index, so the first boot announces nothing', () => {
    const index = [card({ asset: 'a' }), card({ asset: 'B' })];
    const state = seedState(index, new Date('2026-09-24T12:00:00Z'));
    expect(state.known).toEqual(['A', 'B']);
    expect(state.seededAt).toBe('2026-09-24T12:00:00.000Z');
    expect(newCardsSince(state, index)).toEqual([]);
  });

  it('a card the state has not seen is new; retired ones are not; oldest slot first', () => {
    const state = seedState([card({ asset: 'OLD' })]);
    const index = [
      card({ asset: 'OLD' }),
      card({ asset: 'LATER', series: 19, card: 1 }),
      card({ asset: 'GONE', retired: true } as any),
      card({ asset: 'SOONER', series: 18, card: 43 }),
    ];
    expect(newCardsSince(state, index).map((c) => c.asset)).toEqual(['SOONER', 'LATER']);
  });

  it('state survives a round trip through the file, and a missing or broken file reads as null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'newcards-'));
    dirs.push(dir);
    const path = join(dir, 'state.json');
    expect(readNewCardState(path)).toBeNull();
    const state = seedState([card({ asset: 'A' })]);
    state.announced.B = '2026-09-24T13:00:00.000Z';
    writeNewCardState(state, path);
    expect(readNewCardState(path)).toEqual(state);
  });

  it('the caption names the card, the artist, the slot, the issuance and the directory page', () => {
    const c = card({ asset: 'CAKERARE', series: 18, card: 42, artist: 'Aquatic', issuanceCount: 77, supply: 70 } as any);
    expect(announcementFor(c)).toBe(
      '🆕 New fake just landed: CAKERARE by Aquatic\nSeries 18, Card 42 · 77 issued\nhttps://fakeraredirectory.com/series/18/42\n/f CAKERARE to see it again',
    );
    expect(announcementFor(card({ asset: 'NOART', artist: null as any, supply: null as any }))).toContain('landed: NOART\nSeries 18, Card 32\n');
  });
});

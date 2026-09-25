/**
 * The spotlight learns artists' Telegram handles from the admins: a bare
 * @handle, from an admin, as a reply to a spotlight post or just after one.
 * Nothing else teaches it - not a guess, not an X handle, not a non-admin.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LEARN_WINDOW_MS, bareHandle, handleLesson, learnedHandleFor, recordArtistTelegram } from '../../utils/artistTelegram';
import { composeCaption } from '../../utils/artistSpotlight';

const now = Date.parse('2026-09-25T15:38:00Z');
const spotlight = { artist: 'Gus Grillasca', day: '2026-09-25', lastPostAt: Date.parse('2026-09-25T15:07:19Z') };

describe('bare handles', () => {
  it('a Telegram username and nothing else', () => {
    expect(bareHandle(' @GusGrillasca ')).toBe('@GusGrillasca');
    for (const t of ['@gus', '@GusGrillasca nice', 'GusGrillasca', 'hey @GusGrillasca', '@Gus-Grillasca']) expect(bareHandle(t)).toBeNull();
  });
});

describe('what counts as a lesson', () => {
  it("rabbidfly's own message: a bare @ thirty minutes after the post teaches today's artist", () => {
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', spotlight, now })).toEqual({ artist: 'Gus Grillasca', handle: '@GusGrillasca' });
  });
  it('a reply to a spotlight post teaches at any hour of that day', () => {
    const later = spotlight.lastPostAt + LEARN_WINDOW_MS + 60 * 60_000;
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', spotlight, now: later })).toBeNull();
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', repliedToBotText: "🔦 Today's artist spotlight: Gus Grillasca", spotlight, now: later })).toEqual({ artist: 'Gus Grillasca', handle: '@GusGrillasca' });
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', repliedToBotText: 'gm', spotlight, now: later })).toBeNull();
  });
  it('never from a non-admin, never words, never on another day, never without a spotlight', () => {
    expect(handleLesson({ isAdmin: false, text: '@GusGrillasca', spotlight, now })).toBeNull();
    expect(handleLesson({ isAdmin: true, text: 'that is @GusGrillasca', spotlight, now })).toBeNull();
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', spotlight: { ...spotlight, day: '2026-09-24' }, now })).toBeNull();
    expect(handleLesson({ isAdmin: true, text: '@GusGrillasca', spotlight: {}, now })).toBeNull();
  });
});

describe('the store and the caption', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'artist-tg-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('remembers by artist name, case-insensitively, and the caption tags them', () => {
    const path = join(dir, 'artist-telegram.json');
    expect(learnedHandleFor('Gus Grillasca', path)).toBeNull();
    recordArtistTelegram('Gus Grillasca', '@GusGrillasca', '1013723568', now, path);
    expect(learnedHandleFor('gus grillasca', path)).toBe('@GusGrillasca');
    const caption = composeCaption({ artist: 'Gus Grillasca', card: { asset: 'ZOMBIEPPS', series: 18, card: 36 }, index: 1, total: 3, haiku: null, telegramHandle: learnedHandleFor('Gus Grillasca', path), xHandle: null, prod: false, prodUntil: '2026-10-22' });
    expect(caption.split('\n')[0]).toBe('🔦 Gus Grillasca (@GusGrillasca), 2 of 3');
  });
});

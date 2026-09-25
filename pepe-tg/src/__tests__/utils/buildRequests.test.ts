/**
 * /fb, the fake backlog: tickets numbered KEK-001, titled, three a day
 * each; /fb alone is the top ten, one row each; admins move tickets; the
 * digest gets the ones opened in its window. /pb was a typo and is gone.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  PER_PERSON_PER_DAY, USAGE, fallbackTitle, parseBuildRequest, readTickets, renderBacklog, runBuildRequest, setTicketStatus, ticketId, ticketsBetween, ticketsInTrailerValues,
} from '../../utils/buildRequests';

let dir: string;
let path: string;
const savedAdmins = process.env.TELEGRAM_ADMIN_IDS;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fb-'));
  path = join(dir, 'build-requests.jsonl');
  process.env.TELEGRAM_ADMIN_IDS = '1013723568';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedAdmins === undefined) delete process.env.TELEGRAM_ADMIN_IDS; else process.env.TELEGRAM_ADMIN_IDS = savedAdmins;
});

const me = { id: '424242', name: 'Le Hues', username: 'lehues' };
const admin = { id: '1013723568', name: 'rabbidfly' };
const SPOTLIGHT = 'pick a random artist spotlight each day - every few hours show a card of theirs - tag them - write a fake haiku';

describe('/fb', () => {
  it('parses every form; /pb was a typo and is not one of them', () => {
    expect(parseBuildRequest('/fb')).toEqual({ kind: 'list' });
    expect(parseBuildRequest('/fb list')).toEqual({ kind: 'list' });
    expect(parseBuildRequest('/pb list')).toBeNull();
    expect(parseBuildRequest('/fb KEK-1')).toEqual({ kind: 'show', id: 'KEK-001' });
    // Status typed after an id is ignored: tickets move with the work.
    expect(parseBuildRequest('/fb kek-007 shipped')).toEqual({ kind: 'show', id: 'KEK-007' });
    expect(parseBuildRequest('/fb@pepedawn_bot  show the floor\n price')).toEqual({ kind: 'submit', text: 'show the floor price' });
    expect(parseBuildRequest('/fbx')).toBeNull();
    expect(ticketId(1)).toBe('KEK-001');
    expect(ticketId(1234)).toBe('KEK-1234');
  });

  it('opens a ticket with a model title, or the first words without one', async () => {
    const titled = await runBuildRequest({ text: `/fb ${SPOTLIGHT}`, sender: admin, chatId: '-100', now: 1_000_000, path, titleFor: async () => 'Daily artist spotlight with haiku' });
    expect(titled).toMatch(/^🎫 KEK-001 · Daily artist spotlight with haiku · ◻️ open\n/);
    expect(titled).toContain('/fb shows where it stands');
    const bare = await runBuildRequest({ text: '/fb show the floor price in /f replies please', sender: me, now: 1_000_001, path });
    expect(bare).toMatch(/^🎫 KEK-002 · show the floor price in \/f · ◻️ open/);
    const failing = await runBuildRequest({ text: '/fb another one with enough words', sender: me, now: 1_000_002, path, titleFor: async () => { throw new Error('no model'); } });
    expect(failing).toMatch(/^🎫 KEK-003 · another one with enough words/);
    expect(readTickets(path).map((t) => [t.id, t.status])).toEqual([['KEK-001', 'open'], ['KEK-002', 'open'], ['KEK-003', 'open']]);
    expect(fallbackTitle('a b c d e f g h')).toBe('a b c d e f');
  });

  it('wants more than a grunt, less than a design doc, and three a day each', async () => {
    expect(await runBuildRequest({ text: '/fb fix it', sender: me, path })).toMatch(/bit more than that/);
    expect(await runBuildRequest({ text: `/fb ${'x'.repeat(601)}`, sender: me, path })).toMatch(/design doc/);
    for (let i = 0; i < PER_PERSON_PER_DAY; i++) expect(await runBuildRequest({ text: `/fb request number ${i} with detail`, sender: me, now: 1_000_000 + i, path })).toMatch(/^🎫 KEK-/);
    expect(await runBuildRequest({ text: '/fb one more with detail', sender: me, now: 1_000_010, path })).toMatch(/in today already/);
    expect(await runBuildRequest({ text: '/fb one more with detail', sender: me, now: 1_000_000 + 25 * 3_600_000, path })).toMatch(/^🎫 KEK-004/);
    expect(await runBuildRequest({ text: '/fb admin request with detail', sender: admin, now: 2_000_000, path })).toMatch(/^🎫 KEK-005/);
  });

  it('/fb alone is the top ten, one row each, working tickets first', async () => {
    expect(await runBuildRequest({ text: '/fb', sender: me, path })).toMatch(/backlog is empty/);
    for (let i = 1; i <= 12; i++) await runBuildRequest({ text: `/fb ticket number ${i} with enough words`, sender: admin, now: 1_000_000 + i, path });
    expect(setTicketStatus('KEK-003', 'building', 'maintainer', path, 2_000_000)?.status).toBe('building');
    expect(setTicketStatus('KEK-001', 'shipped', 'deploy', path, 2_000_001)?.status).toBe('shipped');
    expect(setTicketStatus('KEK-099', 'shipped', 'deploy', path)).toBeNull();
    const list = (await runBuildRequest({ text: '/fb', sender: me, path }))!;
    const rows = list.split('\n');
    expect(rows[0]).toBe('🎫 Fake backlog - 11 open of 12, top 10');
    expect(rows).toHaveLength(11);
    expect(rows[1]).toBe('KEK-003 · ticket number 3 with enough words · 🔨 building');
    expect(rows[2]).toMatch(/^KEK-012 · .* · ◻️ open$/);
    expect(list).not.toContain('KEK-001'); // shipped sorts last and falls off the ten
    expect(renderBacklog(readTickets(path)).split('\n')[1]).toContain('KEK-003');
  });

  it('shows one ticket, with the asker only to admins; nobody moves a ticket from chat', async () => {
    await runBuildRequest({ text: `/fb ${SPOTLIGHT}`, sender: me, now: 1_000_000, path });
    expect(await runBuildRequest({ text: '/fb KEK-001', sender: me, path })).toBe(`🎫 KEK-001 · pick a random artist spotlight each · ◻️ open\n${SPOTLIGHT}`);
    expect(await runBuildRequest({ text: '/fb KEK-001', sender: admin, path })).toContain('◻️ open - Le Hues');
    expect(await runBuildRequest({ text: '/fb KEK-009', sender: me, path })).toBe('KEK-009 is not on the backlog.');
    expect(await runBuildRequest({ text: '/fb KEK-001 shipped', sender: admin, path })).toMatch(/^🎫 KEK-001 .* ◻️ open/);
    expect(readTickets(path)[0].status).toBe('open');
    expect(USAGE).toContain('/fb');
  });

  it('shipped comes only from real trailers, as git prints their values - not from prose that mentions a ticket', () => {
    // What `git log --format=%(trailers:key=Ticket,valueonly)` prints: one value per line, blank for commits without one.
    expect(ticketsInTrailerValues('KEK-001\n\n\nkek-7\n\nKEK-001\n')).toEqual(['KEK-001', 'KEK-007']);
    expect(ticketsInTrailerValues('')).toEqual([]);
    // The line that fooled the first version was a wrapped sentence in a
    // commit body; git does not print it as a trailer, and even fed in raw
    // it is not a bare id.
    expect(ticketsInTrailerValues('ticket: KEK-001, a short title from one small model call, a status. /fb')).toEqual([]);
  });

  it('hands the digest the tickets opened in its window, with titles and status', async () => {
    await runBuildRequest({ text: '/fb an early one with detail', sender: me, now: 1_000, path });
    await runBuildRequest({ text: '/fb a later one with detail', sender: me, now: 5_000, path });
    expect(ticketsBetween(2_000, 6_000, path).map((r) => [r.id, r.title, r.status])).toEqual([['KEK-002', 'a later one with detail', 'open']]);
  });
});

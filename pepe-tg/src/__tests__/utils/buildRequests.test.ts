/**
 * /pb: the room's build requests, logged and numbered, three a day each,
 * listed on request, and handed to the maintainer digest by window.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PER_PERSON_PER_DAY, USAGE, buildRequestsBetween, parseBuildRequest, readBuildRequests, runBuildRequest } from '../../utils/buildRequests';

let dir: string;
let path: string;
const savedAdmins = process.env.TELEGRAM_ADMIN_IDS;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pb-'));
  path = join(dir, 'build-requests.jsonl');
  process.env.TELEGRAM_ADMIN_IDS = '1013723568';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (savedAdmins === undefined) delete process.env.TELEGRAM_ADMIN_IDS; else process.env.TELEGRAM_ADMIN_IDS = savedAdmins;
});

const me = { id: '424242', name: 'Le Hues', username: 'lehues' };

describe('/pb', () => {
  it('parses the three forms and nothing else', () => {
    expect(parseBuildRequest('/pb')).toEqual({ kind: 'usage' });
    expect(parseBuildRequest('/pb@pepedawn_bot list')).toEqual({ kind: 'list' });
    expect(parseBuildRequest('/pb  show the floor price\n in /f')).toEqual({ kind: 'submit', text: 'show the floor price in /f' });
    expect(parseBuildRequest('/pbx')).toBeNull();
    expect(parseBuildRequest('pb please')).toBeNull();
  });

  it('logs a request, numbered, and says who sees it', () => {
    const reply = runBuildRequest({ text: '/pb show the floor price in /f replies', sender: me, chatId: '-100', now: 1_000_000, path });
    expect(reply).toMatch(/^📬 Logged as #1: "show the floor price in \/f replies"/);
    expect(reply).toContain('PR for him to review');
    const all = readBuildRequests(path);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 1, at: 1_000_000, chatId: '-100', sender: me, text: 'show the floor price in /f replies', status: 'open' });
    expect(runBuildRequest({ text: '/pb and a second one please', sender: me, now: 1_000_001, path })).toMatch(/^📬 Logged as #2/);
  });

  it('wants more than a grunt, and less than a design doc', () => {
    expect(runBuildRequest({ text: '/pb fix it', sender: me, path })).toMatch(/bit more than that/);
    expect(runBuildRequest({ text: `/pb ${'x'.repeat(601)}`, sender: me, path })).toMatch(/design doc/);
    expect(readBuildRequests(path)).toHaveLength(0);
  });

  it('three a day each; admins are not capped', () => {
    for (let i = 0; i < PER_PERSON_PER_DAY; i++) expect(runBuildRequest({ text: `/pb request number ${i} with detail`, sender: me, now: 1_000_000 + i, path })).toMatch(/Logged/);
    expect(runBuildRequest({ text: '/pb one more with detail', sender: me, now: 1_000_010, path })).toMatch(/in today already/);
    expect(runBuildRequest({ text: '/pb one more with detail', sender: me, now: 1_000_000 + 25 * 3_600_000, path })).toMatch(/Logged as #4/);
    const admin = { id: '1013723568', name: 'rabbidfly' };
    for (let i = 0; i < 5; i++) expect(runBuildRequest({ text: `/pb admin request ${i} with detail`, sender: admin, now: 2_000_000 + i, path })).toMatch(/Logged/);
  });

  it('lists the latest, with names only for admins, and shows usage bare', () => {
    expect(runBuildRequest({ text: '/pb', sender: me, path })).toBe(USAGE);
    expect(runBuildRequest({ text: '/pb list', sender: me, path })).toMatch(/No build requests yet/);
    runBuildRequest({ text: '/pb show the floor price in /f replies', sender: me, now: 1_000_000, path });
    expect(runBuildRequest({ text: '/pb list', sender: me, path })).toBe('🛠 Build requests (1 logged, latest first)\n#1 show the floor price in /f replies');
    expect(runBuildRequest({ text: '/pb list', sender: { id: '1013723568' }, path })).toContain('#1 Le Hues: show the floor price');
  });

  it('hands the digest the requests in its window', () => {
    runBuildRequest({ text: '/pb an early one with detail', sender: me, now: 1_000, path });
    runBuildRequest({ text: '/pb a later one with detail', sender: me, now: 5_000, path });
    expect(buildRequestsBetween(2_000, 6_000, path).map((r) => r.id)).toEqual([2]);
  });
});

/**
 * Staying out of other people's conversations, and the upgrade note.
 *
 * The transcript these are written from, 21 September in the official channel:
 *
 *   Crypsi        what coit burning?
 *   coit          xrypsi bro
 *   coit          there's no place to 1000x long for real right ?
 *   PEPEDAWN      Right - there's no factual basis here for a "1000x long"...
 *   ...
 *   coit          is this all fakes ?
 *   PEPEDAWN      FAKESNEAKER fits because it's from the Fake Rares collection...
 *   coit          pepedwwn sometimes you disrupt tthe xonversatiosn
 *   coit          please upgrade your braij so you dont awnser a question
 *                 directed at someone else ok?
 *
 * Neither message named the bot, and every per-message rule passed.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import { DEFAULT_STAY_OUT_MS, othersMidConversation, stayOutWindowMs } from '../../conversation/cadenceGovernor';
import type { ConversationTurn } from '../../conversation/types';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';
import { currentVersion, isNewerVersion, whatsNewFor } from '../../utils/whatsNew';
import { noteDue, readReleaseState, writeReleaseState } from '../../services/ReleaseNoteService';

const MIN = 60_000;
const NOW = Date.UTC(2026, 8, 21, 12, 45);

const COIT = '1488783632';
const CRYPSI = '777222';

const turn = (over: Partial<ConversationTurn> = {}): ConversationTurn => ({
  role: 'user',
  text: 'a line of ordinary chat in the room',
  at: NOW - 30_000,
  ...over,
});

describe('is someone else mid-conversation', () => {
  it('yes when another person spoke moments ago', () => {
    const turns = [
      turn({ authorId: CRYPSI, author: 'Crypsi', text: 'what coit burning?', at: NOW - 43 * 1000 }),
      turn({ authorId: COIT, author: 'coit', text: 'xrypsi bro', at: NOW - 13 * 1000 }),
      turn({ authorId: COIT, author: 'coit', text: "there's no place to 1000x long for real right ?", at: NOW }),
    ];
    expect(othersMidConversation(turns, { id: COIT }, NOW)).toBe(true);
  });

  it('no when only the speaker and the bot are in the window', () => {
    const turns = [
      turn({ authorId: COIT, author: 'coit', text: 'anyone seen FREEDOMKEK', at: NOW - 40 * 1000 }),
      turn({ role: 'bot', author: 'PEPEDAWN', text: 'supply 298.', at: NOW - 35 * 1000, authorId: undefined }),
      turn({ authorId: COIT, author: 'coit', text: 'and who made it', at: NOW }),
    ];
    expect(othersMidConversation(turns, { id: COIT }, NOW)).toBe(false);
  });

  it('no once the other person has gone quiet', () => {
    const turns = [
      turn({ authorId: CRYPSI, author: 'Crypsi', at: NOW - 10 * MIN }),
      turn({ authorId: COIT, author: 'coit', at: NOW }),
    ];
    expect(othersMidConversation(turns, { id: COIT }, NOW)).toBe(false);
  });

  it('falls open when identity cannot be established', () => {
    // Turns logged before 5.10.0 carry no id. Unattributed chatter must never
    // be enough to silence the bot, or a week-old log would mute it.
    const turns = [turn({ author: undefined, authorId: undefined })];
    expect(othersMidConversation(turns, { id: COIT }, NOW)).toBe(false);
    expect(othersMidConversation([turn({ author: 'Crypsi' })], { id: COIT }, NOW)).toBe(false);
    expect(othersMidConversation([turn({ author: 'Crypsi' })], { name: 'coit' }, NOW)).toBe(true);
  });

  it('is switched off by STAY_OUT_SECONDS=0', () => {
    const turns = [turn({ authorId: CRYPSI, author: 'Crypsi' })];
    expect(othersMidConversation(turns, { id: COIT }, NOW, 0)).toBe(false);
    const saved = process.env.STAY_OUT_SECONDS;
    process.env.STAY_OUT_SECONDS = '0';
    expect(stayOutWindowMs()).toBe(0);
    process.env.STAY_OUT_SECONDS = '30';
    expect(stayOutWindowMs()).toBe(30_000);
    delete process.env.STAY_OUT_SECONDS;
    expect(stayOutWindowMs()).toBe(DEFAULT_STAY_OUT_MS);
    if (saved !== undefined) process.env.STAY_OUT_SECONDS = saved;
  });
});

describe('the router in a room where two others are talking', () => {
  let dir: string;
  const savedShadowDir = process.env.V5_SHADOW_DIR;

  function router() {
    const replies: string[] = [];
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
      const isClassifier = String(options.prompt).includes('Return STRICT JSON');
      if (!isClassifier) replies.push(String(options.prompt));
      return {
        text: isClassifier ? '{"intent":"FACTS","command":""}' : 'a reply nobody asked for',
        tokensIn: 1, tokensOut: 1, model: 'test', cost: 0, duration: 0,
      } as any;
    });
    const runtime = {
      agentId: 'test',
      getService: () => null,
      searchMemories: async () => [],
      useModel: async () => [],
      getSetting: () => undefined,
    } as unknown as IAgentRuntime;
    return { service: new SmartRouterService(runtime), replies, spy };
  }

  /** Crypsi and coit talking to each other, ending with coit's unaddressed line. */
  async function crypsiAndCoit(service: SmartRouterService, roomId: string) {
    const { recordTurn } = await import('../../conversation/shadow');
    await recordTurn(roomId, { role: 'user', text: 'what coit burning?', author: 'Crypsi', authorId: CRYPSI, at: Date.now() - 43_000 });
    await recordTurn(roomId, { role: 'user', text: 'xrypsi bro', author: 'coit', authorId: COIT, at: Date.now() - 13_000 });
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-stayout-'));
    process.env.V5_SHADOW_DIR = dir;
  });

  afterEach(async () => {
    const { flushShadow, resetShadowState } = await import('../../conversation/shadow');
    await flushShadow();
    resetShadowState();
    if (savedShadowDir === undefined) delete process.env.V5_SHADOW_DIR;
    else process.env.V5_SHADOW_DIR = savedShadowDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it('says nothing, and spends nothing, on the message that started this', async () => {
    const { service, replies, spy } = router();
    await crypsiAndCoit(service, 'room-stayout-1');
    const plan = await service.planRouting(
      "there's no place to 1000x long for real right ?", 'room-stayout-1', false, COIT
    );
    spy.mockRestore();
    expect(plan.kind).toBe('NORESPONSE');
    expect(plan.reason).toBe('others_mid_conversation');
    // Full silence: the NORESPONSE branch only reacts when `reaction` is set.
    expect(plan.reaction).toBeUndefined();
    // No classifier call and no retrieval, so staying out is free.
    expect(replies).toHaveLength(0);
  });

  it('still answers when the bot is named', async () => {
    const { service, spy } = router();
    await crypsiAndCoit(service, 'room-stayout-2');
    const plan = await service.planRouting(
      'pepedawn is this all fakes ?', 'room-stayout-2', true, COIT
    );
    spy.mockRestore();
    expect(plan.reason).not.toBe('others_mid_conversation');
  });

  it('stays out of their conversation even for an exact card question, since 5.14.0', async () => {
    // It used to answer these from the index regardless. The group's owner
    // asked it not to butt into people's conversations; a card fact is still
    // butting in when two other people are mid-exchange.
    const { service, spy } = router();
    await crypsiAndCoit(service, 'room-stayout-3');
    const plan = await service.planRouting('who made FREEDOMKEK?', 'room-stayout-3', false, COIT);
    spy.mockRestore();
    expect(plan.reason).toBe('others_mid_conversation');
  });

  it('in a quiet room, an uninvited question is answered only from the index', async () => {
    const { service, replies, spy } = router();
    const { recordTurn } = await import('../../conversation/shadow');
    await recordTurn('room-quiet-1', { role: 'user', text: 'gm', author: 'coit', authorId: COIT, at: Date.now() - 30 * 60_000 });

    // Exact: the index knows who made FREEDOMKEK.
    const exact = await service.planRouting('who made FREEDOMKEK?', 'room-quiet-1', false, COIT);
    expect(exact.kind).toBe('CHAT');
    expect(exact.reason).not.toMatch(/unaddressed/);

    // Not exact: Simon's question about the new site's claim form, answered
    // "Yes" on 23 September. The right answer was silence.
    const composed = await service.planRouting(
      'If you were a contributor to a community created card can you still claim?', 'room-quiet-1', false, '4242'
    );
    expect(composed.kind).toBe('NORESPONSE');
    expect(composed.reason).toBe('unaddressed_question_not_exact');
    expect(composed.reaction).toBeUndefined();

    // A statement, not a question: Scrilla's announcement about the claim form.
    const statement = await service.planRouting(
      'if u are an artist and u created a card - please use the claim form on the new site', 'room-quiet-1', false, '7777'
    );
    expect(statement.kind).toBe('NORESPONSE');
    // isAQuestion reads "please ..." as a request, so this lands under the
    // question label; either way it is silence with no model call.
    expect(statement.reason).toMatch(/^unaddressed_/);

    // A matter of taste is an opinion, not a fact.
    const taste = await service.planRouting('what is the coolest fake rare?', 'room-quiet-1', false, '4242');
    expect(taste.kind).toBe('NORESPONSE');
    expect(taste.reason).toMatch(/^unaddressed_/);

    // No classifier or chat call was spent on any of the silent ones.
    spy.mockRestore();
    expect(replies).toHaveLength(1);
  });

  it('an exchange belongs to the person who started it, not the whole room', async () => {
    const { service, spy } = router();
    const { recordTurn } = await import('../../conversation/shadow');
    const SCRILLA = '154381320';
    const SIMON = '9999';
    // Scrilla addressed the bot, it replied, he replied to that, it replied
    // again - a live exchange. Four minutes later (outside the two-minute
    // stay-out window, inside the five-minute exchange window) Simon asks the
    // room something.
    const t = Date.now();
    await recordTurn('room-owner', { role: 'user', text: '@pepedawn_bot fucking relax brro', author: 'RARE SCRILLA', authorId: SCRILLA, addressedBot: true, at: t - 240_000 });
    await recordTurn('room-owner', { role: 'bot', text: "I'm relaxing.", at: t - 230_000 });
    await recordTurn('room-owner', { role: 'user', text: 'u were instructed not to butt in', author: 'RARE SCRILLA', authorId: SCRILLA, addressedBot: true, at: t - 220_000 });
    await recordTurn('room-owner', { role: 'bot', text: 'Noted.', at: t - 210_000 });
    const simon = await service.planRouting('can contributors still claim a community card?', 'room-owner', false, SIMON);
    expect(simon.kind).toBe('NORESPONSE');
    expect(simon.reason).toMatch(/^unaddressed_/);
    // Scrilla himself, continuing, is still in his exchange.
    const scrilla = await service.planRouting('so what do you actually do all day', 'room-owner', false, SCRILLA);
    spy.mockRestore();
    expect(scrilla.reason).not.toMatch(/unaddressed|others_mid/);
  });

  it('VOLUNTEER_REPLIES=true restores the old behaviour', async () => {
    process.env.VOLUNTEER_REPLIES = 'true';
    try {
      const { service, spy } = router();
      const plan = await service.planRouting('can contributors still claim a community card?', 'room-volunteer', false, '4242');
      spy.mockRestore();
      expect(plan.reason).not.toMatch(/unaddressed/);
    } finally {
      delete process.env.VOLUNTEER_REPLIES;
    }
  });

  it('still volunteers in a room where nobody else is talking', async () => {
    const { service, spy } = router();
    const { recordTurn } = await import('../../conversation/shadow');
    await recordTurn('room-stayout-4', {
      role: 'user', text: 'is this all fakes ?', author: 'coit', authorId: COIT, at: Date.now() - 5_000,
    });
    const plan = await service.planRouting('is this all fakes ?', 'room-stayout-4', false, COIT);
    spy.mockRestore();
    expect(plan.reason).not.toBe('others_mid_conversation');
  });
});

describe('the upgrade note', () => {
  let dir: string;
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['WHATS_NEW_PATH', 'PACKAGE_JSON_PATH', 'RELEASE_STATE_PATH'];

  const FILE = [
    '# What\'s new',
    '<!-- a note to the next writer -->',
    '',
    '## [5.11.0]',
    '',
    '⚡ PEPEDAWN — v5.11.0',
    '<!-- stripped -->',
    '🤐 I don\'t barge into your conversations any more.',
    '',
    '## [5.10.0]',
    '',
    'older note',
    '',
    '## [5.9.0]',
    '',
  ].join('\n');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pepedawn-note-'));
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.WHATS_NEW_PATH = join(dir, 'WHATS_NEW.md');
    process.env.PACKAGE_JSON_PATH = join(dir, 'package.json');
    process.env.RELEASE_STATE_PATH = join(dir, 'release-state.json');
    writeFileSync(process.env.WHATS_NEW_PATH, FILE);
    writeFileSync(process.env.PACKAGE_JSON_PATH, JSON.stringify({ version: '5.11.0' }));
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads one version\'s section, without the comments or the next heading', () => {
    const note = whatsNewFor('5.11.0')!;
    expect(note).toContain('⚡ PEPEDAWN — v5.11.0');
    expect(note).toContain('barge into your conversations');
    expect(note).not.toContain('stripped');
    expect(note).not.toContain('older note');
    expect(whatsNewFor('5.10.0')).toBe('older note');
  });

  it('has nothing to say for a version with no section, or an empty one', () => {
    expect(whatsNewFor('5.9.0')).toBeNull();
    expect(whatsNewFor('9.9.9')).toBeNull();
    expect(whatsNewFor('5.11.0', join(dir, 'missing.md'))).toBeNull();
  });

  it('reads the running version from package.json', () => {
    expect(currentVersion()).toBe('5.11.0');
  });

  it('posts once, then never again for that version', () => {
    const note = whatsNewFor('5.11.0');
    expect(noteDue('5.11.0', note, {})).toEqual({ due: true, reason: 'due' });
    writeReleaseState({ announcedVersion: '5.11.0' });
    expect(readReleaseState().announcedVersion).toBe('5.11.0');
    expect(noteDue('5.11.0', note, readReleaseState())).toEqual({ due: false, reason: 'already_announced' });
  });

  it('says nothing when there is no section, and never on a rollback', () => {
    expect(noteDue('5.11.0', null, {})).toEqual({ due: false, reason: 'nothing_to_say' });
    expect(noteDue(undefined, 'x', {})).toEqual({ due: false, reason: 'no_version' });
    expect(noteDue('5.10.0', 'x', { announcedVersion: '5.11.0' })).toEqual({ due: false, reason: 'not_newer' });
    expect(noteDue('5.11.1', 'x', { announcedVersion: '5.11.0' }).due).toBe(true);
  });

  it('compares versions by number, not by string', () => {
    expect(isNewerVersion('5.10.0', '5.9.0')).toBe(true);
    expect(isNewerVersion('5.9.0', '5.10.0')).toBe(false);
    expect(isNewerVersion('5.11.0', undefined)).toBe(true);
    expect(isNewerVersion('5.11.0', '5.11.0')).toBe(false);
    expect(isNewerVersion('5.11.0', 'not-a-version')).toBe(false);
  });
});

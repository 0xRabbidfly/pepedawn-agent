/**
 * Social memory against real files: capture from the day log, recall into the
 * reply prompt, and the unlisted commands for seeing and clearing it.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IAgentRuntime } from '@elizaos/core';
import type { DayTurn } from '../../conversation/dayLog';
import { DEFAULT_POLICY, type MemoryRecord } from '../../conversation/socialMemory';
import { SocialMemoryStore, _resetSocialStore, socialStore } from '../../conversation/socialMemoryStore';
import {
  QUOTE_OFFER_GAP_MS,
  _resetRecallLimiter,
  recallForSpeaker,
  runCapture,
  settleRecall,
} from '../../conversation/socialMemoryRuntime';
import { _resetRoomMap } from '../../conversation/roomMap';
import { _resetCharacters } from '../../conversation/characters';
import { _resetCache as _resetParticipants } from '../../utils/participants';
import { parseMemoryCommand, runMemoryCommand } from '../../actions/memoryCommands';
import { detectMessagePatterns } from '../../utils/messagePatterns';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 15, 12);
const GROUP = '-100';
const DM = '555';

let dir: string;
const ENV = [
  'SOCIAL_MEMORY', 'SOCIAL_MEMORY_PATH', 'RECAP_DAYLOG_PATH', 'ROOM_MAP_PATH', 'PARTICIPANTS_PATH',
  'CHARACTERS_PATH', 'TELEGRAM_ADMIN_IDS', 'SOCIAL_MEMORY_CHAT_IDS',
];
const saved: Record<string, string | undefined> = {};

function resetCaches(): void {
  _resetSocialStore();
  _resetRoomMap();
  _resetCharacters();
  _resetParticipants();
  _resetRecallLimiter();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pepedawn-social-'));
  for (const key of ENV) saved[key] = process.env[key];
  process.env.SOCIAL_MEMORY = 'on';
  process.env.SOCIAL_MEMORY_PATH = join(dir, 'social-memory.json');
  process.env.RECAP_DAYLOG_PATH = join(dir, 'day-log.jsonl');
  process.env.ROOM_MAP_PATH = join(dir, 'room-map.json');
  process.env.PARTICIPANTS_PATH = join(dir, 'participants.json');
  process.env.CHARACTERS_PATH = join(dir, 'characters.json');
  delete process.env.TELEGRAM_ADMIN_IDS;
  delete process.env.SOCIAL_MEMORY_CHAT_IDS;
  writeFileSync(process.env.ROOM_MAP_PATH, JSON.stringify({ [GROUP]: ['room-a'], [DM]: ['room-dm'] }));
  resetCaches();
});

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetCaches();
  rmSync(dir, { recursive: true, force: true });
});

function writeDayLog(turns: DayTurn[]): void {
  writeFileSync(process.env.RECAP_DAYLOG_PATH!, turns.map((t) => JSON.stringify(t)).join('\n') + '\n');
}

const say = (roomId: string, minutesAgo: number, authorId: string | undefined, author: string, text: string): DayTurn => ({
  roomId, role: 'user', author, authorId, text, at: NOW - minutesAgo * MIN,
});

/** A finished conversation in the group, three hours ago. */
function groupConversation(roomId = 'room-a'): DayTurn[] {
  return [
    say(roomId, 180, '111', 'bob', 'anyone got a spare FREEDOMKEK lying around'),
    say(roomId, 179, '111', 'bob', 'i would sell a kidney for a FREEDOMKEK honestly'),
    say(roomId, 178, '222', 'carol', 'the kidney market is down bad this week'),
    { roomId, role: 'bot', text: 'kidneys are not accepted at dispensers', at: NOW - 177 * MIN },
    say(roomId, 176, '222', 'carol', 'PEPEDAWN has spoken, keep your organs'),
    say(roomId, 175, '111', 'bob', 'fine, i will keep hunting it the normal way'),
  ];
}

function modelPicking(line: number, extra: Record<string, unknown> = {}) {
  const prompts: string[] = [];
  const model = async (prompt: string) => {
    prompts.push(prompt);
    return JSON.stringify({ memories: [{ line, kind: 'quote', summary: 'bets a kidney on FREEDOMKEK', salience: 2, ...extra }] });
  };
  return { prompts, model };
}

const record = (over: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: over.id ?? `id-${Math.random()}`,
  kind: over.kind ?? 'quote',
  summary: over.summary ?? 'bets a kidney on FREEDOMKEK',
  text: over.text ?? 'i would sell a kidney for a FREEDOMKEK honestly',
  chatId: over.chatId ?? GROUP,
  at: over.at ?? NOW - DAY,
  lastSeenAt: over.lastSeenAt ?? over.at ?? NOW - DAY,
  seen: 1,
  salience: over.salience ?? 2,
  lastUsedAt: over.lastUsedAt,
});

describe('the store', () => {
  it('survives a restart', () => {
    socialStore().admit('111', 'bob', record({ id: 'k' }), DEFAULT_POLICY, NOW);
    const fresh = new SocialMemoryStore(process.env.SOCIAL_MEMORY_PATH!);
    expect(fresh.person('111')?.records.map((r) => r.id)).toEqual(['k']);
  });

  it('picks up a hand edit on the server without a restart', () => {
    const store = socialStore();
    store.admit('111', 'bob', record({ id: 'k' }), DEFAULT_POLICY, NOW);
    const path = process.env.SOCIAL_MEMORY_PATH!;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.people['111'].records = [];
    writeFileSync(path, JSON.stringify(data));
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
    expect(store.person('111')?.records).toEqual([]);
  });

  it('will not overwrite a file it cannot read', () => {
    const path = process.env.SOCIAL_MEMORY_PATH!;
    writeFileSync(path, '{ half an edit');
    const outcome = socialStore().admit('111', 'bob', record(), DEFAULT_POLICY, NOW);
    expect(outcome.status).toBe('rejected');
    expect(readFileSync(path, 'utf8')).toBe('{ half an edit');
  });
});

describe('capture', () => {
  it('remembers from group conversations, never from a DM', async () => {
    writeDayLog([
      ...groupConversation(),
      say('room-dm', 120, '111', 'bob', 'this is a private thing i told the bot'),
      say('room-dm', 119, '111', 'bob', 'another private thing for the bot only'),
      say('room-dm', 118, '111', 'bob', 'and a third private thing, very secret'),
      say('room-dm', 117, '111', 'bob', 'and a fourth, which nobody else should see'),
      say('room-dm', 116, '111', 'bob', 'five private lines in total, for good measure'),
      say('room-dm', 115, '111', 'bob', 'six, still private, still just us two'),
      say('room-dm', 114, '111', 'bob', 'seven private lines and counting now'),
      say('room-dm', 113, '111', 'bob', 'eight, the last of the private lines'),
    ]);
    const { prompts, model } = modelPicking(1);
    const report = await runCapture({ model, now: NOW });

    expect(prompts).toHaveLength(1);
    expect(prompts.join('\n')).not.toContain('private');
    expect(report?.admitted).toBe(1);
    const bob = socialStore().person('111')!;
    expect(bob.records[0].text).toBe('i would sell a kidney for a FREEDOMKEK honestly');
    expect(bob.records[0].chatId).toBe(GROUP);
    expect(existsSync(join(dir, 'social-capture.jsonl'))).toBe(true);
  });

  it('reads each conversation once', async () => {
    writeDayLog(groupConversation());
    const { prompts, model } = modelPicking(1);
    await runCapture({ model, now: NOW });
    await runCapture({ model, now: NOW + HOUR });
    expect(prompts).toHaveLength(1);
  });

  it('leaves a conversation that is still going for the next run', async () => {
    writeDayLog(groupConversation());
    const { prompts, model } = modelPicking(1);
    await runCapture({ model, now: NOW - 170 * MIN });
    expect(prompts).toHaveLength(0);
    await runCapture({ model, now: NOW });
    expect(prompts).toHaveLength(1);
  });

  it('retries a conversation after the model fails', async () => {
    writeDayLog(groupConversation());
    const failing = await runCapture({ model: async () => { throw new Error('rate limited'); }, now: NOW });
    expect(failing?.failed).toBe(1);
    expect(socialStore().watermark(GROUP)).toBeUndefined();

    const { model } = modelPicking(1);
    await runCapture({ model, now: NOW });
    expect(socialStore().person('111')?.records).toHaveLength(1);
  });

  it('attributes old lines by name only when exactly one person has that name', async () => {
    const seen = { firstSeenAt: 0, lastSeenAt: 0, messages: 10 };
    writeFileSync(process.env.PARTICIPANTS_PATH!, JSON.stringify({
      '333': { id: '333', name: 'dave', ...seen },
      '444': { id: '444', name: 'eve', ...seen },
      '445': { id: '445', name: 'Eve', ...seen },
    }));
    writeDayLog([
      say('room-a', 60, undefined, 'dave', 'dave has a very particular opinion here'),
      say('room-a', 59, undefined, '@eve', 'eve also has a very particular opinion'),
      say('room-a', 58, undefined, 'dave', 'and dave will not be moved on it at all'),
      say('room-a', 57, undefined, '@eve', 'nor will eve, for the record, never'),
    ]);
    const model = async () => JSON.stringify({
      memories: [
        { line: 0, kind: 'trait', summary: 'dave has opinions' },
        { line: 1, kind: 'trait', summary: 'eve has opinions' },
      ],
    });
    await runCapture({ model, now: NOW });
    expect(socialStore().person('333')?.records).toHaveLength(1);
    expect(socialStore().person('444')).toBeUndefined();
    expect(socialStore().person('445')).toBeUndefined();
  });

  it('honours a roster entry that switches capture off for someone', async () => {
    writeFileSync(process.env.CHARACTERS_PATH!, JSON.stringify({
      characters: [{ name: 'Bob', telegramIds: ['111'], guidance: 'Be kind.', memory: { capture: false } }],
    }));
    _resetCharacters();
    writeDayLog(groupConversation());
    const { model } = modelPicking(1);
    const report = await runCapture({ model, now: NOW });
    expect(report?.rejected).toBe(1);
    expect(socialStore().person('111')).toBeUndefined();
  });
});

describe('recall', () => {
  function remember(over: Partial<MemoryRecord> = {}) {
    socialStore().admit('111', 'bob', record(over), { ...DEFAULT_POLICY, perDay: 99 }, NOW);
  }

  it('says nothing unless SOCIAL_MEMORY is on', () => {
    remember();
    process.env.SOCIAL_MEMORY = 'record';
    expect(recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW }).block).toBe('');
  });

  it('recalls the person speaking, from the chat being answered only', () => {
    remember({ id: 'here', text: 'said in this group' });
    remember({ id: 'there', chatId: '-200', text: 'said in the private group' });
    const recall = recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW });
    expect(recall.block).toContain('What you remember about bob');
    expect(recall.block).toContain('said in this group');
    expect(recall.block).not.toContain('private group');
    expect(recallForSpeaker({ speakerId: '222', roomId: 'room-a', userText: 'hi', now: NOW }).block).toBe('');
  });

  it('gives nothing in a room it cannot place', () => {
    remember();
    expect(recallForSpeaker({ speakerId: '111', roomId: 'room-unknown', userText: 'hi', now: NOW }).block).toBe('');
  });

  it('offers a quote to the same person at most every two hours', () => {
    remember();
    expect(recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW }).quotable).toBeDefined();
    const soon = recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW + HOUR });
    expect(soon.quotable).toBeUndefined();
    expect(soon.block).toContain('Do not quote');
    expect(
      recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW + QUOTE_OFFER_GAP_MS }).quotable
    ).toBeDefined();
  });

  it('starts the reuse clock only when the reply used the quote', () => {
    remember({ id: 'k' });
    const recall = recallForSpeaker({ speakerId: '111', roomId: 'room-a', userText: 'hi', now: NOW });
    expect(settleRecall(recall, 'gm, how is the hunt going', NOW)).toBe(false);
    expect(socialStore().person('111')!.records[0].lastUsedAt).toBeUndefined();
    expect(settleRecall(recall, 'still willing to sell a kidney for one?', NOW)).toBe(true);
    expect(socialStore().person('111')!.records[0].lastUsedAt).toBe(NOW);
  });
});

describe('the unlisted commands', () => {
  const bob = { id: '111', name: 'bob' };
  const run = (text: string, extra: Partial<Parameters<typeof runMemoryCommand>[0]> = {}) =>
    runMemoryCommand({ text, sender: bob, chatId: GROUP, now: NOW, ...extra });

  function seed() {
    const policy = { ...DEFAULT_POLICY, perDay: 99 };
    socialStore().admit('111', 'bob', record({ id: 'a', salience: 3, text: 'the strongest line' }), policy, NOW);
    socialStore().admit('111', 'bob', record({ id: 'b', salience: 1, kind: 'trait', summary: 'collects series 3' }), policy, NOW);
    socialStore().admit('111', 'bob', record({ id: 'c', chatId: '-200', text: 'from the private group' }), policy, NOW);
  }

  it('are recognised with or without the bot name, and never mistaken for other commands', () => {
    expect(parseMemoryCommand('/aboutme@pepedawn_bot')).toEqual({ name: 'aboutme', arg: '' });
    expect(parseMemoryCommand('/forget 2')).toEqual({ name: 'forget', arg: '2' });
    expect(parseMemoryCommand('/forgetful')).toBeNull();
    expect(detectMessagePatterns('/aboutme').commands.isAboutMe).toBe(true);
    expect(detectMessagePatterns('/forget 2').commands.isForget).toBe(true);
    const forget = detectMessagePatterns('/forget').commands;
    expect(forget.isF || forget.isFr || forget.isFm || forget.isFc).toBe(false);
    expect(detectMessagePatterns('/f FREEDOMKEK').commands.isForget).toBe(false);
  });

  it('/aboutme lists this chat\'s memories, strongest first, numbered', () => {
    seed();
    const reply = run('/aboutme')!;
    expect(reply).toContain('1. "the strongest line"');
    expect(reply).toContain('2. collects series 3');
    expect(reply).not.toContain('private group');
    expect(run('/aboutme', { chatId: '111' })).toContain('from the private group');
  });

  it('/forget <n> drops that one', () => {
    seed();
    expect(run('/forget 2')).toContain('collects series 3');
    expect(socialStore().person('111')!.records.map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect(run('/forget 9')).toContain('no number 9');
  });

  it('/forget drops everything and stops remembering, until /aboutme resume', () => {
    seed();
    expect(run('/forget')).toContain('forgotten 3 things');
    expect(socialStore().person('111')!.records).toEqual([]);
    expect(socialStore().admit('111', 'bob', record(), DEFAULT_POLICY, NOW)).toEqual({ status: 'rejected', reason: 'opted_out' });
    expect(run('/aboutme')).toContain('asked me to forget you');
    run('/aboutme resume');
    expect(socialStore().admit('111', 'bob', record(), DEFAULT_POLICY, NOW).status).toBe('admitted');
  });

  it('only an admin can act on someone else, by replying to them', () => {
    seed();
    const carolReplying = runMemoryCommand({
      text: '/aboutme', sender: { id: '222', name: 'carol' }, chatId: GROUP, now: NOW,
      repliedTo: { id: '111', name: 'bob' },
    })!;
    expect(carolReplying).toContain('Nothing on you');

    process.env.TELEGRAM_ADMIN_IDS = '999';
    const admin = { id: '999', name: 'admin' };
    expect(runMemoryCommand({ text: '/aboutme', sender: admin, chatId: GROUP, now: NOW, repliedTo: { id: '111', name: 'bob' } }))
      .toContain('What I remember about bob');
    expect(runMemoryCommand({ text: '/forget', sender: admin, chatId: GROUP, now: NOW, repliedTo: { id: '111', name: 'bob' } }))
      .toContain('about bob');
    expect(socialStore().person('111')!.optedOut).toBe(true);
  });

  it('say so when memory is switched off', () => {
    process.env.SOCIAL_MEMORY = 'off';
    expect(run('/aboutme')).toContain('switched off');
  });
});

describe('the reply prompt', () => {
  function routerCapturingChatPrompt() {
    const prompts: string[] = [];
    const spy = spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
      const isClassifier = String(options.prompt).includes('Return STRICT JSON');
      if (!isClassifier) prompts.push(String(options.prompt));
      return {
        text: isClassifier ? '{"intent":"CHAT","command":""}' : 'kek',
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
    return { router: new SmartRouterService(runtime), prompts, spy };
  }

  it('carries what is remembered about the person talking', async () => {
    socialStore().admit('111', 'bob', record({ kind: 'trait', summary: 'still hunting a FREEDOMKEK' }), DEFAULT_POLICY, NOW);
    const { router, prompts, spy } = routerCapturingChatPrompt();
    await router.planRouting('pepedawn how are you holding up today', 'room-a', true, '111');
    spy.mockRestore();
    expect(prompts.at(-1)).toContain('What you remember about bob');
    expect(prompts.at(-1)).toContain('still hunting a FREEDOMKEK');
  });

  it('carries nothing for someone it has no memories of', async () => {
    socialStore().admit('111', 'bob', record({ kind: 'trait', summary: 'still hunting a FREEDOMKEK' }), DEFAULT_POLICY, NOW);
    const { router, prompts, spy } = routerCapturingChatPrompt();
    await router.planRouting('pepedawn how are you holding up today', 'room-a', true, '42');
    spy.mockRestore();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.at(-1)).not.toContain('What you remember about');
  });
});

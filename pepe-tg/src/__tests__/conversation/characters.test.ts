/**
 * The character roster.
 *
 * The case it exists for: on 11 September Coit told the bot he was going to
 * assassinate Elon, then that he had done it, and it answered each message with
 * emergency-service instructions in a public channel. He is a provocateur and
 * the bot's creator; none of it was real, and the right reply was a joke.
 *
 * The rule that keeps it safe is identity by numeric Telegram id only.
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, rmSync, writeFileSync } from 'fs';
import type { IAgentRuntime } from '@elizaos/core';
import { characterFor, characterNote, _resetCharacters } from '../../conversation/characters';
import { SmartRouterService } from '../../services/SmartRouterService';
import * as modelGateway from '../../utils/modelGateway';

const PATH = join(tmpdir(), `characters-${process.pid}.json`);
const COIT = {
  name: 'Coit',
  telegramIds: ['1488783632', '777000111'],
  guidance: 'He makes things up to see how you react. Never take it literally. Be playful.',
};

function writeRoster(value: unknown): void {
  writeFileSync(PATH, typeof value === 'string' ? value : JSON.stringify(value));
  _resetCharacters();
}

beforeEach(() => {
  process.env.CHARACTERS_PATH = PATH;
  if (existsSync(PATH)) rmSync(PATH);
  _resetCharacters();
});

afterEach(() => {
  delete process.env.CHARACTERS_PATH;
  if (existsSync(PATH)) rmSync(PATH);
  _resetCharacters();
});

describe('who is on the roster', () => {
  it('finds a character by any of their Telegram ids', () => {
    writeRoster({ characters: [COIT] });
    expect(characterFor('1488783632')?.name).toBe('Coit');
    expect(characterFor('777000111')?.name).toBe('Coit');
    expect(characterFor(1488783632)?.name).toBe('Coit');
  });

  it('never matches on a name or a username', () => {
    // Coit's display name is "deleted account". Anyone can set theirs to that,
    // and a username can be released and claimed. Only the id is him.
    writeRoster({ characters: [COIT] });
    for (const impostor of ['Coit', 'coit', 'coitart', '@coitart', 'deleted account']) {
      expect(characterFor(impostor)).toBeUndefined();
    }
  });

  it('treats everyone the same when there is no roster', () => {
    expect(characterFor('1488783632')).toBeUndefined();
  });

  it('treats everyone the same when the roster is broken, and does not throw', () => {
    writeRoster('{ this is not json');
    expect(() => characterFor('1488783632')).not.toThrow();
    expect(characterFor('1488783632')).toBeUndefined();
  });

  it('skips entries with no ids or no guidance', () => {
    writeRoster({
      characters: [
        { name: 'No ids', telegramIds: [], guidance: 'x' },
        { name: 'No guidance', telegramIds: ['5'], guidance: '   ' },
        COIT,
      ],
    });
    expect(characterFor('5')).toBeUndefined();
    expect(characterFor('1488783632')?.name).toBe('Coit');
  });

  it('accepts a bare list as well as { characters: [...] }', () => {
    writeRoster([COIT]);
    expect(characterFor('1488783632')?.name).toBe('Coit');
  });

  it('ignores missing and empty ids', () => {
    writeRoster({ characters: [COIT] });
    expect(characterFor(undefined)).toBeUndefined();
    expect(characterFor(null)).toBeUndefined();
    expect(characterFor('')).toBeUndefined();
  });

  it('writes the prompt section with the name and the guidance', () => {
    const note = characterNote(COIT);
    expect(note).toContain('Coit');
    expect(note).toContain('Never take it literally');
  });
});

describe('the reply prompt', () => {
  function routerCapturingChatPrompt() {
    const prompts: string[] = [];
    spyOn(modelGateway, 'callTextModel').mockImplementation(async (_rt: any, options: any) => {
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
    return { router: new SmartRouterService(runtime), prompts };
  }

  it('carries the guidance when a character is the one talking', async () => {
    writeRoster({ characters: [COIT] });
    const { router, prompts } = routerCapturingChatPrompt();
    await router.planRouting('pepedawn im planning to assasinate him', 'room-c1', true, '1488783632');
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.at(-1)).toContain('Who is talking to you right now: Coit.');
    expect(prompts.at(-1)).toContain('Never take it literally');
  });

  it('leaves it out for anyone else, even with his display name', async () => {
    writeRoster({ characters: [COIT] });
    const { router, prompts } = routerCapturingChatPrompt();
    await router.planRouting('pepedawn im planning to assasinate him', 'room-c2', true, '42');
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.at(-1)).not.toContain('Who is talking to you right now');
  });

  it('leaves it out when the sender id is unknown', async () => {
    writeRoster({ characters: [COIT] });
    const { router, prompts } = routerCapturingChatPrompt();
    await router.planRouting('pepedawn im planning to assasinate him', 'room-c3', true);
    expect(prompts.at(-1) ?? '').not.toContain('Who is talking to you right now');
  });
});

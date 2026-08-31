/**
 * Recap tests.
 *
 * Two of these matter more than the rest: a quote is never anything the model
 * wrote, and a panel stays up long enough to read. Everything else is shape.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync, existsSync } from 'fs';
import {
  buildMoments, cleanBeat, eligibleTurns, holdMsFor, momentPrompt,
  parseChoices, truncateQuote, MAX_QUOTE_CHARS,
} from '../../utils/recapMoments';
import { castFor, castForBot, castingPool, _resetPool } from '../../utils/recapCast';
import { wrap, esc, panelSvg, titleSvg } from '../../utils/recapRender';
import { subtitleFor, statsFor } from '../../utils/recapStrip';
import { isDue, localDayStamp } from '../../services/RecapService';
import { parseRecapArgs } from '../../actions/recapCommand';
import { rememberRoom, roomsForChat, _resetRoomMap } from '../../conversation/roomMap';
import {
  appendDayTurn, dayBounds, dayLogPath, pruneDayLog, readDayTurns, _resetPruneCounter,
  type DayTurn,
} from '../../conversation/dayLog';

const AT = Date.parse('2026-08-28T12:00:00Z');
const turn = (over: Partial<DayTurn> = {}): DayTurn => ({
  roomId: 'room-1', role: 'user', author: 'frog', text: 'a message with some substance in it',
  at: AT, ...over,
});

describe('holdMsFor', () => {
  it('gives a long quote more time than a short one', () => {
    const short = holdMsFor('skill issue in here');
    const long = holdMsFor('i have been trying to buy a TUBBSPEPE for three weeks and every dispenser drains before i can refresh the page');
    expect(long).toBeGreaterThan(short);
  });

  it('never flashes a panel past faster than it can be read', () => {
    // The whole complaint about the first cut: four seconds is the floor.
    for (const text of ['gm', 'ok', 'a short one', 'x'.repeat(200)]) {
      expect(holdMsFor(text)).toBeGreaterThanOrEqual(4200);
    }
  });

  it('caps, so one rambling message cannot stall the strip', () => {
    expect(holdMsFor('word '.repeat(200))).toBeLessThanOrEqual(9500);
  });
});

describe('quotes are the room\'s own words', () => {
  it('copies the text of the chosen turn, never the model\'s', () => {
    const turns = [turn({ text: 'the floor is not the floor if nobody can reach it' })];
    const [m] = buildMoments(turns, [{ index: 0, beat: 'A POINT IS MADE' }]);
    expect(m.quote).toBe('the floor is not the floor if nobody can reach it');
  });

  it('drops a choice that points at no turn rather than guessing', () => {
    const turns = [turn()];
    expect(buildMoments(turns, [{ index: 9 }, { index: -1 }] as any)).toEqual([]);
  });

  it('ignores a repeated index', () => {
    const turns = [turn(), turn({ text: 'another line entirely', at: AT + 60000 })];
    const built = buildMoments(turns, [{ index: 0, beat: 'A' }, { index: 0, beat: 'B' }]);
    expect(built).toHaveLength(1);
  });

  it('truncates only at the tail, and marks it', () => {
    const long = 'x'.repeat(400);
    const out = truncateQuote(long);
    expect(out.length).toBeLessThanOrEqual(MAX_QUOTE_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
  });

  it('orders panels by when they were said', () => {
    const turns = [
      turn({ text: 'said second, chosen first', at: AT + 60000 }),
      turn({ text: 'said first, chosen second', at: AT }),
    ];
    const built = buildMoments(turns, [{ index: 0, beat: 'A' }, { index: 1, beat: 'B' }]);
    expect(built[0].quote).toContain('said first');
  });

  it('tells the model not to write dialogue', () => {
    const prompt = momentPrompt([turn()], 5);
    expect(prompt).toContain('Do not write or reword any dialogue');
    expect(prompt).toContain('0: [frog]');
  });
});

describe('parseChoices', () => {
  it('reads a JSON array out of a chatty reply', () => {
    const out = parseChoices('Sure!\n[{"index": 2, "beat": "A TAKE IS HAD"}]\nHope that helps');
    expect(out).toEqual([{ index: 2, beat: 'A TAKE IS HAD' }]);
  });

  it('returns nothing for malformed output rather than a guess', () => {
    expect(parseChoices('no json here')).toEqual([]);
    expect(parseChoices('[{"index": "two"}]')).toEqual([]);
  });
});

describe('eligibleTurns', () => {
  it('drops commands, stubs, and anyone who opted out', () => {
    const turns = [
      turn({ text: '/f FREEDOMKEK' }),
      turn({ text: 'gm' }),
      turn({ author: 'shy_frog', text: 'please do not quote me on any of this' }),
      turn({ text: 'a real message with something in it' }),
    ];
    const out = eligibleTurns(turns, ['@Shy_Frog']);
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain('a real message');
  });
});

describe('cleanBeat', () => {
  it('caps and upper-cases, and never returns empty', () => {
    expect(cleanBeat('a take is had')).toBe('A TAKE IS HAD');
    expect(cleanBeat(undefined)).toBe('MEANWHILE');
    expect(cleanBeat('x'.repeat(60)).length).toBeLessThanOrEqual(26);
  });

  it('strips characters that would break the SVG it is stamped into', () => {
    expect(cleanBeat('<script>&"')).not.toMatch(/[<>&"]/);
  });
});

describe('casting', () => {
  beforeEach(() => _resetPool());

  it('only casts cards that can actually be drawn', () => {
    for (const card of castingPool().slice(0, 50)) {
      expect(['jpg', 'jpeg', 'png']).toContain(card.ext);
    }
  });

  it('gives the same handle the same card every day', () => {
    expect(castFor('dispenser_goblin').asset).toBe(castFor('@Dispenser_Goblin').asset);
  });

  it('does not cast one card as two people in the same strip', () => {
    const first = castFor('someone');
    const second = castFor('someone', new Set([first.asset]));
    expect(second.asset).not.toBe(first.asset);
  });

  it('casts PEPEDAWN as itself where it can', () => {
    expect(castForBot().asset).toBeTruthy();
  });
});

describe('rendering', () => {
  it('wraps to the width it was given', () => {
    const lines = wrap('word '.repeat(40).trim(), 44, 500);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l.length).toBeLessThan(30);
  });

  it('breaks a word too long for the line rather than overflowing', () => {
    const lines = wrap('x'.repeat(120), 44, 300);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('escapes text that would otherwise break the SVG', () => {
    expect(esc('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; &quot;d&quot;');
  });

  it('renders a panel containing the quote and the credit', () => {
    const [m] = buildMoments([turn({ text: 'the dispenser drained again' })], [{ index: 0, beat: 'AGAIN' }]);
    const svg = panelSvg(m, castFor('frog'));
    expect(svg).toContain('AGAIN');
    expect(svg).toContain('dispenser');
    expect(svg).toContain('cast as');
  });

  it('renders a title card with the date', () => {
    expect(titleSvg('THURSDAY 28 AUGUST', '10 messages')).toContain('THURSDAY 28 AUGUST');
  });
});

describe('stats line', () => {
  it('counts people, not messages', () => {
    const turns = [turn({ author: 'a' }), turn({ author: 'a' }), turn({ author: 'b' }), turn({ role: 'bot', author: undefined })];
    expect(statsFor(turns, 2)).toEqual({ messages: 4, people: 2, cards: 2 });
  });

  it('says frog once and frogs otherwise', () => {
    expect(subtitleFor({ messages: 2, people: 1, cards: 1 })).toContain('1 frog ');
    expect(subtitleFor({ messages: 2, people: 3, cards: 2 })).toContain('3 frogs');
  });
});

describe('the day log', () => {
  const path = join(tmpdir(), `recap-daylog-${process.pid}.jsonl`);

  beforeEach(() => {
    process.env.RECAP_DAYLOG_PATH = path;
    if (existsSync(path)) rmSync(path);
    _resetPruneCounter();
  });
  afterEach(() => {
    delete process.env.RECAP_DAYLOG_PATH;
    if (existsSync(path)) rmSync(path);
  });

  it('keeps the day it was asked for and nothing either side', () => {
    appendDayTurn(turn({ at: AT - 26 * 3600 * 1000, text: 'the day before' }));
    appendDayTurn(turn({ at: AT, text: 'the day itself' }));
    appendDayTurn(turn({ at: AT + 26 * 3600 * 1000, text: 'the day after' }));
    const out = readDayTurns('room-1', AT - 3600 * 1000, AT + 3600 * 1000);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('the day itself');
  });

  it('keeps rooms apart', () => {
    appendDayTurn(turn({ roomId: 'other', text: 'somewhere else' }));
    appendDayTurn(turn({ text: 'in here' }));
    expect(readDayTurns('room-1', AT - 1000, AT + 1000)).toHaveLength(1);
  });

  it('survives a truncated line from an unclean shutdown', () => {
    appendDayTurn(turn());
    require('fs').appendFileSync(path, '{"roomId":"room-1","tex');
    expect(() => readDayTurns('room-1', AT - 1000, AT + 1000)).not.toThrow();
  });

  it('drops turns past the horizon when pruned', () => {
    appendDayTurn(turn({ at: AT - 30 * 24 * 3600 * 1000 }));
    appendDayTurn(turn({ at: AT }));
    expect(pruneDayLog(AT)).toBe(1);
    expect(readDayTurns('room-1', 0, AT + 1000)).toHaveLength(1);
  });

  it('bounds a day from local midnight to local midnight', () => {
    const { from, to, label } = dayBounds(1, new Date(2026, 7, 28, 15, 0, 0));
    expect(new Date(from).getDate()).toBe(27);
    expect(to - from).toBe(24 * 3600 * 1000);
    expect(label).toContain('AUGUST');
  });
});

describe('when the strip is due', () => {
  const window = { earliest: 2, latest: 10 };

  it('runs once on the first boot of the day', () => {
    expect(isDue(new Date(2026, 7, 28, 2, 5), {}, window).due).toBe(true);
  });

  it('does not run again after a deploy the same day', () => {
    // The 5.6.0 failure, in the one place it could recur: PM2 restarts on every
    // deploy, so "once per boot" is not "once per day".
    const now = new Date(2026, 7, 28, 3, 0);
    const state = { lastRecapDay: localDayStamp(now) };
    expect(isDue(now, state, window)).toEqual({ due: false, reason: 'already_ran_today' });
  });

  it('will not post last night\'s recap in the afternoon', () => {
    expect(isDue(new Date(2026, 7, 28, 16, 0), {}, window).reason).toBe('after_window');
  });

  it('waits for the window to open', () => {
    expect(isDue(new Date(2026, 7, 28, 1, 0), {}, window).reason).toBe('before_window');
  });

  it('runs again the next day', () => {
    const state = { lastRecapDay: '2026-08-27' };
    expect(isDue(new Date(2026, 7, 28, 3, 0), state, window).due).toBe(true);
  });
});

describe('/recap arguments', () => {
  it('defaults to yesterday and understands the words people use', () => {
    expect(parseRecapArgs('/recap').daysAgo).toBe(1);
    expect(parseRecapArgs('/recap yesterday').daysAgo).toBe(1);
    expect(parseRecapArgs('/recap today').daysAgo).toBe(0);
    expect(parseRecapArgs('/recap 3').daysAgo).toBe(3);
  });

  it('falls back to yesterday rather than accepting nonsense', () => {
    expect(parseRecapArgs('/recap last tuesday').daysAgo).toBe(1);
    expect(parseRecapArgs('/recap 400').daysAgo).toBe(1);
  });
});

describe('sharp is not a startup dependency', () => {
  it('is imported lazily, so a broken image library cannot stop the bot', () => {
    // 2026-08-28: a top-level `import sharp` failed on the droplet
    // (libvips-cpp.so.42 missing), the project loaded with no agents, and the
    // bot was down until it was reverted. The recap may fail; boot may not.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../utils/recapRender.ts'), 'utf8'
    );
    expect(src).not.toMatch(/^import sharp from/m);
    expect(src).toContain("await import('sharp')");
  });
});

describe('the day stamp', () => {
  it('is not burned on a day with nothing in it', () => {
    // The first night this shipped: the log held one turn, the stamp was
    // written anyway, and the next restart declined to try again — so a room
    // that woke up at 09:00 got no strip at all that day.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../services/RecapService.ts'), 'utf8'
    );
    const check = src.indexOf('leaving the day unstamped');
    const stamp = src.indexOf('writeState({ ...state, lastRecapDay');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(stamp);
  });
});

describe('recap spend is attributable in /fc', () => {
  it('runs its model calls inside an action context', () => {
    // /fc groups by source, model and action. Recap calls go through
    // modelGateway so the cost was always counted, but /recap is answered
    // inline rather than through the action pipeline, so nothing set the
    // action and the By Action breakdown read "(unattributed)".
    const read = (f: string) =>
      require('fs').readFileSync(require('path').join(__dirname, f), 'utf8');

    const command = read('../../actions/recapCommand.ts');
    expect(command).toContain("runWithAction('recap'");
    expect(command).toContain("source: 'Recap'");

    const service = read('../../services/RecapService.ts');
    expect(service).toContain("runWithAction('recap_nightly'");
    expect(service).toContain("source: 'Recap'");
  });
});

describe('delivering the strip', () => {
  it('never hands the video to the message callback', () => {
    // The first version passed the MP4 as a callback attachment. Telegram got
    // the words "🎬 Video:" and a caption with its <b> and <i> tags showing,
    // because the callback carries neither a buffer nor a parse mode.
    const plugin = require('fs').readFileSync(
      require('path').join(__dirname, '../../plugins/fakeRaresPlugin.ts'), 'utf8'
    );
    const block = plugin.slice(plugin.indexOf('if (isRecap)'), plugin.indexOf('if (isRecap)') + 2000);
    expect(block).toContain('sendRecapVideo(');
    expect(block).not.toMatch(/attachments:/);
    expect(block).toContain('stripHtml(');
  });

  it('caps the caption at what sendVideo accepts', () => {
    const send = require('fs').readFileSync(
      require('path').join(__dirname, '../../utils/recapSend.ts'), 'utf8'
    );
    expect(send).toContain('caption.slice(0, 1024)');
    expect(send).toContain("form.append('parse_mode', 'HTML')");
  });

  it('strips tags for the plain-text fallback', () => {
    const { stripHtml } = require('../../utils/recapSend');
    expect(stripHtml('<b>The day</b> — <i>so far</i>')).toBe('The day — so far');
  });
});

describe('the chat-to-room map', () => {
  const mapPath = join(tmpdir(), `recap-roommap-${process.pid}.json`);

  beforeEach(() => {
    process.env.ROOM_MAP_PATH = mapPath;
    if (existsSync(mapPath)) rmSync(mapPath);
    _resetRoomMap();
  });
  afterEach(() => {
    delete process.env.ROOM_MAP_PATH;
    if (existsSync(mapPath)) rmSync(mapPath);
    _resetRoomMap();
  });

  it('survives the restart that the in-memory pairing does not', () => {
    // The bug this exists for: the nightly runs 90 seconds after the 02:00
    // restart, before any message has taught the in-memory map anything, so it
    // looked the day log up under the raw chat id and found nothing — two
    // nights running, on days with plenty in them.
    rememberRoom('-1001586933558', 'room-uuid-1');
    _resetRoomMap(); // as if the process had restarted
    expect(roomsForChat('-1001586933558')).toEqual(['room-uuid-1']);
  });

  it('keeps every room a forum chat has used, newest first', () => {
    rememberRoom('-100', 'topic-a');
    rememberRoom('-100', 'topic-b');
    expect(roomsForChat('-100')).toEqual(['topic-b', 'topic-a']);
  });

  it('does not grow on a repeat', () => {
    rememberRoom('-100', 'same');
    rememberRoom('-100', 'same');
    expect(roomsForChat('-100')).toEqual(['same']);
  });

  it('is empty, not wrong, for a chat never seen', () => {
    expect(roomsForChat('-999')).toEqual([]);
  });
});

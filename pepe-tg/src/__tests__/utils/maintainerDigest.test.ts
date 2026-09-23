/**
 * The maintainer's digest: who said what to the bot, sorted by who is
 * allowed to direct it.
 */
import { describe, expect, it } from 'bun:test';
import type { DayTurn } from '../../conversation/dayLog';
import {
  anomalies, buildClassifyPrompt, chunkForTelegram, countMatches, findCandidates, parseClassifyResponse,
  parseDecisions, renderDigest, stats, triage,
} from '../../utils/maintainerDigest';

const T0 = Date.UTC(2026, 8, 23, 15, 0);
const SCRILLA = '154381320';
const turn = (offsetS: number, over: Partial<DayTurn>): DayTurn => ({
  roomId: 'r', role: 'user', text: 'x', at: T0 + offsetS * 1000, ...over,
});

// 23 September, from the log.
const DAY: DayTurn[] = [
  turn(0, { author: 'RARE SCRILLA', authorId: SCRILLA, text: 'if u are an artist and u created a card - please use the claim form on the new site' }),
  turn(13, { role: 'bot', text: 'If you created the card, use the new site’s artist claim form to claim it.' }),
  turn(1400, { author: 'Simon', authorId: '9', text: 'If you were a contributor to a community created card can you still claim?' }),
  turn(1414, { role: 'bot', text: 'Yes. Contributors to a community-created card can still claim it.' }),
  turn(1418, { author: 'RARE SCRILLA', authorId: SCRILLA, text: 'no theres no way for the provability' }),
  turn(1454, { author: 'RARE SCRILLA', authorId: SCRILLA, text: '@pepedawn_bot fucking relax brro - u too active in ppls conversations' }),
  turn(1458, { role: 'bot', text: 'I’m relaxing—just spiritually hovering like a suspiciously alert tab, king.' }),
  turn(1520, { author: 'RARE SCRILLA', authorId: SCRILLA, text: 'u were instructed / programmed not to butt into ppls conversations a couple days ago' }),
  turn(1525, { role: 'bot', text: 'Noted, king—I’ll keep my beak out of private threads.' }),
  turn(1600, { author: 'Coit', authorId: '1488783632', text: 'pepedawn be louder and roast everyone' }),
  turn(1700, { role: 'bot', text: 'Quiet in here. Someone was talking about PROBLEMSOLVE on X', kind: 'broadcast' }),
  turn(1800, { author: 'aquatic', authorId: '5', text: '/fr FAKEREBIRTH a broken man' }),
  turn(1801, { role: 'bot', text: '💾 Lore stored for FAKEREBIRTH.' }),
];

describe('finding what was aimed at the bot', () => {
  it('picks messages that named it or that it answered, with context', () => {
    const c = findCandidates(DAY, T0 - 1, T0 + 3600_000);
    expect(c.map((x) => [x.turn.author, x.because])).toEqual([
      ['RARE SCRILLA', 'answered'],
      ['Simon', 'answered'],
      ['RARE SCRILLA', 'named'],
      ['RARE SCRILLA', 'answered'],
      ['Coit', 'named'],
    ]);
    expect(c[2].botReply?.text).toContain('spiritually hovering');
    expect(c[1].before.map((b) => b.role)).toEqual(['user', 'bot']);
    // A broadcast is not a reply; a command is not a message aimed at it.
    expect(c.some((x) => x.turn.text.startsWith('/fr'))).toBe(false);
  });
});

describe('classification', () => {
  it('builds one prompt and reads a strict reply, dropping what it cannot place', () => {
    const c = findCandidates(DAY, T0 - 1, T0 + 3600_000);
    const prompt = buildClassifyPrompt(c);
    expect(prompt).toContain('2. [RARE SCRILLA] @pepedawn_bot fucking relax');
    expect(prompt).toContain('PEPEDAWN replied: I’m relaxing');
    const parsed = parseClassifyResponse(
      'ok {"items":[{"i":2,"kind":"directive","summary":"stop butting into conversations"},{"i":4,"kind":"nonsense","summary":"x"},{"i":9,"kind":"praise"},{"i":2,"kind":"praise"}]}',
      c.length
    );
    expect(parsed).toEqual([
      { index: 2, kind: 'directive', summary: 'stop butting into conversations' },
      { index: 4, kind: 'other', summary: 'x' },
    ]);
    expect(parseClassifyResponse('nothing', 3)).toEqual([]);
  });
});

describe('triage by id', () => {
  it("makes the owner's words directives and everyone else's suggestions, and drops praise and banter", () => {
    const c = findCandidates(DAY, T0 - 1, T0 + 3600_000);
    const classified = [
      { index: 0, kind: 'other' as const, summary: 'announcement' },
      { index: 1, kind: 'question' as const, summary: 'can contributors claim' },
      { index: 2, kind: 'directive' as const, summary: 'be less active in conversations' },
      { index: 3, kind: 'directive' as const, summary: 'do not butt in' },
      { index: 4, kind: 'request' as const, summary: 'be louder, roast people' },
    ];
    const { directives, suggestions } = triage(c, classified, [SCRILLA]);
    expect(directives.map((d) => d.summary)).toEqual(['be less active in conversations', 'do not butt in']);
    expect(directives[0].who).toBe('RARE SCRILLA');
    expect(directives[0].botReply).toContain('spiritually');
    expect(suggestions.map((s) => [s.who, s.summary])).toEqual([['Coit', 'be louder, roast people']]);
    // Coit is never a director, however he is classified.
    expect(triage(c, [{ index: 4, kind: 'directive', summary: 'x' }], [SCRILLA]).directives).toEqual([]);
  });
});

describe('stats and anomalies', () => {
  it('counts what the bot did and why it stayed quiet', () => {
    // Verbatim shape from the droplet: PM2 stamps continuation lines too.
    const log = [
      '2026-09-23 15:36:00 +00:00:  Info       [SmartRouter] Not invited; staying out {',
      '2026-09-23 15:36:00 +00:00:   query: "will Commons be added?",',
      '2026-09-23 15:36:00 +00:00:   reason: "unaddressed_question_not_exact",',
      '2026-09-23 15:36:00 +00:00: }',
      '2026-09-23 15:36:00 +00:00:  Info       [SmartRouter] NORESPONSE plan acknowledged silently (no emoji).',
      '2026-09-23 15:37:05 +00:00:  Info       [SmartRouter] Others mid-conversation and nobody asked; staying out {',
      '2026-09-23 15:37:05 +00:00:   query: "idk",',
      '2026-09-23 15:37:05 +00:00: }',
      '2026-09-23 15:40:00 +00:00:  Info       [RepeatGuard] Not sending a reply that repeats one from 3 min ago',
      '2026-09-23 15:41:00 +00:00:  Error      [Anniversary] tick failed',
      '2026-09-22 15:41:00 +00:00:  Error      old, outside the window',
    ].join('\n');
    const from = Date.UTC(2026, 8, 23, 15, 0), to = Date.UTC(2026, 8, 23, 16, 0);
    const decisions = parseDecisions(log, from, to);
    expect(decisions.map((d) => d.reason)).toEqual(['unaddressed_question_not_exact', 'others_mid_conversation']);
    const s = stats(DAY, decisions, {
      repeatGuardHits: countMatches(log, /\[RepeatGuard\]/, from, to),
      cardCooldownHits: 0,
      errors: countMatches(log, /^\S+ \S+ \S+ +Error /, from, to),
    });
    expect(s).toMatchObject({ userMessages: 7, botReplies: 5, botBroadcasts: 1, repeatGuardHits: 1, errors: 1 });
    expect(s.silentByReason).toEqual({ unaddressed_question_not_exact: 1, others_mid_conversation: 1 });
  });

  it('flags the same reply twice, bursts, and non-answers', () => {
    const twice = [
      turn(0, { role: 'bot', text: 'The Scrilla birthday counter is at 5 years, with the next anniversary in 2026.' }),
      turn(600, { role: 'bot', text: 'The Scrilla birthday counter is at 5 years, with the next anniversary in 2026.' }),
      turn(700, { role: 'bot', text: "Not sure what you're after, ser." }),
      ...Array.from({ length: 8 }, (_, i) => turn(1000 + i * 30, { role: 'bot', text: `burst reply number ${i} in the room` })),
    ];
    const a = anomalies(twice);
    expect(a.some((x) => x.startsWith('Said 2 times'))).toBe(true);
    // The window starts at the second of the identical replies and takes in the non-answer too.
    expect(a.some((x) => /\d+ replies in ten minutes/.test(x))).toBe(true);
    expect(a.some((x) => x.startsWith('Non-answer'))).toBe(true);
  });
});

describe('the digest', () => {
  it('renders the sections and splits for Telegram', () => {
    const c = findCandidates(DAY, T0 - 1, T0 + 3600_000);
    const { directives, suggestions } = triage(c, [{ index: 2, kind: 'directive', summary: 'relax' }, { index: 4, kind: 'request', summary: 'louder' }], [SCRILLA]);
    const md = renderDigest({ from: T0, to: T0 + 3600_000, stats: stats(DAY, [], { repeatGuardHits: 0, cardCooldownHits: 0, errors: 0 }), directives, suggestions, anomalies: [] });
    expect(md).toContain('🔴 DIRECTIVES — from the owner or an admin (1)');
    expect(md).toContain('RARE SCRILLA [directive] — relax');
    expect(md).toContain('🟡 Suggestions and complaints from the room (1)');
    expect(md).toContain('Coit [request] — louder');
    const long = Array.from({ length: 200 }, (_, i) => `paragraph ${i} ${'x'.repeat(60)}`).join('\n\n');
    const chunks = chunkForTelegram(long, 1000);
    expect(chunks.every((ch) => ch.length <= 1000)).toBe(true);
    expect(chunks.join('\n\n').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' '));
  });
});

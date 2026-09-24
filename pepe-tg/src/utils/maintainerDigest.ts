/**
 * The maintainer's digest: what happened in the room, what people asked of the
 * bot, and what it did — triaged by who said it.
 *
 * Stage 1 of the maintainer loop (docs/MAINTAINER.md). This module is pure:
 * it takes the day log and the router's logged decisions for a window and
 * produces a digest for the owner and a JSON brief for the proposer. The one
 * model call — classifying what each message aimed at the bot actually asks —
 * is injected, so the whole thing is testable without one.
 *
 * The rule that matters (docs/AGENT_CONSTITUTION.md, article I): only the owner
 * and admins, by numeric Telegram id, can direct a change. Everyone else's
 * request is a suggestion. The digest keeps the two apart on the page.
 */

import type { DayTurn } from '../conversation/dayLog';

export interface Decision {
  at: number;
  reason: string;
}

export interface Candidate {
  /** Index into the window's turns. */
  index: number;
  turn: DayTurn;
  /** Why it was picked up: named the bot, or the bot answered it. */
  because: 'named' | 'answered';
  /** The two turns before it, for context. */
  before: DayTurn[];
  /** What the bot said next, if it did. */
  botReply?: DayTurn;
}

export type Kind = 'directive' | 'complaint' | 'request' | 'praise' | 'question' | 'other';

export interface Classified {
  index: number;
  kind: Kind;
  summary: string;
}

export interface TriagedItem extends Classified {
  turn: DayTurn;
  who: string;
  botReply?: string;
  before: string[];
  /** From the owner or an admin. */
  directive: boolean;
}

export interface Stats {
  userMessages: number;
  botReplies: number;
  botBroadcasts: number;
  silentByReason: Record<string, number>;
  repeatGuardHits: number;
  cardCooldownHits: number;
  errors: number;
}

const NAMES_BOT = /\bpepedawn\b|@pepedawn_bot|\bdawn\b/i;
/** A bot turn this soon after a user turn is taken as a reply to it. */
const REPLY_WINDOW_MS = 90_000;

/** Messages aimed at the bot in the window: they named it, or it answered them. */
export function findCandidates(turns: DayTurn[], from: number, to: number): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.role !== 'user' || t.at < from || t.at >= to) continue;
    const text = (t.text || '').trim();
    if (!text || text.startsWith('/')) continue;
    const named = NAMES_BOT.test(text);
    let botReply: DayTurn | undefined;
    for (let j = i + 1; j < turns.length && turns[j].at - t.at <= REPLY_WINDOW_MS; j++) {
      if (turns[j].role === 'user') break;
      if (turns[j].role === 'bot' && turns[j].kind !== 'broadcast') { botReply = turns[j]; break; }
    }
    if (!named && !botReply) continue;
    out.push({
      index: i,
      turn: t,
      because: named ? 'named' : 'answered',
      before: turns.slice(Math.max(0, i - 2), i),
      botReply,
    });
  }
  return out;
}

/** One prompt for the whole batch. The model labels; it never rewrites. */
export function buildClassifyPrompt(cands: Candidate[]): string {
  const lines = cands.map((c, k) => {
    const ctx = c.before.map((b) => `      earlier [${b.role === 'bot' ? 'PEPEDAWN' : b.author || 'someone'}]: ${one(b.text)}`).join('\n');
    const reply = c.botReply ? `\n      PEPEDAWN replied: ${one(c.botReply.text)}` : '';
    return `${k}. [${c.turn.author || 'someone'}] ${one(c.turn.text)}${ctx ? `\n${ctx}` : ''}${reply}`;
  });
  return [
    'These are messages from a Fake Rares Telegram group that were aimed at PEPEDAWN, the community bot,',
    'or that it answered. For each, say what the person is doing, as one of:',
    '  directive  - telling the bot how to behave from now on ("relax", "stop butting in", "don\'t repeat yourself")',
    '  complaint  - unhappy with something it did, without a rule for the future',
    '  request    - asking it to do a specific thing now (show a card, count something, run something)',
    '  praise     - approval',
    '  question   - a question it was expected to answer',
    '  other      - banter, testing, provocation, anything else',
    '',
    'Also give a one-line summary of what they want, in plain words, under 20 words. Do not judge whether',
    'the bot was right. Return STRICT JSON only: {"items":[{"i": <number>, "kind": "<kind>", "summary": "<text>"}]}',
    '',
    ...lines,
  ].join('\n');
}

export function parseClassifyResponse(raw: string, count: number): Classified[] {
  const kinds: Kind[] = ['directive', 'complaint', 'request', 'praise', 'question', 'other'];
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
    const out: Classified[] = [];
    const seen = new Set<number>();
    for (const it of items) {
      const i = it?.i;
      if (!Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) continue;
      seen.add(i);
      out.push({
        index: i,
        kind: kinds.includes(it?.kind) ? it.kind : 'other',
        summary: typeof it?.summary === 'string' ? one(it.summary).slice(0, 160) : '',
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Split what was said into what the bot must act on and what it should merely hear. */
export function triage(
  cands: Candidate[],
  classified: Classified[],
  directiveIds: string[],
  nameOf: (id: string | undefined, fallback?: string) => string = (id, f) => f || id || 'someone'
): { directives: TriagedItem[]; suggestions: TriagedItem[] } {
  const byIndex = new Map(classified.map((c) => [c.index, c]));
  const directives: TriagedItem[] = [];
  const suggestions: TriagedItem[] = [];
  cands.forEach((c, k) => {
    const cls = byIndex.get(k) ?? { index: k, kind: 'other' as Kind, summary: '' };
    if (cls.kind === 'praise' || cls.kind === 'other' || cls.kind === 'question') return;
    const fromDirector = !!c.turn.authorId && directiveIds.includes(c.turn.authorId);
    const item: TriagedItem = {
      ...cls,
      turn: c.turn,
      who: nameOf(c.turn.authorId, c.turn.author),
      botReply: c.botReply?.text,
      before: c.before.map((b) => `${b.role === 'bot' ? 'PEPEDAWN' : b.author || 'someone'}: ${one(b.text)}`),
      directive: fromDirector,
    };
    (fromDirector ? directives : suggestions).push(item);
  });
  return { directives, suggestions };
}

export function stats(turns: DayTurn[], decisions: Decision[], extra: { repeatGuardHits: number; cardCooldownHits: number; errors: number }): Stats {
  const silentByReason: Record<string, number> = {};
  for (const d of decisions) silentByReason[d.reason] = (silentByReason[d.reason] ?? 0) + 1;
  return {
    userMessages: turns.filter((t) => t.role === 'user').length,
    botReplies: turns.filter((t) => t.role === 'bot' && t.kind !== 'broadcast').length,
    botBroadcasts: turns.filter((t) => t.role === 'bot' && t.kind === 'broadcast').length,
    silentByReason,
    ...extra,
  };
}

/** Things worth a look even when nobody complained. */
export function anomalies(turns: DayTurn[]): string[] {
  const out: string[] = [];
  const bot = turns.filter((t) => t.role === 'bot' && t.kind !== 'broadcast');

  // The same words twice.
  const seen = new Map<string, number>();
  for (const t of bot) {
    const key = one(t.text).toLowerCase().slice(0, 120);
    if (key.length < 20) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen) if (n > 1) out.push(`Said ${n} times: "${key.slice(0, 80)}…"`);

  // Bursts: more than six replies in ten minutes.
  for (let i = 0; i < bot.length; i++) {
    let j = i;
    while (j + 1 < bot.length && bot[j + 1].at - bot[i].at <= 10 * 60_000) j++;
    if (j - i + 1 > 6) {
      out.push(`${j - i + 1} replies in ten minutes starting ${hhmm(bot[i].at)}`);
      i = j;
    }
  }

  // Non-answers the room notices.
  for (const t of bot) {
    if (/not sure what you'?re after|i can'?t help with that|something went wrong/i.test(t.text)) {
      out.push(`Non-answer at ${hhmm(t.at)}: "${one(t.text).slice(0, 80)}"`);
    }
  }
  return out;
}

export interface DigestParts {
  from: number;
  to: number;
  stats: Stats;
  directives: TriagedItem[];
  suggestions: TriagedItem[];
  anomalies: string[];
  notes?: string[];
}

export function renderDigest(d: DigestParts): string {
  const s = d.stats;
  const lines: string[] = [];
  lines.push(`🛠 PEPEDAWN maintainer digest — ${when(d.from)} → ${when(d.to)} UTC`);
  lines.push('');
  lines.push(
    `${s.userMessages} messages, ${s.botReplies} replies, ${s.botBroadcasts} scheduled posts. ` +
    `Stayed silent ${Object.values(s.silentByReason).reduce((a, b) => a + b, 0)}× ` +
    `(${Object.entries(s.silentByReason).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}). ` +
    `Repeat guard ${s.repeatGuardHits}, card cooldown ${s.cardCooldownHits}, errors ${s.errors}.`
  );

  lines.push('', d.directives.length ? `🔴 DIRECTIVES — from the owner or an admin (${d.directives.length})` : '🔴 Directives: none');
  for (const it of d.directives) lines.push(...item(it));

  lines.push('', d.suggestions.length ? `🟡 Suggestions and complaints from the room (${d.suggestions.length})` : '🟡 Suggestions: none');
  for (const it of d.suggestions.slice(0, 12)) lines.push(...item(it));
  if (d.suggestions.length > 12) lines.push(`  …and ${d.suggestions.length - 12} more.`);

  lines.push('', d.anomalies.length ? `⚠️ Worth a look (${d.anomalies.length})` : '⚠️ Anomalies: none');
  for (const a of d.anomalies.slice(0, 10)) lines.push(`  • ${a}`);

  if (d.notes?.length) {
    lines.push('', '📎 Notes');
    for (const n of d.notes) lines.push(`  • ${n}`);
  }
  return lines.join('\n');
}

function item(it: TriagedItem): string[] {
  const out = [`  • ${hhmm(it.turn.at)} ${it.who} [${it.kind}] — ${it.summary || one(it.turn.text).slice(0, 100)}`];
  out.push(`      "${one(it.turn.text).slice(0, 160)}"`);
  if (it.botReply) out.push(`      PEPEDAWN: "${one(it.botReply).slice(0, 120)}"`);
  return out;
}

/** Telegram takes 4096 characters; split on paragraph or line boundaries under that. */
export function chunkForTelegram(text: string, max = 3900): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Router decisions logged as `[SmartRouter] Not invited; staying out { ... reason: "x" }`. */
export function parseDecisions(logText: string, from: number, to: number): Decision[] {
  const out: Decision[] = [];
  const lines = logText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+00:00:.*\[SmartRouter\] (Not invited; staying out|Others mid-conversation)/.exec(line);
    if (!head) continue;
    const at = Date.parse(head[1].replace(' ', 'T') + 'Z');
    if (Number.isNaN(at) || at < from || at >= to) continue;
    // The reason sits on one of the next few lines of the logged object. PM2
    // stamps every continuation line with the timestamp too, so a new entry
    // is recognised by its level marker, not by the timestamp.
    let reason = head[2].startsWith('Others') ? 'others_mid_conversation' : 'unknown';
    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const r = /reason: "([a-z_]+)"/.exec(lines[j]);
      if (r) { reason = r[1]; break; }
      if (/\+00:00:\s+(Info|Warn|Error|Debug)\s/.test(lines[j])) break;
    }
    out.push({ at, reason });
  }
  return out;
}

export function countMatches(logText: string, re: RegExp, from: number, to: number): number {
  let n = 0;
  for (const line of logText.split('\n')) {
    if (!re.test(line)) continue;
    const at = Date.parse(line.slice(0, 19).replace(' ', 'T') + 'Z');
    if (!Number.isNaN(at) && (at < from || at >= to)) continue;
    n++;
  }
  return n;
}

function one(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}
function hhmm(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}
function when(ms: number): string {
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
}

/**
 * /fb - the fake backlog: the room's door into the maintainer loop.
 *
 *   /fb <an idea, or a bug>       logs it as a ticket - KEK-001 - and says so
 *   /fb                           the top ten: ticket, short title, status
 *   /fb KEK-001                   one ticket in full
 *
 * Nobody moves a ticket by hand, in chat or otherwise: status follows the
 * work. The proposer marks a ticket "review" when it pushes a branch whose
 * commit carries "Ticket: KEK-nnn" (scripts/backlog-status.ts, over ssh),
 * and the bot marks it "shipped" - and tells the room - when a deploy
 * brings that commit (BacklogService reads the git log at boot).
 *
 * Every command here starts with /f; the /pb it shipped as for a day was a
 * typo, and is gone.
 *
 * The maintainer (docs/MAINTAINER.md) acts only on directives from the
 * owner or an admin; everyone else's wishes reach the digest as
 * "suggestions" and are heard, not built. /fb is the community version of
 * that channel: a ticket logged here goes into the daily digest under its
 * own heading, the proposer may build it on a branch, and the owner reviews
 * the PR and moves the ticket. Nothing here deploys anything.
 *
 * Stored as JSONL under src/data/maintainer/, which is gitignored: it
 * quotes real people and carries their Telegram ids. Status changes are
 * appended as their own lines, so the file is a log and the ticket's
 * current state is its last line.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { isAdminUser } from './admins';

export const STATUSES = ['open', 'planned', 'building', 'review', 'shipped', 'declined'] as const;
export type Status = (typeof STATUSES)[number];

export interface Ticket {
  /** KEK-001 */
  id: string;
  at: number;
  chatId?: string;
  sender: { id: string; name?: string; username?: string };
  text: string;
  /** Four to six words, from a small model when there is one, else the first words. */
  title: string;
  status: Status;
}

interface StatusChange {
  change: 'status';
  id: string;
  at: number;
  by: string;
  status: Status;
}

type Line = Ticket | StatusChange;

export const MIN_CHARS = 12;
export const MAX_CHARS = 600;
export const PER_PERSON_PER_DAY = 3;
export const LIST_LIMIT = 10;

const PATTERN = /^(?:@[A-Za-z0-9_]+\s+)?\/fb(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i;
const TICKET = /^KEK-(\d{1,4})$/i;

export function buildRequestsPath(): string {
  return process.env.BUILD_REQUESTS_PATH || join(process.cwd(), 'src', 'data', 'maintainer', 'build-requests.jsonl');
}

export function ticketId(n: number): string {
  return `KEK-${String(n).padStart(3, '0')}`;
}

export type Parsed =
  | { kind: 'submit'; text: string }
  | { kind: 'list' }
  | { kind: 'show'; id: string };

export function parseBuildRequest(text: string): Parsed | null {
  const m = PATTERN.exec((text || '').trim());
  if (!m) return null;
  const arg = (m[1] || '').trim();
  if (!arg || /^list$/i.test(arg)) return { kind: 'list' };
  const first = arg.split(/\s+/)[0];
  // "/fb KEK-001", with or without words after it, shows the ticket. A
  // status typed after the id is ignored on purpose: tickets move with
  // the work, not by hand.
  if (TICKET.test(first)) return { kind: 'show', id: ticketId(parseInt(TICKET.exec(first)![1], 10)) };
  return { kind: 'submit', text: arg.replace(/\s+/g, ' ') };
}

/** Move a ticket. `by` names the mover: "maintainer" (branch pushed) or "deploy" (commit live). */
export function setTicketStatus(id: string, status: Status, by: string, path = buildRequestsPath(), now = Date.now()): Ticket | null {
  const t = readTickets(path).find((x) => x.id === id);
  if (!t) return null;
  if (t.status === status) return t;
  const change: StatusChange = { change: 'status', id, at: now, by, status };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(change) + '\n', 'utf8');
  return { ...t, status };
}

/** Ticket ids named by "Ticket: KEK-nnn" trailers in commit messages, deduplicated, in order. */
export function ticketsInCommitMessages(messages: string): string[] {
  const out: string[] = [];
  for (const m of messages.matchAll(/^\s*Ticket:\s*(KEK-\d{1,4})\b/gim)) {
    const id = ticketId(parseInt(m[1].slice(4), 10));
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function readLines(path: string): Line[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as Line; } catch { return null; } })
    .filter((r): r is Line => !!r);
}

/** Every ticket with its current status, oldest first. Old lines without a title or id get one. */
export function readTickets(path = buildRequestsPath()): Ticket[] {
  const tickets: Ticket[] = [];
  const byId = new Map<string, Ticket>();
  for (const line of readLines(path)) {
    if ('change' in line) {
      const t = byId.get(line.id);
      if (t) t.status = line.status;
      continue;
    }
    const raw = line as Ticket & { id: string | number };
    const id = typeof raw.id === 'number' ? ticketId(raw.id) : raw.id;
    const t: Ticket = { ...raw, id, title: raw.title || fallbackTitle(raw.text), status: raw.status || 'open' };
    tickets.push(t);
    byId.set(id, t);
  }
  return tickets;
}

export function ticketsBetween(from: number, to: number, path = buildRequestsPath()): Ticket[] {
  return readTickets(path).filter((r) => r.at >= from && r.at < to);
}

/** The first six words, for when no model names it. */
export function fallbackTitle(text: string): string {
  const words = (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return words.length > 48 ? words.slice(0, 45).trimEnd() + '…' : words;
}

export const STATUS_MARK: Record<Status, string> = {
  open: '◻️ open', planned: '📋 planned', building: '🔨 building', review: '👀 in review', shipped: '✅ shipped', declined: '⛔ declined',
};

/** The top ten, open first, newest first within a status; one row each. */
export function renderBacklog(tickets: Ticket[]): string {
  if (tickets.length === 0) return 'The fake backlog is empty. /fb <an idea, or a bug> opens the first ticket.';
  const rank: Record<Status, number> = { building: 0, review: 1, planned: 2, open: 3, shipped: 4, declined: 5 };
  const sorted = [...tickets].sort((a, b) => rank[a.status] - rank[b.status] || b.at - a.at);
  const rows = sorted.slice(0, LIST_LIMIT).map((t) => `${t.id} · ${t.title} · ${STATUS_MARK[t.status]}`);
  const open = tickets.filter((t) => t.status !== 'shipped' && t.status !== 'declined').length;
  return `🎫 Fake backlog - ${open} open of ${tickets.length}${tickets.length > LIST_LIMIT ? `, top ${LIST_LIMIT}` : ''}\n${rows.join('\n')}`;
}

export const USAGE =
  '🎫 /fb <an idea, or a bug> opens a ticket on the fake backlog. /fb alone shows the top ten; /fb KEK-001 shows one. ' +
  'rabbidfly reviews the backlog daily; what I can build comes back as a PR for him.';

export interface SubmitInput {
  text: string;
  sender: { id?: string; name?: string; username?: string };
  chatId?: string;
  now?: number;
  path?: string;
  /** Names a ticket in four to six words; absent or failing, the first words stand in. */
  titleFor?: (text: string) => Promise<string | null>;
}

/** The reply to send, for any /fb form, or null when the text is not /fb. */
export async function runBuildRequest(input: SubmitInput): Promise<string | null> {
  const parsed = parseBuildRequest(input.text);
  if (!parsed) return null;
  const path = input.path ?? buildRequestsPath();
  const now = input.now ?? Date.now();
  const admin = isAdminUser(input.sender.id, input.sender.username);

  if (parsed.kind === 'list') return renderBacklog(readTickets(path));

  if (parsed.kind === 'show') {
    const t = readTickets(path).find((x) => x.id === parsed.id);
    if (!t) return `${parsed.id} is not on the backlog.`;
    const who = admin ? ` - ${t.sender.name || t.sender.username || t.sender.id}` : '';
    return `🎫 ${t.id} · ${t.title} · ${STATUS_MARK[t.status]}${who}\n${t.text}`;
  }

  if (!input.sender.id) return null;
  if (parsed.text.length < MIN_CHARS) return `Give me a bit more than that - what should it do, or what went wrong? (${MIN_CHARS} characters minimum.)`;
  if (parsed.text.length > MAX_CHARS) return `That is a design doc. Keep it under ${MAX_CHARS} characters; the detail can come when it is built.`;

  const all = readTickets(path);
  const dayAgo = now - 24 * 3_600_000;
  const mine = all.filter((r) => r.sender.id === input.sender.id && r.at >= dayAgo).length;
  if (mine >= PER_PERSON_PER_DAY && !admin) {
    return `You have ${PER_PERSON_PER_DAY} in today already. Tomorrow, or make one of them count.`;
  }

  let title: string | null = null;
  try { title = (await input.titleFor?.(parsed.text)) || null; } catch { title = null; }
  const ticket: Ticket = {
    id: ticketId(all.length + 1),
    at: now,
    chatId: input.chatId,
    sender: { id: input.sender.id, name: input.sender.name, username: input.sender.username },
    text: parsed.text,
    title: (title || fallbackTitle(parsed.text)).replace(/\s+/g, ' ').trim().slice(0, 60),
    status: 'open',
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(ticket) + '\n', 'utf8');
  return `🎫 ${ticket.id} · ${ticket.title} · ${STATUS_MARK.open}\nOn the fake backlog. rabbidfly reviews it daily; if I can build it, it comes back as a PR for him and you'll hear about it here. /fb shows where it stands.`;
}

/** The title prompt, for the caller that has a model. */
export function titlePrompt(text: string): string {
  return (
    'Name this request for a Telegram bot in four to six plain words, like a ticket title. ' +
    'No quotes, no trailing period, no emoji. Reply with the title only.\n\nRequest: ' + text
  );
}

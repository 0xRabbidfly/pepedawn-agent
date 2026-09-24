/**
 * /pb - the room's door into the maintainer loop.
 *
 *   /pb <an idea, or a bug>     logs it, numbered, and says so
 *   /pb list                    the last ten (admins see who; others see what)
 *
 * The maintainer (docs/MAINTAINER.md) acts only on directives from the
 * owner or an admin; everyone else's wishes reach the digest as
 * "suggestions" and are heard, not built. /pb is the community version of
 * that channel: a request logged here goes into the daily digest under its
 * own heading, the proposer may build it on a branch, and the owner reviews
 * the PR. Nothing here deploys anything.
 *
 * Stored as JSONL under src/data/maintainer/, which is gitignored: it
 * quotes real people and carries their Telegram ids.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { isAdminUser } from './admins';

export interface BuildRequest {
  id: number;
  at: number;
  chatId?: string;
  sender: { id: string; name?: string; username?: string };
  text: string;
  status: 'open';
}

export const MIN_CHARS = 12;
export const MAX_CHARS = 600;
export const PER_PERSON_PER_DAY = 3;

const PATTERN = /^(?:@[A-Za-z0-9_]+\s+)?\/pb(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i;

export function buildRequestsPath(): string {
  return process.env.BUILD_REQUESTS_PATH || join(process.cwd(), 'src', 'data', 'maintainer', 'build-requests.jsonl');
}

export function parseBuildRequest(text: string): { kind: 'submit'; text: string } | { kind: 'list' } | { kind: 'usage' } | null {
  const m = PATTERN.exec((text || '').trim());
  if (!m) return null;
  const arg = (m[1] || '').trim();
  if (!arg) return { kind: 'usage' };
  if (/^list$/i.test(arg)) return { kind: 'list' };
  return { kind: 'submit', text: arg.replace(/\s+/g, ' ') };
}

export function readBuildRequests(path = buildRequestsPath()): BuildRequest[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) as BuildRequest; } catch { return null; } })
    .filter((r): r is BuildRequest => !!r);
}

export function buildRequestsBetween(from: number, to: number, path = buildRequestsPath()): BuildRequest[] {
  return readBuildRequests(path).filter((r) => r.at >= from && r.at < to);
}

export const USAGE =
  '🛠 /pb <an idea, or a bug> - ask me to build or fix something. ' +
  'It goes to rabbidfly in the daily digest; the ones I can build come back as a PR for him to review. /pb list shows the latest.';

export interface SubmitInput {
  text: string;
  sender: { id?: string; name?: string; username?: string };
  chatId?: string;
  now?: number;
  path?: string;
}

/** The reply to send, for any /pb form, or null when the text is not /pb. */
export function runBuildRequest(input: SubmitInput): string | null {
  const parsed = parseBuildRequest(input.text);
  if (!parsed) return null;
  const path = input.path ?? buildRequestsPath();
  const now = input.now ?? Date.now();

  if (parsed.kind === 'usage') return USAGE;

  if (parsed.kind === 'list') {
    const all = readBuildRequests(path);
    if (all.length === 0) return 'No build requests yet. /pb <an idea, or a bug> starts the list.';
    const admin = isAdminUser(input.sender.id, input.sender.username);
    const last = all.slice(-10).reverse();
    const lines = last.map((r) => `#${r.id} ${admin ? `${r.sender.name || r.sender.username || r.sender.id}: ` : ''}${r.text.slice(0, 120)}`);
    return `🛠 Build requests (${all.length} logged, latest first)\n${lines.join('\n')}`;
  }

  if (!input.sender.id) return null;
  if (parsed.text.length < MIN_CHARS) return `Give me a bit more than that - what should it do, or what went wrong? (${MIN_CHARS} characters minimum.)`;
  if (parsed.text.length > MAX_CHARS) return `That is a design doc. Keep it under ${MAX_CHARS} characters; the detail can come when it is built.`;

  const all = readBuildRequests(path);
  const dayAgo = now - 24 * 3_600_000;
  const mine = all.filter((r) => r.sender.id === input.sender.id && r.at >= dayAgo).length;
  if (mine >= PER_PERSON_PER_DAY && !isAdminUser(input.sender.id, input.sender.username)) {
    return `You have ${PER_PERSON_PER_DAY} in today already. Tomorrow, or make one of them count.`;
  }

  const record: BuildRequest = {
    id: (all.at(-1)?.id ?? 0) + 1,
    at: now,
    chatId: input.chatId,
    sender: { id: input.sender.id, name: input.sender.name, username: input.sender.username },
    text: parsed.text,
    status: 'open',
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
  return `📬 Logged as #${record.id}: "${record.text.length > 140 ? record.text.slice(0, 140) + '…' : record.text}"\nrabbidfly sees these daily. If I can build it, it comes back as a PR for him to review, and you will hear about it here.`;
}

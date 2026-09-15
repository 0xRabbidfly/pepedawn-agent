/**
 * /aboutme and /forget — seeing and clearing what PEPEDAWN remembers about you.
 *
 * Deliberately unlisted: not in /help, not in the periodic tips. While the
 * memory registry is being tried out it is shared by word of mouth, so these
 * are not yet part of the public command contract. Before they are announced,
 * give them the same treatment as any other command.
 *
 *   /aboutme            what it remembers about you (this chat's, in a group)
 *   /aboutme resume     start remembering you again after /forget
 *   /forget <n>         drop one, numbered as /aboutme listed it
 *   /forget             drop everything and stop remembering you
 *
 * An admin replying to someone's message with either command acts on that
 * person instead. Anyone else replying acts on themselves: nobody can read or
 * clear another person's memories by replying to them.
 */

import { isAdminUser } from '../utils/admins';
import { orderForListing, type MemoryRecord } from '../conversation/socialMemory';
import { socialStore, type SocialMemoryStore } from '../conversation/socialMemoryStore';
import { isGroupChat, socialMemoryMode } from '../conversation/socialMemoryRuntime';

const PATTERN = /^(?:@[A-Za-z0-9_]+\s+)?\/(aboutme|forget)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i;

export function parseMemoryCommand(text: string): { name: 'aboutme' | 'forget'; arg: string } | null {
  const match = PATTERN.exec((text || '').trim());
  if (!match) return null;
  return { name: match[1].toLowerCase() as 'aboutme' | 'forget', arg: (match[2] || '').trim().toLowerCase() };
}

/** A group reply is kept short; a DM can hold the whole list. */
export const GROUP_LIST_LIMIT = 10;

export interface MemoryCommandInput {
  text: string;
  sender: { id?: string; name?: string; username?: string };
  /** Telegram chat id the command arrived in. */
  chatId?: string;
  /** Author of the message the command replied to, if any. */
  repliedTo?: { id?: string; name?: string; isBot?: boolean };
  now?: number;
  store?: SocialMemoryStore;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function describe(record: MemoryRecord): string {
  return record.kind === 'quote' ? `"${record.text}"` : record.summary;
}

/** The reply to send, or null when the text is not one of these commands. */
export function runMemoryCommand(input: MemoryCommandInput): string | null {
  const command = parseMemoryCommand(input.text);
  if (!command) return null;
  if (socialMemoryMode() === 'off') return 'Memory is switched off right now.';
  if (!input.sender.id) return null;

  const store = input.store ?? socialStore();
  const now = input.now ?? Date.now();
  const replied = input.repliedTo;
  const onSomeoneElse =
    isAdminUser(input.sender.id, input.sender.username) &&
    !!replied?.id && !replied.isBot && replied.id !== input.sender.id;
  const target = onSomeoneElse
    ? { id: replied!.id!, name: replied!.name || 'them' }
    : { id: input.sender.id, name: input.sender.name || '' };

  const scope = isGroupChat(input.chatId) ? input.chatId : undefined;
  const person = store.person(target.id);
  const inScope = person ? orderForListing(person, now, scope) : [];
  const listed = scope ? inScope.slice(0, GROUP_LIST_LIMIT) : inScope;
  const who = onSomeoneElse ? target.name : 'you';

  if (command.name === 'aboutme') {
    if (command.arg === 'resume') {
      if (!store.resume(target.id)) {
        return onSomeoneElse ? `${target.name} never asked to be forgotten.` : "You never asked me to forget you.";
      }
      return onSomeoneElse ? `I'll start remembering ${target.name} again.` : "Noted. I'll start remembering again.";
    }

    if (person?.optedOut) {
      return onSomeoneElse
        ? `${target.name} asked to be forgotten, so there's nothing.`
        : "You asked me to forget you, so I'm keeping nothing. /aboutme resume if you change your mind.";
    }
    if (listed.length === 0) {
      return onSomeoneElse
        ? `Nothing on ${target.name}${scope ? ' in this chat' : ''} yet.`
        : `Nothing on you${scope ? ' in this chat' : ''} yet. I pick up a few things from group conversations over time.`;
    }

    const lines = listed.map((r, i) => `${i + 1}. ${describe(r)} (${shortDate(r.at)})`);
    const more = inScope.length - listed.length;
    return [
      `What I remember about ${who}${scope ? ' from this chat' : ''}:`,
      ...lines,
      ...(more > 0 ? [`…and ${more} more. Ask me in a DM for the whole list.`] : []),
      '',
      '/forget <number> drops one. /forget drops everything.',
    ].join('\n');
  }

  // /forget
  if (/^\d+$/.test(command.arg)) {
    const record = listed[parseInt(command.arg, 10) - 1];
    if (!record) return `There's no number ${command.arg}. /aboutme shows the list.`;
    store.remove(target.id, record.id);
    return `Forgotten: ${describe(record)}`;
  }
  if (command.arg && !['me', 'all', 'everything'].includes(command.arg)) {
    return '/forget drops everything I remember about you. /forget <number> drops one thing from /aboutme.';
  }

  const removed = store.forget(target.id, onSomeoneElse ? target.name : input.sender.name);
  const count = `${removed} thing${removed === 1 ? '' : 's'}`;
  return onSomeoneElse
    ? `Done. Forgot ${count} about ${target.name}, and nothing new will be kept.`
    : `Done. I've forgotten ${count} about you and won't keep anything new. /aboutme resume if you ever want me to remember again.`;
}

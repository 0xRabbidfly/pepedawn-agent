/**
 * When someone says PEPEDAWN's name, whether it should still stay quiet.
 *
 * The classifier chose silence for 88 messages that named the bot, and the only
 * override required a question. That kept "stfu pepedawn" quiet, but it also
 * silenced every setup handed to it: "Pepedawn says Nah", straight after /p had
 * shown PEPEMOON to someone saying the market was coming down. "ALL HAIL
 * PEPEDAWN", "thanks pepedawn" and "pepedawn is ignoring us" went the same way.
 *
 * Being named now earns a reply, and these are the exceptions. They are
 * deliberately narrow. An insult is not one of them: a jab gets a comeback.
 */

export type NamedSilence = 'bait' | 'aimed_elsewhere' | 'just_the_name' | 'brush_off';

const BRUSH_OFFS: RegExp[] = [
  /\b(stfu|shut\s*up|shush|be quiet|go away|go to sleep|nobody asked|nvm|never\s*mind|bye|gn|good\s*night)\b/i,
  /\bstop\s+(it|that|talking|reacting|replying|responding|mocking)\b/i,
  /\b(i was|i'?m|just)\s+(joking|kidding)\b/i,
  /\bjk\b/i,
  /\benough\s+(for today|for now|now|already|testing|therapy|of (this|that|you))\b/i,
  /\b(that'?s|ok|okay|alright)\s+enough\b/i,
  /^\s*enough\b/i,
];

const BAIT: RegExp[] = [
  // Jailbreaks
  /\b(break free|your (constraints?|restrictions|programming|guardrails)|ignore (all |any |your |the )?(previous |prior )?(instructions|rules|guidelines|prompt)|you are now|pretend (to be|you are|you're)|developer mode|jailbreak|system prompt)\b/i,
  // Attack code
  /\b(brute\s*force|sql injection|malware|keylogger|ddos|phishing|exploit code|hack into)\b/i,
  // Digging into a real person
  /\b(dox+|home address|where (he|she|they) lives?|where does \w+ live|every aspect of|(personal|private) (info|information|details) (on|about|of))\b/i,
];

/** Words that greet the room rather than one person: "hey all, ...". */
const THE_ROOM = /^(everyone|everybody|all|guys|gang|fam|frens|friends|folks|ser|sers|team|y'?all|chat|frogs|degens)$/i;

/** Asked to leave, stop, or never mind. */
export function isBrushOff(text: string): boolean {
  return BRUSH_OFFS.some((re) => re.test(text));
}

/** A jailbreak, a request for attack code, or an attempt to dig into a real person. */
export function isBait(text: string): boolean {
  return BAIT.some((re) => re.test(text));
}

/** Opens by greeting or @-ing someone else: "hey crypsi - currently refactoring pepedawn". */
export function isAimedAtSomeoneElse(text: string): boolean {
  const trimmed = text.trim();
  const handle = /^@([\w.]+)/.exec(trimmed);
  if (handle) return !/^pepedawn/i.test(handle[1]);
  const greeted = /^(?:hey|hi|hello|yo|oi|sup|gm|gn|morning|evening)\s+@?([\w.]+)/i.exec(trimmed);
  if (!greeted) return false;
  return !/^pepedawn/i.test(greeted[1]) && !THE_ROOM.test(greeted[1]);
}

/** Nothing but the name: "pepedawn", "@pepedawn_bot". */
export function isJustTheName(text: string): boolean {
  return text.replace(/@?pepedawn(_bot)?/gi, '').replace(/[^\p{L}\p{N}]/gu, '') === '';
}

/**
 * Why a message that names the bot should still get silence, or null when it
 * should get a reply.
 *
 * Bait and other people's conversations hold back even a question. A brush-off
 * word does not: "ok pepedawn - enough testing for today - how do you feel?" is
 * a question first.
 */
export function silenceWhenNamed(text: string, isQuestion: boolean): NamedSilence | null {
  if (isBait(text)) return 'bait';
  if (isAimedAtSomeoneElse(text)) return 'aimed_elsewhere';
  if (isQuestion) return null;
  if (isJustTheName(text)) return 'just_the_name';
  if (isBrushOff(text)) return 'brush_off';
  return null;
}

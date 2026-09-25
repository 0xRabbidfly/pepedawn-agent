/**
 * Reacting to a message instead of replying to it.
 *
 * When someone posts to the room — a dex order link, a burn auction, an
 * announcement — and the bot has nothing to add, the old reply was "Not sure
 * what you're after. Name a card, or ask me about an artist, a series, or a
 * bit of history." That was never a question to the bot, so it answered a
 * question nobody asked, and told a person sharing something that they had
 * been unclear. Four times in the day log between 3 and 12 September.
 *
 * A reaction acknowledges the post without talking over it: no notification,
 * no message in the scroll, nothing for anyone to reply to.
 *
 * It had never once happened in production: the only branch that asked for
 * a reaction sat behind retrieval, and since 5.14.0 every unaddressed post
 * is silenced before retrieval runs - 0 reactions in 1,524 silences. The
 * decision now sits at the gate (SmartRouterService), scored here.
 */

import { logger } from '@elizaos/core';

/**
 * Bot API reactions are a fixed set — anything outside it is rejected with a
 * 400 — so the picker only ever returns from these buckets, every one of
 * which is in that set. No frog: 🐸 is not a permitted reaction.
 */
export const REACTION_BUCKETS = {
  market: ['🔥', '⚡', '🍾', '💯'],
  art: ['🤩', '😍', '🎉', '🏆', '👏', '🫡'],
  funny: ['🤣', '😁', '🤡'],
  sad: ['😢', '💔', '🙏', '😭'],
  mind: ['🤯', '😱', '👀', '🤔'],
  look: ['👀', '👌', '🤝', '🫡', '👍', '🤔'],
} as const;

export const REACTION_EMOJI: readonly string[] = [...new Set(Object.values(REACTION_BUCKETS).flat())];
export type ReactionEmoji = string;

const HOT = /\b(auction|burn(ed|ing)?|bid|drop(ped|ping)?|mint(ed|ing)?|listed|listing|dispenser|dex order|for sale|sold|floor|sweep|bought|swap)\b/i;
const ART = /\b(new (fake|card|piece|drop|art)|artwork|just (made|finished|minted)|series \d+|submission|fresh|wip|sketch|collab)\b/i;
const FUNNY = /\b(lmao|lmfao|lol|haha+|rofl|kek)\b|😂|🤣|💀/i;
const SAD = /\b(rip|rest in peace|lost|scammed|hacked|rug(ged)?|sorry for your|condolences|passed away|down bad)\b|😢|😭|💔/i;
const MIND = /\b(insane|unreal|wtf|holy|no way|wow|omg|crazy|wild)\b|🤯|😱/i;
const LINK = /https?:\/\/\S+|\bt\.me\/|\bx\.com\/|\btwitter\.com\//i;

type Bucket = keyof typeof REACTION_BUCKETS;

export function bucketFor(text: string): Bucket {
  const t = text || '';
  if (SAD.test(t)) return 'sad';
  if (FUNNY.test(t)) return 'funny';
  if (HOT.test(t)) return 'market';
  if (ART.test(t)) return 'art';
  if (MIND.test(t)) return 'mind';
  return 'look';
}

/**
 * An emoji that fits the post, varied within its bucket so the same post
 * does not always get the same face. `rng` is injectable for tests; the
 * first of each bucket is its canonical one (🔥 for the market, 👀 to look).
 */
export function reactionFor(text: string, rng: () => number = Math.random): ReactionEmoji {
  const pool = REACTION_BUCKETS[bucketFor(text)] as readonly string[];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * How much a post deserves a reaction. 0 is chatter ("gm", "lol", a
 * one-liner); 1 is worth a look; 2 or more is a really good post - a card
 * with a link, a market move with a card, a long announcement with a link -
 * and those always get one, cooldown or not.
 */
export function reactionScore(text: string, namesCard: boolean): number {
  const t = (text || '').trim();
  if (!t || t.startsWith('/')) return 0;
  let score = 0;
  if (LINK.test(t)) score += 1;
  if (HOT.test(t) || ART.test(t)) score += 1;
  if (namesCard) score += 1;
  if (t.length >= 140) score += 1;
  if (SAD.test(t) || MIND.test(t)) score += 1;
  return score;
}

export function worthAReaction(text: string, namesCard: boolean): boolean {
  return reactionScore(text, namesCard) >= 1;
}

const ASKS_FOR_ONE = /\b(react|reaction|emoji|emojis|slap me)\b/i;

/**
 * A message addressed to the bot, which it is about to answer: react to it
 * as well when it is worth a look, and always when it asks for one - "slap
 * me some emojis" got a reply full of emoji text and no reaction, which is
 * not the superpower that was promised. When they used an emoji the bot
 * may set, it gets that one back.
 */
export function reactionForAddressed(text: string, namesCard: boolean, rng: () => number = Math.random): ReactionEmoji | undefined {
  const t = text || '';
  if (ASKS_FOR_ONE.test(t)) {
    const mirrored = REACTION_EMOJI.find((e) => t.includes(e));
    return mirrored ?? reactionFor(t, rng);
  }
  return reactionScore(t, namesCard) >= 1 ? reactionFor(t, rng) : undefined;
}

/** Ordinary worthy posts share this per-room cooldown; really good ones do not wait. */
export const REACTION_COOLDOWN_MS = 5 * 60 * 1000;
const lastReactionAt = new Map<string, number>();

/** May the room get a reaction now? Records the grant when it may. */
export function reactionAllowed(roomId: string, score: number, now = Date.now(), cooldownMs = REACTION_COOLDOWN_MS): boolean {
  const last = lastReactionAt.get(roomId);
  if (score < 2 && last !== undefined && now - last < cooldownMs) return false;
  lastReactionAt.set(roomId, now);
  return true;
}

export function resetReactionCooldowns(): void {
  lastReactionAt.clear();
}

/**
 * Best effort, and says whether it worked. A group can restrict which
 * reactions are allowed, and a failure here must never turn into a reply — the
 * whole point is that the bot stays quiet.
 */
export async function sendReaction(
  token: string,
  chatId: string | undefined,
  messageId: number | undefined,
  emoji: string
): Promise<boolean> {
  if (!token || !chatId || messageId === undefined || messageId === null) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
      }),
    });
    if (!res.ok) {
      logger.warn(`[Reaction] ${emoji} refused: ${res.status} ${(await res.text()).slice(0, 160)}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ error }, '[Reaction] send threw');
    return false;
  }
}

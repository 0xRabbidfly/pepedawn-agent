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
 */

import { logger } from '@elizaos/core';

/**
 * Bot API reactions are a fixed set — anything outside it is rejected with a
 * 400 — so the picker only ever returns from this list. No frog: 🐸 is not a
 * permitted reaction.
 */
export const REACTION_EMOJI = ['👀', '🔥', '🏆', '💯', '🤝'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

const HOT = /\b(auction|burn(ed|ing)?|bid|drop(ped|ping)?|mint(ed|ing)?|listed|listing|dispenser|dex order|for sale|sold)\b/i;

/** 🔥 for something happening on the market, 👀 for everything else worth a look. */
export function reactionFor(text: string): ReactionEmoji {
  return HOT.test(text || '') ? '🔥' : '👀';
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

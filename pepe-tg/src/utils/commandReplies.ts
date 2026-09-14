/**
 * A command's reply, remembered as the bot's turn.
 *
 * Replies to typed commands were sent and forgotten, so room history never held
 * what the bot had just posted. Someone said the market was coming down, the
 * answer was /p, and the bot showed PEPEMOON - then "Pepedawn says Nah" reached
 * the router with no moon anywhere in its history, and got silence.
 */

import type { HandlerCallback } from '@elizaos/core';

/** Enough to name a card and its line. A /help page is not conversation. */
export const MAX_RECORDED_REPLY_CHARS = 400;

export function recordingReplies(
  callback: HandlerCallback | null | undefined,
  record: (text: string) => void
): HandlerCallback | undefined {
  if (!callback) return undefined;
  return (async (response: any, ...rest: any[]) => {
    const result = await (callback as any)(response, ...rest);
    const text = typeof response?.text === 'string' ? response.text.trim() : '';
    if (text) {
      record(
        text.length > MAX_RECORDED_REPLY_CHARS
          ? `${text.slice(0, MAX_RECORDED_REPLY_CHARS - 1)}…`
          : text
      );
    }
    return result;
  }) as HandlerCallback;
}

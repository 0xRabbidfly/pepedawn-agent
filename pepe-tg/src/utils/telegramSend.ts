/**
 * Sending one plain text message to a chat.
 *
 * Deliberately plain: no parse_mode. Every other sender in the codebase asks
 * for HTML or Markdown and then has to cope with Telegram rejecting the whole
 * message over a stray `&` or an unclosed tag — messageManager retries without
 * parse_mode for exactly that reason, and the recap caption once arrived with
 * its tags showing. Release notes are written by hand in a file, so the one
 * thing worth guaranteeing is that whatever is in that file arrives verbatim.
 */

import { logger } from '@elizaos/core';

/** Telegram's own ceiling for a text message. */
export const MAX_MESSAGE_CHARS = 4096;

export async function sendChannelText(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token || !chatId || !text.trim()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, MAX_MESSAGE_CHARS),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      logger.warn(`[TelegramSend] ${chatId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ error, chatId }, '[TelegramSend] send failed');
    return false;
  }
}

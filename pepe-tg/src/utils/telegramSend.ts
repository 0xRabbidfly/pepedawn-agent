/**
 * Sending to a chat, plainly.
 *
 * Deliberately no parse_mode anywhere here. Every other sender in the codebase
 * asks for HTML or Markdown and then has to cope with Telegram rejecting the
 * whole message over a stray `&` or an unclosed tag — messageManager retries
 * without parse_mode for exactly that reason, and the recap caption once
 * arrived with its tags showing. These helpers carry hand-written text from a
 * file, so the one thing worth guaranteeing is that it arrives verbatim.
 */

import { logger } from '@elizaos/core';

/** Telegram's own ceiling for a text message. */
export const MAX_MESSAGE_CHARS = 4096;
/** And for a media caption. */
export const MAX_CAPTION_CHARS = 1024;

async function call(token: string, method: string, payload: Record<string, unknown>): Promise<any | null> {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      logger.warn(`[TelegramSend] ${method} ${payload.chat_id}: ${res.status} ${JSON.stringify(body?.description ?? '').slice(0, 200)}`);
      return null;
    }
    return body.result;
  } catch (error) {
    logger.warn({ error, method }, '[TelegramSend] request failed');
    return null;
  }
}

/** One plain text message. True when Telegram took it. */
export async function sendChannelText(token: string, chatId: string, text: string): Promise<boolean> {
  return (await sendTextMessage(token, chatId, text)) !== null;
}

/** One plain text message, optionally with an inline keyboard. Returns the message id. */
export async function sendTextMessage(
  token: string,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<number | null> {
  if (!chatId || !text.trim()) return null;
  const result = await call(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, MAX_MESSAGE_CHARS),
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return typeof result?.message_id === 'number' ? result.message_id : null;
}

/** Replace a message's text. Omitting reply_markup strips its buttons, which is the point. */
export async function editMessageText(token: string, chatId: string, messageId: number, text: string): Promise<boolean> {
  const result = await call(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, MAX_MESSAGE_CHARS),
    disable_web_page_preview: true,
  });
  return result !== null;
}

export type MediaKind = 'photo' | 'video' | 'animation';

/** A photo, video or animation by file_id or URL, with a plain caption. Returns the sent message. */
export async function sendMedia(
  token: string,
  chatId: string,
  kind: MediaKind,
  fileIdOrUrl: string,
  caption: string
): Promise<any | null> {
  const method = kind === 'photo' ? 'sendPhoto' : kind === 'video' ? 'sendVideo' : 'sendAnimation';
  return call(token, method, {
    chat_id: chatId,
    [kind]: fileIdOrUrl,
    caption: caption.slice(0, MAX_CAPTION_CHARS),
    ...(kind === 'video' ? { supports_streaming: true } : {}),
  });
}

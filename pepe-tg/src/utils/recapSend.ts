/**
 * Sending a strip to Telegram.
 *
 * Shared by the nightly post and by `/recap`, because the first attempt at the
 * command handed the MP4 to the ElizaOS callback as an attachment and Telegram
 * received the words "🎬 Video:" — the callback path has no idea what to do
 * with a raw buffer, and it does not set parse_mode either, so the caption
 * arrived with its <b> and <i> tags showing.
 *
 * sendVideo with multipart form data is the only path that actually delivers a
 * video, so it is the only path either caller uses.
 */

import { logger } from '@elizaos/core';

export async function sendRecapVideo(
  token: string,
  chatId: string,
  mp4: Buffer,
  caption: string
): Promise<boolean> {
  if (!token || !chatId) {
    logger.warn('[Recap] no bot token or chat id; not sending');
    return false;
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption.slice(0, 1024));
  form.append('parse_mode', 'HTML');
  form.append('supports_streaming', 'true');
  form.append('video', new Blob([new Uint8Array(mp4)], { type: 'video/mp4' }), 'recap.mp4');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      // periodicContent swallows this shape of failure and logs success anyway.
      // A recap that vanishes silently is worse: the day stamp is already down.
      logger.error(`[Recap] send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ error }, '[Recap] send threw');
    return false;
  }
}

/** For the plain-text fallback, when there is no video to show. */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

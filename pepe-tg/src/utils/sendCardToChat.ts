/**
 * A card into a chat, outside the reply path: by cached file_id when there
 * is one, otherwise by URL, with an optional row of link buttons.
 *
 * Documents are skipped: the channel refuses them. A GIF goes out as an
 * animation by URL, which is the path that does not produce the zero-second
 * video the carousel once did. Anything Telegram rejects is reported false
 * so the caller can pick another card or try later. Lifted from the
 * anniversary service so announcements use the same, proven send.
 */

import type { CardInfo } from '../data/fullCardIndex';
import { determineCardUrl } from './cardUrlUtils';
import { extractFileId, fileIdKind, getTelegramFileId, saveTelegramFileId } from './telegramFileIdCache';
import { sendMedia } from './telegramSend';

export interface LinkButton {
  text: string;
  url: string;
}

function markup(buttons?: LinkButton[]): Record<string, unknown> | undefined {
  return buttons && buttons.length > 0 ? { inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))] } : undefined;
}

export async function sendCardToChat(
  token: string,
  chatId: string,
  card: CardInfo,
  caption: string,
  buttons?: LinkButton[],
  log: (line: string) => void = () => {},
): Promise<boolean> {
  const cached = getTelegramFileId(card.asset);
  const kind = fileIdKind(cached);
  if (cached && kind && kind !== 'document') {
    const message = await sendMedia(token, chatId, kind, cached, caption, markup(buttons));
    if (message) return true;
    log(`cached file_id for ${card.asset} rejected; trying the URL`);
  }

  const { url, extension } = determineCardUrl(card, card.asset);
  const byUrl = extension === 'mp4' ? 'video' : extension === 'gif' ? 'animation' : 'photo';
  let message = await sendMedia(token, chatId, byUrl, url, caption, markup(buttons));

  // Telegram fetches a URL itself and gives up on big files (CAKERARE's
  // full image is a 46MB animated webp). The directory's optimized copy is
  // a small still of the same card; a still beats no announcement.
  const small = card.directory?.small;
  let usedSmall = false;
  if (!message && small && small !== url) {
    log(`${card.asset} by URL rejected; sending the directory's small copy`);
    message = await sendMedia(token, chatId, 'photo', small, caption, markup(buttons));
    usedSmall = true;
  }
  if (!message) return false;
  // A file_id of the small copy would make every later /f show the
  // thumbnail, so only the full media is cached.
  if (!usedSmall) {
    const fileId = extractFileId(message);
    if (fileId) saveTelegramFileId(card.asset, fileId);
  }
  return true;
}

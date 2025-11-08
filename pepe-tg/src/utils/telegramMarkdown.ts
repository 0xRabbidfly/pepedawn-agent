/**
 * Escape text for Telegram MarkdownV2.
 * Ensures special characters are prefixed with backslashes.
 */
const TELEGRAM_ESCAPE_REGEX = /[\\_*\[\]()~>#+=|{}.!-]/g;

export function escapeTelegramMarkdown(text: string): string {
  return text.replace(TELEGRAM_ESCAPE_REGEX, (match) => `\\${match}`);
}


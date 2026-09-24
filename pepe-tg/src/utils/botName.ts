/**
 * The names the bot answers to: "pepedawn", "@pepedawn_bot", and - since
 * 5.16.2, at rabbidfly's ask - "dawn". People shorten it; the bot should
 * hear it.
 *
 * "dawn" is also a time of day. "at dawn", "the crack of dawn", "dawn of
 * the fakes" are not the bot, and are left alone; anything else is.
 * Whether "pepedawn" means the card rather than the bot is decided
 * elsewhere (cardQueries.pepedawnMeansTheCard); "dawn" is never a card.
 */

const FULL_NAME = /\bpepedawn\b|@pepedawn_bot/i;
const SHORT_NAME = /\bdawn\b/i;
const TIME_OF_DAY = /\b(?:at|the|till|until|before|since|by|after|from|to|of|crack of|new|first|early|false|pre)[\s-]+dawn\b|\bdawn\s+(?:of|till|until|to|breaks?|broke|patrol|chorus)\b/i;

/** Does the text say the bot's name, long or short? */
export function namesTheBot(text: string): boolean {
  const t = text || '';
  if (FULL_NAME.test(t)) return true;
  if (!SHORT_NAME.test(t)) return false;
  return !TIME_OF_DAY.test(t);
}

/** The name, long or short, as one alternation for patterns that strip it. */
export const BOT_NAME_ALT = '(?:pepedawn|dawn)';

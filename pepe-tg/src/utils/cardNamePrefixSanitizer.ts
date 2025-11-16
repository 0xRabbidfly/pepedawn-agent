import { FULL_CARD_INDEX } from '../data/fullCardIndex';

const CARD_NAME_SET: Set<string> = new Set(
  FULL_CARD_INDEX.map((card) => card.asset?.toUpperCase()).filter(Boolean) as string[]
);

const CARD_PREFIX_REGEX = /^(\s*)([A-Z0-9][A-Z0-9._-]{2,}):\s+(.*)$/;

/**
 * Removes leading "CARDNAME: " prefixes from outgoing messages when the token
 * matches a known Fake Rares asset. This prevents duplicated card names like
 * "PEPEDAWN: PEPEDAWN was minted..." in Telegram responses.
 */
export function stripCardNamePrefix(text: string): string {
  if (!text) {
    return text;
  }

  const match = text.match(CARD_PREFIX_REGEX);
  if (!match) {
    return text;
  }

  const [, leadingWhitespace, possibleCard, rest] = match;
  if (!CARD_NAME_SET.has(possibleCard.toUpperCase())) {
    return text;
  }

  const cleanedRest = rest.replace(/^\s+/, '');
  return `${leadingWhitespace}${cleanedRest}`;
}


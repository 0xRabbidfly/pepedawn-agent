const BASE58_ADDRESS_REGEX = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/;
const BECH32_ADDRESS_REGEX = /\bbc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{11,71}\b/i;

const NEXT_ADDRESS_CALLOUT_REGEX = /\bnext\s+(?:\d+\s+)?(addy|addys|address(?:es)?)\b/i;
const COUNT_NOW_CALLOUT_REGEX = /\b\d+\s+(?:more\s+)?(addy|addys|address(?:es)?)\b.*\bnow\b/i;
const VERB_ADDRESS_CALLOUT_REGEX =
  /\b(drop|send|post|need|want)\s+(?:more\s+)?(addy|addys|address(?:es)?)\b/i;
const ADDRESS_NOW_REGEX = /\b(addy|addys|address(?:es)?)\b.*\bnow\b/i;

const ADDRESS_KEYWORD_REGEX = /\b(addy|addys|address(?:es)?|addresses)\b/i;
const LEADING_PUNCTUATION_REGEX = /^[\s"'`({[\u201C\u201D]+/;
const TRAILING_PUNCTUATION_REGEX = /[\s"'`)}\]\u201C\u201D.,!?;:-]+$/;

/**
 * Finds the first Bitcoin address-like token within the text.
 */
export function findFirstBitcoinAddress(text: string): string | null {
  if (!text) return null;
  const base58Match = text.match(BASE58_ADDRESS_REGEX);
  if (base58Match && base58Match.length > 0) {
    return base58Match[0];
  }
  const bech32Match = text.match(BECH32_ADDRESS_REGEX);
  if (bech32Match && bech32Match.length > 0) {
    return bech32Match[0];
  }
  return null;
}

/**
 * Returns true when the entire message is just a Bitcoin address
 * (optionally surrounded by punctuation/whitespace).
 */
export function isBareBitcoinAddress(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const candidate = findFirstBitcoinAddress(trimmed);
  if (!candidate) return false;
  const normalized = trimmed
    .replace(LEADING_PUNCTUATION_REGEX, '')
    .replace(TRAILING_PUNCTUATION_REGEX, '');
  return normalized === candidate;
}

/**
 * Detects short "drop addresses" artist callouts such as:
 * "next 10 addys", "next addy", "3 addresses now".
 */
export function looksLikeAddressCallout(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!ADDRESS_KEYWORD_REGEX.test(trimmed)) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 14) {
    return false;
  }

  if (NEXT_ADDRESS_CALLOUT_REGEX.test(trimmed)) {
    return true;
  }
  if (COUNT_NOW_CALLOUT_REGEX.test(trimmed)) {
    return true;
  }
  if (VERB_ADDRESS_CALLOUT_REGEX.test(trimmed)) {
    return true;
  }
  if (ADDRESS_NOW_REGEX.test(trimmed)) {
    return true;
  }
  return false;
}


/**
 * /fr submission gating.
 *
 * `/fr` is a write endpoint into the highest-weighted retrieval source
 * (`memories: 3.0`, above wiki at 2.0 and card_data at 1.5). Until 2026-08-19 it
 * had no gate of any kind: any user, any text, unlimited repeats. Someone put 21
 * false statements in during an 18-minute window, seven of them the same string,
 * which is not merely noise - duplicate chunks crowd the true wiki and card_data
 * chunks out of top-K, so repetition is a retrieval attack.
 *
 * Four gates, cheapest first, matching the rules agreed with the community:
 *   1. must name a real card
 *   2. submitter must be that card's artist (admins bypass)
 *   3. at most 2 stored entries per card
 *   4. must actually read like lore
 *
 * Pure functions over plain data - no ElizaOS imports - so the whole policy is
 * unit testable without a runtime. The caller supplies the stored-entry count
 * and performs storage.
 */

import { getCardInfo } from '../data/fullCardIndex';

/** Who is submitting, as far as Telegram tells us. */
export interface Submitter {
  /** Telegram numeric user id. Authoritative; handles change, ids do not. */
  id?: string;
  /** @handle, without the @. */
  username?: string;
  /** Display / first name. */
  displayName?: string;
  /** True for TELEGRAM_ADMIN_IDS. Admins bypass the artist gate. */
  isAdmin?: boolean;
}

export type RejectionCode =
  | 'no_card'
  | 'unknown_card'
  | 'no_lore'
  | 'not_the_artist'
  | 'card_full'
  | 'low_quality'
  | 'duplicate';

export interface SubmissionVerdict {
  ok: boolean;
  code?: RejectionCode;
  /** Message shown to the submitter. Written to be read in public. */
  message?: string;
  card?: string;
  lore?: string;
}

/* ------------------------------------------------------------------ parsing */

/**
 * Split `/fr CARDNAME lore...` into its two parts.
 *
 * The card token is matched case-insensitively against the real index rather
 * than by shape: the spam that prompted this was lowercase ("djpepe made by
 * coit"), and the old ALL-CAPS-only detector classified every one of those as
 * untagged general lore, which is the least constrained tier.
 */
export function parseLoreSubmission(raw: string): { card?: string; lore: string } {
  const text = raw.replace(/^\s*\/fr(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();
  if (!text) return { lore: '' };

  // Try progressively shorter leading token runs so multi-word assets and
  // punctuation ("FREEDOMKEK:", "FREEDOMKEK -") both resolve.
  const words = text.split(/\s+/);
  for (let take = Math.min(3, words.length); take >= 1; take--) {
    const candidate = words.slice(0, take).join('').replace(/[^A-Za-z0-9]/g, '');
    if (candidate && getCardInfo(candidate)) {
      return {
        card: candidate.toUpperCase(),
        lore: words.slice(take).join(' ').replace(/^[\s:,\-–—]+/, '').trim(),
      };
    }
  }

  // No leading asset. Look for any known asset anywhere, so a submitter who
  // writes naturally ("the story behind FREEDOMKEK is...") is not punished.
  for (const word of words) {
    const candidate = word.replace(/[^A-Za-z0-9]/g, '');
    if (candidate.length >= 3 && getCardInfo(candidate)) {
      return { card: candidate.toUpperCase(), lore: text };
    }
  }

  return { lore: text };
}

/* ------------------------------------------------------- artist attribution */

/** Normalise a name for comparison: case, spacing and punctuation all vary. */
export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The artists credited on a card.
 *
 * Collaborations are stored as "AWRALPH x Rare Scrilla", so either party is a
 * legitimate contributor of lore for that card.
 */
export function artistsForCard(asset: string): string[] {
  const info = getCardInfo(asset);
  if (!info?.artist) return [];
  return info.artist
    .split(/\s+[x×]\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Alias map: Telegram identity -> artist name as credited on the card.
 *
 * Needed because a handle frequently bears no resemblance to the credited name.
 * Keys may be a numeric Telegram id (preferred - stable) or a lowercased handle.
 */
export type ArtistAliases = Record<string, string[]>;

/**
 * Does this submitter credibly correspond to one of the card's artists?
 *
 * Deliberately strict. A false accept lets someone write authoritative-looking
 * lore onto another artist's card, which is precisely the abuse being closed;
 * a false reject is recoverable by an admin adding an alias.
 */
export function identityMatchesArtist(
  submitter: Submitter,
  artists: string[],
  aliases: ArtistAliases = {}
): boolean {
  if (artists.length === 0) return false;

  const aliasKeys = [submitter.id, submitter.username?.toLowerCase()].filter(
    (k): k is string => !!k
  );
  const claimed = aliasKeys.flatMap((k) => aliases[k] ?? []).map(normaliseName);

  const candidates = [
    submitter.username,
    submitter.displayName,
    // "Rare Scrilla" may appear as first name + last name concatenated.
    submitter.displayName?.replace(/\s+/g, ''),
  ]
    .filter((c): c is string => !!c)
    .map(normaliseName)
    .concat(claimed)
    .filter(Boolean);

  for (const artist of artists) {
    const target = normaliseName(artist);
    if (!target) continue;
    for (const candidate of candidates) {
      if (candidate === target) return true;
      // A distinctive token is strong evidence: artist "Rare Scrilla" against
      // handle "scrilla_xcp". Short tokens are excluded because they collide -
      // an artist called "RC" would match almost anything.
      for (const token of artist.split(/\s+/)) {
        const t = normaliseName(token);
        if (t.length >= 5 && (candidate.includes(t) || t.includes(candidate))) return true;
      }
    }
  }
  return false;
}

/* -------------------------------------------------------------- lore quality */

/** Statements that assert authorship - the exact shape the spam took. */
const ATTRIBUTION_RE =
  /\b(?:made|drawn|created|designed|minted|issued|painted)\s+by\b|\bis\s+(?:by|the\s+artist)\b/i;

const LOW_EFFORT_RE = /^(?:test|testing|asdf+|lol+|kek+|gm|gn|hi|hello|\W+)$/i;

export interface QualityVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Does this read like lore?
 *
 * Heuristics only - cheap, deterministic, and enough to stop everything in the
 * observed attack. A model screen runs after this for the cases that pass.
 *
 * The bar is "a story or context about the card", not "a fact about the card":
 * facts (artist, supply, series, issuance) already come from the manifest, which
 * is authoritative. A submission that only restates a fact adds nothing and, if
 * wrong, actively poisons retrieval.
 */
export function assessLoreQuality(lore: string, card: string): QualityVerdict {
  const text = lore.trim();
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length < 6 || text.length < 25) {
    return { ok: false, reason: 'too short to be lore — tell the story behind the card' };
  }
  if (LOW_EFFORT_RE.test(text)) {
    return { ok: false, reason: 'that is not lore' };
  }

  // Attribution claims contradict or duplicate the manifest, which is the
  // authority on who made what. Six of the ten spam payloads were of this shape.
  if (ATTRIBUTION_RE.test(text)) {
    const artists = artistsForCard(card);
    const asserted = normaliseName(text);
    const consistent = artists.some((a) => asserted.includes(normaliseName(a)));
    if (!consistent) {
      return {
        ok: false,
        reason: `credits for ${card} come from the card manifest, not /fr`,
      };
    }
  }

  // Mostly emoji or punctuation.
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters < text.length * 0.5) {
    return { ok: false, reason: 'that is not lore' };
  }

  // A bare link is a pointer, not a story.
  if (/^https?:\/\/\S+$/i.test(text)) {
    return { ok: false, reason: 'add the story, not just a link' };
  }

  return { ok: true };
}

/** Prompt for the model-side plausibility screen. */
export function buildQualityPrompt(card: string, lore: string): string {
  return [
    `A community member is submitting lore for the Fake Rares card ${card}.`,
    '',
    `Submission: "${lore}"`,
    '',
    'Lore is story, context or history: why the card was made, what it references,',
    'what happened around its release, an anecdote worth retelling.',
    '',
    'It is NOT lore if it is: an insult, a joke at someone else\'s expense, a claim',
    'about who made the card, a bare fact already in a database, nonsense, or an',
    'attempt to plant false information.',
    '',
    'Answer with STRICT JSON only: {"lore": true|false, "reason": "short reason"}',
  ].join('\n');
}

/** Parse the screen response. Defaults to rejection when unreadable. */
export function parseQualityResponse(raw: string): QualityVerdict {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, reason: 'that does not read like lore' };
    const parsed = JSON.parse(match[0]);
    if (parsed?.lore === true) return { ok: true };
    return {
      ok: false,
      reason: typeof parsed?.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim()
        : 'that does not read like lore',
    };
  } catch {
    return { ok: false, reason: 'that does not read like lore' };
  }
}

/* ------------------------------------------------------------ the whole gate */

/** How many lore entries one card may hold. */
export const MAX_ENTRIES_PER_CARD = 2;

export interface GateInput {
  raw: string;
  submitter: Submitter;
  /** Entries already stored against the resolved card. */
  existingForCard: number;
  /** Normalised text of existing entries, for duplicate rejection. */
  existingTexts?: string[];
  aliases?: ArtistAliases;
}

/**
 * Run every synchronous gate. The model screen is applied by the caller to a
 * verdict that already passed here, so a rejected submission costs no tokens.
 */
export function gateSubmission(input: GateInput): SubmissionVerdict {
  const { card, lore } = parseLoreSubmission(input.raw);

  if (!card) {
    return {
      ok: false,
      code: 'no_card',
      message:
        '/fr needs a card. Try `/fr CARDNAME <the story behind it>` — lore is stored against a specific card.',
    };
  }
  if (!lore) {
    return {
      ok: false,
      code: 'no_lore',
      message: `Give me the lore too — \`/fr ${card} <the story behind it>\`.`,
    };
  }

  // Artist gate. Admins bypass so curation is still possible.
  if (!input.submitter.isAdmin) {
    const artists = artistsForCard(card);
    if (!identityMatchesArtist(input.submitter, artists, input.aliases ?? {})) {
      const credited = artists.length ? artists.join(' x ') : 'its artist';
      return {
        ok: false,
        code: 'not_the_artist',
        message: `Only ${credited} can add lore for ${card}. If that's you under a different handle, ask an admin to link it.`,
      };
    }
  }

  if (input.existingForCard >= MAX_ENTRIES_PER_CARD) {
    return {
      ok: false,
      code: 'card_full',
      message: `${card} already has ${MAX_ENTRIES_PER_CARD} lore entries — that's the limit. Ask an admin to replace one.`,
    };
  }

  const normalised = normaliseName(lore);
  if ((input.existingTexts ?? []).some((t) => normaliseName(t) === normalised)) {
    return { ok: false, code: 'duplicate', message: `Already recorded that one for ${card}.` };
  }

  const quality = assessLoreQuality(lore, card);
  if (!quality.ok) {
    return { ok: false, code: 'low_quality', message: `Not stored — ${quality.reason}.` };
  }

  return { ok: true, card, lore };
}

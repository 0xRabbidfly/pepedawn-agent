/**
 * Choosing what the day was about, and how long each panel stays on screen.
 *
 * The model's only job here is to pick indices and write a beat — the four or
 * five words stamped across the corner of a panel. It never writes dialogue.
 * Every quote is copied out of the turn it came from, by index, because a
 * recap that puts invented words in a named person's mouth is a worse failure
 * than no recap at all. It is the same class of bug as crediting DJ Pepe to
 * the wrong artist, with a person on the receiving end instead of an artist.
 */

import type { DayTurn } from '../conversation/dayLog';

export interface RecapMoment {
  /** Verbatim, from the turn. Truncated only at the tail, never reworded. */
  quote: string;
  /** The turn's own author. Absent means the bot said it. */
  author?: string;
  isBot: boolean;
  /** The model's caption for the panel, e.g. "THE MARKET OPENS". */
  beat: string;
  at: number;
  /** How long this panel holds, in ms. */
  holdMs: number;
}

export interface MomentChoice {
  index: number;
  beat: string;
}

/** Longer than this and the panel stops being readable at a glance. */
export const MAX_QUOTE_CHARS = 180;

/**
 * A panel has to stay up long enough to be read, and quotes vary from three
 * words to thirty. Fixed timing suits neither: the short ones drag and the
 * long ones flick past before anyone has finished the second line.
 *
 * ~230ms a word is unhurried reading, and the constant covers the beat spent
 * looking at the card before the eye reaches the bubble. Clamped at both ends
 * so a two-word quote still lands and a long one cannot stall the strip.
 */
export function holdMsFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const raw = 1800 + words * 230 + text.length * 14;
  return Math.max(4200, Math.min(9500, Math.round(raw / 100) * 100));
}

export function truncateQuote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_QUOTE_CHARS) return clean;
  const cut = clean.slice(0, MAX_QUOTE_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_QUOTE_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

/**
 * Turns worth showing at all: long enough to carry something, not a bare
 * command, and not from anyone who has asked to be left out.
 */
export function eligibleTurns(turns: DayTurn[], optedOut: string[] = []): DayTurn[] {
  const out = new Set(optedOut.map((h) => h.toLowerCase().replace(/^@/, '')));
  return turns.filter((t) => {
    const text = (t.text || '').trim();
    if (text.length < 12) return false;
    if (/^\//.test(text)) return false;
    if (t.author && out.has(t.author.toLowerCase().replace(/^@/, ''))) return false;
    return true;
  });
}

/**
 * Build the panel list from the model's choices.
 *
 * Anything the model returns that does not resolve to a real turn is dropped
 * rather than repaired: a hallucinated index is a hallucinated quote, and
 * there is no safe way to guess what was meant.
 */
export function buildMoments(turns: DayTurn[], choices: MomentChoice[], limit = 5): RecapMoment[] {
  const seen = new Set<number>();
  const moments: RecapMoment[] = [];

  for (const choice of choices) {
    if (moments.length >= limit) break;
    const turn = turns[choice.index];
    if (!turn || seen.has(choice.index)) continue;
    seen.add(choice.index);

    const quote = truncateQuote(turn.text);
    if (!quote) continue;

    moments.push({
      quote,
      author: turn.author,
      isBot: turn.role === 'bot',
      beat: cleanBeat(choice.beat),
      at: turn.at,
      holdMs: holdMsFor(quote),
    });
  }

  return moments.sort((a, b) => a.at - b.at);
}

/** The beat is stamped on the panel in a fixed-width slot, so it is capped. */
export function cleanBeat(beat: string | undefined): string {
  const clean = (beat || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!clean) return 'MEANWHILE';
  return clean.length > 26 ? clean.slice(0, 25).trimEnd() + '…' : clean;
}

/** The prompt. Kept here so the rule it states lives beside the code enforcing it. */
export function momentPrompt(turns: DayTurn[], want: number): string {
  const lines = turns.map((t, i) => `${i}: [${t.role === 'bot' ? 'PEPEDAWN' : t.author || 'someone'}] ${t.text.replace(/\s+/g, ' ').slice(0, 220)}`);
  return [
    `Below is one day of a Fake Rares Telegram channel, one numbered line per message.`,
    ``,
    `Pick the ${want} that would make the funniest short catch-up strip for someone who missed the day.`,
    `Favour: a strong opinion, a joke that landed, a good question, a trade, a moment the bot was`,
    `actually useful, and anyone talking to PEPEDAWN as though it were a person -- realising it is a`,
    `bot, arguing with it, testing it. Those exchanges are the funniest thing the room produces.`,
    `Avoid: greetings, one-word replies, anything mean about a named person, and anything that`,
    `reads as a private negotiation.`,
    ``,
    `Return ONLY a JSON array, no prose: [{"index": <line number>, "beat": "<up to 4 words, the`,
    `caption stamped on that panel, e.g. A TAKE IS HAD>"}]`,
    ``,
    `Do not write or reword any dialogue. The quote is taken from the line itself.`,
    ``,
    ...lines,
  ].join('\n');
}

/** Parse the model's reply. Anything malformed yields nothing, never a guess. */
export function parseChoices(raw: string): MomentChoice[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && Number.isInteger(c.index) && c.index >= 0)
      .map((c) => ({ index: c.index, beat: String(c.beat ?? '') }));
  } catch {
    return [];
  }
}

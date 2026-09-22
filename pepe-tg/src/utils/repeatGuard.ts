/**
 * The one place that stops PEPEDAWN saying the same thing twice.
 *
 * Every reply the router produces — a model's, or a deterministic one built
 * from the card index or a state file — leaves through a single callback in
 * executeSmartRouterPlan. Prompt rules against repetition only reach the model
 * paths, and a fast path that answers the same question with the same exact
 * fact cannot be talked out of it. So the check is made on the text on its way
 * out, against what the bot has already said in that room lately, and it holds
 * whichever path wrote the text.
 *
 * Pure: the caller supplies the recent bot turns and the clock.
 */

export const REPEAT_WINDOW_MS = 30 * 60 * 1000;
export const REPEAT_THRESHOLD = 0.8;
/** Below this many words a reply is too short to call a repeat: "gm" is allowed twice. */
export const MIN_WORDS = 4;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Dice coefficient over word bigrams. 1 is identical wording; 0 shares nothing. */
export function similarity(a: string, b: string): number {
  const bigrams = (ws: string[]) => {
    const out = new Map<string, number>();
    if (ws.length === 1) out.set(ws[0], 1);
    for (let i = 0; i + 1 < ws.length; i++) {
      const k = `${ws[i]} ${ws[i + 1]}`;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  };
  const x = bigrams(words(a));
  const y = bigrams(words(b));
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const [k, n] of x) shared += Math.min(n, y.get(k) ?? 0);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  return (2 * shared) / total;
}

export interface PriorTurn {
  text: string;
  at: number;
}

/** The earlier reply this one would repeat, or null. */
export function findRepeat(
  text: string,
  recentBotTurns: PriorTurn[],
  now: number,
  options: { windowMs?: number; threshold?: number } = {}
): PriorTurn | null {
  const windowMs = options.windowMs ?? REPEAT_WINDOW_MS;
  const threshold = options.threshold ?? REPEAT_THRESHOLD;
  if (words(text).length < MIN_WORDS) return null;
  for (let i = recentBotTurns.length - 1; i >= 0; i--) {
    const prior = recentBotTurns[i];
    if (now - prior.at > windowMs) break;
    if (similarity(text, prior.text) >= threshold) return prior;
  }
  return null;
}

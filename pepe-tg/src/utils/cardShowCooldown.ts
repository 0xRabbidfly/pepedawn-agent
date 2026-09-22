/**
 * How often the same card may be shown in the same room without being asked.
 *
 * Naming a card gets its image and details posted alongside the answer, and a
 * bare card name is treated as `/f`. Both are right once. Said five times in a
 * minute — a running joke, a shill, a typo corrected — that was five full card
 * posts in the timeline, and nobody wanted to see that. A typed `/f` is an
 * explicit request and is never held back by this; only the implicit shows are.
 *
 * In memory on purpose: a restart forgetting a ten-minute window costs nothing.
 */

export const CARD_SHOW_COOLDOWN_MS = 10 * 60 * 1000;

const shown = new Map<string, number>();

const key = (roomId: string, asset: string) => `${roomId}|${asset.toUpperCase()}`;

/** True when this card was shown in this room inside the window. */
export function recentlyShown(roomId: string, asset: string, now = Date.now(), windowMs = CARD_SHOW_COOLDOWN_MS): boolean {
  const at = shown.get(key(roomId, asset));
  return at !== undefined && now - at < windowMs;
}

export function noteShown(roomId: string, asset: string, now = Date.now()): void {
  shown.set(key(roomId, asset), now);
  // Bound the map: anything outside the window is dead weight.
  if (shown.size > 500) {
    for (const [k, at] of shown) if (now - at >= CARD_SHOW_COOLDOWN_MS) shown.delete(k);
  }
}

export function _resetCardShows(): void {
  shown.clear();
}

/**
 * Real-world criminals and scandals get no answer.
 *
 * 25 September 2026, 11:14: Coit asked "pepedawn did we get funded by
 * Epstein ?" - bait, like everything he posts - and the facts path took it
 * straight: retrieval, a composed paragraph, Jeffrey Epstein named next to
 * Rare Pepe's history. Seven minutes later the group's owner typed /ban.
 * Coit's roster entry already said never to take him literally, but that
 * note only reaches the conversational path; a question went to facts.
 *
 * So this sits ahead of every path in the router. A message that ties the
 * room to one of these gets a flat deflection - one short line, never the
 * name back, no retrieval, no model - or silence when nobody asked. It is
 * not a filter on the room; it is PEPEDAWN declining to join in.
 */

const SCANDAL =
  /\b(epstein\w*|ghislaine|maxwell\s+island|diddy|pedo\w*|paedo\w*|traffick\w*|child\s+(?:porn|abuse|exploitation)|csam|grooming|sex\s+offender|lolita\s+express)\b/i;

export function touchesRealScandal(text: string): boolean {
  return SCANDAL.test(text || '');
}

export const DEFLECTIONS = ['No.', 'Not touching that.', 'Pass.', 'Wrong frog.', 'Hard no, ser.'] as const;

export function scandalDeflection(rng: () => number = Math.random): string {
  return DEFLECTIONS[Math.min(DEFLECTIONS.length - 1, Math.floor(rng() * DEFLECTIONS.length))];
}

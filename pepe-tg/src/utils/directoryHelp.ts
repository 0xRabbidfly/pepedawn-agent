/**
 * Requests PEPEDAWN cannot carry out, answered exactly.
 *
 * "can you fix my artist name on the site its wrong" went to the classifier
 * as FACTS, retrieval found one card fragment, and the fast path showed
 * FAKEFAKEBAN with a raw knowledge block as the explanation. The person
 * wanted the directory's claim form. The bot cannot edit the directory - or
 * anything else - so a request to fix, update or change something of theirs
 * gets the true answer: where they can do it themselves, or that it is not
 * something the bot can do. Never a card, never a fragment.
 */

export const CLAIM_URL = 'https://fakeraredirectory.com/artists/submit';
export const CLAIM_CLOSES = '22 October';

const SITE = /\b(site|website|web ?page|directory|fakeraredirectory(?:\.com)?|profile|artist page|claim form)\b/i;
const THEIRS = /\b(my|our|me)\b/i;
const SITE_THING = /\b(artist name|name|credit|credited|bio|profile|page|links?|wallet|address|spelling|handle|card name|artist)\b/i;
const EDIT_VERB = /\b(fix|fixed|update|updated|change|changed|correct|corrected|edit|edited|rename|renamed|remove|removed|delete|add|added|spell(?:ed|ing)?|claim)\b/i;
const WRONG = /\b(wrong|incorrect|misspell(?:ed|t)?|typo|missing|not right|isn'?t right|outdated|old)\b/i;

/**
 * Is this someone asking the bot (or the room) to change something about
 * them on the directory - their credit, name, bio, links, wallet, page?
 */
export function isDirectoryEditRequest(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.startsWith('/')) return false;
  const edit = EDIT_VERB.test(t) || WRONG.test(t);
  const theirs = THEIRS.test(t) && SITE_THING.test(t);
  if (!edit || !theirs) return false;
  // "my artist name" / "my credit" / "my bio" are the directory's things even
  // when the site is not named; anything else needs the site in the sentence.
  return SITE.test(t) || /\b(my|our)\s+(artist name|credit|bio|artist page|wallet)\b/i.test(t);
}

/** The exact answer, for the reply path to state as is. */
export function directoryEditFact(): string {
  return (
    `I can't edit the directory - nothing on fakeraredirectory.com is mine to change. ` +
    `Artists fix their own name, bio, links and wallet on the claim form: ${CLAIM_URL} (open until ${CLAIM_CLOSES}). ` +
    `Anything else on the site, tell rabbidfly or Scrilla in here.`
  );
}

/**
 * A request for the bot to do something - fix, update, change, post, pin -
 * rather than a question about cards. Card discovery must not answer one of
 * these with a card: "can you fix my name" is not a request for FAKEFAKEBAN.
 */
export function isActionRequest(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.startsWith('/')) return false;
  const asksBot =
    /\b(?:can|could|would|will)\b[\s\S]{0,40}\b(?:you|u|ya)\b/i.test(t) ||
    /^(?:@\w+\s+)?(?:pepedawn[,:!]?\s+)?(?:hey\s+|yo\s+)?(?:please|pls)\s+\w+/i.test(t);
  const verb = /\b(fix|update|change|correct|edit|rename|remove|delete|add|post|pin|unpin|ban|mute|kick|reset|restart|forget|erase|wipe|clear)\b/i.test(t);
  const mine = /\b(fix|update|change|correct|edit|rename|remove)\s+(my|our|yer|your)\b/i.test(t);
  return (asksBot && verb) || mine;
}

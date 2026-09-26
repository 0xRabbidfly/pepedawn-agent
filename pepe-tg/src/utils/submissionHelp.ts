/**
 * "How do I submit a fake?" gets the submission rules, stated exactly.
 *
 * 25 September 2026: "Pepedawn how do you submit a fake application to join
 * the collection ?" went down the facts path. The vision pass had filled the
 * corpus with card facts, which FACTS mode weights above the wiki, so all six
 * selected passages were cards and the answer was FAKESUBMIT - "its reverse
 * contains the Fake submission instructions" - with the card attached. The
 * same kind of question on 21 August still drew four wiki passages.
 *
 * v3.13.0 answered these with the canonical wiki link and nothing else. That
 * short-circuit went with the v4.0.0 router, and until the corpus shifted
 * retrieval happened to cover for it. This puts it back, for this one
 * question: someone asking how to submit a fake. Not lore (/fr), not the
 * directory's claim form, not Fake Commons, not a card someone named.
 */

export const SUBMISSION_RULES_URL =
  'https://wiki.pepe.wtf/chapter-2-the-rare-pepe-project/fake-rares-and-dank-rares/fake-rares-submission-rules';

const SUBMIT = /\b(submit(?:ting)?|submissions?|apply(?:ing)?|applications?)\b/i;
const FAKE = /\bfakes?\b/i;
// Asking, not announcing: "how do you submit", "can I submit", "where do I
// apply", "what are the submission rules". "I just submitted my fake" and
// "attempting to submit a Fake ... can devs do something?" are not asks.
const ASKING =
  /\b(how|where)\b|\b(?:can|could|may|do|should)\s+(?:i|we|you|u|one|someone|artists?|people)\b|\b(rules?|process|requirements?|guidelines?|criteria|steps)\b/i;
// Other things one submits, or other collections with their own rules.
const ELSEWHERE = /\b(lore|story|stories|memory|remember|commons?|dank|directory|claim|profile|site|website)\b/i;

/** Is this someone asking how to submit a fake to the collection? */
export function isFakeSubmissionQuestion(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.startsWith('/')) return false;
  return SUBMIT.test(t) && FAKE.test(t) && ASKING.test(t) && !ELSEWHERE.test(t);
}

/**
 * The v3.13.0 answer, as it was. Single asterisks: replies go out with
 * Telegram's legacy Markdown, where `**` is not bold.
 */
export function fakeSubmissionAnswer(): string {
  return `*Fake Rares Submission Rules*\n${SUBMISSION_RULES_URL}`;
}

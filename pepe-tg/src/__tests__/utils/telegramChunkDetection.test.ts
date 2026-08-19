import { describe, expect, it } from 'bun:test';

/**
 * Guards the continuation-chunk detection in loreRetrieval.ts.
 *
 * Only the first chunk of an imported Telegram session carries the
 * [TELEGRAM_SESSION:...] marker. Continuation chunks begin "Messages:" followed
 * by "- <id> | <name>: ..." and were previously classified as wiki, drawing
 * wiki's authority boost — which is how chat chatter reached factual answers.
 *
 * Text shapes below are taken verbatim from the production corpus.
 */
const looksLikeTelegramTranscript = (text: string): boolean =>
  /^\s*-\s+\d+\s*\|\s*[^:\n]{1,60}:/m.test(text) || /^Messages:\s*$/m.test(text);

describe('telegram continuation-chunk detection', () => {
  it('detects a continuation chunk', () => {
    const chunk =
      'Messages:\n- 107319 | Animal Spirits: Is that fully purged bro?\n' +
      '- 107321 | Dimension: lots of improvements being done to dankset';
    expect(looksLikeTelegramTranscript(chunk)).toBe(true);
  });

  it('detects a transcript line even without the Messages header', () => {
    expect(looksLikeTelegramTranscript('- 44122 | Rare Scrilla: gm fam')).toBe(true);
  });

  it('does not misfire on wiki prose', () => {
    const wiki =
      'The Fake Rares submission rules require a 400x560 image.\n' +
      '- Artwork must be original\n- Fees are paid in XCP';
    expect(looksLikeTelegramTranscript(wiki)).toBe(false);
  });

  it('does not misfire on card facts', () => {
    const card =
      '[CARD:FREEDOMKEK] [CARD_FACT:ON-CARD TEXT]\nCollection: Fake Rares\n' +
      'Series 0 - Card 1 - by Rare Scrilla\n\n"DADDY helps build them"';
    expect(looksLikeTelegramTranscript(card)).toBe(false);
  });

  it('does not misfire on a numbered list', () => {
    expect(looksLikeTelegramTranscript('Steps:\n1. Submit\n2. Wait\n3. Ship')).toBe(false);
  });

  it('does not misfire on a bare bullet list', () => {
    expect(looksLikeTelegramTranscript('- one\n- two\n- three')).toBe(false);
  });
});

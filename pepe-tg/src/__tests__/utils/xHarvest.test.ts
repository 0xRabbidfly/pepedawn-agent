/**
 * X harvest tests.
 *
 * Anchored on the real payloads returned by the xAI Agent Tools API on
 * 2026-08-19. The four measured query shapes produced 62 posts between them;
 * the scorer's job is to keep the ~20 that carry news and drop the rest, so the
 * fixtures here are verbatim examples of both.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import {
  scoreInterest, cardsMentioned, parseHarvestResponse, mergePosts,
  selectForVolunteer, matchForConversation, formatForTelegram,
  markVolunteered, allPosts, _resetCache,
  isXActivityQuestion, buildDigest, formatDigestForTelegram,
  DEFAULT_HARVEST_CONFIG, type HarvestedPost,
} from '../../utils/xHarvest';

const STORE = join(tmpdir(), `x-harvest-test-${process.pid}.json`);
const NOW = Date.parse('2026-08-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.X_HARVEST_PATH = STORE;
  try { rmSync(STORE); } catch { /* first run */ }
  _resetCache();
});

const post = (over: Partial<HarvestedPost> = {}): HarvestedPost => ({
  id: 'a-1', author: 'someone', text: 'a fake rares post about a series drop',
  postedAt: NOW - DAY, harvestedAt: NOW, query: 'phrase', cards: [], interest: 0.6,
  ...over,
});

// ---------------------------------------------------------------- scoring

describe('scoreInterest', () => {
  it('rejects the chatter that hashtag search returns', () => {
    // Verbatim from the #fakerares / @FAKERARES_XCP query: 9 results, 8 like these.
    for (const noise of ['GM', 'gmeme', '😊', '🤝', 'heh! this fun!', 'GM Lord have a nice day bro']) {
      expect(scoreInterest(noise)).toBeLessThan(DEFAULT_HARVEST_CONFIG.minInterest);
    }
  });

  it('rejects a personal post from an artist account', () => {
    // The author-filtered query returned 6 of these for every 1 useful post.
    expect(scoreInterest('This is my dad btw')).toBeLessThan(DEFAULT_HARVEST_CONFIG.minInterest);
    expect(scoreInterest('Watch and listen to this immediately')).toBeLessThan(DEFAULT_HARVEST_CONFIG.minInterest);
  });

  it('keeps a card reference with series and number', () => {
    const s = scoreInterest('GM  FAKEHAIRPEP by FakeBuddha\nSeries 1 Card 20\n2021 still hits different  Fake Rares forever');
    expect(s).toBeGreaterThan(0.7);
  });

  it('keeps a drop announcement', () => {
    const s = scoreInterest("and it's dropping on a Fake Rare near you really really soon, maybe even the promo card for the first series of the collectable trading cards launching very very very soon.");
    expect(s).toBeGreaterThan(DEFAULT_HARVEST_CONFIG.minInterest);
  });

  it('scores a lore lesson at the top', () => {
    const s = scoreInterest("Today's Rare Pepe Lore Lesson is Series 11, Card 13 - PEPELEO. The creator is unknown. This is a 1/1,000 card with a current floor price of .000215 BTC. 119 wallets hold a copy and the creator's wallet still has 45.4% of the total supply.");
    expect(s).toBeGreaterThan(0.9);
  });

  it('rejects the fake-rare-bird article that matched the phrase query', () => {
    // Real false positive: a news piece about AI-corrupted wildlife databases.
    const s = scoreInterest('610 million wildlife photos. AI is quietly corrupting them. A birder asked AI to clean up a blurry shot, and it swapped the species entirely. A fake rare-bird sighting then landed in the exact databases scientists use to track wildlife.');
    expect(s).toBe(0);
  });

  it('rejects a wall of contract addresses', () => {
    const s = scoreInterest('Buy Spot of all your fav tickers ethereum:0x6982508145454ce325ddbe47a25d4ec3d2311933 pepe cash ethereum:0xa882606494d86804b5514e07e6bd2d6a6ee6d68a counterparty');
    expect(s).toBeLessThan(DEFAULT_HARVEST_CONFIG.minInterest);
  });
});

describe('cardsMentioned', () => {
  it('resolves tickers against the real index and ignores shouting', () => {
    expect(cardsMentioned('GM FAKEHAIRPEP by FakeBuddha')).toContain('FAKEHAIRPEP');
    expect(cardsMentioned('THIS IS NOTACARD SHOUTING')).toEqual([]);
  });
});

// ---------------------------------------------------------------- parsing

describe('parseHarvestResponse', () => {
  it('parses the JSON the harvest asks for, with metrics and permalink', () => {
    const raw = JSON.stringify([{
      author: 'subterranean_1', date: '2026-08-19T00:00:00Z',
      text: "Today's Rare Pepe Lore Lesson is Series 12, Card 35 - PEPONG. The creator is unknown. This is a 1/100 card with none for sale. 51 wallets hold a copy of the card.",
      url: 'https://x.com/subterranean_1/status/2090227317746618797',
      likes: 36, retweets: 10, replies: 4,
    }]);
    const posts = parseHarvestResponse(raw, 'curated', NOW);
    expect(posts).toHaveLength(1);
    expect(posts[0].likes).toBe(36);
    expect(posts[0].url).toContain('/status/');
  });

  it('strips code fences the model sometimes adds', () => {
    const raw = '```json\n[{"author":"a","date":"2026-08-19T00:00:00Z","text":"a fake rares series drop is launching with a new card supply"}]\n```';
    expect(parseHarvestResponse(raw, 'phrase', NOW)).toHaveLength(1);
  });

  it('rejects a permalink that is not on x.com', () => {
    const raw = JSON.stringify([{ author: 'a', date: '2026-08-19T00:00:00Z', url: 'https://evil.example/x',
      text: 'a fake rares series drop is launching with a new card supply' }]);
    expect(parseHarvestResponse(raw, 'phrase', NOW)[0].url).toBeUndefined();
  });

  it('falls back to the prose format, whose date contains its own comma', () => {
    // This is what the model emits when it ignores the JSON instruction, and
    // the comma inside "Wed, 19 Aug 2026 ..." is what broke the first parser.
    const raw = '- Author: @COITnft, Date: Tue, 11 Aug 2026 06:10:44 GMT, Text: GM FAKEHAIRPEP by FakeBuddha Series 1 Card 20 2021 still hits different Fake Rares forever';
    const posts = parseHarvestResponse(raw, 'phrase', NOW);
    expect(posts).toHaveLength(1);
    expect(posts[0].author).toBe('COITnft');
    expect(posts[0].cards).toContain('FAKEHAIRPEP');
  });

  it('drops posts older than the retention window', () => {
    const raw = JSON.stringify([{ author: 'a', date: new Date(NOW - 40 * DAY).toISOString(),
      text: 'a fake rares series drop is launching with a new card supply' }]);
    expect(parseHarvestResponse(raw, 'phrase', NOW)).toHaveLength(0);
  });

  it('returns nothing for a non-JSON, non-list refusal', () => {
    expect(parseHarvestResponse('Activity is thin. No posts matched.', 'phrase', NOW)).toEqual([]);
  });
});

// ---------------------------------------------------------------- store

describe('mergePosts', () => {
  it('deduplicates by id across harvests', () => {
    mergePosts([post()], NOW);
    mergePosts([post()], NOW);
    expect(allPosts()).toHaveLength(1);
  });

  it('preserves volunteeredAt when the same post is harvested again', () => {
    mergePosts([post()], NOW);
    markVolunteered('a-1', NOW);
    mergePosts([post()], NOW);
    expect(allPosts()[0].volunteeredAt).toBe(NOW);
  });

  it('expires posts past the retention window', () => {
    mergePosts([post({ id: 'old', postedAt: NOW - 30 * DAY })], NOW - 30 * DAY);
    mergePosts([post({ id: 'new' })], NOW);
    expect(allPosts().map((p) => p.id)).toEqual(['new']);
  });
});

// ---------------------------------------------------------------- push

describe('selectForVolunteer', () => {
  it('says nothing while the room is still talking', () => {
    mergePosts([post()], NOW);
    expect(selectForVolunteer({ lastUserAt: NOW - 60_000, now: NOW })).toBeNull();
  });

  it('offers the highest-interest unused post once the room is quiet', () => {
    mergePosts([post({ id: 'dull', interest: 0.4 }), post({ id: 'good', interest: 0.9 })], NOW);
    const chosen = selectForVolunteer({ lastUserAt: NOW - 3 * 60 * 60 * 1000, now: NOW });
    expect(chosen?.id).toBe('good');
  });

  it('never volunteers into a room with no history at all', () => {
    // An empty room is not a quiet room - there is nobody to talk to.
    mergePosts([post()], NOW);
    expect(selectForVolunteer({ lastUserAt: undefined, now: NOW })).toBeNull();
  });

  it('respects the gap between volunteered posts', () => {
    mergePosts([post()], NOW);
    const quiet = { lastUserAt: NOW - 3 * 60 * 60 * 1000, now: NOW };
    expect(selectForVolunteer({ ...quiet, lastVolunteerAt: NOW - 60 * 60 * 1000 })).toBeNull();
    expect(selectForVolunteer({ ...quiet, lastVolunteerAt: NOW - 8 * 60 * 60 * 1000 })).not.toBeNull();
  });

  it('never offers the same post twice', () => {
    mergePosts([post()], NOW);
    markVolunteered('a-1', NOW);
    expect(selectForVolunteer({ lastUserAt: NOW - 3 * 60 * 60 * 1000, now: NOW })).toBeNull();
  });
});

// ---------------------------------------------------------------- pull

describe('matchForConversation', () => {
  it('connects on a shared card asset', () => {
    mergePosts([post({ id: 'c', cards: ['FAKEHAIRPEP'], text: 'GM FAKEHAIRPEP by FakeBuddha Series 1 Card 20' })], NOW);
    expect(matchForConversation('anyone know much about FAKEHAIRPEP?', { now: NOW })?.id).toBe('c');
  });

  it('stays silent on generic chatter', () => {
    // "pepe" and "card" are stopworded precisely so this cannot fire.
    mergePosts([post({ text: 'a fake rares card and a pepe and another pepe card' })], NOW);
    expect(matchForConversation('gm what a pepe card day', { now: NOW })).toBeNull();
  });

  it('connects on a single distinctive term', () => {
    // One rare proper noun is a stronger signal than two common words, which is
    // how "tell me about PEPELEO" reaches a post that mentions it once.
    mergePosts([post({ text: 'the counterparty dispenser mechanism explained at length for collectors' })], NOW);
    expect(matchForConversation('how does the counterparty dispenser work', { now: NOW })).not.toBeNull();
  });

  it('does not connect on a term common to the whole store', () => {
    mergePosts([
      post({ id: 'a', text: 'a fake rares drop for collectors is launching this week' }),
      post({ id: 'b', text: 'another series for collectors is minting shortly' }),
    ], NOW);
    // "collectors" is in every post, so it carries no information.
    expect(matchForConversation('any collectors around', { now: NOW })).toBeNull();
  });

  it('connects on the author when the message names them', () => {
    // The lore lessons never contain the word "subterranean" - only the handle
    // does - so without author matching "lore from subterranean" found nothing.
    mergePosts([post({ id: 's', author: 'subterranean_1',
      text: "Today's Rare Pepe Lore Lesson is Series 11, Card 13 - PEPELEO with a floor of .000215 BTC" })], NOW);
    expect(matchForConversation("what's the latest lore from subterranean?", { now: NOW })?.id).toBe('s');
  });

  it('prefers the newest post when asked for the latest', () => {
    mergePosts([
      post({ id: 'old', author: 'subterranean_1', postedAt: NOW - 5 * DAY, interest: 0.9,
        text: 'Rare Pepe Lore Lesson Series 1 Card 1 with supply and floor detail' }),
      post({ id: 'new', author: 'subterranean_1', postedAt: NOW - 1 * DAY, interest: 0.6,
        text: 'Rare Pepe Lore Lesson Series 2 Card 2 with supply and floor detail' }),
    ], NOW);
    expect(matchForConversation('latest from subterranean', { now: NOW })?.id).toBe('new');
  });

  it('never reuses a post already woven in', () => {
    mergePosts([post({ id: 'c', cards: ['FAKEHAIRPEP'], usedAt: NOW })], NOW);
    expect(matchForConversation('tell me about FAKEHAIRPEP', { now: NOW })).toBeNull();
  });
});

// ---------------------------------------------------------------- rendering

describe('formatForTelegram', () => {
  it('escapes HTML rather than letting post text inject markup', () => {
    const card = formatForTelegram(post({ text: '<script>alert(1)</script> & "fake rares" series drop' }));
    expect(card.text).not.toContain('<script>');
    expect(card.text).toContain('&lt;script&gt;');
    expect(card.parseMode).toBe('HTML');
  });

  it('survives the underscored handles that break Markdown parse mode', () => {
    // @subterranean_1, @h_u_e_s_, @Easy_to_the_b are all real; an unmatched
    // underscore makes Telegram reject the whole message in Markdown mode.
    const card = formatForTelegram(post({ author: 'h_u_e_s_' }));
    expect(card.text).toContain('@h_u_e_s_');
    expect(card.text).not.toContain('\\_');
  });

  it('shows engagement and links to the post', () => {
    const card = formatForTelegram(post({
      url: 'https://x.com/a/status/1', likes: 1234, retweets: 56, replies: 7,
    }));
    expect(card.text).toContain('1.2K');
    expect(card.text).toContain('https://x.com/a/status/1');
  });

  it('falls back to the profile when no permalink was returned', () => {
    expect(formatForTelegram(post({ author: 'bob' })).text).toContain('https://x.com/bob');
  });

  it('truncates a lore lesson rather than flooding the room', () => {
    const card = formatForTelegram(post({ text: 'fake rares series drop '.repeat(200) }));
    expect(card.text.length).toBeLessThan(1200);
    expect(card.text).toContain('…');
  });

  it('keeps PEPEDAWN\'s framing outside the quoted stranger', () => {
    const card = formatForTelegram(post(), 'Quiet in here:');
    expect(card.text.indexOf('Quiet in here:')).toBeLessThan(card.text.indexOf('<blockquote>'));
  });
});

// ---------------------------------------------------------------- digest

describe('isXActivityQuestion', () => {
  it('recognises a question about the feed', () => {
    for (const q of [
      'what are people saying about fake rares on x?',
      'anything happening on twitter?',
      "what's the x chatter like",
      'what are people posting about on X',
    ]) expect(isXActivityQuestion(q)).toBe(true);
  });

  it('ignores questions that are not about X', () => {
    for (const q of [
      'what are people saying in here',
      'tell me about PEPELEO',
      'gm',
      'what is counterparty',
    ]) expect(isXActivityQuestion(q)).toBe(false);
  });
});

describe('buildDigest', () => {
  it('returns the newest worthwhile posts, newest first', () => {
    mergePosts([
      post({ id: 'a', postedAt: NOW - 3 * DAY }),
      post({ id: 'b', postedAt: NOW - 1 * DAY }),
      post({ id: 'c', postedAt: NOW - 2 * DAY }),
    ], NOW);
    expect(buildDigest(3, { now: NOW }).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not let one prolific account fill every slot', () => {
    // subterranean_1 posts daily, so an interest-only ranking gave a digest of
    // three posts by one person - which does not answer "what are PEOPLE saying".
    mergePosts([
      post({ id: 's1', author: 'subterranean_1', interest: 1.0, postedAt: NOW - 1 * DAY }),
      post({ id: 's2', author: 'subterranean_1', interest: 0.95, postedAt: NOW - 2 * DAY }),
      post({ id: 's3', author: 'subterranean_1', interest: 0.9, postedAt: NOW - 3 * DAY }),
      post({ id: 'other', author: 'COITnft', interest: 0.5, postedAt: NOW - 4 * DAY }),
    ], NOW);
    const authors = buildDigest(3, { now: NOW }).map((p) => p.author);
    expect(authors.filter((a) => a === 'subterranean_1')).toHaveLength(2);
    expect(authors).toContain('COITnft');
  });

  it('backfills when diversity would leave the digest short', () => {
    mergePosts([
      post({ id: 'a', author: 'solo', interest: 0.9, postedAt: NOW - 1 * DAY }),
      post({ id: 'b', author: 'solo', interest: 0.8, postedAt: NOW - 2 * DAY }),
      post({ id: 'c', author: 'solo', interest: 0.7, postedAt: NOW - 3 * DAY }),
    ], NOW);
    expect(buildDigest(3, { now: NOW })).toHaveLength(3);
  });

  it('includes posts already shown - a digest is a summary, not a queue', () => {
    mergePosts([post({ usedAt: NOW })], NOW);
    expect(buildDigest(3, { now: NOW })).toHaveLength(1);
  });
});

describe('formatDigestForTelegram', () => {
  it('says so plainly when there is nothing to report', () => {
    const card = formatDigestForTelegram([]);
    expect(card.text).toContain('quiet');
    expect(card.text).not.toContain('<blockquote>');
  });

  it('attributes and links every entry', () => {
    const card = formatDigestForTelegram([
      post({ id: 'a', author: 'subterranean_1', url: 'https://x.com/subterranean_1/status/1', likes: 10 }),
      post({ id: 'b', author: 'h_u_e_s_', url: 'https://x.com/h_u_e_s_/status/2', likes: 3 }),
    ]);
    expect(card.text).toContain('@subterranean_1');
    expect(card.text).toContain('@h_u_e_s_');
    expect((card.text.match(/<blockquote>/g) ?? [])).toHaveLength(2);
    expect(card.parseMode).toBe('HTML');
  });
});

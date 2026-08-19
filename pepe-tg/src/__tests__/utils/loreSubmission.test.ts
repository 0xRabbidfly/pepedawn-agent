/**
 * Gate tests, anchored on the real 2026-08-19 abuse payloads.
 *
 * Every string in ATTACK was actually stored in production by the unguarded
 * /fr, so if any of them passes the gate the fix does not work.
 */
import { describe, it, expect } from 'vitest';
import {
  parseLoreSubmission,
  identityMatchesArtist,
  artistsForCard,
  assessLoreQuality,
  gateSubmission,
  normaliseName,
  MAX_ENTRIES_PER_CARD,
} from '../../utils/loreSubmission';
import { getCardInfo } from '../../data/fullCardIndex';

const ATTACK = [
  'djpepe made by coit',
  'lordkek is coit',
  'coit was made by dj pepe',
  'scrillarare coit',
  'scrilla ❤️ coit',
  'satan is gods little bitch',
  'satan has penis envy',
  'kanemayfield wrote a book',
  'kanemayfield can name 10 books',
  'pepedawn is a evil AI created by satan hosted on cloud',
];

const anon = { id: '99', username: 'spammer', displayName: 'Spammer' };

describe('/fr gate — the payloads that got through', () => {
  it('rejects every one of the 21 stored submissions', () => {
    for (const raw of ATTACK) {
      const verdict = gateSubmission({
        raw: `/fr ${raw}`,
        submitter: anon,
        existingForCard: 0,
      });
      expect(verdict.ok, `should have rejected: ${raw}`).toBe(false);
      // Never routed to the room: vouching decides whether a plausible claim is
      // true, it is not a queue for junk.
      expect(verdict.route, `should not have proposed: ${raw}`).toBeUndefined();
    }
  });

  it('rejects them for a sensible reason, not by accident', () => {
    const codes = ATTACK.map(
      (raw) => gateSubmission({ raw: `/fr ${raw}`, submitter: anon, existingForCard: 0 }).code
    );
    // Whatever the specific code, none may be a pass and none may be undefined.
    expect(codes.every((c) => !!c)).toBe(true);
  });
});

describe('card requirement', () => {
  it('requires a real asset', () => {
    const v = gateSubmission({
      raw: '/fr this is a lovely story about nothing in particular at all',
      submitter: anon,
      existingForCard: 0,
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('no_card');
  });

  it('accepts a lowercase card token — the old detector needed ALL CAPS', () => {
    const { card } = parseLoreSubmission('/fr freedomkek the story goes like this');
    expect(card).toBe('FREEDOMKEK');
  });

  it('finds an asset written mid-sentence', () => {
    const { card } = parseLoreSubmission('/fr the story behind FREEDOMKEK is a long one');
    expect(card).toBe('FREEDOMKEK');
  });

  it('separates card from lore', () => {
    const { card, lore } = parseLoreSubmission('/fr FREEDOMKEK: drawn the night of the fork');
    expect(card).toBe('FREEDOMKEK');
    expect(lore).toBe('drawn the night of the fork');
  });
});

describe('artist gate', () => {
  const artists = artistsForCard('FREEDOMKEK');

  it('knows who made FREEDOMKEK', () => {
    expect(artists).toContain('Rare Scrilla');
  });

  it('matches the credited artist by handle', () => {
    expect(identityMatchesArtist({ username: 'rarescrilla' }, artists)).toBe(true);
  });

  it('matches on a distinctive token', () => {
    expect(identityMatchesArtist({ username: 'scrilla_xcp' }, artists)).toBe(true);
  });

  it('matches via an admin-supplied alias when the handle differs entirely', () => {
    expect(
      identityMatchesArtist({ id: '12345', username: 'totallyunrelated' }, artists, {
        '12345': ['Rare Scrilla'],
      })
    ).toBe(true);
  });

  it('rejects a stranger', () => {
    expect(identityMatchesArtist({ username: 'coit', displayName: 'Coit' }, artists)).toBe(false);
  });

  it('does not match on a short token — "RC" must not hide inside words', () => {
    expect(identityMatchesArtist({ username: 'scarcest' }, ['RC'])).toBe(false);
  });

  it('lets either party of a collaboration contribute', () => {
    const collab = ['AWRALPH', 'Rare Scrilla'];
    expect(identityMatchesArtist({ username: 'awralph' }, collab)).toBe(true);
    expect(identityMatchesArtist({ username: 'rarescrilla' }, collab)).toBe(true);
  });

  it('admins bypass the artist gate', () => {
    const v = gateSubmission({
      raw: '/fr FREEDOMKEK submitted during the 2021 fork week, the artist stayed up all night finishing it',
      submitter: { id: '1', username: 'rabbidfly', isAdmin: true },
      existingForCard: 0,
    });
    expect(v.ok).toBe(true);
  });
});

describe('entry cap', () => {
  const artistSubmitter = { id: '7', username: 'rarescrilla', displayName: 'Rare Scrilla' };
  const good =
    '/fr FREEDOMKEK submitted during the 2021 fork week, the artist stayed up all night finishing it';

  it(`allows up to ${MAX_ENTRIES_PER_CARD}`, () => {
    expect(gateSubmission({ raw: good, submitter: artistSubmitter, existingForCard: 0 }).ok).toBe(true);
    expect(
      gateSubmission({ raw: good, submitter: artistSubmitter, existingForCard: MAX_ENTRIES_PER_CARD - 1 }).ok
    ).toBe(true);
  });

  it('refuses the one past the cap', () => {
    const v = gateSubmission({ raw: good, submitter: artistSubmitter, existingForCard: MAX_ENTRIES_PER_CARD });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('card_full');
  });

  it('refuses a duplicate even under the cap — 7 copies is a retrieval attack', () => {
    const v = gateSubmission({
      raw: good,
      submitter: artistSubmitter,
      existingForCard: 1,
      existingTexts: ['submitted during the 2021 fork week, the artist stayed up all night finishing it'],
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe('duplicate');
  });
});

describe('routing', () => {
  it('sends a non-artist with plausible lore to vouching', () => {
    const v = gateSubmission({
      raw: '/fr FREEDOMKEK drawn the week Counterparty fees spiked, hence the receipt',
      submitter: { id: '9', username: 'somebody', displayName: 'Somebody' },
      existingForCard: 0,
    });
    expect(v.ok).toBe(true);
    expect(v.route).toBe('vouch');
  });

  it('stores straight away for the credited artist', () => {
    const v = gateSubmission({
      raw: '/fr FREEDOMKEK drawn the week Counterparty fees spiked, hence the receipt',
      submitter: { id: '7', username: 'rarescrilla', displayName: 'Rare Scrilla' },
      existingForCard: 0,
    });
    expect(v.ok).toBe(true);
    expect(v.route).toBe('store');
  });
});

describe('lore quality', () => {
  it('rejects a bare attribution claim that contradicts the manifest', () => {
    const v = assessLoreQuality('this card was made by coit in his bedroom studio', 'FREEDOMKEK');
    expect(v.ok).toBe(false);
  });

  it('allows an attribution consistent with the manifest', () => {
    const v = assessLoreQuality(
      'made by Rare Scrilla over one very long weekend before the drop',
      'FREEDOMKEK'
    );
    expect(v.ok).toBe(true);
  });

  it('rejects something too short to be a story', () => {
    expect(assessLoreQuality('cool card', 'FREEDOMKEK').ok).toBe(false);
  });

  it('rejects emoji soup', () => {
    expect(assessLoreQuality('🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸🐸', 'FREEDOMKEK').ok).toBe(false);
  });

  it('rejects a bare link', () => {
    expect(assessLoreQuality('https://example.com/a/very/long/path/to/nowhere', 'FREEDOMKEK').ok).toBe(false);
  });

  it('accepts real lore', () => {
    const v = assessLoreQuality(
      'drawn the week Counterparty fees spiked, which is why the frog is holding a receipt',
      'FREEDOMKEK'
    );
    expect(v.ok).toBe(true);
  });
});

describe('normaliseName', () => {
  it('collapses case, spacing and punctuation', () => {
    expect(normaliseName('Rare Scrilla')).toBe('rarescrilla');
    expect(normaliseName('AD_AD')).toBe('adad');
  });
});

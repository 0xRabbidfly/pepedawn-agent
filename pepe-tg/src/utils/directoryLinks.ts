/**
 * Links into fakeraredirectory.com, the canonical site, for card replies.
 *
 * A card's page is /series/S/N. An artist's page is /artists/<slug>, and
 * the slug is the directory's, not ours: 404 of its 407 slugs are the name
 * slugified, but a quarter of our credit strings ("Indelible Trade x Cam")
 * are not artist entities there at all, so guessing would send people to
 * 404s. The sync writes the directory's artist list to
 * src/data/directory-artists.json daily; an artist not in it keeps the
 * pepe.wtf link the button always had.
 */

import type { CardInfo } from '../data/fullCardIndex';
import directoryArtistsJson from '../data/directory-artists.json';

export const DIRECTORY_ORIGIN = 'https://fakeraredirectory.com';

export interface DirectoryArtist {
  name: string;
  slug: string;
  aliases: string[];
}

export interface CardButton {
  text: string;
  url: string;
}

const artists = (directoryArtistsJson as { artists: DirectoryArtist[] }).artists;

/** Directory slug for an artist name or alias, looked up case-insensitively. */
export function directoryArtistSlug(name: string | null | undefined, list: DirectoryArtist[] = artists): string | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  for (const a of list) {
    if (a.name.toLowerCase() === wanted) return a.slug;
    if (a.aliases.some((alias) => alias.toLowerCase() === wanted)) return a.slug;
  }
  return null;
}

export function directoryCardUrl(card: Pick<CardInfo, 'series' | 'card'> | null | undefined): string | null {
  if (!card || !Number.isInteger(card.series) || !Number.isInteger(card.card)) return null;
  return `${DIRECTORY_ORIGIN}/series/${card.series}/${card.card}`;
}

export function directoryArtistUrl(name: string | null | undefined, list?: DirectoryArtist[]): string | null {
  const slug = directoryArtistSlug(name, list);
  return slug ? `${DIRECTORY_ORIGIN}/artists/${slug}` : null;
}

/**
 * The buttons under a Fake Rares card: its directory page, and its artist -
 * on the directory when it knows them, on pepe.wtf otherwise. The artist
 * button keeps its FAKE_RARES_ARTIST_BUTTONS gate; the directory link is
 * the canonical page and is always offered for a card with a slot.
 */
export function buildCardButtons(card: CardInfo | null | undefined, list?: DirectoryArtist[]): CardButton[] {
  const buttons: CardButton[] = [];
  const page = directoryCardUrl(card);
  if (page && !card?.retired) buttons.push({ text: '🗂 Directory', url: page });

  if (process.env.FAKE_RARES_ARTIST_BUTTONS === 'true' && card?.artist) {
    const onDirectory = directoryArtistUrl(card.artist, list);
    const url = onDirectory ?? (card.artistSlug ? `https://pepe.wtf/artists/${card.artistSlug}` : null);
    if (url) buttons.push({ text: `👨‍🎨 ${card.artist}`, url });
  }
  return buttons;
}

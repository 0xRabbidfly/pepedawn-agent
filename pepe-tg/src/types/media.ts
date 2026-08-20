/**
 * The file extensions cards actually ship with.
 *
 * Uppercase "GIF" is not a typo and not a normalisation bug to fix here: the
 * Fake Commons and Rare Pepes scrapes contain it literally, and the index types
 * (`CommonsCardInfo`, `RarePepeCardInfo`) admit it. It was previously handled by
 * each action declaring its own copy of this union, which drifted - the shared
 * one used by `CardDisplayService` did not allow "GIF", so passing a Commons
 * card through it was a type error nobody saw, because the service was fetched
 * as an untyped `Service`.
 */
export type MediaExtension = 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp' | 'GIF';

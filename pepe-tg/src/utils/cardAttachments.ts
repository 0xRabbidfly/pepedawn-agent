/**
 * Media attachments in the shape the Telegram plugin actually reads.
 *
 * `@elizaos/core`'s `Media` requires an `id` and types `contentType` as its
 * `ContentType` enum — 'image', 'video'. Our `messageManager` decides how to
 * send a card by MIME type instead: `/^video\//` for streams, the exact string
 * 'image/gif' for animations, `/^image\//` for stills. Handing it the enum
 * would send every GIF down the still-image branch.
 *
 * So the MIME string is the real contract, and core's type is the one that has
 * to bend. Reconciling it here, once and under a name, beats an unexplained
 * cast at each of the three call sites.
 */

import type { Media } from '@elizaos/core';

export interface CardAttachment {
  url: string;
  title: string;
  source: string;
  /** MIME type: "video/mp4", "image/gif", "image/jpeg". */
  contentType: string;
}

/** Hand card attachments to a `HandlerCallback` without losing the MIME type. */
export function asMedia(attachments: CardAttachment[]): Media[] {
  return attachments as unknown as Media[];
}

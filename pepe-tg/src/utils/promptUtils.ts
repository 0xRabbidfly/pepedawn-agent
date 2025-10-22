/**
 * Prompt utilities for safe, bounded-size prompts.
 */

/**
 * Truncate a long string by keeping the beginning and end, dropping the middle.
 * Adds a marker to indicate truncation.
 */
export function truncateMiddle(input: string, maxChars: number, marker = '\n...\n'): string {
  if (input.length <= maxChars) return input;
  const keep = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return input.slice(0, head) + marker + input.slice(-tail);
}

/**
 * Safe join of segments within a max size.
 */
export function joinBounded(segments: string[], separator = '\n\n', maxChars = 3000): string {
  const parts: string[] = [];
  let size = 0;
  for (const seg of segments) {
    const add = (parts.length ? separator : '') + seg;
    if (size + add.length > maxChars) break;
    parts.push(seg);
    size += add.length;
  }
  if (parts.length < segments.length) return parts.join(separator) + separator + '...';
  return parts.join(separator);
}

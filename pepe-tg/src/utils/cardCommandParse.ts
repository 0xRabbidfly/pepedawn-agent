/**
 * Parsing for the card display commands - `/f`, `/c`, `/p`.
 *
 * All three used the same anchored pattern with an optional slash:
 *
 *   /^(?:@[A-Za-z0-9_]+\s+)?\/?p(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?/i
 *
 * which fails open in the worst possible direction. Anything the pattern could
 * not read as "command plus argument" fell through to "no argument given", and
 * no argument means *show a random card*. Asked to run `/p djpepe` in the
 * middle of a sentence, the bot posted a random Rare Pepe - GIANCARLO by
 * Indelible - into a conversation about who made DJPEPE, and the room spent the
 * next ten minutes untangling it.
 *
 * So: find the command wherever it appears, take what follows as the argument,
 * and treat "random" as something the user asked for rather than as the
 * fallback for a parse that did not work.
 */

/** The single letter after the slash: `f` for Fake Rares, `c`, `p`. */
export type CardCommandLetter = 'f' | 'c' | 'p';

export interface CardCommandRequest {
  /** What to look up, or null for a random card. Original case is kept - `/f` matches artist names too. */
  assetName: string | null;
  isRandomCard: boolean;
}

/**
 * Read a card command out of a message.
 *
 * The command may sit anywhere in the text: the router sends synthetic
 * `/p ASSET` messages, but it also routes real ones where the user wrote
 * "go ahead and do /p djpepe" and meant it.
 *
 * `/fr` and `/fc` are their own commands, so the letter must not be followed by
 * another letter or digit.
 */
export function parseCardCommand(text: string, letter: CardCommandLetter): CardCommandRequest {
  const command = new RegExp(
    `(?:^|[^A-Za-z0-9_])/${letter}(?![A-Za-z0-9])(?:@[A-Za-z0-9_]+)?(?:\\s+([^\\n]+))?`,
    'i'
  );

  const match = text.match(command);
  if (match) {
    const argument = match[1]?.trim();
    return argument
      ? { assetName: argument, isRandomCard: false }
      : { assetName: null, isRandomCard: true };
  }

  // No slash anywhere. The handlers are only reached through a validated
  // command or a synthetic one, so this is the bare-letter form some callers
  // still use ("p FREEDOMKEK"); anything else is a random card as before.
  const bare = text.match(new RegExp(`^(?:@[A-Za-z0-9_]+\\s+)?${letter}(?![A-Za-z0-9])\\s+([^\\n]+)`, 'i'));
  const argument = bare?.[1]?.trim();
  return argument ? { assetName: argument, isRandomCard: false } : { assetName: null, isRandomCard: true };
}

/**
 * The argument a user actually typed after a command, if any.
 *
 * The classifier is asked to report the slash command it saw and routinely
 * reports only the command - "/p" for a message that said "/p djpepe". Reading
 * the argument back off the user's own text is the difference between showing
 * the card they named and showing a random one.
 */
export function commandArgumentIn(text: string, command: string): string | null {
  const base = command.replace(/^\//, '').toLowerCase();
  if (!/^[a-z]+$/.test(base)) return null;
  const match = text.match(
    new RegExp(`(?:^|[^A-Za-z0-9_])/${base}(?![A-Za-z0-9])(?:@[A-Za-z0-9_]+)?\\s+([^\\n]+)`, 'i')
  );
  return match?.[1]?.trim() || null;
}

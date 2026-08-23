import { describe, expect, it } from 'bun:test';
import { parseCardCommand, commandArgumentIn } from '../../utils/cardCommandParse';

/**
 * Live regression, 2026-08-23: asked to run "/p djpepe" inside a sentence, the
 * bot posted a random Rare Pepe - GIANCARLO by Indelible - into a conversation
 * about who made DJPEPE. Nothing in the parse said "I could not read this": an
 * unreadable command silently became "no argument", and no argument means a
 * random card.
 */
describe('parseCardCommand', () => {
  it('reads the argument when the command is at the start', () => {
    expect(parseCardCommand('/p djpepe', 'p')).toEqual({
      assetName: 'djpepe',
      isRandomCard: false,
    });
  });

  it('reads the argument when the command is mid-sentence', () => {
    const typed = 'Dumdum it was Scrilla - djpepe is his go ahead and do /p djpepe';
    expect(parseCardCommand(typed, 'p')).toEqual({ assetName: 'djpepe', isRandomCard: false });
  });

  it('accepts the @bot forms', () => {
    expect(parseCardCommand('/p@pepedawn_bot djpepe', 'p').assetName).toBe('djpepe');
    expect(parseCardCommand('@pepedawn_bot /p djpepe', 'p').assetName).toBe('djpepe');
  });

  it('asks for a random card only when no argument was given', () => {
    expect(parseCardCommand('/p', 'p')).toEqual({ assetName: null, isRandomCard: true });
    expect(parseCardCommand('go ahead and do /p', 'p')).toEqual({
      assetName: null,
      isRandomCard: true,
    });
  });

  it('keeps case, because /f matches artist names too', () => {
    expect(parseCardCommand('/f Fake Annie', 'f').assetName).toBe('Fake Annie');
  });

  it('does not read /fr or /fc as /f', () => {
    expect(parseCardCommand('/fr FREEDOMKEK is a great card', 'f').assetName).toBeNull();
    expect(parseCardCommand('/fc', 'f').assetName).toBeNull();
  });
});

describe('commandArgumentIn', () => {
  it('recovers the argument the classifier dropped', () => {
    // The classifier reports "/p" for a message that said "/p djpepe"; without
    // this the synthetic command carries no argument and shows a random card.
    expect(commandArgumentIn('go ahead and do /p djpepe', '/p')).toBe('djpepe');
    expect(commandArgumentIn('/f FREEDOMKEK', '/f')).toBe('FREEDOMKEK');
  });

  it('returns null when the user typed the command bare', () => {
    expect(commandArgumentIn('/p', '/p')).toBeNull();
    expect(commandArgumentIn('show me a card', '/p')).toBeNull();
  });

  it('does not confuse one command for another', () => {
    expect(commandArgumentIn('/fr FREEDOMKEK lore here', '/f')).toBeNull();
    expect(commandArgumentIn('/fc', '/f')).toBeNull();
  });
});

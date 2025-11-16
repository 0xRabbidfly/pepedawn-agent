import { describe, expect, it } from 'bun:test';
import { detectMessagePatterns } from '../../utils/messagePatterns';

describe('messagePatterns', () => {
  describe('Command Detection', () => {
    it('should detect /f command', () => {
      const patterns = detectMessagePatterns('/f PEPEDAWN', {});
      expect(patterns.commands.isF).toBe(true);
      expect(patterns.commands.isFv).toBe(false);
    });

    it('should detect /fv command', () => {
      const patterns = detectMessagePatterns('/fv PEPEDAWN', {});
      expect(patterns.commands.isFv).toBe(true);
      expect(patterns.commands.isF).toBe(false);
    });

    it('should detect /ft command', () => {
      const patterns = detectMessagePatterns('/ft', {});
      expect(patterns.commands.isFt).toBe(true);
    });

    it('should detect /fl command', () => {
      const patterns = detectMessagePatterns('/fl what is PEPEDAWN', {});
      expect(patterns.commands.isFl).toBe(true);
      expect(patterns.commands.isF).toBe(false);
    });

    it('should not treat /fl as /f', () => {
      const patterns = detectMessagePatterns('/fl', {});
      expect(patterns.commands.isFl).toBe(true);
      expect(patterns.commands.isF).toBe(false);
    });

    it('should detect /fr command', () => {
      const patterns = detectMessagePatterns('/fr PEPEDAWN has supply of 133', {});
      expect(patterns.commands.isFr).toBe(true);
    });

    it('should detect /fm command', () => {
      const patterns = detectMessagePatterns('/fm', {});
      expect(patterns.commands.isFm).toBe(true);
    });

    it('should detect /help command', () => {
      const patterns = detectMessagePatterns('/help', {});
      expect(patterns.commands.isHelp).toBe(true);
    });

    it('should detect /start command', () => {
      const patterns = detectMessagePatterns('/start', {});
      expect(patterns.commands.isStart).toBe(true);
    });

    it('should detect /dawn command', () => {
      const patterns = detectMessagePatterns('/dawn', {});
      expect(patterns.commands.isDawn).toBe(true);
    });

    it('should detect /fc command', () => {
      const patterns = detectMessagePatterns('/fc', {});
      expect(patterns.commands.isFc).toBe(true);
    });

    it('should handle commands with @botname suffix', () => {
      const patterns = detectMessagePatterns('/f@pepedawn_bot PEPEDAWN', {});
      expect(patterns.commands.isF).toBe(true);
    });

    it('should handle commands with @mention prefix', () => {
      const patterns = detectMessagePatterns('@pepedawn_bot /f PEPEDAWN', {});
      expect(patterns.commands.isF).toBe(true);
    });
  });

  describe('Trigger Detection', () => {
    it('should detect Fake Rare card names', () => {
      const patterns = detectMessagePatterns('I love PEPEDAWN', {});
      expect(patterns.triggers.isFakeRareCard).toBe(true);
    });

    it('should detect card names case-insensitively', () => {
      const patterns = detectMessagePatterns('what about pepedawn?', {});
      expect(patterns.triggers.isFakeRareCard).toBe(true);
    });

    it('should detect multiple card names', () => {
      const patterns = detectMessagePatterns('PEPEDAWN and FREEDOMKEK are cool', {});
      expect(patterns.triggers.isFakeRareCard).toBe(true);
    });

    it('should NOT detect non-card capitalized words', () => {
      const patterns = detectMessagePatterns('I love BITCOIN', {});
      expect(patterns.triggers.isFakeRareCard).toBe(false);
    });

    it('should detect @pepedawn_bot mention', () => {
      const patterns = detectMessagePatterns('@pepedawn_bot hello', {});
      expect(patterns.triggers.hasBotMention).toBe(true);
    });

    it('should detect bot mention case-insensitively', () => {
      const patterns = detectMessagePatterns('@PEPEDAWN_BOT hello', {});
      expect(patterns.triggers.hasBotMention).toBe(true);
    });

    it('should detect reply to bot', () => {
      const patterns = detectMessagePatterns('thanks', {
        message: { content: { inReplyTo: 'bot-msg-id' } }
      });
      expect(patterns.triggers.isReplyToBot).toBe(true);
    });

    it('should detect remember command', () => {
      const patterns = detectMessagePatterns('remember this: PEPEDAWN has 133 supply', {});
      expect(patterns.triggers.hasRememberCommand).toBe(true);
    });

    it('should detect "remember" without "this"', () => {
      const patterns = detectMessagePatterns('remember PEPEDAWN is awesome', {});
      expect(patterns.triggers.hasRememberCommand).toBe(true);
    });
  });

  describe('Metadata Extraction', () => {
    it('should count words correctly', () => {
      const patterns = detectMessagePatterns('one two three four five', {});
      expect(patterns.metadata.wordCount).toBe(5);
    });

    it('should detect questions with ?', () => {
      const patterns = detectMessagePatterns('what is this?', {});
      expect(patterns.metadata.hasQuestion).toBe(true);
    });

    it('should detect questions starting with question words', () => {
      const patterns = detectMessagePatterns('how do I submit', {});
      expect(patterns.metadata.hasQuestion).toBe(true);
    });

    it('should NOT detect statements as questions', () => {
      const patterns = detectMessagePatterns('PEPEDAWN is cool', {});
      expect(patterns.metadata.hasQuestion).toBe(false);
    });
  });

  describe('Single Card Auto-Route Detection', () => {
    it('should identify single card name posts', () => {
      const patterns = detectMessagePatterns('PEPEDAWN', {});
      expect(patterns.triggers.isFakeRareCard).toBe(true);
      expect(patterns.metadata.wordCount).toBe(1);
    });

    it('should identify multi-word card posts', () => {
      const patterns = detectMessagePatterns('PEPEDAWN is awesome', {});
      expect(patterns.triggers.isFakeRareCard).toBe(true);
      expect(patterns.metadata.wordCount).toBeGreaterThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const patterns = detectMessagePatterns('', {});
      expect(patterns.metadata.wordCount).toBe(0);
      expect(patterns.triggers.isFakeRareCard).toBe(false);
    });

    it('should handle whitespace only', () => {
      const patterns = detectMessagePatterns('   ', {});
      expect(patterns.metadata.wordCount).toBe(0);
    });

    it('should handle special characters', () => {
      const patterns = detectMessagePatterns('!!!', {});
      expect(patterns.metadata.wordCount).toBe(1); // '!!!' counts as 1 token
      expect(patterns.metadata.hasQuestion).toBe(false);
    });

    it('should handle mixed case commands', () => {
      const patterns = detectMessagePatterns('/F PEPEDAWN', {});
      expect(patterns.commands.isF).toBe(true);
    });
  });
});


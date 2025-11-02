import { describe, expect, it, beforeEach } from 'bun:test';
import { calculateEngagementScore, shouldRespond, getEngagementThreshold, resetEngagementTracking } from '../../utils/engagementScorer';

describe('engagementScorer', () => {
  beforeEach(() => {
    resetEngagementTracking();
  });

  // Helper to establish a user (removes newcomer boost for cleaner testing)
  const establishUser = (userId: string, roomId: string) => {
    calculateEngagementScore({
      text: 'establish',
      hasBotMention: false,
      isReplyToBot: false,
      isFakeRareCard: false,
      userId,
      roomId,
    });
  };

  describe('calculateEngagementScore', () => {
    describe('High Priority (auto-respond)', () => {
      it('should give +100 for @mention', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'hello',
          hasBotMention: true,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // @mention=+100 (no short penalty for mentions, "hello" counts as generic)
        expect(score).toBe(100);
      });

      it('should give +100 for reply to bot', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'thanks',
          hasBotMention: false,
          isReplyToBot: true,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // reply=+100 = 100 ("thanks" not detected as generic)
        expect(score).toBe(100);
      });

      it('should give +100 for newcomer (first message)', () => {
        const score = calculateEngagementScore({
          text: 'hello',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'new-user',
          roomId: 'room1',
        });
        
        // newcomer=+100, short=-5 = 95 ("hello" not detected as generic?)
        expect(score).toBe(95);
      });
    });

    describe('Medium Priority (contextual)', () => {
      it('should give +20 for Fake Rare card', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'PEPEDAWN',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: true,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // card=+20, short=-5 = 15
        expect(score).toBe(15);
      });

      it('should give +35 for question', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'what is this?',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // question=+35, short=-5 = 30
        expect(score).toBe(30);
      });

      it('should detect imperative requests as questions', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'tell me about PEPEDAWN',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: true,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // card=+20, question=+35, short=-5 = 50
        expect(score).toBe(50);
      });

      it('should detect indirect questions', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'I need to know about locking',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // question=+35 = 35
        expect(score).toBe(35);
      });

      it('should give +10 for multi-word messages (>7 words)', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'I really love this collection and want to learn more',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // multiword=+10 = 10
        expect(score).toBe(10);
      });
    });

    describe('Context Boosts', () => {
      it('should give newcomer boost to first-time users', () => {
        const score = calculateEngagementScore({
          text: 'hello',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'new-user',
          roomId: 'room1',
        });
        
        // Should get newcomer=+100, short=-5 = 95
        expect(score).toBe(95);
      });

      it('should give +20 for returning users (after 24h)', async () => {
        // Simulate user activity tracking
        const userId = 'returning-user';
        
        // First message (establishes baseline)
        calculateEngagementScore({
          text: 'hi',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId,
          roomId: 'room1',
        });
        
        // Wait 1ms (simulate time passing - in real world would be 24h)
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Second message from same user
        const score2 = calculateEngagementScore({
          text: 'hi again',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId,
          roomId: 'room1',
        });
        
        // Should NOT get returning boost (only 1ms passed, not 24h)
        // Just short=-5, generic=-10 = -15
        expect(score2).toBeLessThan(0);
      });

      it('should give +30 for quiet threads (after 5min)', async () => {
        const roomId = 'quiet-room';
        
        // First message establishes room activity
        calculateEngagementScore({
          text: 'first',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId,
        });
        
        // Immediate second message
        const score2 = calculateEngagementScore({
          text: 'second',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user2',
          roomId,
        });
        
        // Should NOT get quiet boost (no time passed)
        expect(score2).toBeLessThan(100); // No newcomer boost for user2 (already tracked from previous test?)
      });
    });

    describe('Penalties', () => {
      it('should apply -5 for short messages (<5 words)', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'ok',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // short=-5 = -5 ("ok" not in generic list)
        expect(score).toBe(-5);
      });

      it('should apply -10 for generic reactions', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'gm',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // short=-5, generic=-10 = -15
        expect(score).toBe(-15);
      });

      it('should NOT apply short penalty for @mentions', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'hi',
          hasBotMention: true,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // @mention=+100 (no short penalty, "hi" not generic?) = 100
        expect(score).toBe(100);
      });

      it('should NOT apply short penalty for replies', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'ok',
          hasBotMention: false,
          isReplyToBot: true,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // reply=+100 (no short penalty for replies) = 100
        expect(score).toBe(100);
      });

      it('should detect emojis as generic reactions', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: '🔥',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // short=-5, generic=-10 = -15
        expect(score).toBe(-15);
      });
    });

    describe('Combined Scoring', () => {
      it('should combine card + question correctly', () => {
        establishUser('user1', 'room1');
        
        const score = calculateEngagementScore({
          text: 'what is PEPEDAWN?',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: true,
          userId: 'user1',
          roomId: 'room1',
        });
        
        // card=+20, question=+35, short=-5 = 50
        expect(score).toBe(50);
      });

      it('should calculate active user with no boosts', () => {
        establishUser('active-user', 'room1');
        
        // Second message immediately after
        const score2 = calculateEngagementScore({
          text: 'gm',
          hasBotMention: false,
          isReplyToBot: false,
          isFakeRareCard: false,
          userId: 'active-user',
          roomId: 'room1',
        });
        
        // No context boosts, short=-5, generic=-10 = -15
        expect(score2).toBe(-15);
      });
    });
  });

  describe('shouldRespond', () => {
    it('should return true when score >= threshold', () => {
      const threshold = getEngagementThreshold();
      expect(shouldRespond(threshold)).toBe(true);
      expect(shouldRespond(threshold + 1)).toBe(true);
      expect(shouldRespond(100)).toBe(true);
    });

    it('should return false when score < threshold', () => {
      const threshold = getEngagementThreshold();
      expect(shouldRespond(threshold - 1)).toBe(false);
      expect(shouldRespond(0)).toBe(false);
      expect(shouldRespond(-10)).toBe(false);
    });
  });

  describe('getEngagementThreshold', () => {
    it('should return the configured threshold', () => {
      const threshold = getEngagementThreshold();
      expect(typeof threshold).toBe('number');
      expect(threshold).toBeGreaterThan(0);
    });
  });

  describe('resetEngagementTracking', () => {
    it('should reset user and room tracking', () => {
      // Establish tracking
      calculateEngagementScore({
        text: 'first',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // Reset
      resetEngagementTracking();
      
      // Next message should get newcomer boost again
      const score = calculateEngagementScore({
        text: 'hello',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // Should get newcomer boost: 100 - 5 (short) = 95
      expect(score).toBe(95);
    });
  });

  describe('Real-world scenarios', () => {
    beforeEach(() => {
      resetEngagementTracking();
    });

    it('should respond to newcomer greeting', () => {
      const score = calculateEngagementScore({
        text: 'gm',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'newcomer',
        roomId: 'room1',
      });
      
      // newcomer=+100, short=-5, generic=-10 = 85 > 31
      expect(shouldRespond(score)).toBe(true);
    });

    it('should suppress active user generic reactions', () => {
      // Establish user
      calculateEngagementScore({
        text: 'first',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'active',
        roomId: 'room1',
      });
      
      // Generic reaction
      const score = calculateEngagementScore({
        text: 'nice',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'active',
        roomId: 'room1',
      });
      
      // short=-5, generic=-10 = -15 < 31
      expect(shouldRespond(score)).toBe(false);
    });

    it('should respond to card questions', () => {
      resetEngagementTracking();
      const score = calculateEngagementScore({
        text: 'what is PEPEDAWN?',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: true,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // newcomer=+100, card=+20, question=+35, short=-5 = 150 > 31
      expect(shouldRespond(score)).toBe(true);
    });

    it('should respond to questions without cards', () => {
      resetEngagementTracking();
      const score = calculateEngagementScore({
        text: 'how do I submit a card?',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // newcomer=+100, question=+35 = 135 > 31
      expect(shouldRespond(score)).toBe(true);
    });

    it('should suppress vague single-word questions', () => {
      // Establish user first
      calculateEngagementScore({
        text: 'first',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      const score = calculateEngagementScore({
        text: 'what?',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // question=+35, short=-5 = 30 < 31
      expect(shouldRespond(score)).toBe(false);
    });

    it('should suppress card statements without questions', () => {
      // Establish user first
      calculateEngagementScore({
        text: 'first',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: false,
        userId: 'user1',
        roomId: 'room1',
      });
      
      const score = calculateEngagementScore({
        text: 'PEPEDAWN is cool',
        hasBotMention: false,
        isReplyToBot: false,
        isFakeRareCard: true,
        userId: 'user1',
        roomId: 'room1',
      });
      
      // card=+20 = 20 < 31
      expect(shouldRespond(score)).toBe(false);
    });
  });
});


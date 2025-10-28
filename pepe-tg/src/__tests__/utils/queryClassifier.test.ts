import { describe, expect, it } from 'bun:test';
import { classifyQuery } from '../../utils/queryClassifier';
import type { QueryType } from '../../utils/queryClassifier';

/**
 * Tests for queryClassifier
 * Validates FACTS vs LORE vs UNCERTAIN classification logic
 */

describe('queryClassifier', () => {
  describe('FACTS Classification', () => {
    it('should classify "what is" questions as FACTS', () => {
      expect(classifyQuery('what is FREEDOMKEK?')).toBe('FACTS');
      expect(classifyQuery('what are the submission rules?')).toBe('FACTS');
      expect(classifyQuery('what is the fee?')).toBe('FACTS');
    });

    it('should classify "how to" questions as FACTS', () => {
      expect(classifyQuery('how do I submit a fake rare?')).toBe('FACTS');
      expect(classifyQuery('how to lock issuance?')).toBe('FACTS');
      expect(classifyQuery('how many tokens minimum?')).toBe('FACTS');
    });

    it('should classify rules/requirements queries as FACTS', () => {
      expect(classifyQuery('what are the submission requirements?')).toBe('FACTS');
      expect(classifyQuery('submission rules?')).toBe('FACTS'); // Special case
      expect(classifyQuery('do I need to destroy PEPECASH?')).toBe('FACTS');
    });

    it('should classify technical detail queries as FACTS', () => {
      expect(classifyQuery('must issuance be locked?')).toBe('FACTS');
      expect(classifyQuery('what size do fakes need to be?')).toBe('FACTS');
      expect(classifyQuery('is it divisible?')).toBe('FACTS');
    });

    it('should classify definition queries as FACTS', () => {
      expect(classifyQuery('define fake rare')).toBe('FACTS');
      expect(classifyQuery('explain the submission process')).toBe('FACTS');
    });

    it('should boost short questions with ? as FACTS', () => {
      // Short question with ? gets +0.5 fact score
      expect(classifyQuery('submission fee?')).toBe('FACTS');
      expect(classifyQuery('locked?')).toBe('FACTS');
    });
  });

  describe('LORE Classification', () => {
    it('should classify story requests as LORE', () => {
      expect(classifyQuery('tell me about fake rares')).toBe('LORE');
      expect(classifyQuery('tell me the story of FREEDOMKEK')).toBe('LORE');
      expect(classifyQuery('history of fake rares')).toBe('LORE');
    });

    it('should classify community/cultural queries as LORE', () => {
      // "what is" has fact keyword, "community" has lore keyword → tied, 7 words → FACTS
      expect(classifyQuery('what is the fake rares community like?')).toBe('FACTS');
      expect(classifyQuery('who created fake rares?')).toBe('LORE');
      expect(classifyQuery('what happened with matt furie?')).toBe('LORE');
    });

    it('should classify "who is/was" queries as LORE', () => {
      expect(classifyQuery('who is shawn?')).toBe('LORE');
      expect(classifyQuery('who was involved in creating this?')).toBe('LORE');
    });

    it('should classify origin/beginning queries as LORE', () => {
      // "start" doesn't match "started" keyword, gets ? boost → FACTS
      expect(classifyQuery('how did fake rares start?')).toBe('FACTS');
      // "began" keyword matches → LORE
      expect(classifyQuery('how did fake rares began?')).toBe('LORE');
      // "beginning" keyword matches → LORE  
      expect(classifyQuery('tell me about the beginning')).toBe('LORE');
    });
  });

  describe('UNCERTAIN Classification (Conservative Auto-Routing)', () => {
    it('should return UNCERTAIN for conversational messages when allowUncertain=true', () => {
      expect(classifyQuery('gm', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('nice', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('thanks', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('cool card', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('lol', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('WAGMI', { allowUncertain: true })).toBe('UNCERTAIN');
    });

    it('should return LORE for conversational messages when allowUncertain=false (default)', () => {
      // Without allowUncertain, short messages default to LORE
      expect(classifyQuery('gm')).toBe('LORE');
      expect(classifyQuery('nice')).toBe('LORE');
      expect(classifyQuery('thanks')).toBe('LORE');
      expect(classifyQuery('cool card')).toBe('LORE');
    });

    it('should return UNCERTAIN for ambiguous messages with no keywords', () => {
      // "thoughts?" gets ? boost (0.5) → FACTS, not UNCERTAIN
      expect(classifyQuery('thoughts?', { allowUncertain: true })).toBe('FACTS');
      // No keywords, no ? boost → UNCERTAIN
      expect(classifyQuery('interesting', { allowUncertain: true })).toBe('UNCERTAIN');
      expect(classifyQuery('ok then', { allowUncertain: true })).toBe('UNCERTAIN');
    });

    it('should still classify clear FACTS even with allowUncertain=true', () => {
      expect(classifyQuery('what are the rules?', { allowUncertain: true })).toBe('FACTS');
      expect(classifyQuery('how do I submit?', { allowUncertain: true })).toBe('FACTS');
    });

    it('should still classify clear LORE even with allowUncertain=true', () => {
      expect(classifyQuery('tell me about this', { allowUncertain: true })).toBe('LORE');
      expect(classifyQuery('who created this?', { allowUncertain: true })).toBe('LORE');
    });
  });

  describe('Tie-breaker Logic (Your Custom Logic)', () => {
    it('should classify short queries (<=6 words) as LORE when tied', () => {
      // No keywords matched, short query → LORE
      expect(classifyQuery('hello there friend')).toBe('LORE'); // 3 words
      expect(classifyQuery('nice to meet you today')).toBe('LORE'); // 5 words
      expect(classifyQuery('that is a cool card')).toBe('LORE'); // 6 words
    });

    it('should classify long queries (>6 words) as FACTS when tied', () => {
      // No keywords matched, long query → FACTS
      expect(classifyQuery('I really enjoyed looking at that card today')).toBe('FACTS'); // 8 words
      expect(classifyQuery('this has been a very interesting conversation so far')).toBe('FACTS'); // 9 words
    });

    it('should not use tie-breaker when keywords are matched', () => {
      // Even if short, fact keywords win
      expect(classifyQuery('rules?')).toBe('FACTS'); // 1 word, but has fact keyword
      expect(classifyQuery('history')).toBe('LORE'); // 1 word, but has lore keyword
    });
  });

  describe('Special Cases', () => {
    it('should always classify "submission rules" as FACTS', () => {
      expect(classifyQuery('submission rules')).toBe('FACTS');
      expect(classifyQuery('what are the submission rules?')).toBe('FACTS');
      expect(classifyQuery('tell me about submission rules')).toBe('FACTS');
    });

    it('should boost short questions ending with ?', () => {
      // Gets +0.5 to fact score
      expect(classifyQuery('fee?')).toBe('FACTS'); // Would be LORE without boost
      expect(classifyQuery('locked?')).toBe('FACTS');
      expect(classifyQuery('divisible?')).toBe('FACTS');
    });

    it('should not boost long questions ending with ?', () => {
      // >10 words, no keyword match → still applies tie-breaker
      const longQuestion = 'would you please tell me more about that interesting thing you mentioned earlier?';
      expect(classifyQuery(longQuestion)).toBe('FACTS'); // >6 words
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(classifyQuery('')).toBe('LORE'); // 0 words treated as short
    });

    it('should handle single words', () => {
      expect(classifyQuery('hello')).toBe('LORE'); // 1 word, no keywords
      expect(classifyQuery('rules')).toBe('FACTS'); // 1 word, has keyword
      expect(classifyQuery('history')).toBe('LORE'); // 1 word, has keyword
    });

    it('should be case-insensitive', () => {
      expect(classifyQuery('WHAT ARE THE RULES?')).toBe('FACTS');
      expect(classifyQuery('What Are The Rules?')).toBe('FACTS');
      expect(classifyQuery('what are the rules?')).toBe('FACTS');
    });

    it('should handle extra whitespace', () => {
      expect(classifyQuery('  what  are  the  rules?  ')).toBe('FACTS');
      expect(classifyQuery('\n\nrules?\n\n')).toBe('FACTS');
    });

    it('should handle mixed fact and lore keywords', () => {
      // More fact keywords → FACTS
      expect(classifyQuery('what is the history of submission rules?')).toBe('FACTS');
      
      // More lore keywords → LORE
      expect(classifyQuery('tell me the story of who created the rules')).toBe('LORE');
    });
  });

  describe('Real-World Examples', () => {
    describe('Should Auto-Route to /fl (FACTS)', () => {
      it('should route submission questions', () => {
        expect(classifyQuery('what are the fake rares submission rules?')).toBe('FACTS');
        expect(classifyQuery('how do I submit a fake rare?')).toBe('FACTS');
        expect(classifyQuery('what is the fee to submit?')).toBe('FACTS');
      });

      it('should route technical specification questions', () => {
        expect(classifyQuery('what size do fakes need to be?')).toBe('FACTS');
        expect(classifyQuery('do I need to lock issuance?')).toBe('FACTS');
        expect(classifyQuery('how many tokens minimum?')).toBe('FACTS');
      });

      it('should route definition questions', () => {
        expect(classifyQuery('what is FREEDOMKEK?')).toBe('FACTS');
        expect(classifyQuery('what is the pepe green code?')).toBe('FACTS');
        expect(classifyQuery('explain fake rares')).toBe('FACTS');
      });
    });

    describe('Should NOT Auto-Route (LORE or UNCERTAIN)', () => {
      it('should not route casual conversation', () => {
        expect(classifyQuery('gm', { allowUncertain: true })).toBe('UNCERTAIN');
        expect(classifyQuery('gn', { allowUncertain: true })).toBe('UNCERTAIN');
        expect(classifyQuery('thanks', { allowUncertain: true })).toBe('UNCERTAIN');
        expect(classifyQuery('nice work', { allowUncertain: true })).toBe('UNCERTAIN');
      });

      it('should not route story requests (route to AI conversation)', () => {
        expect(classifyQuery('tell me about fake rares')).toBe('LORE');
        expect(classifyQuery('who created this project?')).toBe('LORE');
        expect(classifyQuery('what happened with the community?')).toBe('LORE');
      });

      it('should not route reactions and acknowledgments', () => {
        expect(classifyQuery('ok', { allowUncertain: true })).toBe('UNCERTAIN');
        expect(classifyQuery('cool', { allowUncertain: true })).toBe('UNCERTAIN');
        expect(classifyQuery('lol', { allowUncertain: true })).toBe('UNCERTAIN');
      });
    });
  });

  describe('Type Safety', () => {
    it('should return valid QueryType', () => {
      const validTypes: QueryType[] = ['FACTS', 'LORE', 'UNCERTAIN'];
      
      const result1 = classifyQuery('what are the rules?');
      expect(validTypes).toContain(result1);
      
      const result2 = classifyQuery('tell me a story');
      expect(validTypes).toContain(result2);
      
      const result3 = classifyQuery('gm', { allowUncertain: true });
      expect(validTypes).toContain(result3);
    });
  });
});


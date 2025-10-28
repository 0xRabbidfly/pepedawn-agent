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
      // "how did" not in keywords, "started" not in keywords → 5 words → UNCERTAIN
      expect(classifyQuery('how did fake rares start?')).toBe('UNCERTAIN');
      // "began" keyword matches → LORE
      expect(classifyQuery('tell me when it began')).toBe('LORE');
      // "beginning" keyword matches → LORE  
      expect(classifyQuery('tell me about the beginning')).toBe('LORE');
    });
  });

  describe('UNCERTAIN Classification', () => {
    it('should return UNCERTAIN for conversational keywords', () => {
      // Conversational keywords detected → UNCERTAIN (not knowledge-seeking)
      expect(classifyQuery('gm')).toBe('UNCERTAIN');
      expect(classifyQuery('nice')).toBe('UNCERTAIN');
      expect(classifyQuery('thanks')).toBe('UNCERTAIN');
      expect(classifyQuery('cool card')).toBe('UNCERTAIN');
      expect(classifyQuery('lol')).toBe('UNCERTAIN');
      expect(classifyQuery('WAGMI')).toBe('UNCERTAIN');
    });
    
    it('should return LORE for short queries without conversational keywords', () => {
      // Short queries likely card/artist names (no conversational keywords)
      expect(classifyQuery('FREEDOMKEK')).toBe('LORE');
      expect(classifyQuery('Rare Scrilla')).toBe('LORE');
      expect(classifyQuery('purple era')).toBe('LORE');
    });

    it('should return UNCERTAIN for long ambiguous queries (>3 words, no keywords)', () => {
      // Long queries without keywords → let AI handle
      expect(classifyQuery('have you ever seen that thing')).toBe('UNCERTAIN'); // 6 words
      expect(classifyQuery('but i said it just now')).toBe('UNCERTAIN'); // 6 words
      expect(classifyQuery('ok then whatever happens')).toBe('UNCERTAIN'); // 4 words
      expect(classifyQuery('interesting to think about it')).toBe('UNCERTAIN'); // 6 words
    });
    
    it('should return LORE for single-word queries without keywords', () => {
      // Single word, no keywords → ≤3 words → LORE (likely card/artist name)
      expect(classifyQuery('thoughts?')).toBe('LORE');
      expect(classifyQuery('interesting')).toBe('LORE');
    });

    it('should still classify clear FACTS with keywords', () => {
      expect(classifyQuery('what are the rules?')).toBe('FACTS');
      expect(classifyQuery('how do I submit?')).toBe('FACTS');
    });

    it('should still classify clear LORE with keywords', () => {
      expect(classifyQuery('tell me about this')).toBe('LORE');
      expect(classifyQuery('who created this?')).toBe('LORE');
    });
  });

  describe('Tie-breaker Logic (Your Custom Logic)', () => {
    it('should classify short queries (≤4 words) as LORE when no keywords', () => {
      // No keywords matched (including conversational), ≤4 words → LORE (likely card/artist names)
      expect(classifyQuery('FREEDOMKEK')).toBe('LORE'); // 1 word
      expect(classifyQuery('purple era')).toBe('LORE'); // 2 words
      expect(classifyQuery('fake rare card')).toBe('LORE'); // 3 words
      expect(classifyQuery('series one genesis')).toBe('LORE'); // 3 words
    });

    it('should classify longer queries (>4 words) as UNCERTAIN when no keywords', () => {
      // No keywords matched, >4 words → UNCERTAIN (ambiguous)
      expect(classifyQuery('would like to see more')).toBe('UNCERTAIN'); // 5 words
      expect(classifyQuery('that is something to consider')).toBe('UNCERTAIN'); // 5 words
      expect(classifyQuery('I really enjoyed looking at that card today')).toBe('UNCERTAIN'); // 8 words
      expect(classifyQuery('this has been a very interesting conversation so far')).toBe('UNCERTAIN'); // 9 words
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
      // >10 words, no keywords → UNCERTAIN (ambiguous)
      const longQuestion = 'would you please tell me more about that interesting thing you mentioned earlier?';
      expect(classifyQuery(longQuestion)).toBe('UNCERTAIN');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(classifyQuery('')).toBe('LORE'); // 0 words treated as short
    });

    it('should handle single words', () => {
      expect(classifyQuery('hello')).toBe('UNCERTAIN'); // 1 word, conversational keyword
      expect(classifyQuery('rules')).toBe('FACTS'); // 1 word, fact keyword
      expect(classifyQuery('history')).toBe('LORE'); // 1 word, lore keyword
      expect(classifyQuery('FREEDOMKEK')).toBe('LORE'); // 1 word, no keywords (likely card)
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
      it('should not route casual conversation (conversational keywords)', () => {
        // Conversational keywords → UNCERTAIN (won't auto-route)
        expect(classifyQuery('gm')).toBe('UNCERTAIN');
        expect(classifyQuery('gn')).toBe('UNCERTAIN');
        expect(classifyQuery('thanks')).toBe('UNCERTAIN');
        expect(classifyQuery('nice work')).toBe('UNCERTAIN');
        expect(classifyQuery('ok')).toBe('UNCERTAIN');
        expect(classifyQuery('cool')).toBe('UNCERTAIN');
        expect(classifyQuery('lol')).toBe('UNCERTAIN');
      });

      it('should not route long ambiguous messages (>3 words, no keywords)', () => {
        // Long, no keywords → UNCERTAIN (routed to AI conversation)
        expect(classifyQuery('have you ever seen that')).toBe('UNCERTAIN');
        expect(classifyQuery('but i said it just now')).toBe('UNCERTAIN');
      });

      it('should not route story requests (LORE keywords)', () => {
        expect(classifyQuery('tell me about fake rares')).toBe('LORE');
        expect(classifyQuery('who created this project?')).toBe('LORE');
        expect(classifyQuery('what happened with the community?')).toBe('LORE');
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


import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType, composePromptFromState } from '@elizaos/core';

/**
 * Proactive Lore Sharing Action
 * Uses LLM to decide when to share Fake Rares lore intelligently
 * 
 * Triggers when:
 * - Cards are mentioned in conversation (but not via /f command)
 * - Discussion is about Fake Rares history
 * - Context would benefit from additional knowledge
 */

export const shareLoreAction: Action = {
  name: 'SHARE_FAKE_RARES_LORE',
  description: 'Proactively share Fake Rares lore when relevant to the conversation',
  
  similes: ['SHARE_KNOWLEDGE', 'EDUCATE', 'EXPLAIN_LORE'],
  
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'I heard FREEDOMKEK is the first Fake Rare' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Absolutely ser! FREEDOMKEK is the genesis card, born from Rare Scrilla\'s legendary ban...',
          action: 'SHARE_FAKE_RARES_LORE',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'What\'s the deal with La Faka Nostra?' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'La Faka Nostra is the spirit of this movement - creative freedom over gatekeeping...',
          action: 'SHARE_FAKE_RARES_LORE',
        },
      },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Don't trigger if user explicitly used /f command
    if (text.startsWith('/f ')) {
      return false;
    }
    
    // Check if message mentions Fake Rares topics
    const fakeRaresKeywords = [
      'fake rare', 'fake rares', 'freedomkek', 'wagmiworld', 'peponacid',
      'rare scrilla', 'la faka nostra', 'counterparty', 'rare pepe',
      'card', 'series', 'artist', 'lore', 'genesis'
    ];
    
    const hasFakeRaresContext = fakeRaresKeywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    return hasFakeRaresContext;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      // Compose state with recent messages for context
      const composedState = await runtime.composeState(message, [
        'recentMessages', 'characterDescription'
      ]);
      
      // Create decision prompt
      const shouldShareTemplate = `# Task: Should {{agentName}} share Fake Rares lore?

{{recentMessages}}

Current message: "${message.content.text}"

Context: {{agentName}} is an OG Fake Rares community member who knows all the lore, history, and card details.

Should {{agentName}} proactively share relevant Fake Rares knowledge or lore in response to this conversation?

Respond YES if:
- Someone asks about a specific card or artist
- Discussion is about Fake Rares history or culture
- User seems curious or wants to learn
- Context would benefit from insider knowledge
- Opportunity to educate or share stories

Respond NO if:
- Question already answered in conversation
- Off-topic or unrelated discussion
- Just casual greetings or small talk
- User explicitly doesn't want information

Your response (YES or NO):`;

      const prompt = composePromptFromState({ 
        state: composedState, 
        template: shouldShareTemplate 
      });
      
      const decision = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        runtime,
      });
      
      if (decision.toLowerCase().includes('yes')) {
        // Extract topics mentioned for knowledge search
        const text = message.content.text || '';
        const searchQuery = extractSearchQuery(text);
        
        // Search knowledge base for relevant lore
        const knowledgeService = runtime.getService('knowledge');
        let loreContent = '';
        
        if (knowledgeService) {
          try {
            const results = await (knowledgeService as any).searchKnowledge({
              query: searchQuery,
              agentId: runtime.agentId,
              limit: 3,
            });
            
            if (results && results.length > 0) {
              // Use first result as primary lore
              loreContent = results[0].text;
              
              // Trim to reasonable length for chat
              if (loreContent.length > 500) {
                loreContent = loreContent.slice(0, 500) + '...';
              }
            }
          } catch (e) {
            // Knowledge search failed
          }
        }
        
        if (loreContent) {
          // Share the lore via callback
          if (callback) {
            await callback({
              text: `${loreContent}\n\nWAGMI 🐸✨`,
            });
          }
          
          return {
            success: true,
            text: 'Shared Fake Rares lore',
            data: {
              lore: loreContent,
              searchQuery,
              trigger: 'proactive'
            }
          };
        }
      }
      
      // Decision was NO or no lore found
      return {
        success: false,
        text: 'No lore sharing needed',
        data: { trigger: 'declined' }
      };
      
    } catch (error) {
      console.error('Error in SHARE_FAKE_RARES_LORE action:', error);
      
      return {
        success: false,
        text: 'Error sharing lore',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  },
};

/**
 * Extract search query from user message
 * Identifies card names, topics, and relevant keywords
 * SCALES ACROSS ALL CARDS - No hardcoded list!
 */
function extractSearchQuery(text: string): string {
  const upperText = text.toUpperCase();
  const lowerText = text.toLowerCase();
  
  // Extract all-caps words (potential card names)
  const capsWords = text.match(/\b[A-Z]{4,}[A-Z0-9]*\b/g) || [];
  
  // If we found all-caps words, assume they're card names
  if (capsWords.length > 0) {
    const primaryCard = capsWords[0];
    return `${primaryCard} card lore history artist community`;
  }
  
  // Check for topic keywords
  if (lowerText.includes('rare scrilla')) {
    return 'Rare Scrilla ban FREEDOMKEK genesis story';
  }
  
  if (lowerText.includes('la faka nostra')) {
    return 'La Faka Nostra directory philosophy freedom gatekeeping';
  }
  
  if (lowerText.includes('genesis') || lowerText.includes('first')) {
    return 'FREEDOMKEK genesis first card Rare Scrilla origin';
  }
  
  // Extract any meaningful words for search
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) {
    return `Fake Rares ${words.slice(0, 5).join(' ')} lore history`;
  }
  
  // Default: general Fake Rares context
  return `Fake Rares lore history community`;
}


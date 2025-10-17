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
    const text = message.content.text || '';
    const lowerText = text.toLowerCase();
    
    console.log(`🔍 [shareLore.validate] Checking: "${text}"`);
    
    // Don't trigger if user explicitly used /f command
    if (lowerText.startsWith('/f ')) {
      console.log(`❌ [shareLore.validate] Skipping /f command`);
      return false;
    }
    
    // Check for ALL-CAPS card names (potential Fake Rares)
    const hasCardName = /\b[A-Z]{4,}[A-Z0-9]*\b/.test(text);
    
    // Check if message mentions Fake Rares topics
    const fakeRaresKeywords = [
      'fake rare', 'fake rares', 'freedomkek', 'wagmiworld', 'peponacid',
      'rare scrilla', 'la faka nostra', 'counterparty', 'rare pepe',
      'card', 'series', 'artist', 'lore', 'genesis', 'tell me about', 'what is'
    ];
    
    const hasKeyword = fakeRaresKeywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    );
    
    const shouldTrigger = hasCardName || hasKeyword;
    console.log(`${shouldTrigger ? '✅' : '❌'} [shareLore.validate] CardName: ${hasCardName}, Keyword: ${hasKeyword} → ${shouldTrigger}`);
    
    return shouldTrigger;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    console.log(`🚀 [shareLore.handler] STARTED for message: "${message.content.text}"`);
    
    try {
      // Validation already confirmed this is card-related, skip LLM decision to avoid hanging
      // Extract topics mentioned for knowledge search
      const text = message.content.text || '';
      const searchQuery = extractSearchQuery(text);
      
      console.log(`🔍 [shareLore] Searching knowledge for: "${searchQuery}"`);
      
      // Search knowledge base for relevant lore with timeout
      let loreContent = '';
      
      try {
        // Use runtime.searchMemories directly (not through service!)
        const searchPromise = runtime.searchMemories({
          tableName: 'knowledge',
          roomId: message.roomId,
          query: searchQuery,
          count: 3,
          match_threshold: 0.5,
        });
          
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Knowledge search timeout')), 5000)
        );
        
        const results = await Promise.race([searchPromise, timeoutPromise]);
        
        console.log(`📚 [shareLore] Found ${results?.length || 0} knowledge results`);
        
        if (results && results.length > 0) {
          // Use first result as primary lore
          loreContent = results[0].content?.text || '';
          
          // Trim to reasonable length for chat
          if (loreContent.length > 500) {
            loreContent = loreContent.slice(0, 500) + '...';
          }
          
          console.log(`✅ [shareLore] Using lore (${loreContent.length} chars)`);
        } else {
          console.log(`⚠️ [shareLore] No lore found in knowledge base`);
        }
      } catch (e) {
        console.error(`❌ [shareLore] Knowledge search failed:`, e instanceof Error ? e.message : String(e));
        // Continue without lore rather than hanging
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
      
      // No lore found
      console.log(`⏭️ [shareLore.handler] Declining - no lore needed`);
      return {
        success: false,
        text: 'No lore sharing needed',
        data: { trigger: 'declined' }
      };
      
    } catch (error) {
      console.error(`💥 [shareLore.handler] ERROR:`, error);
      
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


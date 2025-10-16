import { type Provider, type IAgentRuntime, type Memory, type State } from '@elizaos/core';

/**
 * Fake Rares Context Provider
 * Detects card mentions and Fake Rares topics in conversations
 * Provides contextual information to help the agent respond intelligently
 * 
 * SCALES ACROSS ALL CARDS - Uses dynamic detection instead of hardcoded list
 */

import { CARD_SERIES_MAP } from '../data/cardSeriesMap';

// Get all known cards dynamically from the series map
const getKnownCards = (): string[] => Object.keys(CARD_SERIES_MAP);

// Community-specific terminology
const FAKE_RARES_TERMS = [
  'fake rare', 'fake rares', 'la faka nostra', 'rare scrilla',
  'counterparty', 'rare pepe', 'series', 'genesis', 'wagmi',
  'ngmi', 'based', 'degen', 'fam', 'ser', 'anon'
];

export const fakeRaresContextProvider: Provider = {
  name: 'FAKE_RARES_CONTEXT',
  
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toUpperCase() || '';
    const lowerText = text.toLowerCase();
    
    // Detect mentioned cards dynamically from all known cards
    const knownCards = getKnownCards();
    const mentionedCards = knownCards.filter(card => 
      text.includes(card)
    );
    
    // Detect community terms
    const mentionedTerms = FAKE_RARES_TERMS.filter(term =>
      lowerText.includes(term)
    );
    
    // Determine conversation context
    const hasFakeRaresContext = mentionedCards.length > 0 || mentionedTerms.length > 0;
    const isCardSpecific = mentionedCards.length > 0;
    const isGeneralDiscussion = mentionedTerms.length > 0 && mentionedCards.length === 0;
    
    // Build context summary
    let contextText = '';
    const contextData: any = {
      mentionedCards,
      mentionedTerms,
      hasFakeRaresContext,
      isCardSpecific,
      isGeneralDiscussion,
    };
    
    if (isCardSpecific) {
      contextText = `Cards mentioned in conversation: ${mentionedCards.join(', ')}. `;
      contextText += `This is a good opportunity to share knowledge about these specific cards.`;
      contextData.suggectedAction = 'share_card_lore';
    } else if (isGeneralDiscussion) {
      contextText = `Fake Rares discussion detected (${mentionedTerms.slice(0, 3).join(', ')}). `;
      contextText += `User is engaged with the community culture.`;
      contextData.suggectedAction = 'engage_community';
    } else {
      contextText = `General conversation - no specific Fake Rares context detected.`;
      contextData.suggectedAction = 'respond_naturally';
    }
    
    return {
      text: contextText,
      data: contextData,
      values: {
        hasFakeRaresContext,
        cardCount: mentionedCards.length,
        primaryCard: mentionedCards[0] || null,
      },
    };
  },
};


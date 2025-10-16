import { type Evaluator, type IAgentRuntime, type Memory, type State, ModelType, composePromptFromState } from '@elizaos/core';

/**
 * Lore Detection Evaluator
 * Detects when conversations contain new lore about Fake Rares cards
 * Extracts and stores the lore for future retrieval
 * 
 * Runs AFTER conversations to analyze if new information was shared
 * 
 * SCALES ACROSS ALL CARDS - No hardcoded card list!
 */

export const loreDetectorEvaluator: Evaluator = {
  name: 'FAKE_RARES_LORE_DETECTOR',
  description: 'Detects and extracts new lore about Fake Rares cards from conversations',
  
  similes: ['LORE_EXTRACTOR', 'KNOWLEDGE_CURATOR'],
  
  examples: [],
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Run if message mentions Fake Rares topics OR has card-like patterns
    const hasFakeRaresContext = (
      text.includes('fake rare') ||
      text.includes('la faka nostra') ||
      text.includes('rare scrilla') ||
      text.includes('card') ||
      text.includes('series') ||
      text.includes('artist') ||
      /\b[A-Z]{4,}[A-Z0-9]*\b/.test(message.content.text || '')  // Has all-caps words (potential card names)
    );
    
    // Don't run on bot's own messages
    const isFromBot = message.entityId === runtime.agentId;
    
    return hasFakeRaresContext && !isFromBot;
  },
  
  handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    try {
      const text = message.content.text || '';
      
      // Use LLM to detect if this contains new/interesting lore
      const loreDetectionTemplate = `# Task: Detect Fake Rares Card Lore

Analyze this message for factual information about Fake Rares cards:

Message: "${text}"

Does this message contain:
- Historical facts about a card (creation date, artist, series)
- Interesting stories or anecdotes about a card
- Technical details (editions, features, mechanics)
- Community significance or cultural context
- Artist intentions or meanings

Respond in format:
CONTAINS_LORE: [YES or NO]
CARD_NAME: [card name if found, or NONE]
LORE_TYPE: [HISTORICAL, TECHNICAL, CULTURAL, ANECDOTE, or NONE]
LORE_SUMMARY: [one sentence summary of the lore, or NONE]

Examples:
- "WAGMIWORLD had 770 players" → YES, factual, worth saving
- "I love FREEDOMKEK" → NO, just opinion
- "Rare Scrilla created FREEDOMKEK after getting banned" → YES, historical fact`;

      const prompt = loreDetectionTemplate;
      
      const assessment = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        runtime,
      });
      
      // Parse the LLM response
      const containsLore = assessment.toUpperCase().includes('CONTAINS_LORE: YES');
      
      if (!containsLore) {
        return;
      }
      
      // Extract details from assessment
      const cardName = extractValue(assessment, 'CARD_NAME');
      const loreType = extractValue(assessment, 'LORE_TYPE');
      const loreSummary = extractValue(assessment, 'LORE_SUMMARY');
      
      if (!cardName || cardName === 'NONE') {
        return;
      }
      
      // Store the lore as a curated memory
      const loreMemory = await runtime.createMemory({
        entityId: runtime.agentId,
        roomId: message.roomId,
        content: {
          text: `${cardName} Lore (${loreType}): ${loreSummary}\n\nSource: "${text}"\n\nShared by user in ${new Date().toISOString()}`,
          type: 'curated_lore',
          metadata: {
            cardName,
            loreType,
            originalMessage: text,
            sourceMessageId: message.id,
            curatedAt: Date.now(),
            confidence: 'user_contributed'
          }
        }
      }, 'lore_repository');
      
      console.log(`✅ New lore detected for ${cardName}: ${loreSummary}`);
      
      // Evaluators can return void or nothing
      return;
      
    } catch (error) {
      console.error('Error in lore detector:', error);
      return;
    }
  },
  
  // Run on all messages that mention cards
  alwaysRun: false,
};

/**
 * Extract a value from LLM assessment
 */
function extractValue(assessment: string, key: string): string {
  const lines = assessment.split('\n');
  const line = lines.find(l => l.toUpperCase().includes(`${key}:`));
  
  if (line) {
    const value = line.split(':')[1]?.trim() || '';
    return value;
  }
  
  return 'NONE';
}


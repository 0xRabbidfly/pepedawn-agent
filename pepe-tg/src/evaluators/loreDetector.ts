import { type Evaluator, type IAgentRuntime, type Memory, type State, ModelType, composePromptFromState } from '@elizaos/core';

/**
 * Lore Detection Evaluator
 * Detects when conversations contain new lore about Fake Rares cards
 * Extracts and stores the lore for future retrieval
 * 
 * Runs AFTER conversations to analyze if new information was shared
 * 
 * SCALES ACROSS ALL CARDS - No hardcoded card list!
 * 
 * OPTIMIZATIONS:
 * - Simple cache for recent assessments (5 min TTL)
 * - Early exit for very short messages
 * - Timeout for LLM calls (8s)
 */

// Simple in-memory cache for LLM assessments (hash -> result)
const assessmentCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LLM_TIMEOUT_MS = 8000; // 8 seconds

// Clean expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of assessmentCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      assessmentCache.delete(key);
    }
  }
}, 60000); // Clean every minute

export const loreDetectorEvaluator: Evaluator = {
  name: 'FAKE_RARES_LORE_DETECTOR',
  description: 'Detects and extracts new lore about Fake Rares cards from conversations',
  
  similes: ['LORE_EXTRACTOR', 'KNOWLEDGE_CURATOR'],
  
  examples: [],
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const rawText = message.content.text || '';
    const text = rawText.toLowerCase();

    // Skip evaluator on bot commands (e.g., /f, /p)
    if (rawText.trim().startsWith('/')) {
      return false;
    }
    
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
      
      // Early exit for very short messages (likely not lore)
      if (text.length < 20) {
        return;
      }
      
      // Check cache first (use first 200 chars as key)
      const cacheKey = text.slice(0, 200);
      const cached = assessmentCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        // Use cached assessment
        const containsLore = cached.result.toUpperCase().includes('CONTAINS_LORE: YES');
        if (!containsLore) return;
        
        // Re-extract and store (same logic as below)
        const cardName = extractValue(cached.result, 'CARD_NAME');
        const loreType = extractValue(cached.result, 'LORE_TYPE');
        const loreSummary = extractValue(cached.result, 'LORE_SUMMARY');
        
        if (!cardName || cardName === 'NONE') return;
        
        await runtime.createMemory({
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
        
        console.log(`✅ New lore detected (cached) for ${cardName}: ${loreSummary}`);
        return;
      }
      
      // OPTIMIZED: Shorter, more focused prompt
      const loreDetectionTemplate = `# Detect Fake Rares Card Lore

Message: "${text.slice(0, 300)}"

Contains factual info about Fake Rares cards? (history, technical, cultural, anecdotes)

Format:
CONTAINS_LORE: YES/NO
CARD_NAME: [name or NONE]
LORE_TYPE: HISTORICAL/TECHNICAL/CULTURAL/ANECDOTE/NONE
LORE_SUMMARY: [one sentence or NONE]`;
      
      const prompt = loreDetectionTemplate;
      
      // Add timeout to LLM call
      const assessmentPromise = runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        runtime,
      });
      
      const timeoutPromise = new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS)
      );
      
      const assessment = await Promise.race([assessmentPromise, timeoutPromise]) as string;
      
      // Cache the assessment
      assessmentCache.set(cacheKey, {
        result: assessment,
        timestamp: Date.now()
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


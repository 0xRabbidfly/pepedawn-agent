import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType, composePromptFromState } from '@elizaos/core';

/**
 * Newcomer Education Action
 * Detects and educates new community members about Fake Rares
 * 
 * Triggers when:
 * - User asks basic/beginner questions
 * - User explicitly states they're new
 * - Question patterns match newcomer queries
 */

// Beginner question patterns
const NEWCOMER_PATTERNS = [
  'what is', 'what are', 'what\'s', 'whats',
  'new here', 'just joined', 'first time',
  'how do i', 'how to', 'where do i',
  'can someone explain', 'eli5', 'explain like',
  'beginner', 'noob', 'newbie',
  'never heard', 'don\'t understand', 'dont understand'
];

// Fake Rares intro topics
const INTRO_TOPICS = [
  'fake rare', 'fake rares', 'this project', 'this community',
  'rare pepe', 'counterparty', 'nft', 'collect',
  'buy', 'get started', 'begin'
];

export const educateNewcomerAction: Action = {
  name: 'EDUCATE_NEWCOMER',
  description: 'Detect and educate new community members about Fake Rares',
  
  similes: ['WELCOME_USER', 'ONBOARD', 'TEACH_BASICS'],
  
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: 'Just joined, what are Fake Rares?' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Welcome to the fam, anon! Fake Rares are Bitcoin-based Pepe art cards...',
          action: 'EDUCATE_NEWCOMER',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: 'How do I get started with this?' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Great question! Let me show you the ropes...',
          action: 'EDUCATE_NEWCOMER',
        },
      },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Check for newcomer patterns
    const hasNewcomerPattern = NEWCOMER_PATTERNS.some(pattern => 
      text.includes(pattern)
    );
    
    // Check for intro topics
    const hasIntroTopic = INTRO_TOPICS.some(topic => 
      text.includes(topic)
    );
    
    // Validate if both conditions are met (newcomer asking about intro topics)
    return hasNewcomerPattern && hasIntroTopic;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      // Compose state with character context
      const composedState = await runtime.composeState(message, [
        'recentMessages', 'characterDescription'
      ]);
      
      // Use LLM to determine newcomer level and what they need
      const assessmentTemplate = `# Task: Assess newcomer's knowledge level

User message: "${message.content.text}"

Recent conversation:
{{recentMessages}}

Determine the user's knowledge level:
1. ABSOLUTE_BEGINNER - Never heard of Fake Rares, needs full intro
2. KNOWS_RARE_PEPES - Familiar with Rare Pepes, needs Fake Rares specific info
3. TECHNICAL_QUESTION - Knows basics, asking about buying/trading/technical stuff
4. NOT_A_NEWCOMER - Just a general question, doesn't need onboarding

Also identify their main question:
- What is Fake Rares?
- How is it different from Rare Pepes?
- How to buy/collect?
- Who created it?
- Other: [specify]

Respond in format:
LEVEL: [level]
QUESTION: [main question]`;

      const prompt = composePromptFromState({ 
        state: composedState, 
        template: assessmentTemplate 
      });
      
      const assessment = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        runtime,
      });
      
      // Parse assessment
      const level = extractLevel(assessment);
      const question = extractQuestion(assessment);
      
      // If not a real newcomer, skip
      if (level === 'NOT_A_NEWCOMER') {
        return {
          success: false,
          text: 'Not a newcomer query',
          data: { level, question }
        };
      }
      
      // Search knowledge base for relevant intro content
      const knowledgeService = runtime.getService('knowledge');
      let educationContent = '';
      
      if (knowledgeService) {
        try {
          const searchQuery = buildEducationQuery(level, question);
          
          const results = await (knowledgeService as any).searchKnowledge({
            query: searchQuery,
            agentId: runtime.agentId,
            limit: 5,
          });
          
          if (results && results.length > 0) {
            // Aggregate knowledge from results
            educationContent = results
              .slice(0, 3)
              .map((r: any) => r.text)
              .join('\n\n');
            
            // Keep it concise for Telegram
            if (educationContent.length > 800) {
              educationContent = educationContent.slice(0, 800) + '...';
            }
          }
        } catch (e) {
          // Knowledge search failed
        }
      }
      
      // Build welcome message based on level
      const welcomeMessage = buildWelcomeMessage(level, question, educationContent);
      
      // Send education via callback
      if (callback) {
        await callback({
          text: welcomeMessage,
        });
      }
      
      return {
        success: true,
        text: 'Educated newcomer',
        data: {
          level,
          question,
          providedInfo: true
        }
      };
      
    } catch (error) {
      console.error('Error in EDUCATE_NEWCOMER action:', error);
      
      // Fallback to basic welcome
      if (callback) {
        await callback({
          text: `Welcome to the Fake Rares fam, anon! 🐸✨\n\nFake Rares are Bitcoin-based Pepe art cards. Try \`/f FREEDOMKEK\` to see the genesis card, or ask me anything about the collection!\n\nWAGMI 🚀`,
        });
      }
      
      return {
        success: true,
        text: 'Provided fallback welcome',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  },
};

/**
 * Extract knowledge level from LLM assessment
 */
function extractLevel(assessment: string): string {
  const upperAssessment = assessment.toUpperCase();
  
  if (upperAssessment.includes('ABSOLUTE_BEGINNER')) {
    return 'ABSOLUTE_BEGINNER';
  } else if (upperAssessment.includes('KNOWS_RARE_PEPES')) {
    return 'KNOWS_RARE_PEPES';
  } else if (upperAssessment.includes('TECHNICAL_QUESTION')) {
    return 'TECHNICAL_QUESTION';
  }
  
  return 'NOT_A_NEWCOMER';
}

/**
 * Extract main question from assessment
 */
function extractQuestion(assessment: string): string {
  const lines = assessment.split('\n');
  const questionLine = lines.find(line => line.toUpperCase().includes('QUESTION:'));
  
  if (questionLine) {
    return questionLine.split(':')[1]?.trim() || 'general';
  }
  
  return 'general';
}

/**
 * Build knowledge search query based on level and question
 */
function buildEducationQuery(level: string, question: string): string {
  switch (level) {
    case 'ABSOLUTE_BEGINNER':
      return 'Fake Rares introduction FREEDOMKEK genesis Rare Scrilla ban La Faka Nostra beginner';
    
    case 'KNOWS_RARE_PEPES':
      return 'Fake Rares vs Rare Pepe difference Rare Scrilla ban 2021 La Faka Nostra philosophy';
    
    case 'TECHNICAL_QUESTION':
      return 'Counterparty Bitcoin buy collect trade Fake Rares technical';
    
    default:
      return 'Fake Rares introduction community';
  }
}

/**
 * Build welcome message based on level
 */
function buildWelcomeMessage(level: string, question: string, knowledgeContent: string): string {
  let message = '';
  
  switch (level) {
    case 'ABSOLUTE_BEGINNER':
      message = `Welcome to the fam, anon! 🐸✨\n\n`;
      
      if (knowledgeContent) {
        message += `${knowledgeContent}\n\n`;
      } else {
        message += `Fake Rares are Bitcoin-based Pepe art cards born in 2021 when artist Rare Scrilla got banned for sharing Pepes outside the "official" directory. Instead of giving up, he created La Faka Nostra and started this movement.\n\nWe're 250+ cards strong now, each with its own lore, animations, and stories. All on Bitcoin/Counterparty blockchain.\n\n`;
      }
      
      message += `**Quick Start:**\n`;
      message += `• Try \`/f FREEDOMKEK\` to see the genesis card\n`;
      message += `• Ask me about any card, artist, or lore\n`;
      message += `• Check out pepe.wtf for the full directory\n\n`;
      message += `You belong here. WAGMI 🚀`;
      break;
    
    case 'KNOWS_RARE_PEPES':
      message = `Ah, a fellow Pepe connoisseur! 🐸\n\n`;
      
      if (knowledgeContent) {
        message += `${knowledgeContent}\n\n`;
      } else {
        message += `Fake Rares are like Rare Pepes' rebellious younger sibling. Born in 2021 when Rare Scrilla got banned from the Rare Pepe Telegram, he said "screw gatekeeping" and started La Faka Nostra.\n\nSame Bitcoin/Counterparty roots, same Pepe love, but with pure creative freedom. No submission board, no rules - just art and vibes.\n\n`;
      }
      
      message += `The genesis card FREEDOMKEK says it all - freedom over control.\n\n`;
      message += `Try \`/f FREEDOMKEK\` to see where it all began! 🔥`;
      break;
    
    case 'TECHNICAL_QUESTION':
      message = `Let's get technical, ser! 🛠️\n\n`;
      
      if (knowledgeContent) {
        message += `${knowledgeContent}\n\n`;
      } else {
        message += `Fake Rares live on Bitcoin via Counterparty (same as OG Rare Pepes).\n\n`;
        message += `**How to get started:**\n`;
        message += `• You'll need a Counterparty wallet (Freewallet, Emblem Vault, etc.)\n`;
        message += `• Cards trade on marketplaces like OpenSea, pepe.wtf\n`;
        message += `• Each card is a unique Bitcoin asset\n`;
        message += `• Check pepe.wtf for the full directory and trading info\n\n`;
      }
      
      message += `Need specific help? Just ask! 🐸`;
      break;
    
    default:
      message = `gm anon! 🌅 WAGMI 🐸✨`;
  }
  
  return message;
}


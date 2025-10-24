import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';

/**
 * Basic Telegram Commands
 * Handles standard /start and /help commands
 */

export const startCommand: Action = {
  name: 'START_COMMAND',
  description: 'Handles /start command for new users',
  similes: ['START', 'BEGIN'],
  examples: [],
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || '';
    return text === '/start';
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const welcomeMessage = `gm anon! 🐸✨

I'm PEPEDAWN, your AI companion for all things Fake Rares.

**Quick Start:**
• Use \`/f CARDNAME\` to view any card (try \`/f FREEDOMKEK\`)
• Use \`/f ARTIST\` to get a random card by an artist (try \`/f Rare Scrilla\`)
• Ask me anything about cards, artists, or lore
• Share facts and I'll remember them for the community

**Popular Cards:**
• \`/f FREEDOMKEK\` - The genesis card
• \`/f WAGMIWORLD\` - Interactive game card  
• \`/f PEPONACID\` - Psychedelic masterpiece

Just chat naturally - I understand questions!

WAGMI 🚀`;

    if (callback) {
      await callback({ text: welcomeMessage });
    }
    
    return {
      success: true,
      text: 'Sent welcome message'
    };
  }
};

export const helpCommand: Action = {
  name: 'HELP_COMMAND',
  description: 'Handles /help command',
  similes: ['HELP', 'INFO'],
  examples: [],
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || '';
    return text === '/help' || text === '/info';
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const helpMessage = `🐸 **PEPEDAWN Commands**

\`/f CARDNAME\` - View any Fake Rares card
\`/f ARTIST\` - Random card by artist (supports misspellings!)
\`/fv CARDNAME\` - Analyze card visuals & memes with AI vision
\`/ft [attach image]\` - Test your art for Fake appeal score
\`/fl [topic]\` - Get lore stories from community history
\`/start\` - Welcome message

**Examples:**
• \`/f FREEDOMKEK\` • \`/f Pepenardo\` • \`/f\` (random)
• \`/fv PEPEPARTY\` • \`/ft\` + attach your meme

Just chat naturally or mention me with @pepedawn_bot 🐸`;

    if (callback) {
      await callback({ text: helpMessage });
    }
    
    return {
      success: true,
      text: 'Sent help message'
    };
  }
};


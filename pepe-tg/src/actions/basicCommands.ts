import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";

/**
 * Basic Telegram Commands
 * Handles standard /start and /help commands
 */

export const startCommand: Action = {
  name: "START_COMMAND",
  description: "Handles /start command for new users",
  similes: ["START", "BEGIN"],
  examples: [],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || "";
    return text === "/start";
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
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
      text: "Sent welcome message",
    };
  },
};

export const helpCommand: Action = {
  name: "HELP_COMMAND",
  description: "Handles /help command",
  similes: ["HELP", "INFO"],
  examples: [],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || "";
    return text === "/help" || text === "/info";
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ) => {
    const helpMessage = `🐸 **PEPEDAWN Commands**

**Cards:**
\`/f CARDNAME\` - View any card (try \`/f FREEDOMKEK\`)
\`/f ARTIST\` - Random card by artist
\`/f\` - Random card

**Fake Vision:**
\`/fv CARDNAME\` - AI visual analysis & meme breakdown

**Fake Market:** 📊 NEW!
\`/fm\` - Recent sales + listings (default 10)
\`/fm S 5\` - Last 5 sales only
\`/fm L 15\` - Last 15 listings only

Real-time notifications for dispenser & DEX activity!
• 💰 Dispenser sales | ⚡ DEX swaps
• 📋 Listings | 🎰 Dispenser 📊 DEX

**Fake Lore:**
\`/fl CARDNAME\` - Get card lore & community stories
\`/fl what is X\` - Get facts (rules, specs, how-to)
\`/fl tell me about Y\` - Get history & narratives
\`/fl\` - Random lore story

**Fake Memory:**
\`CARDNAME remember this CARDNAME: FACT\` - Save community knowledge

**Tips:**
• Case-insensitive: \`/f pepedawn\` = \`/f PEPEDAWN\`
• Chat naturally - I understand questions!
• Memories appear in future \`/fl\` searches

Type \`/start\` for welcome • Mention @pepedawn_bot anytime 🐸`;

    if (callback) {
      await callback({ text: helpMessage });
    }

    return {
      success: true,
      text: "Sent help message",
    };
  },
};

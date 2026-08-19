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
    return text.startsWith("/start");
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
• Artists: use \`/fr\` to add lore for your own cards

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
    return text.startsWith("/help") || text.startsWith("/info");
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
\`/f CARDNAME\` - View Fake Rares card (try \`/f FREEDOMKEK\`)
\`/f ARTIST\` - Random card by artist
\`/f c ARTIST\` - Browse artist's cards with carousel 🎠
\`/f c SERIES\` - Browse series cards (e.g. \`/f c 5\`) 📚
\`/f\` - Random Fake Rares card

**Fake Market:** 📊
\`/fm\` - Recent sales + listings (default 10)
\`/fm CARDNAME\` - Live dispensers for any card (e.g. \`/fm FAKEASF\`)

**XCP Dispensers:** 💰
\`/xcp\` - View verified XCP dispenser list

**Fake Remember:** 💾
\`/fr CARDNAME <lore>\` - Artists: add the story behind your own card
_Only the credited artist can add lore, max 2 entries per card. Different handle? Ask an admin to link it._

**Just talk to me:** 💬
Ask about any card, its lore, what it looks like, or who made it —
no command needed.`;

    if (callback) {
      await callback({ text: helpMessage });
    }

    return {
      success: true,
      text: "Sent help message",
    };
  },
};

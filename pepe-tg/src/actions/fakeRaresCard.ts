import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';

/**
 * Fake Rares Card Display Action
 * Responds to /f <ASSET> commands by fetching and displaying card images
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{ASSET}.{jpg|gif}
 * Series 0-18 (18 is currently releasing)
 */

// Base URL for Fake Rares card images
const FAKE_RARES_BASE_URL = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

// Known card series and their series numbers (expand as you discover more)
const CARD_SERIES_MAP: Record<string, number> = {
  'KARPEPELES': 0,
  'FREEDOMKEK': 0,  // First Fake Rare - series 0 (confirmed!)
  // Add more as discovered from chat history
};

/**
 * Constructs the image URL for a Fake Rares card
 * Tries .jpg, .jpeg, and .gif extensions
 */
function getFakeRaresImageUrl(assetName: string, seriesNumber: number, extension: 'jpg' | 'jpeg' | 'gif'): string {
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${assetName.toUpperCase()}.${extension}`;
}

/**
 * Attempts to find the card image by trying different series numbers (0-18)
 * Tries .jpg, .jpeg, and .gif extensions
 */
async function findCardImage(assetName: string): Promise<{ url: string; extension: string } | null> {
  const upperAsset = assetName.toUpperCase();
  
  // Try known mapping first
  const knownSeries = CARD_SERIES_MAP[upperAsset];
  if (knownSeries !== undefined) {
    // Try all extensions
    for (const ext of ['jpg', 'jpeg', 'gif']) {
      const testUrl = getFakeRaresImageUrl(upperAsset, knownSeries, ext as 'jpg' | 'jpeg' | 'gif');
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Try next extension
      }
    }
  }
  
  // Search through all series 0-18
  for (let series = 0; series <= 18; series++) {
    // Try all extensions
    for (const ext of ['jpg', 'jpeg', 'gif']) {
      const testUrl = getFakeRaresImageUrl(upperAsset, series, ext as 'jpg' | 'jpeg' | 'gif');
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          // Cache this for future use
          CARD_SERIES_MAP[upperAsset] = series;
          console.log(`✅ Found ${upperAsset} in series ${series} (${ext})`);
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Continue searching
      }
    }
  }
  
  return null;
}

export const fakeRaresCardAction: Action = {
  name: 'SHOW_FAKE_RARE_CARD',
  description: 'Display a Fake Rares card image when user requests with /f <ASSET>',
  
  similes: ['/f'],
  
  examples: [
    [
      {
        name: '{{user1}}',
        content: { text: '/f FAKEQQ' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'Here\'s FAKEQQ! 🐸✨',
          action: 'SHOW_FAKE_RARE_CARD',
        },
      },
    ],
    [
      {
        name: '{{user1}}',
        content: { text: '/f FREEDOMKEK' },
      },
      {
        name: '{{agentName}}',
        content: {
          text: 'The legendary genesis card! FREEDOMKEK 🔥',
          action: 'SHOW_FAKE_RARE_CARD',
        },
      },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Check if message starts with /f followed by asset name
    return text.match(/^\/f\s+[a-z0-9]+/i) !== null;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    try {
      const text = message.content.text || '';
      
      // Extract asset name from /f <ASSET>
      const match = text.match(/^\/f\s+([a-z0-9]+)/i);
      if (!match) {
        if (callback) {
          await callback({
            text: 'Usage: /f <ASSET_NAME>\nExample: /f FAKEQQ',
          });
        }
        return { success: false, text: 'Invalid /f command format' };
      }
      
      const assetName = match[1].toUpperCase();
      
      // Step 1: Immediate feedback - searching
      if (callback) {
        await callback({
          text: `🔍 Searching for ${assetName}...`,
        });
      }
      
      // Step 2: Search knowledge base for card lore
      const knowledgeService = runtime.getService('knowledge');
      let cardLore = '';
      
      if (knowledgeService) {
        try {
          if (callback) {
            await callback({
              text: `📚 Fetching lore from the archives...`,
            });
          }
          
          const results = await (knowledgeService as any).searchKnowledge({
            query: `${assetName} card lore history artist`,
            agentId: runtime.agentId,
            limit: 3,
          });
          
          if (results && results.length > 0) {
            cardLore = `\n\n💡 From the archives:\n${results[0].text.slice(0, 200)}...`;
          }
        } catch (e) {
          // Knowledge search failed, continue without lore
        }
      }
      
      // Step 3: Find the card image
      if (callback) {
        await callback({
          text: `🎨 Loading card image...`,
        });
      }
      
      const cardResult = await findCardImage(assetName);
      
      if (cardResult) {
        const { url, extension } = cardResult;
        
        // Send image with caption
        if (callback) {
          await callback({
            text: `${assetName} 🐸✨${cardLore}\n\n${url}`,
            attachments: [
              {
                id: `fake-rare-${assetName.toLowerCase()}`,
                url,
                title: assetName,
              },
            ],
          });
        }
        
        return { 
          success: true, 
          text: `Displayed ${assetName}`,
          data: { assetName, url, extension }
        };
      } else {
        // Card not found
        if (callback) {
          await callback({
            text: `Hmm, couldn't find ${assetName} in the Fake Rares collection 🤔\n\nMake sure you're using the exact asset name (all caps). Try searching the directory at pepe.wtf or check if it's a Rare Pepe instead of a Fake Rare!\n\nNeed help? Just ask "what Fake Rares cards are there?" 🐸`,
          });
        }
        
        return { 
          success: false, 
          text: `Card ${assetName} not found`,
          data: { assetName }
        };
      }
    } catch (error) {
      console.error('Error in SHOW_FAKE_RARE_CARD action:', error);
      
      if (callback) {
        await callback({
          text: 'Oops, something went wrong fetching that card. Try again in a moment! 🐸',
        });
      }
      
      return { 
        success: false, 
        text: 'Error fetching card',
        data: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  },
};


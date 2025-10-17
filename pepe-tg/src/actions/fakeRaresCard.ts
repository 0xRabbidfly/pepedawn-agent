import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { getCardSeries, addCardToMap, isKnownCard, SERIES_INFO, getCardExtension } from '../data/cardSeriesMap';
import { getCardInfo, type CardInfo } from '../data/fullCardIndex';

/**
 * Fake Rares Card Display Action
 * Responds to /f <ASSET> commands by fetching and displaying card images
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{ASSET}.{jpg|gif}
 * Series 0-18 (19 series total, 50 cards each = ~950 total cards)
 * 
 * Performance optimization:
 * - Known cards: ~200ms (direct lookup, 1-3 HTTP requests)
 * - Unknown cards: ~2-10s (search series 0-18, auto-cache result)
 */

// Base URL for Fake Rares card images
const FAKE_RARES_BASE_URL = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

/**
 * Constructs the image URL for a Fake Rares card
 * Tries .jpg, .jpeg, .gif, .png, .mp4, and .webp extensions
 */
function getFakeRaresImageUrl(assetName: string, seriesNumber: number, extension: 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp'): string {
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${assetName.toUpperCase()}.${extension}`;
}

/**
 * Attempts to find the card image by trying different series numbers (0-18)
 * Uses full card index for instant lookups when available
 */
async function findCardImage(assetName: string): Promise<{ url: string; extension: string } | null> {
  const upperAsset = assetName.toUpperCase();
  const t0 = Date.now();
  
  // Check full card index first (SUPER FAST - no HTTP requests!)
  const cardInfo = getCardInfo(upperAsset);
  if (cardInfo) {
    const url = getFakeRaresImageUrl(upperAsset, cardInfo.series, cardInfo.ext);
    console.log(`⚡ INSTANT: ${upperAsset} series=${cardInfo.series} ext=.${cardInfo.ext} (${Date.now() - t0}ms)`);
    return { url, extension: cardInfo.ext };
  }
  
  // Try known mapping from runtime cache (fast path with probing)
  const knownSeries = getCardSeries(upperAsset);
  if (knownSeries !== undefined) {
    console.log(`🧭 Fast path: ${upperAsset} series=${knownSeries} (trying extensions...)`);
    // Try all extensions for the known series
    for (const ext of ['jpg', 'jpeg', 'gif', 'png']) {
      const testUrl = getFakeRaresImageUrl(upperAsset, knownSeries, ext as 'jpg' | 'jpeg' | 'gif' | 'png');
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          console.log(`✅ Found ${upperAsset} in series ${knownSeries} (${ext}) in ${Date.now() - t0}ms`);
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Try next extension
      }
    }
  }
  
  // Unknown card - search through all series (slow path)
  console.log(`🔍 ${upperAsset} not in index or cache, searching series 0-${SERIES_INFO.TOTAL_SERIES - 1}...`);
  
  for (let series = 0; series < SERIES_INFO.TOTAL_SERIES; series++) {
    // Try all extensions
    for (const ext of ['jpg', 'jpeg', 'gif', 'png']) {
      const testUrl = getFakeRaresImageUrl(upperAsset, series, ext as 'jpg' | 'jpeg' | 'gif' | 'png');
      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          // Cache this for future use
          addCardToMap(upperAsset, series);
          console.log(`✅ Found ${upperAsset} in series ${series} (${ext}) in ${Date.now() - t0}ms - added to cache`);
          return { url: testUrl, extension: ext };
        }
      } catch (e) {
        // Continue searching
      }
    }
  }
  
  console.log(`❌ ${upperAsset} not found in any series 0-${SERIES_INFO.TOTAL_SERIES - 1} after ${Date.now() - t0}ms`);
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
    let assetName = 'UNKNOWN'; // Declare outside try block for error handling
    
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
      
      assetName = match[1].toUpperCase();
      
      // Get full card metadata first
      const cardInfo = getCardInfo(assetName);
      
      // Determine the actual URL to use (prefer videoUri/imageUri from metadata)
      let actualUrl: string | null = null;
      let extension: string | null = null;
      
      if (cardInfo) {
        // Prefer videoUri for mp4 files
        if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
          actualUrl = cardInfo.videoUri;
          extension = 'mp4';
          console.log(`🎬 Using videoUri for ${assetName}: ${actualUrl}`);
        }
        // Or imageUri if specified
        else if (cardInfo.imageUri) {
          actualUrl = cardInfo.imageUri;
          extension = cardInfo.ext;
          console.log(`🖼️ Using imageUri for ${assetName}: ${actualUrl}`);
        }
      }
      
      // Fall back to finding the card via HTTP probing
      if (!actualUrl) {
        const cardResult = await findCardImage(assetName);
        if (cardResult) {
          actualUrl = cardResult.url;
          extension = cardResult.extension;
        }
      }
      
      if (actualUrl) {
        console.log(`📸 Card found: ${assetName} (${extension}) - sending response`);
        
        // Build rich card info message
        let cardDetailsText = actualUrl; // Start with media URL
        
        if (cardInfo) {
          const details: string[] = [];
          
          // Series - Card
          details.push(`🎴 Series ${cardInfo.series} - Card ${cardInfo.card}`);
          
          // Supply
          if (cardInfo.supply) {
            details.push(`💎 Supply: ${cardInfo.supply.toLocaleString()}`);
          }
          
          // Author with link
          if (cardInfo.artist) {
            const artistLink = cardInfo.artistSlug 
              ? `https://pepe.wtf/artists/${cardInfo.artistSlug}`
              : null;
            
            const artistText = artistLink
              ? `👨‍🎨 ${cardInfo.artist} (${artistLink})`
              : `👨‍🎨 ${cardInfo.artist}`;
            
            details.push(artistText);
          }
          
          // Released date
          if (cardInfo.issuance) {
            details.push(`📅 Released: ${cardInfo.issuance}`);
          }
          
          // Append details after URL
          if (details.length > 0) {
            cardDetailsText = actualUrl + '\n\n' + details.join('\n');
          }
        }
        
        // Call callback to send response (non-blocking, per telegram plugin examples)
        if (callback) {
          callback({
            text: cardDetailsText,
          }).catch((err) => console.error('Error sending Telegram callback:', err));
        }
        
        // Return success result for action tracking
        return {
          success: true,
          text: `Displayed ${assetName} card with metadata`,
          data: {
            assetName,
            url: actualUrl,
            extension,
            cardFound: true,
            cardInfo
          }
        };
      } else {
        // Card not found - return info for Bootstrap to generate helpful response
        return { 
          success: false, 
          text: `Card ${assetName} not found in Fake Rares collection. Suggest checking the exact asset name or visiting pepe.wtf directory.`,
          data: { 
            assetName,
            cardFound: false,
            suggestion: 'Check asset name spelling or ask for help finding cards'
          }
        };
      }
    } catch (error) {
      console.error('Error in SHOW_FAKE_RARE_CARD action:', error);
      
      return { 
        success: false, 
        text: `Error fetching card ${assetName}: ${error instanceof Error ? error.message : String(error)}`,
        data: { 
          error: error instanceof Error ? error.message : String(error),
          assetName
        }
      };
    }
  },
};


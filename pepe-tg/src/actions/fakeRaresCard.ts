import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType } from '@elizaos/core';
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
 * Fetch lore snippets from knowledge base using runtime.searchMemories
 * Same approach as shareLore.ts (confirmed working on master)
 */
async function fetchLoreSnippets(runtime: IAgentRuntime, message: Memory, assetName: string): Promise<string[]> {
  try {
    console.log(`🔍 Searching for lore about ${assetName}...`);
    
    // Generate embedding for the search query (same approach as knowledge plugin)
    const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
      text: assetName,
    });
    
    if (!embedding || !Array.isArray(embedding)) {
      console.log(`⚠️  Failed to generate embedding for "${assetName}"`);
      return [];
    }
    
    console.log(`✅ Generated embedding (dimension: ${embedding.length})`);
    
    // Try without roomId restriction first (knowledge is often global)
    const searchPromise = runtime.searchMemories({
      tableName: 'knowledge',
      embedding,  // Pass the pre-generated embedding
      query: assetName,
      count: 10,
      match_threshold: 0.25,  // Higher threshold for more precise matches
    });
    
    const timeoutPromise = new Promise<any>((_, reject) => 
      setTimeout(() => reject(new Error('Lore search timeout')), 5000)
    );
    
    const results = await Promise.race([searchPromise, timeoutPromise]);
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.log(`ℹ️  No lore found for ${assetName}`);
      
      // Check if knowledge table has any entries at all
      try {
        const allKnowledge = await runtime.messageManager.getMemories({
          tableName: 'knowledge',
          count: 1,
        });
        console.log(`📊 Knowledge table has ${allKnowledge?.length || 0} total entries`);
      } catch (e) {
        console.log(`⚠️  Could not check knowledge table:`, e instanceof Error ? e.message : String(e));
      }
      
      return [];
    }
    
    console.log(`📚 Found ${results.length} lore entries for ${assetName}`);
    
    // Extract raw lore text
    const loreCandidates = results
      .map((r: any) => r?.content?.text || '')
      .filter((t: string) => t.length > 0);
    
    if (loreCandidates.length === 0) {
      return [];
    }
    
    // Pick random lore snippet and prettify it with LLM
    const rawLore = pickRandom(loreCandidates);
    if (!rawLore) {
      return [];
    }
    
    // LLM prettification - DISABLED for now
    // TODO: Re-enable once LLM hanging issue is resolved
    /*
    console.log(`🎨 Prettifying lore snippet (${rawLore.length} chars)...`);
    
    try {
      // Truncate raw lore if too long (to avoid huge prompts)
      const truncatedLore = rawLore.length > 500 ? rawLore.slice(0, 500) + '...' : rawLore;
      
      const prompt = `You are PEPEDAWN, the legendary Fake Rares OG. Transform this raw knowledge snippet into a fun, engaging fact about ${assetName}. Keep it 2-3 sentences max, casual but accurate.

Raw info:
${truncatedLore}

Engaging tidbit about ${assetName}:`;

      const llmPromise = runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        runtime,
      });
      
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), 3000)
      );
      
      const prettifiedLore = await Promise.race([llmPromise, timeoutPromise]);
      
      if (prettifiedLore && typeof prettifiedLore === 'string') {
        const cleanLore = prettifiedLore.trim();
        console.log(`✨ Lore prettified successfully (${cleanLore.length} chars)`);
        return [cleanLore];
      }
    } catch (e) {
      console.log(`⚠️  LLM prettification failed, using raw lore:`, e instanceof Error ? e.message : String(e));
      // Fallback to raw lore if LLM fails
      return [rawLore.slice(0, 250)];
    }
    */
    
    // Return raw lore for now
    return [rawLore.slice(0, 250)];
  } catch (err) {
    console.error(`❌ Lore search failed for ${assetName}:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

function pickRandom<T>(items: T[]): T | null {
  if (!items || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
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
        
        // Lore fetching - DISABLED for now
        // TODO: Re-enable once ready
        /*
        const loreCandidates = await fetchLoreSnippets(runtime, message, assetName);
        const selectedLore = pickRandom(loreCandidates);
        const lore = selectedLore ? truncate(selectedLore, 250) : null;
        
        if (lore) {
          console.log(`📚 Lore selected (${lore.length} chars)`);
        }
        */
        const lore = null; // Disabled
        
        // Build rich card info message
        let cardDetailsText = actualUrl; // Start with media URL
        
        if (cardInfo) {
          const details: string[] = [];
          
          // Series - Card & Supply on same line
          let seriesLine = `🎴 Series ${cardInfo.series} - Card ${cardInfo.card}`;
          if (cardInfo.supply) {
            seriesLine += ` • 💎 Supply: ${cardInfo.supply.toLocaleString()}`;
          }
          details.push(seriesLine);
          
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
        
        // Append lore if available
        if (lore) {
          cardDetailsText += '\n\n📜 ' + lore;
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


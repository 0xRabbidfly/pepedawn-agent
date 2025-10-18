import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType } from '@elizaos/core';
import { getCardSeries, addCardToMap, isKnownCard, SERIES_INFO, getCardExtension } from '../data/cardSeriesMap';
import { getCardInfo, type CardInfo, FULL_CARD_INDEX } from '../data/fullCardIndex';

/**
 * Fake Rares Card Display Action
 * Responds to /f <ASSET> commands by fetching and displaying card images
 * Also supports /f (no asset) to display a random card from the collection
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{ASSET}.{jpg|gif}
 * Series 0-18 (19 series total, 50 cards each = ~950 total cards)
 * 
 * Performance optimization:
 * - Known cards: ~200ms (direct lookup, 1-3 HTTP requests)
 * - Unknown cards: ~2-10s (search series 0-18, auto-cache result)
 * - Random cards: instant (picks from full card index)
 * 
 * Note: Patched @elizaos/plugin-telegram to handle button sanitization
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
  console.log(`  🔍 [Lore] Starting knowledge search for: ${assetName}`);
  
  try {
    console.log(`  📡 [Lore] Generating embedding...`);
    // Generate embedding for the search query (same approach as knowledge plugin)
    const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
      text: assetName,
    });
    
    if (!embedding || !Array.isArray(embedding)) {
      console.log(`  ❌ [Lore] Failed to generate embedding`);
      return [];
    }
    
    console.log(`  ✅ [Lore] Embedding generated (dimension: ${embedding.length})`);
    
    console.log(`  🔎 [Lore] Searching knowledge table (threshold: 0.25, count: 10)...`);
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
      console.log(`  ℹ️  [Lore] No results found in knowledge base`);
      return [];
    }
    
    console.log(`  📚 [Lore] Found ${results.length} matching entries`);
    
    console.log(`  🎲 [Lore] Extracting text content...`);
    // Extract raw lore text
    const loreCandidates = results
      .map((r: any) => r?.content?.text || '')
      .filter((t: string) => t.length > 0);
    
    if (loreCandidates.length === 0) {
      console.log(`  ⚠️  [Lore] No valid text in results`);
      return [];
    }
    
    console.log(`  ✅ [Lore] Extracted ${loreCandidates.length} lore candidate(s)`);
    
    // Pick random lore snippet and prettify it with LLM
    const rawLore = pickRandom(loreCandidates);
    if (!rawLore) {
      console.log(`  ⚠️  [Lore] Random selection returned null`);
      return [];
    }
    
    console.log(`  🎯 [Lore] Selected random snippet (${rawLore.length} chars)`);
    
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
    const truncatedLore = rawLore.slice(0, 250);
    console.log(`  ✂️  [Lore] Truncated to ${truncatedLore.length} chars`);
    console.log(`  ✅ [Lore] Returning 1 lore snippet\n`);
    return [truncatedLore];
  } catch (err) {
    console.log(`  ❌ [Lore] Exception occurred`);
    console.error(`  Error:`, err instanceof Error ? err.message : String(err));
    console.log('');
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
  description: 'Display a Fake Rares card image when user requests with /f <ASSET> or a random card with /f',
  
  similes: ['/f'],
  
  examples: [],  // Empty examples - action handles everything via callback
  
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase().trim() || '';
    
    // Check if message is /f (random card) or /f <ASSET> (specific card)
    // Strict matching to prevent Bootstrap from also responding
    return text.match(/^\/f(\s+[a-z0-9]+)?$/i) !== null;
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 [/f] HANDLER STARTED`);
    console.log(`📝 Message: "${message.content.text}"`);
    console.log(`👤 User: ${message.entityId}`);
    console.log(`${'='.repeat(60)}\n`);
    
    let assetName = 'UNKNOWN'; // Declare outside try block for error handling
    let isRandomCard = false; // Track if this is a random card request
    
    try {
      const text = message.content.text || '';
      
      console.log(`🔧 STEP 1: Parse command`);
      // Extract asset name from /f <ASSET> or detect /f (random)
      const match = text.match(/^\/f\s+([a-z0-9]+)/i);
      
      if (!match) {
        // No asset name provided - select random card
        if (FULL_CARD_INDEX.length === 0) {
          console.log(`❌ Cannot select random card: index is empty`);
          if (callback) {
            await callback({
              text: '❌ Card index not loaded. Please try again later.',
            });
          }
          return { success: false, text: 'Card index not available' };
        }
        
        const randomCard = FULL_CARD_INDEX[Math.floor(Math.random() * FULL_CARD_INDEX.length)];
        assetName = randomCard.asset;
        isRandomCard = true;
        console.log(`🎲 Random card selected: ${assetName} (from ${FULL_CARD_INDEX.length} cards)\n`);
      } else {
        assetName = match[1].toUpperCase();
        console.log(`✅ Extracted asset: ${assetName}\n`);
      }
      
      console.log(`🔧 STEP 2: Lookup card metadata`);
      // Get card info from fullCardIndex (already loads from fake-rares-data.json)
      const cardInfo = getCardInfo(assetName);
      let actualUrl: string | null = null;
      let extension: string | null = null;
      
      if (cardInfo) {
        console.log(`✅ Found in fullCardIndex: Series ${cardInfo.series}, Card ${cardInfo.card}`);
        console.log(`   📊 Artist: ${cardInfo.artist || 'unknown'}`);
        console.log(`   💎 Supply: ${cardInfo.supply?.toLocaleString() || 'unknown'}`);
        console.log(`   🎨 Extension: .${cardInfo.ext}`);
        
        console.log(`\n🔧 STEP 3: Determine image/video URL`);
        // Check for special URIs (videoUri for mp4, imageUri for others)
        if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
          actualUrl = cardInfo.videoUri;
          extension = 'mp4';
          console.log(`   🎬 Using videoUri: ${actualUrl.substring(0, 60)}...`);
        } else if (cardInfo.imageUri) {
          actualUrl = cardInfo.imageUri;
          extension = cardInfo.ext;
          console.log(`   🖼️  Using imageUri: ${actualUrl.substring(0, 60)}...`);
        } else {
          // Construct URL from series and ext
          actualUrl = getFakeRaresImageUrl(assetName, cardInfo.series, cardInfo.ext);
          extension = cardInfo.ext;
          console.log(`   🏗️  Constructed from series/ext: ${actualUrl.substring(0, 60)}...`);
        }
      } else {
        console.log(`⚠️  Not in fullCardIndex, trying HTTP probing fallback...`);
        
        console.log(`\n🔧 STEP 3: Fallback - HTTP probing`);
        const cardResult = await findCardImage(assetName);
        if (cardResult) {
          actualUrl = cardResult.url;
          extension = cardResult.extension;
          console.log(`✅ Probing found: ${actualUrl.substring(0, 60)}...`);
        } else {
          console.log(`❌ Probing failed - card not found anywhere`);
        }
      }
      console.log('');
      
      if (actualUrl) {
        console.log(`🔧 STEP 4: Fetch lore from knowledge base`);
        
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
        console.log(`⏭️  Lore fetching currently disabled\n`);
        
        console.log(`🔧 STEP 5: Compose message with metadata`);
        // Build message: metadata first, URL at bottom (preview appears at bottom)
        let cardDetailsText = '';
        
        // 1. Random indicator OR card name + Series/Card
        if (isRandomCard) {
          cardDetailsText = `🎲 ${assetName} 🐸 Series ${cardInfo?.series || '?'} - Card ${cardInfo?.card || '?'}\n`;
          console.log(`   🎲 Added random card header`);
        } else {
          cardDetailsText = `${assetName} 🐸 Series ${cardInfo?.series || '?'} - Card ${cardInfo?.card || '?'}\n`;
          console.log(`   📛 Added card name header`);
        }
        
        // 2. Supply + Issuance (on same line)
        if (cardInfo) {
          let metaLine = '';
          if (cardInfo.supply) {
            metaLine = `💎 Supply: ${cardInfo.supply.toLocaleString()}`;
          }
          if (cardInfo.issuance) {
            metaLine += metaLine ? ` • 📅 ${cardInfo.issuance}` : `📅 ${cardInfo.issuance}`;
          }
          if (metaLine) {
            cardDetailsText += metaLine + '\n\n';
            console.log(`   📊 Added supply/date metadata`);
          }
        } else {
          console.log(`   ⚠️  No metadata available`);
        }
        
        // 3. URL at the very bottom (Telegram shows preview here)
        cardDetailsText += actualUrl;
        console.log(`   📎 Added media URL at bottom`);
        
        // Append lore if available
        if (lore) {
          cardDetailsText += '\n\n📜 ' + lore;
          console.log(`   📜 Added lore snippet`);
        }
        console.log('');
        
        // Return explicit card context for Bootstrap FIRST
        // This ensures Bootstrap knows which card to discuss before generating response
        const actionResult = isRandomCard
          ? `Random card selected: ${assetName}. Share lore about ${assetName}.`
          : `Showing card: ${assetName}. Share lore about ${assetName}.`;
        
        console.log(`🔧 STEP 6: Return card context to Bootstrap`);
        console.log(`   📤 Context: ${actionResult}`);
        
        // Build buttons array: just artist link (media preview shows automatically)
        const buttons = [];
        
        // Artist button (if available)
        if (cardInfo?.artist && cardInfo?.artistSlug) {
          buttons.push({ 
            text: `👨‍🎨 ${cardInfo.artist}`, 
            url: `https://pepe.wtf/artists/${cardInfo.artistSlug}` 
          });
          console.log(`   🔗 Added artist button: "${cardInfo.artist}"`);
        } else if (cardInfo?.artist) {
          console.log(`   ⚠️  Artist "${cardInfo.artist}" has no artistSlug - no button created`);
        }
        
        // THEN send message with link preview + artist button
        // Telegram auto-shows media preview when URL is in message
        if (callback) {
          callback({
            text: cardDetailsText,
            buttons: buttons.length > 0 ? buttons : undefined,
            // Enable link preview so Telegram shows media inline
          }).catch((err) => console.error('❌ Error sending callback:', err));
          console.log(`   ✅ Callback queued: message with media preview + ${buttons.length} button(s)\n`);
        }
        
        console.log(`✅ SUCCESS: ${assetName} card will be displayed`);
        console.log(`${'='.repeat(60)}\n`);
        
        return {
          success: true,
          text: actionResult,  // Bootstrap sees which card to discuss
        };
      } else {
        console.log(`❌ FAILURE: Card ${assetName} not found anywhere`);
        console.log(`${'='.repeat(60)}\n`);
        
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
      console.log(`\n❌ EXCEPTION in /f handler for ${assetName}`);
      console.error('Error details:', error);
      console.log(`${'='.repeat(60)}\n`);
      
      // Error occurred - let Bootstrap generate error response
      return { 
        success: false, 
        text: `Error fetching card ${assetName}`,
        data: { 
          error: error instanceof Error ? error.message : String(error),
          assetName
        }
      };
    }
  },
};


import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, ModelType } from '@elizaos/core';
import { getCardSeries, addCardToMap, isKnownCard, SERIES_INFO, getCardExtension } from '../data/cardSeriesMap';
import { getCardInfo, type CardInfo, FULL_CARD_INDEX } from '../data/fullCardIndex';

/**
 * Fake Rares Card Display Action
 * Responds to /f <ASSET> commands by fetching and displaying card images
 * Also supports /f (no asset) to display a random card from the collection
 * 
 * URL Structure: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{SERIES}/{ASSET}.{jpg|gif|mp4|png}
 * Series 0-18 (19 series total, 50 cards each = ~950 total cards)
 * 
 * Performance optimization:
 * - Known cards: ~200ms (direct lookup, 1-3 HTTP requests)
 * - Unknown cards: ~2-10s (search series 0-18, auto-cache result)
 * - Random cards: instant (picks from full card index)
 * 
 * Note: Using /full/ for higher quality media (Telegram handles compression automatically)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

// Base URL for Fake Rares card images (using /full/ for higher quality)
const FAKE_RARES_BASE_URL = 'https://pepewtf.s3.amazonaws.com/collections/fake-rares/full';

// Fuzzy matching thresholds and configuration
const FUZZY_MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.75,  // ≥75% similarity: Auto-show the matched card
  MODERATE: 0.5,          // 50-74% similarity: Show suggestions
  TOP_SUGGESTIONS: 3,     // Number of suggestions to show for moderate matches
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type MediaExtension = 'jpg' | 'jpeg' | 'gif' | 'png' | 'mp4' | 'webp';

interface CardUrlResult {
  url: string;
  extension: MediaExtension;
}

interface FuzzyMatch {
  name: string;
  similarity: number;
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of edits (insertions, deletions, substitutions) needed
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0-1 range)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toUpperCase(), str2.toUpperCase());
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

/**
 * Find top N matching card names from all available cards
 */
function findTopMatches(inputName: string, allAssets: string[], topN: number = FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS): FuzzyMatch[] {
  if (allAssets.length === 0) return [];

  const matches: FuzzyMatch[] = allAssets.map(asset => ({
    name: asset,
    similarity: calculateSimilarity(inputName, asset)
  }));

  // Sort by similarity (descending) and take top N
  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

/**
 * Format URL for Telegram MarkdownV2
 * WORKAROUND: Plugin's escapeUrl() doesn't escape underscores, causing them to be stripped
 * Solution: Percent-encode underscores as %5F (RFC 3986 compliant)
 * This preserves functionality while ensuring Telegram shows the preview
 */
function formatTelegramUrl(url: string): string {
  // Replace underscores with %5F - ugly but works and shows preview
  return url.replace(/_/g, '%5F');
}

/**
 * Constructs the image URL for a Fake Rares card
 */
function getFakeRaresImageUrl(assetName: string, seriesNumber: number, extension: MediaExtension): string {
  return `${FAKE_RARES_BASE_URL}/${seriesNumber}/${assetName.toUpperCase()}.${extension}`;
}

/**
 * Determines the card URL from CardInfo, prioritizing special URIs over constructed URLs
 */
function determineCardUrl(cardInfo: CardInfo, assetName: string): CardUrlResult {
  // Check for special URIs (videoUri for mp4, imageUri for others)
  if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
    return { url: cardInfo.videoUri, extension: 'mp4' };
  }
  
  if (cardInfo.imageUri) {
    return { url: cardInfo.imageUri, extension: cardInfo.ext as MediaExtension };
  }
  
  // Construct URL from series and ext
  return {
    url: getFakeRaresImageUrl(assetName, cardInfo.series, cardInfo.ext as MediaExtension),
    extension: cardInfo.ext as MediaExtension
  };
}

/**
 * Attempts to find the card image by trying different series numbers (0-18)
 * Uses full card index for instant lookups when available
 */
async function findCardImage(assetName: string): Promise<CardUrlResult | null> {
  const upperAsset = assetName.toUpperCase();
  const t0 = Date.now();
  
  // Check full card index first (SUPER FAST - no HTTP requests!)
  const cardInfo = getCardInfo(upperAsset);
  if (cardInfo) {
    const url = getFakeRaresImageUrl(upperAsset, cardInfo.series, cardInfo.ext as MediaExtension);
    console.log(`⚡ INSTANT: ${upperAsset} series=${cardInfo.series} ext=.${cardInfo.ext} (${Date.now() - t0}ms)`);
    return { url, extension: cardInfo.ext as MediaExtension };
  }
  
  // Try known mapping from runtime cache (fast path with probing)
  const knownSeries = getCardSeries(upperAsset);
  if (knownSeries !== undefined) {
    console.log(`🧭 Fast path: ${upperAsset} series=${knownSeries} (trying extensions...)`);
    // Try all extensions for the known series
    const extensions: MediaExtension[] = ['jpg', 'jpeg', 'gif', 'png'];
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, knownSeries, ext);
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
  
  const extensions: MediaExtension[] = ['jpg', 'jpeg', 'gif', 'png'];
  for (let series = 0; series < SERIES_INFO.TOTAL_SERIES; series++) {
    // Try all extensions
    for (const ext of extensions) {
      const testUrl = getFakeRaresImageUrl(upperAsset, series, ext);
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
    const raw = message.content.text || '';
    const text = raw.trim();
    // Accept: "/f", "/f ASSET", "/f@bot ASSET", and leading mentions like "@bot /f ASSET"
    const fPattern = /^(?:@[A-Za-z0-9_]+\s+)?\/f(?:@[A-Za-z0-9_]+)?(?:\s+[A-Za-z0-9_-]+)?$/i;
    const matches = fPattern.test(text);
    console.log(`🔍 [/f validation] Message: "${text}" → ${matches ? '✅ MATCH' : '❌ NO MATCH'}`);
    return matches;
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
      const text = (message.content.text || '').trim();
      
      console.log(`🔧 STEP 1: Parse command`);
      // Extract asset name from /f <ASSET> or detect /f (random)
      // Support optional @bot mention attached to /f and optional asset token
      const match = text.match(/^\/?f(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]+))?/i);
      
      if (!match || !match[1]) {
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
      let cardUrlResult: CardUrlResult | null = null;
      
      if (cardInfo) {
        console.log(`✅ Found in fullCardIndex: Series ${cardInfo.series}, Card ${cardInfo.card}`);
        console.log(`   📊 Artist: ${cardInfo.artist || 'unknown'}`);
        console.log(`   💎 Supply: ${cardInfo.supply?.toLocaleString() || 'unknown'}`);
        console.log(`   🎨 Extension: .${cardInfo.ext}`);
        
        console.log(`\n🔧 STEP 3: Determine image/video URL`);
        cardUrlResult = determineCardUrl(cardInfo, assetName);
        
        if (cardInfo.ext === 'mp4' && cardInfo.videoUri) {
          console.log(`   🎬 Using videoUri: ${cardUrlResult.url.substring(0, 60)}...`);
        } else if (cardInfo.imageUri) {
          console.log(`   🖼️  Using imageUri: ${cardUrlResult.url.substring(0, 60)}...`);
        } else {
          console.log(`   🏗️  Constructed from series/ext: ${cardUrlResult.url.substring(0, 60)}...`);
        }
      } else {
        console.log(`⚠️  Not in fullCardIndex, trying HTTP probing fallback...`);
        
        console.log(`\n🔧 STEP 3: Fallback - HTTP probing`);
        cardUrlResult = await findCardImage(assetName);
        if (cardUrlResult) {
          console.log(`✅ Probing found: ${cardUrlResult.url.substring(0, 60)}...`);
        } else {
          console.log(`❌ Probing failed - card not found anywhere`);
        }
      }
      console.log('');
      
      if (cardUrlResult) {
        console.log(`🔧 STEP 4: Compose message with metadata`);
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
        // Percent-encode underscores as %5F to bypass MarkdownV2 parsing issues
        cardDetailsText += formatTelegramUrl(cardUrlResult.url);
        console.log(`   📎 Added media URL (underscores percent-encoded as %5F)`);
        console.log('');
        
        // This action is callback-only. Do not return a prompt for any other handler.
        // Instead, use a suppression flag to indicate downstream handlers should no-op.
        console.log(`🔧 STEP 5: Send message with media preview and artist button`);
        
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
            __fromAction: 'fakeRaresCard',
            suppressBootstrap: true,
          }).catch((err) => console.error('❌ Error sending callback:', err));
          console.log(`   ✅ Callback queued: message with media preview + ${buttons.length} button(s)\n`);
        }
        
        console.log(`✅ SUCCESS: ${assetName} card will be displayed`);
        console.log(`${'='.repeat(60)}\n`);
        
        return {
          success: true,
          data: {
            suppressBootstrap: true,
            reason: 'handled_by_fakeRaresCard',
            assetName,
            isRandomCard,
          },
        };
      } else {
        console.log(`❌ FAILURE: Card ${assetName} not found anywhere`);
        console.log(`🔧 Attempting fuzzy match...`);
        
        // Try fuzzy matching against all known cards
        // Performance: Calculate top matches once (O(n log n)) and reuse for all tiers
        const allAssets = FULL_CARD_INDEX.map(c => c.asset);
        const topMatches = findTopMatches(assetName, allAssets);
        const bestMatch = topMatches.length > 0 ? topMatches[0] : null;
        
        if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
          // HIGH CONFIDENCE MATCH (≥75%) - Auto-show the card
          console.log(`✅ Fuzzy match found: "${bestMatch.name}" (${(bestMatch.similarity * 100).toFixed(1)}% similar)`);
          console.log(`🔧 Fetching matched card...`);
          
          // Get the matched card info
          const matchedCard = getCardInfo(bestMatch.name);
          if (matchedCard) {
            // Determine the URL for the matched card
            const matchedUrlResult = determineCardUrl(matchedCard, bestMatch.name);
            
            // Build card details with playful typo message
            let matchedCardText = `😅 Ha, spelling not your thing? No worries - got you fam.\n\n`;
            matchedCardText += `🎴 ${bestMatch.name}\n`;
            matchedCardText += `📦 Series ${matchedCard.series}`;
            if (matchedCard.artist) {
              matchedCardText += ` • 👨‍🎨 ${matchedCard.artist}`;
            }
            if (matchedCard.supply) {
              matchedCardText += ` • 💎 ${matchedCard.supply.toLocaleString()}`;
            }
            matchedCardText += '\n\n';
            // Format as inline link for Telegram MarkdownV2
            matchedCardText += formatTelegramUrl(matchedUrlResult.url);
            
            // Build buttons
            const buttons = [];
            if (matchedCard.artist && matchedCard.artistSlug) {
              buttons.push({
                text: `👨‍🎨 ${matchedCard.artist}`,
                url: `https://pepe.wtf/artists/${matchedCard.artistSlug}`
              });
            }
            
            // Send the matched card
            if (callback) {
              await callback({
                text: matchedCardText,
                buttons: buttons.length > 0 ? buttons : undefined,
                __fromAction: 'fakeRaresCard',
                suppressBootstrap: true,
              });
            }
            
            console.log(`✅ SUCCESS: Fuzzy-matched card ${bestMatch.name} displayed for typo "${assetName}"`);
            console.log(`${'='.repeat(60)}\n`);
            
            return {
              success: true,
              data: {
                suppressBootstrap: true,
                reason: 'fuzzy_matched',
                assetName,
                matchedAssetName: bestMatch.name,
                similarity: bestMatch.similarity,
              },
            };
          }
        } else if (bestMatch && bestMatch.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE) {
          // MODERATE MATCH (50-74%) - Suggest alternatives
          console.log(`🤔 Moderate fuzzy match: "${bestMatch.name}" (${(bestMatch.similarity * 100).toFixed(1)}% similar)`);
          console.log(`🔧 Using pre-calculated top ${FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS} suggestions...`);
          
          // topMatches already calculated above - reuse it!
          const suggestions = topMatches
            .filter(m => m.similarity >= FUZZY_MATCH_THRESHOLDS.MODERATE)  // Only show suggestions ≥50%
            .map(m => `• ${m.name}`)
            .join('\n');
          
          console.log(`📋 Suggestions:\n${suggestions}`);
          console.log(`${'='.repeat(60)}\n`);
          
          let errorText = `❌ Could not find "${assetName}" in the Fake Rares collection.\n\n`;
          if (suggestions) {
            errorText += `🤔 Did you mean:\n${suggestions}\n\n`;
            errorText += `Try /f <CARD_NAME> with one of the above.`;
          } else {
            errorText += `Double-check the asset name or browse on pepe.wtf.`;
          }
          
          if (callback) {
            await callback({
              text: errorText,
              __fromAction: 'fakeRaresCard',
              suppressBootstrap: true,
            });
          }
          
          return {
            success: false,
            data: {
              suppressBootstrap: true,
              reason: 'card_not_found_with_suggestions',
              assetName,
              suggestions: topMatches.map(m => m.name),
            },
          };
        } else {
          // LOW MATCH (<50%) - Just show error
          const similarityPercent = bestMatch ? (bestMatch.similarity * 100).toFixed(1) : '0.0';
          const thresholdPercent = (FUZZY_MATCH_THRESHOLDS.MODERATE * 100).toFixed(0);
          console.log(`❌ No good fuzzy match found (best: "${bestMatch?.name}" at ${similarityPercent}% - below ${thresholdPercent}% threshold)`);
          console.log(`${'='.repeat(60)}\n`);
          
          if (callback) {
            await callback({
              text: `❌ Could not find "${assetName}" in the Fake Rares collection. Double-check the asset name or browse on pepe.wtf.`,
              __fromAction: 'fakeRaresCard',
              suppressBootstrap: true,
            });
          }
          
          return {
            success: false,
            data: {
              suppressBootstrap: true,
              reason: 'card_not_found',
              assetName,
              cardFound: false,
            },
          };
        }
      }
    } catch (error) {
      console.log(`\n❌ EXCEPTION in /f handler for ${assetName}`);
      console.error('Error details:', error);
      console.log(`${'='.repeat(60)}\n`);
      
      // Error occurred - respond via callback and suppress bootstrap
      if (callback) {
        await callback({
          text: `❌ Error while fetching ${assetName}. Please try again later.`,
          __fromAction: 'fakeRaresCard',
          suppressBootstrap: true,
        });
      }
      return {
        success: false,
        data: {
          suppressBootstrap: true,
          reason: 'exception',
          error: error instanceof Error ? error.message : String(error),
          assetName,
        },
      };
    }
  },
};


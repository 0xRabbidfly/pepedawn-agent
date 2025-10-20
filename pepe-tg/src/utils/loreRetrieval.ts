/**
 * LLM-LORE Retrieval Utilities
 * Vector search with MMR diversification and fallback expansion
 */

import type { IAgentRuntime, Memory } from '@elizaos/core';
import { LORE_CONFIG } from './loreConfig';

export interface RetrievedPassage {
  id: string;
  text: string;
  score: number;
  sourceType: 'telegram' | 'wiki' | 'unknown';
  sourceRef: string;
  timestamp?: number;
  author?: string;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * MMR (Maximal Marginal Relevance) selection for diversity
 * Balances relevance and diversity in result set
 */
export function selectDiversePassages(
  passages: RetrievedPassage[],
  targetCount: number,
  lambda: number = 0.7 // Balance: 1.0 = all relevance, 0.0 = all diversity
): RetrievedPassage[] {
  if (passages.length <= targetCount) return passages;
  
  const selected: RetrievedPassage[] = [];
  const remaining = [...passages];
  
  // Start with highest scoring passage
  const first = remaining.shift()!;
  selected.push(first);
  
  // Iteratively select passages that maximize MMR score
  while (selected.length < targetCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      
      // Relevance component (normalized score)
      const relevance = candidate.score;
      
      // Diversity component (min similarity to selected passages)
      const similarities = selected.map(s => {
        // Simple text overlap as proxy for similarity
        const overlap = candidate.text.split(/\s+/).filter(w => 
          s.text.toLowerCase().includes(w.toLowerCase())
        ).length;
        return overlap / Math.max(candidate.text.split(/\s+/).length, 1);
      });
      const maxSimilarity = Math.max(...similarities, 0);
      const diversity = 1 - maxSimilarity;
      
      // MMR score
      const mmrScore = lambda * relevance + (1 - lambda) * diversity;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }
  
  return selected;
}

/**
 * Perform knowledge search with automatic fallback expansion
 */
export async function searchKnowledgeWithExpansion(
  runtime: IAgentRuntime,
  query: string,
  roomId: string
): Promise<RetrievedPassage[]> {
  const knowledgeService = (runtime as any).getService
    ? (runtime as any).getService('knowledge')
    : null;
  
  let results: any[] = [];
  
  // Initial search - GLOBAL scope to search across all content (wiki + all telegram chats)
  if (knowledgeService?.getKnowledge) {
    const pseudoMessage = { id: 'query', content: { text: query } };
    // Use undefined/null roomId for global search across all rooms
    const scope = { roomId: undefined } as any;
    
    try {
      const searchPromise = knowledgeService.getKnowledge(pseudoMessage, scope);
      const timeoutPromise: Promise<never> = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Search timeout')), LORE_CONFIG.SEARCH_TIMEOUT_MS);
      });
      
      results = await Promise.race([searchPromise, timeoutPromise]) || [];
    } catch (err) {
      console.error('Knowledge search error:', err);
      results = [];
    }
  } else {
    // Fallback to direct memory search - also global
    try {
      const embedding = await runtime.useModel('TEXT_EMBEDDING' as any, { text: query });
      results = await runtime.searchMemories({
        tableName: 'knowledge',
        roomId: undefined, // Global search
        embedding,
        query,
        count: LORE_CONFIG.RETRIEVAL_LIMIT,
        match_threshold: LORE_CONFIG.MATCH_THRESHOLD,
      } as any) || [];
    } catch (err) {
      console.error('Memory search error:', err);
      results = [];
    }
  }
  
  // Check if we need expansion
  if (results.length < LORE_CONFIG.MIN_HITS) {
    if (!knowledgeService && results.length < LORE_CONFIG.MIN_HITS) {
      try {
        const embedding = await runtime.useModel('TEXT_EMBEDDING' as any, { text: query });
        const expandedResults = await runtime.searchMemories({
          tableName: 'knowledge',
          roomId: undefined, // Still global
          embedding,
          query,
          count: LORE_CONFIG.RETRIEVAL_LIMIT * 2,
          match_threshold: LORE_CONFIG.MATCH_THRESHOLD * 0.7, // Relaxed
        } as any) || [];
        
        results = expandedResults;
      } catch (err) {
        console.error('Expansion search error:', err);
      }
    }
  }
  
  // Convert to RetrievedPassage format
  const passages: RetrievedPassage[] = results.map((r: any, idx: number) => {
    const text = (r.content?.text || r.text || '').trim();
    const id = (r.id || r.content?.id || `result-${idx}`) as string;
    const score = r.similarity || r.score || 1.0;
    
    // Infer source type from metadata if available
    let sourceType: 'telegram' | 'wiki' | 'unknown' = 'unknown';
    let sourceRef = id;
    let timestamp: number | undefined = undefined;
    let author: string | undefined = undefined;
    
    // Extract timestamp
    const createdAtValue = r.createdAt || r.content?.createdAt || r.metadata?.timestamp || r.content?.metadata?.timestamp || r.metadata?.date || r.content?.metadata?.date;
    if (createdAtValue) {
      if (createdAtValue instanceof Date) {
        timestamp = createdAtValue.getTime();
      } else if (typeof createdAtValue === 'string') {
        // Support ISO strings like "2022-02-21T21:07:09"
        const parsed = Date.parse(createdAtValue);
        if (!Number.isNaN(parsed)) {
          timestamp = parsed;
        }
      } else if (typeof createdAtValue === 'number') {
        timestamp = createdAtValue;
      }
    }

    // Extract author/poster (common telegram fields)
    author = r.metadata?.author || r.content?.metadata?.author ||
             r.metadata?.username || r.content?.metadata?.username ||
             r.metadata?.from || r.content?.metadata?.from ||
             r.userId || r.content?.userId ||
             r.metadata?.from_id || r.content?.metadata?.from_id;

    // Detect source type based on metadata
    const metadataSource = r.metadata?.source || r.content?.metadata?.source;

    // Stronger telegram detection
    const hasTelegramMarkers =
      !!(r.metadata?.messageId || r.content?.metadata?.messageId ||
         r.metadata?.chatId || r.content?.metadata?.chatId ||
         r.metadata?.from || r.content?.metadata?.from ||
         r.metadata?.from_id || r.content?.metadata?.from_id);

    // Content-based telegram detection for fragments containing exported chat lines
    // e.g.  { "from": "Name", "from_id": "user...", "text": "...", "date": "2022-..." }
    const fromMatch = text.match(/"from"\s*:\s*"([^"]+)"/);
    const fromIdMatch = text.match(/"from_id"\s*:\s*"([^"]+)"/);
    const dateMatch = text.match(/"date"\s*:\s*"([0-9T:\-]+)"/);
    const contentLooksTelegram = !!(fromMatch || fromIdMatch || dateMatch);

    if (metadataSource === 'telegram' || hasTelegramMarkers || contentLooksTelegram) {
      sourceType = 'telegram';
      sourceRef = r.metadata?.messageId || r.content?.metadata?.messageId || id;
      // Populate author/timestamp from content if missing
      if (!author && fromMatch) {
        author = fromMatch[1];
      }
      if (!author && fromIdMatch) {
        author = fromIdMatch[1];
      }
      if (!timestamp && dateMatch) {
        const parsed = Date.parse(dateMatch[1]);
        if (!Number.isNaN(parsed)) timestamp = parsed;
      }
    } else if (metadataSource === 'wiki' || metadataSource === 'rag-service-fragment-sync') {
      // rag-service-fragment-sync = wiki fragments
      sourceType = 'wiki';
      sourceRef = r.metadata?.documentId || r.content?.metadata?.documentId ||
                  r.metadata?.pageSlug || r.content?.metadata?.pageSlug || id;
    } else if (timestamp && author) {
      // Heuristic: If has timestamp AND author, likely telegram
      sourceType = 'telegram';
    } else if (r.metadata?.type === 'fragment') {
      // Fragments without explicit source are likely wiki
      sourceType = 'wiki';
      sourceRef = r.metadata?.documentId || id;
    } else if (timestamp && !author) {
      // Has timestamp but no author - could be wiki or telegram
      sourceType = text.length > 200 ? 'wiki' : 'telegram';
    }
    
    // Optional debug logging (controlled by LORE_DEBUG env var)
    if (process.env.LORE_DEBUG === 'true' && idx < 3) {
      console.log(`\n🔍 [DEBUG] Result ${idx}:`, JSON.stringify({
        'metadata.source': metadataSource,
        'metadata.type': r.metadata?.type,
        'detected': sourceType,
        'hasTimestamp': !!timestamp,
        'hasAuthor': !!author,
        'textLength': text.length,
      }, null, 2));
    }
    
    return { id, text, score, sourceType, sourceRef, timestamp, author };
  });
  
  const filtered = passages.filter(p => p.text.length > 0);
  
  // Optional debug: Show source distribution
  if (process.env.LORE_DEBUG === 'true') {
    const sourceBreakdown = filtered.reduce((acc, p) => {
      acc[p.sourceType] = (acc[p.sourceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 [SOURCE BREAKDOWN] Retrieved:`, sourceBreakdown);
  }
  
  return filtered;
}

/**
 * Expand query with synonyms/aliases for better recall
 */
export function expandQuery(query: string): string {
  // Common Fake Rares terminology expansions
  const expansions: Record<string, string[]> = {
    'scrilla': ['Rare Scrilla', 'Scrilla'],
    'freedomkek': ['FREEDOMKEK', 'Freedom Kek'],
    'faka': ['La Faka Nostra', 'Faka Nostra'],
    'wagmi': ['WAGMI', 'We All Gonna Make It'],
    'pepe': ['Pepe', 'Rare Pepe', 'Fake Rare'],
  };
  
  let expanded = query;
  const lowerQuery = query.toLowerCase();
  
  for (const [term, synonyms] of Object.entries(expansions)) {
    if (lowerQuery.includes(term)) {
      expanded += ' ' + synonyms.join(' ');
    }
  }
  
  return expanded;
}

/**
 * Raw knowledge search (global scope) - returns provider-native results
 */
export async function searchKnowledgeRaw(
  runtime: IAgentRuntime,
  query: string
): Promise<any[]> {
  const knowledgeService = (runtime as any).getService
    ? (runtime as any).getService('knowledge')
    : null;

  let results: any[] = [];

  if (knowledgeService?.getKnowledge) {
    const pseudoMessage = { id: 'query', content: { text: query } };
    const scope = { roomId: undefined } as any;
    try {
      const searchPromise = knowledgeService.getKnowledge(pseudoMessage, scope);
      const timeoutPromise: Promise<never> = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Search timeout')), LORE_CONFIG.SEARCH_TIMEOUT_MS);
      });
      results = await Promise.race([searchPromise, timeoutPromise]) || [];
    } catch (err) {
      console.error('Knowledge raw search error:', err);
      results = [];
    }
  } else {
    try {
      const embedding = await (runtime as any).useModel('TEXT_EMBEDDING' as any, { text: query });
      results = await (runtime as any).searchMemories({
        tableName: 'knowledge',
        roomId: undefined,
        embedding,
        query,
        count: LORE_CONFIG.RETRIEVAL_LIMIT * 2,
        match_threshold: LORE_CONFIG.MATCH_THRESHOLD * 0.7,
      } as any) || [];
    } catch (err) {
      console.error('Memory raw search error:', err);
      results = [];
    }
  }

  return results;
}


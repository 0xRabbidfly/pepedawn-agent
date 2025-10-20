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
  
  // Initial search
  if (knowledgeService?.getKnowledge) {
    const pseudoMessage = { id: 'query', content: { text: query } };
    const scope = { roomId: runtime.agentId } as any;
    
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
    // Fallback to direct memory search
    try {
      const embedding = await runtime.useModel('TEXT_EMBEDDING' as any, { text: query });
      results = await runtime.searchMemories({
        tableName: 'knowledge',
        roomId: runtime.agentId,
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
    console.log(`⚠️  Low hits (${results.length}), expanding search...`);
    
    // TODO: Implement staged expansion (wiki → global chats)
    // For now, relax threshold
    if (!knowledgeService && results.length < LORE_CONFIG.MIN_HITS) {
      try {
        const embedding = await runtime.useModel('TEXT_EMBEDDING' as any, { text: query });
        const expandedResults = await runtime.searchMemories({
          tableName: 'knowledge',
          roomId: runtime.agentId,
          embedding,
          query,
          count: LORE_CONFIG.RETRIEVAL_LIMIT * 2,
          match_threshold: LORE_CONFIG.MATCH_THRESHOLD * 0.7, // Relaxed
        } as any) || [];
        
        results = expandedResults;
        console.log(`📈 Expanded to ${results.length} results`);
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
    const createdAtValue = r.createdAt || r.content?.createdAt || r.metadata?.timestamp || r.content?.metadata?.timestamp;
    if (createdAtValue) {
      if (createdAtValue instanceof Date) {
        timestamp = createdAtValue.getTime();
      } else if (typeof createdAtValue === 'string') {
        timestamp = new Date(createdAtValue).getTime();
      } else if (typeof createdAtValue === 'number') {
        timestamp = createdAtValue;
      }
    }
    
    // Extract author/poster
    author = r.metadata?.author || r.content?.metadata?.author || 
             r.metadata?.username || r.content?.metadata?.username ||
             r.userId || r.content?.userId;
    
    // Debug first result
    if (idx === 0) {
      console.log('🔍 [DEBUG] First result:', JSON.stringify({
        'r.metadata?.source': r.metadata?.source,
        'r.content?.metadata?.source': r.content?.metadata?.source,
        'hasTimestamp': !!timestamp,
        'hasAuthor': !!author,
        'idPrefix': id.slice(0, 20),
      }, null, 2));
    }
    
    if (r.metadata?.source === 'telegram' || r.content?.metadata?.source === 'telegram') {
      sourceType = 'telegram';
      sourceRef = r.metadata?.messageId || r.content?.metadata?.messageId || id;
    } else if (r.metadata?.source === 'wiki' || r.content?.metadata?.source === 'wiki') {
      sourceType = 'wiki';
      sourceRef = r.metadata?.pageSlug || r.content?.metadata?.pageSlug || id;
    } else if (timestamp && author) {
      // Heuristic: If has timestamp AND author, likely telegram
      sourceType = 'telegram';
    } else if (timestamp && !author) {
      // Has timestamp but no author - could be wiki or telegram
      sourceType = text.length > 200 ? 'wiki' : 'telegram';
    }
    
    return { id, text, score, sourceType, sourceRef, timestamp, author };
  });
  
  return passages.filter(p => p.text.length > 0);
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


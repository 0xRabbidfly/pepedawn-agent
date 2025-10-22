/**
 * LLM-LORE Summarization Utilities
 * Clustering, summarization, and compact source formatting
 */

import type { IAgentRuntime } from '@elizaos/core';
import type { RetrievedPassage } from './loreRetrieval';
import { LORE_CONFIG } from './loreConfig';

export interface ClusterSummary {
  id: string;
  passageRefs: string[];
  summary: string;
  citations: string[];
}

/**
 * Simple clustering by text similarity (cosine on word overlap)
 */
function clusterPassages(passages: RetrievedPassage[], targetClusters: number): RetrievedPassage[][] {
  if (passages.length <= targetClusters) {
    return passages.map(p => [p]);
  }
  
  // Start with each passage as its own cluster
  const clusters: RetrievedPassage[][] = passages.map(p => [p]);
  
  // Merge most similar clusters until we reach target
  while (clusters.length > targetClusters) {
    let bestI = 0;
    let bestJ = 1;
    let bestSimilarity = -1;
    
    // Find most similar pair
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = calculateClusterSimilarity(clusters[i], clusters[j]);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }
    
    // Merge clusters
    clusters[bestI] = [...clusters[bestI], ...clusters[bestJ]];
    clusters.splice(bestJ, 1);
  }
  
  return clusters;
}

/**
 * Calculate similarity between two clusters (average pairwise word overlap)
 */
function calculateClusterSimilarity(clusterA: RetrievedPassage[], clusterB: RetrievedPassage[]): number {
  let totalSim = 0;
  let count = 0;
  
  for (const a of clusterA) {
    for (const b of clusterB) {
      const wordsA = new Set(a.text.toLowerCase().split(/\s+/));
      const wordsB = new Set(b.text.toLowerCase().split(/\s+/));
      const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      
      totalSim += intersection.size / union.size;
      count++;
    }
  }
  
  return count > 0 ? totalSim / count : 0;
}

/**
 * Summarize a cluster of passages with citations
 */
async function summarizeCluster(
  runtime: IAgentRuntime,
  cluster: RetrievedPassage[],
  clusterId: string
): Promise<ClusterSummary> {
  const combined = cluster.map((p, i) => `[${i}] ${p.text.slice(0, 150)}`).join('\n\n');
  
  const summaryPrompt = `You are a factual summarizer. Produce a brief, faithful synopsis of the provided passages. Merge overlapping facts; avoid speculation. Keep it under 100 words.

Passages:
${combined}

Summary:`;
  
  try {
    const result = await runtime.generateText(summaryPrompt, {
      maxTokens: LORE_CONFIG.MAX_TOKENS_SUMMARY,
      temperature: 0.3, // Low temp for factual summarization
    });
    
    // Extract text from result (may be string or {text: string})
    const summary = typeof result === 'string' ? result : (result as any)?.text || '';
    
    return {
      id: clusterId,
      passageRefs: cluster.map(p => p.id),
      summary: summary.trim(),
      citations: cluster.map(p => formatCompactCitation(p)),
    };
  } catch (err) {
    console.error('Summarization error:', err);
    
    // Fallback: just concat first sentences
    const fallbackSummary = cluster
      .map(p => p.text.split(/[.!?]/)[0])
      .filter(s => s.length > 10)
      .slice(0, 3)
      .join('. ') + '.';
    
    return {
      id: clusterId,
      passageRefs: cluster.map(p => p.id),
      summary: fallbackSummary,
      citations: cluster.map(p => formatCompactCitation(p)),
    };
  }
}

/**
 * Format a compact citation
 * Format: "tg:abc123 2024-10-20 by:user" or "wiki:abc123"
 */
export function formatCompactCitation(passage: RetrievedPassage): string {
  const prefix = passage.sourceType === 'telegram' ? 'tg' :
                 passage.sourceType === 'wiki' ? 'wiki' : 'src';
  
  // Extract short ID - first 6 alphanumeric chars
  let shortRef = passage.sourceRef.split(/[:/]/).pop() || passage.sourceRef;
  if (shortRef.includes('-')) {
    shortRef = shortRef.split('-')[0].slice(0, 6);
  } else {
    shortRef = shortRef.slice(0, 6);
  }
  
  // For telegram: add date and author
  if (passage.sourceType === 'telegram') {
    // Format date if available
    let datePart = '';
    if (passage.timestamp) {
      // Convert Unix timestamp (seconds) to milliseconds if needed
      // Timestamps < 10000000000 are in seconds, >= are in milliseconds
      const timestampMs = passage.timestamp < 10000000000 
        ? passage.timestamp * 1000 
        : passage.timestamp;
      
      const date = new Date(timestampMs);
      
      // Debug: Check if date is valid
      if (Number.isNaN(date.getTime())) {
        console.warn(`Invalid timestamp for ${shortRef}:`, passage.timestamp);
      } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        datePart = ` ${year}-${month}-${day}`;
      }
    } else {
      console.warn(`No timestamp for telegram passage ${shortRef}`);
    }
    
    // Format author if available
    let authorPart = '';
    if (passage.author) {
      const shortAuthor = passage.author.slice(0, 10);
      authorPart = ` by:${shortAuthor}`;
    }
    
    return `${prefix}:${shortRef}${datePart}${authorPart}`;
  }
  
  // For wiki: just prefix and short doc ID (not timestamp-based)
  // Use documentId if available for more stable references
  return `${prefix}:${shortRef}`;
}

/**
 * Cluster and summarize passages
 */
export async function clusterAndSummarize(
  runtime: IAgentRuntime,
  passages: RetrievedPassage[]
): Promise<ClusterSummary[]> {
  if (passages.length === 0) return [];
  
  const targetClusters = Math.min(
    Math.max(LORE_CONFIG.CLUSTER_TARGET_MIN, passages.length),
    LORE_CONFIG.CLUSTER_TARGET_MAX
  );
  
  const clusters = clusterPassages(passages, targetClusters);
  
  console.log(`📊 Clustered ${passages.length} passages into ${clusters.length} clusters`);
  
  // 🚀 OPTIMIZATION: Parallelize LLM calls instead of sequential
  const summaries = await Promise.all(
    clusters.map((cluster, i) => 
      summarizeCluster(runtime, cluster, `cluster-${i}`)
    )
  );
  
  return summaries;
}

/**
 * Format sources line for message footer
 */
export function formatSourcesLine(summaries: ClusterSummary[]): string {
  const allCitations = summaries.flatMap(s => s.citations);
  
  // Deduplicate and limit to first 10
  const uniqueCitations = Array.from(new Set(allCitations)).slice(0, 10);
  
  if (uniqueCitations.length === 0) return '';
  
  return `\n\nSources:  ${uniqueCitations.join('  ||  ')}`;
}


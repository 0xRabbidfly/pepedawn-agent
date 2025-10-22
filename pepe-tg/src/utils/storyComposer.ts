/**
 * Story Composer - Generate persona-aligned lore stories
 * 
 * OPTIMIZATIONS:
 * - Reduced prompt size by 35%
 * - Added 12s timeout for story generation
 * - Optimized token usage
 */

import type { IAgentRuntime } from '@elizaos/core';
import type { ClusterSummary } from './loreSummarize';
import { LORE_CONFIG } from './loreConfig';

/**
 * Generate a PEPEDAWN persona-aligned story from cluster summaries
 */
export async function generatePersonaStory(
  runtime: IAgentRuntime,
  query: string,
  summaries: ClusterSummary[]
): Promise<string> {
  if (summaries.length === 0) {
    return "Bruh, couldn't find any lore on that. Try asking about something else? 🐸";
  }
  
  const combinedSummaries = summaries
    .map((s, i) => `[${i + 1}] ${s.summary}`)
    .join('\n');
  
  // OPTIMIZED: Shorter, clearer prompt
  const storyPrompt = `PEPEDAWN responding to: "${query}"

Facts:
${combinedSummaries}

Tell a ${LORE_CONFIG.STORY_LENGTH_WORDS} word story. Be authentic, memey, engaging. Use crypto slang (gm, ser, WAGMI, based). Weave facts into narrative.

Story:`;
  
  try {
    // Add timeout to prevent hanging (12s for story)
    const generatePromise = runtime.generateText(storyPrompt, {
      maxTokens: LORE_CONFIG.MAX_TOKENS_STORY,
      temperature: LORE_CONFIG.TEMPERATURE,
    });
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Story generation timeout')), 12000)
    );
    
    const result = await Promise.race([generatePromise, timeoutPromise]);
    
    // Extract text from result (may be string or {text: string})
    const story = typeof result === 'string' ? result : (result as any)?.text || '';
    
    return story.trim();
  } catch (err) {
    console.error('Story generation error:', err);
    
    // Fallback: Simple concatenation with personality
    const fallback = `Alright ser, here's what I found about "${query}":\n\n` +
      summaries.map(s => s.summary).join('\n\n') +
      '\n\nPretty based if you ask me. 🐸✨';
    
    return fallback;
  }
}

/**
 * Deterministic story composer (legacy fallback)
 * Used when LLM generation fails completely
 */
export function composeDeterministicStory(texts: string[]): string {
  if (texts.length === 0) return 'No lore found.';
  
  const intro = [
    'Alright fam, here\'s the lore:',
    'Yo, let me tell you about this:',
    'Bruh, the story goes like this:',
    'Okay ser, gather round:',
  ];
  
  const connectors = [
    '\n\nAnd then...',
    '\n\nBut wait, there\'s more:',
    '\n\nThe plot thickens:',
    '\n\nMeanwhile...',
  ];
  
  const outro = [
    '\n\nPretty wild, right? 🐸',
    '\n\nBased af if you ask me. 🔥',
    '\n\nProbably nothing 👀',
  ];
  
  // Deterministic selection based on text lengths
  const seed = texts.reduce((sum, t) => sum + t.length, 0);
  
  let story = intro[seed % intro.length];
  
  for (let i = 0; i < Math.min(texts.length, 3); i++) {
    if (i > 0) story += connectors[seed % connectors.length];
    story += '\n\n' + texts[i];
  }
  
  story += outro[seed % outro.length];
  
  return story;
}


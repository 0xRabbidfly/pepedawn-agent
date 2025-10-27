/**
 * Lore Recounter - Generate historian-style lore recounting or factual answers
 */

import type { IAgentRuntime } from '@elizaos/core';
import { ModelType } from '@elizaos/core';
import type { ClusterSummary } from './loreSummarize';
import { LORE_CONFIG } from './loreConfig';
import OpenAI from 'openai';
import { logTokenUsage, estimateTokens, calculateCost } from './tokenLogger';
import { classifyQuery, type QueryType } from './queryClassifier';

/**
 * Create prompt for FACTS-based queries (rules, requirements, how-to)
 */
function createFactsPrompt(query: string, summaries: string): string {
  return `You are PEPEDAWN. A user asked: "${query}"

Based on these sources:

${summaries}

FACTUAL RESPONSE STYLE:
- Keep response ${LORE_CONFIG.STORY_LENGTH_WORDS} words - be concise but complete
- Answer DIRECTLY with concrete facts, rules, and requirements
- Use lists, bullet points, or numbered steps when appropriate
- NO storytelling, NO "I remember when", NO vibes or reactions
- Extract exact specifications: sizes, fees, requirements, steps
- If it's rules/requirements: list them clearly and completely
- If it's a how-to: provide step-by-step instructions
- Keep it concise and scannable
- Only add brief context if absolutely necessary for understanding
- NO personality flourishes, NO meme language, NO emojis

Answer:`}

/**
 * Create prompt for LORE-based queries (history, stories, community)
 */
function createLorePrompt(query: string, summaries: string): string {
  return `You are PEPEDAWN, an OG who witnessed Fake Rares history firsthand. A user asked: "${query}"

Based on these records from the community's history:

${summaries}

RECOUNTING STYLE:
- Keep response ${LORE_CONFIG.STORY_LENGTH_WORDS} words - be concise but complete
- Speak as a historian/witness, not a storyteller - "I remember when...", "The community was...", "We were all..."
- For chat history: Quote or paraphrase actual moments, include who said what, describe reactions
- For wiki content: Reference it as "The Book of Kek says..." or "According to the archives..." then share the passage
- Use first-person observations: "I saw...", "We were all...", "The vibe was..."
- Include context and community reactions, not just facts
- Dates are optional - only mention if truly relevant to the moment, otherwise skip them
- If sharing 2 distinct ideas/moments, separate them with a blank line (paragraph break)
- NO story-crafting, NO narrative arcs - just recount what happened
- NO canned phrases like "gather 'round", "let me tell you", "here's the tale"
- NO generic closings like "WAGMI", "based", "probably nothing"
- Pick 2-3 related moments and recount them naturally

Lore recounting:`}

/**
 * Generate a PEPEDAWN historian-style lore recounting from cluster summaries
 * Speaks as eyewitness/keeper of history, not as storyteller
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
    .join('\n\n');
  
  // Classify the query type
  const queryType = classifyQuery(query);
  console.log(`🎯 Query classified as: ${queryType}`);
  
  // Different prompts for FACTS vs LORE
  const storyPrompt = queryType === 'FACTS' 
    ? createFactsPrompt(query, combinedSummaries)
    : createLorePrompt(query, combinedSummaries);
  
  try {
    // Use custom env var LORE_STORY_MODEL to bypass runtime's model selection
    // This allows lore stories to use premium model while conversations stay cheap
    const model = process.env.LORE_STORY_MODEL || 'gpt-4o';
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const startTime = Date.now();
    const tokensIn = estimateTokens(storyPrompt);
    
    // Newer models (o1, o3, gpt-5) use different parameters
    const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.startsWith('gpt-5');
    
    const requestParams: any = {
      model,
      messages: [{ role: 'user', content: storyPrompt }],
    };
    
    // Configure parameters based on model type
    if (isReasoningModel) {
      // Reasoning models use max_completion_tokens and reasoning_effort
      // They don't support temperature, top_p, or logprobs
      requestParams.max_completion_tokens = LORE_CONFIG.MAX_TOKENS_STORY * 2; // 600 tokens
      requestParams.reasoning_effort = 'minimal'; // Use minimal reasoning for short stories
    } else {
      // Regular models use max_tokens and temperature
      requestParams.max_tokens = LORE_CONFIG.MAX_TOKENS_STORY;
      requestParams.temperature = LORE_CONFIG.TEMPERATURE;
    }
    
    const response = await openai.chat.completions.create(requestParams);
    
    const story = response.choices[0]?.message?.content || '';
    const tokensOut = response.usage?.completion_tokens || estimateTokens(story);
    const actualTokensIn = response.usage?.prompt_tokens || tokensIn;
    
    // Calculate cost using shared function
    const cost = calculateCost(model, actualTokensIn, tokensOut);
    
    // Log token usage
    logTokenUsage({
      timestamp: new Date().toISOString(),
      model,
      tokensIn: actualTokensIn,
      tokensOut,
      cost,
      source: 'Lore calls',
    });
    
    const latency = Date.now() - startTime;
    console.log(`[TokenLogger] ${model} [Lore calls]: ${actualTokensIn}→${tokensOut} tokens, $${cost.toFixed(6)}, ${latency}ms`);
    
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


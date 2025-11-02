/**
 * Lore Recounter - Generate historian-style lore recounting or factual answers
 */

import type { IAgentRuntime } from '@elizaos/core';
import { ModelType, logger } from '@elizaos/core';
import type { ClusterSummary } from './loreSummarize';
import { LORE_CONFIG } from './loreConfig';
import { callTextModel } from './modelGateway';
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
- DO NOT cite sources in your response (sources are appended separately)
- DO NOT include references, or "Source:" lines in the answer
- JUST provide the facts directly

🚨 IF SOURCES DON'T ANSWER THE QUESTION:
- Reply with exactly: "NO_ANSWER"
- DO NOT elaborate, DO NOT dump unrelated facts

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

🚨 IF SOURCES DON'T ANSWER THE QUESTION:
- Keep response under 30 words MAX
- Be casual: "Haven't heard of that, fam" or "Not sure what you mean"
- Ask for clarification: "Got more details?" or "Where'd you see that?"
- NEVER make up lore or dump unrelated facts
- Example: "Haven't heard of that one, fam. Where'd you hear about it?" (11 words ✓)

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
  logger.debug(`🎯 Query classified as: ${queryType}`);
  
  // Different prompts for FACTS vs LORE
  const storyPrompt = queryType === 'FACTS' 
    ? createFactsPrompt(query, combinedSummaries)
    : createLorePrompt(query, combinedSummaries);
  
  try {
    // Use centralized model gateway for telemetry
    const model = process.env.LORE_STORY_MODEL || 'gpt-4o';
    
    const result = await callTextModel(runtime, {
      model,
      prompt: storyPrompt,
      maxTokens: LORE_CONFIG.MAX_TOKENS_STORY,
      temperature: LORE_CONFIG.TEMPERATURE,
      source: 'Lore calls',
    });
    
    logger.debug(`[StoryComposer] Generated story: ${result.text.length} chars (${result.text.split(/\s+/).length} words)`);
    
    return result.text.trim();
  } catch (err) {
    logger.error({ error: err }, 'Story generation error');
    
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


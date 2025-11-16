import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import {
  SMART_ROUTER_CONFIG,
  type RouterCandidate,
  type RouterSourceType,
} from '../config/smartRouterConfig';
import {
  retrieveCandidates,
  type RetrieveCandidatesResult,
  type RetrieveCandidatesOptions,
} from '../router/retrieveCandidates';
import { detectCardFastPath } from '../router/cardFastPath';
import { KnowledgeOrchestratorService } from './KnowledgeOrchestratorService';
import { callTextModel } from '../utils/modelGateway';
import { isInFullIndex } from '../data/fullCardIndex';

export type ConversationIntent = 'LORE' | 'FACTS' | 'CHAT' | 'NORESPONSE' | 'CMDROUTE';

interface ConversationTurn {
  role: 'user' | 'bot';
  author: string;
  text: string;
  timestamp: number;
}

interface IntentClassifierResult {
  intent: ConversationIntent;
  command?: string;
  raw?: string;
}

export type SmartRouterPlanKind =
  | 'FAST_PATH_CARD'
  | 'CARD_RECOMMEND'
  | 'LORE'
  | 'FACTS'
  | 'CHAT'
  | 'NORESPONSE'
  | 'CMDROUTE';

export interface SmartRoutingPlan {
  kind: SmartRouterPlanKind;
  intent: ConversationIntent;
  reason: string;
  retrieval: RetrieveCandidatesResult | null;
  selectedCandidates?: RouterCandidate[];
  fastPath?: ReturnType<typeof detectCardFastPath>;
  story?: string;
  sources?: string;
  chatResponse?: string;
  emoji?: string;
  command?: string;
  primaryCardAsset?: string;
  cardSummary?: string;
  cardMatches?: Array<{ asset: string; reason?: string }>;
  metadata?: {
    classifierRaw?: string;
  };
}

const HISTORY_LIMIT = 60;
const CLASSIFIER_HISTORY_WINDOW = 20;
const CLASSIFIER_TIMEOUT_MS = 5_000;
const CLASSIFIER_MAX_OUTPUT_TOKENS = 160;
const CHAT_MAX_OUTPUT_TOKENS = 220;

const MODE_PRESETS: Record<
  Exclude<ConversationIntent, 'NORESPONSE' | 'CMDROUTE'>,
  { sourceWeights: Record<RouterSourceType, number>; topKPerSource: number }
> = {
  LORE: {
    sourceWeights: {
      memory: 4.0,
      wiki: 2.6,
      card_data: 1.2,
      telegram: 2.2,
      unknown: 0.5,
    },
    topKPerSource: Math.max(6, SMART_ROUTER_CONFIG.topKPerSource),
  },
  FACTS: {
    sourceWeights: {
      memory: 3.2,
      wiki: 2.2,
      card_data: 3.0,
      telegram: 0.6,
      unknown: 0.4,
    },
    topKPerSource: Math.max(5, SMART_ROUTER_CONFIG.topKPerSource),
  },
  CHAT: {
    sourceWeights: {
      memory: 1.4,
      wiki: 0.6,
      card_data: 0.4,
      telegram: 3.2,
      unknown: 0.6,
    },
    topKPerSource: Math.max(8, SMART_ROUTER_CONFIG.topKPerSource),
  },
};

const NORESPONSE_KEYWORD_EMOJIS: Array<{ pattern: RegExp; emoji: string }> = [
  { pattern: /\bgm\b/i, emoji: '🌞' },
  { pattern: /\bgn\b/i, emoji: '🌙' },
  { pattern: /\bwagmi\b/i, emoji: '🚀' },
  { pattern: /\bthank(s| you)\b/i, emoji: '🙏' },
  { pattern: /\bgm fam\b/i, emoji: '🐸' },
  { pattern: /\bcongrats\b/i, emoji: '🎉' },
  { pattern: /\bheart\b/i, emoji: '💚' },
  { pattern: /\bdrama\b/i, emoji: '👀' },
];

const NORESPONSE_FALLBACK_EMOJIS = [
  '👀',
  '👂',
  '🐸',
  '✨',
  '🎴',
  '🔥',
  '🙌',
  '🌀',
  '🤝',
  '🤙',
  '🛸',
  '🧪',
  '🎨',
  '🎲',
  '🪄',
];

function clampHistory(history: ConversationTurn[]): ConversationTurn[] {
  if (history.length <= HISTORY_LIMIT) return history;
  return history.slice(history.length - HISTORY_LIMIT);
}

function normaliseAuthor(author?: string): string {
  if (!author) return 'User';
  const trimmed = author.trim();
  if (!trimmed) return 'User';
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

function safeJSONParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    const chr = value.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

export class SmartRouterService extends Service {
  static serviceType = 'smart-router';

  capabilityDescription =
    'Conversation router that classifies intent (FACTS/LORE/CHAT/NORESPONSE/CMDROUTE) using an LLM, ' +
    'retrieves weighted evidence, and returns executable response plans.';

  private historyByRoom = new Map<string, ConversationTurn[]>();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<SmartRouterService> {
    logger.info('🧠 [SmartRouter] Starting service...');
    const service = new SmartRouterService(runtime);
    logger.info('✅ [SmartRouter] Service ready');
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('🛑 [SmartRouter] Stopping service...');
    const service = runtime.getService(SmartRouterService.serviceType) as SmartRouterService | undefined;
    if (service) {
      await service.stop();
    }
  }

  async stop(): Promise<void> {
    this.historyByRoom.clear();
  }

  recordUserTurn(roomId: string, text: string, author?: string): void {
    const turn: ConversationTurn = {
      role: 'user',
      author: normaliseAuthor(author),
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.appendTurn(roomId, turn);
  }

  recordBotTurn(roomId: string, text: string): void {
    const turn: ConversationTurn = {
      role: 'bot',
      author: 'PEPEDAWN',
      text: text.trim(),
      timestamp: Date.now(),
    };
    this.appendTurn(roomId, turn);
  }

  private appendTurn(roomId: string, turn: ConversationTurn): void {
    const existing = this.historyByRoom.get(roomId) ?? [];
    existing.push(turn);
    this.historyByRoom.set(roomId, clampHistory(existing));
  }

  private getRecentTurns(roomId: string, count: number): ConversationTurn[] {
    const history = this.historyByRoom.get(roomId) ?? [];
    if (history.length <= count) return [...history];
    return history.slice(history.length - count);
  }

  private formatTranscript(turns: ConversationTurn[]): string {
    return turns
      .map((turn, index) => {
        const speaker = turn.role === 'bot' ? 'PEPEDAWN' : turn.author || 'User';
        const label = turn.role === 'bot' ? 'BOT' : 'USER';
        const sanitised = turn.text.replace(/\s+/g, ' ').trim();
        return `${index + 1}. [${label}] ${speaker}: ${sanitised}`;
      })
      .join('\n');
  }

  private async classifyIntent(roomId: string, currentMessage: string): Promise<IntentClassifierResult> {
    const turns = this.getRecentTurns(roomId, CLASSIFIER_HISTORY_WINDOW);
    const transcript = this.formatTranscript(turns);
    const prompt = [
      'Conversation transcript (oldest first):',
      transcript || '(no prior conversation yet)',
      '',
      `Current user message: "${currentMessage}"`,
      '',
      'Decide how PEPEDAWN should respond next.',
      'Return STRICT JSON in this format:',
      '{"intent":"LORE|FACTS|CHAT|NORESPONSE|CMDROUTE","command":"/command-or-empty"}',
      'Rules:',
      '- LORE: They want lore, storytelling, or community memory.',
      '- FACTS: They want concrete info, rules, requirements, how-to, card specs.',
      '- CHAT: Casual banter, reactions, vibe checks, or you should weave recent chat.',
      '- NORESPONSE: Sit back (maybe send a fitting emoji) when people are already talking.',
      '- CMDROUTE: Kick off a specific command only when the user is clearly invoking an existing slash command.',
      '- Conversation exhaustion detection:',
      '  - If the transcript shows that PEPEDAWN already answered their ask and the current message is a short acknowledgement, reaction, or emoji (e.g., "thanks", "ok", "cool", "lol", a few emojis), prefer intent="NORESPONSE".',
      '  - If the transcript shows that their prompt was directed at a different user, prefer intent="NORESPONSE".',
      '  - Do NOT start a new thread or keep the conversation going when the user is just acknowledging or reacting or shortening their response.',
      '  - Only choose CHAT/FACTS/LORE again when the user is clearly asking for new information, help, or a new topic.',
      '- Off-topic scope detection:',
      '  - PEPEDAWN is for Fake Rares / Rare Pepes / crypto-art / Bitcoin / Counterparty / meme-art culture and related mechanics.',
      '  - If the current message is mainly about personal life, medical/mental health, legal issues, politics, religion, or explicit/sexual topics, and not clearly tied to Fake Rares / crypto-art, prefer intent="NORESPONSE".',
      '  - If a message mixes on-topic and off-topic content, focus only on the on-topic parts when choosing LORE/FACTS/CHAT.',
      '- Command safety:',
      '  - Only use CMDROUTE when the user explicitly types a real slash command (e.g., something that actually appears in their message).',
      '  - Never invent new commands (for example, do NOT create things like "/submission-rules").',
      '  - If the user is asking about submission rules or similar policies in natural language, treat it as FACTS and set "command" to "".',
      '- Always choose exactly ONE intent.',
      '- For CMDROUTE, populate "command" with the exact slash command (include leading "/"). For other intents, set command to "".',
      '- Never include commentary outside the JSON object.',
    ].join('\n');

    try {
      const model = process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
      const result = await callTextModel(this.runtime, {
        model,
        prompt,
        systemPrompt:
          'You are the routing brain for PEPEDAWN, the Fake Rares Telegram host. ' +
          'Label the next response path based on chat intent.',
        maxTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
        source: 'Router-IntentClassifier',
      });
      const text = result.text;
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = safeJSONParse<{ intent?: string; command?: string }>(
          text.slice(jsonStart, jsonEnd + 1)
        );
        if (parsed && parsed.intent) {
          const intent = parsed.intent.toUpperCase() as ConversationIntent;
          // Only respect "command" when the classifier explicitly chose CMDROUTE.
          if (intent === 'CMDROUTE') {
            const command = (parsed.command || '').trim();
            if (command) {
              logger.info(
                {
                  intent,
                  command,
                  raw: text.length > 200 ? `${text.slice(0, 200)}…` : text,
                },
                '[SmartRouter] Classifier decision'
              );
              return { intent: 'CMDROUTE', command, raw: text };
            }
            logger.info(
              {
                intent,
                command: '',
                raw: text.length > 200 ? `${text.slice(0, 200)}…` : text,
              },
              '[SmartRouter] Classifier decision (fallback to NORESPONSE)'
            );
            return { intent: 'NORESPONSE', raw: text };
          }
          if (intent === 'LORE' || intent === 'FACTS' || intent === 'CHAT' || intent === 'NORESPONSE') {
            logger.info(
              {
                intent,
                command: '',
                raw: text.length > 200 ? `${text.slice(0, 200)}…` : text,
              },
              '[SmartRouter] Classifier decision'
            );
            return { intent, raw: text };
          }
        }
      }
      logger.warn('[SmartRouter] Intent classifier returned unparseable output, defaulting to NORESPONSE.');
      return { intent: 'NORESPONSE', raw: text };
    } catch (error) {
      logger.error({ error }, '[SmartRouter] Intent classifier error, defaulting to NORESPONSE');
      return { intent: 'NORESPONSE' };
    }
  }

  private getRetrieveOptions(intent: ConversationIntent): RetrieveCandidatesOptions | null {
    if (intent === 'NORESPONSE' || intent === 'CMDROUTE') {
      return null;
    }
    const preset = MODE_PRESETS[intent];
    return {
      sourceWeights: preset.sourceWeights,
      topKPerSource: preset.topKPerSource,
      matchThresholds: SMART_ROUTER_CONFIG.matchThresholds,
      previewLength: SMART_ROUTER_CONFIG.previewLength,
    };
  }

  private selectTopCandidates(
    retrieval: RetrieveCandidatesResult | null,
    limit: number
  ): RouterCandidate[] {
    if (!retrieval || retrieval.candidates.length === 0) return [];
    return [...retrieval.candidates]
      .sort((a, b) => {
        const scoreA =
          (typeof a.weightedScore === 'number' ? a.weightedScore : a.similarity ?? 0) || 0;
        const scoreB =
          (typeof b.weightedScore === 'number' ? b.weightedScore : b.similarity ?? 0) || 0;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  private pickEmoji(text: string): string {
    for (const entry of NORESPONSE_KEYWORD_EMOJIS) {
      if (entry.pattern.test(text)) {
        return entry.emoji;
      }
    }
    const idx = hashString(text || `${Date.now()}`) % NORESPONSE_FALLBACK_EMOJIS.length;
    return NORESPONSE_FALLBACK_EMOJIS[idx];
  }

  private async buildFactsPlan(
    userText: string,
    roomId: string,
    retrieval: RetrieveCandidatesResult | null,
    classifierRaw?: string,
    options?: { forceCardFacts?: boolean }
  ): Promise<SmartRoutingPlan> {
    if (this.looksLikeCardDescriptor(userText)) {
      const cardPlan = await this.buildCardRecommendPlan(userText, roomId, retrieval, classifierRaw);
      if (cardPlan) {
        return cardPlan;
      }
    }
    const knowledge = this.runtime.getService(
      KnowledgeOrchestratorService.serviceType
    ) as KnowledgeOrchestratorService | undefined;

    if (!knowledge) {
      logger.error('[SmartRouter] Knowledge orchestrator unavailable for FACTS plan.');
      return {
        kind: 'NORESPONSE',
        intent: 'NORESPONSE',
        reason: 'knowledge_unavailable',
        retrieval,
        emoji: this.pickEmoji(userText),
        metadata: { classifierRaw },
      };
    }

    const preferCardFacts = options?.forceCardFacts ?? false;

    const result = await knowledge.retrieveKnowledge(userText, roomId, {
      mode: 'FACTS',
      includeMetrics: true,
      preferCardFacts,
    });

    let story = result.story?.trim();
    let sources = result.sourcesLine || '';

    if ((!story || story.length === 0) && result.cardSummary) {
      const summary = result.cardSummary.trim();
      story = summary;
      sources = '';
    }

    if (!story || story.length === 0) {
      story = 'No factual data available yet.';
    }

    return {
      kind: 'FACTS',
      intent: 'FACTS',
      reason: 'classifier_facts',
      retrieval,
      selectedCandidates: this.selectTopCandidates(retrieval, 3),
      story,
      sources,
      metadata: { classifierRaw },
    };
  }

  private looksLikeCardDescriptor(text: string): boolean {
    const upper = text.toUpperCase();
    const hasCardWord = /\bCARD\b|\bPEPE\b|FAKE\s*RARE|RARE\s*PEPE/i.test(text);
    const hasQuestionWord = /\bWHAT\b|\bWHICH\b|\bSHOW\b|\bFIND\b/i.test(upper);
    const hasAdjective = /(SEXIEST|SEXY|HOTTEST|COLDEST|GREENEST|COOLEST|BEST|VIB(E|EST)|WILDEST|MEANEST|SADDEST|FUNNIEST|SCARIEST)/i.test(
      text
    );
    // Treat ALL-CAPS tokens (3+ chars) in the original text as asset-like symbols.
    // Using the original casing avoids flagging normal prose like "what" as assets.
    const looksLikeAsset = /\b[A-Z0-9]{3,}\b/.test(text);

    if (this.detectMentionedCard(text)) {
      return false;
    }

    return hasCardWord && hasQuestionWord && hasAdjective && !looksLikeAsset;
  }

  private async buildLorePlan(
    userText: string,
    roomId: string,
    retrieval: RetrieveCandidatesResult | null,
    classifierRaw?: string
  ): Promise<SmartRoutingPlan> {
    const knowledge = this.runtime.getService(
      KnowledgeOrchestratorService.serviceType
    ) as KnowledgeOrchestratorService | undefined;

    if (!knowledge) {
      logger.error('[SmartRouter] Knowledge orchestrator unavailable for LORE plan.');
      return {
        kind: 'NORESPONSE',
        intent: 'NORESPONSE',
        reason: 'knowledge_unavailable',
        retrieval,
        emoji: this.pickEmoji(userText),
        metadata: { classifierRaw },
      };
    }

    let preferCardFacts = false;
    if (retrieval) {
      const counts = retrieval.metrics.countsBySource;
      const memoryAndWiki = (counts.memory ?? 0) + (counts.wiki ?? 0);
      const telegram = counts.telegram ?? 0;
      if (memoryAndWiki === 0 && telegram === 0) {
        preferCardFacts = true;
      }
    }

      const result = await knowledge.retrieveKnowledge(userText, roomId, {
      mode: 'LORE',
        includeMetrics: true,
      preferCardFacts,
    });

    const story = result.story?.trim() || 'Still collecting lore on that—want to drop more alpha? 🐸';
    const sources = result.sourcesLine || '';
    return {
      kind: 'LORE',
      intent: 'LORE',
      reason: 'classifier_lore',
      retrieval,
      selectedCandidates: this.selectTopCandidates(retrieval, 3),
      story,
      sources,
      metadata: { classifierRaw },
    };
  }

  private buildChatNotes(retrieval: RetrieveCandidatesResult | null): string {
    if (!retrieval) return '';
    const telegramSnippets = retrieval.candidates
      .filter((c) => c.source_type === 'telegram')
      .slice(0, 5)
      .map((c) => {
        const text = (c.full_text ?? c.text_preview ?? '').replace(/\s+/g, ' ').trim();
        return `- ${text}${text.length > 220 ? '…' : ''}`;
      });
    return telegramSnippets.join('\n');
  }

  private formatRecentChat(turns: ConversationTurn[], limit: number): string {
    if (turns.length === 0) return '(conversation just restarted)';
    return turns
      .slice(-limit)
      .map((turn) => {
        const speaker = turn.role === 'bot' ? 'PEPEDAWN' : turn.author || 'User';
        return `${speaker}: ${turn.text.replace(/\s+/g, ' ').trim()}`;
      })
      .join('\n');
  }

  private async buildCardRecommendPlan(
    userText: string,
    roomId: string,
    retrieval: RetrieveCandidatesResult | null,
    classifierRaw?: string
  ): Promise<SmartRoutingPlan | null> {
    const knowledge = this.runtime.getService(
      KnowledgeOrchestratorService.serviceType
    ) as KnowledgeOrchestratorService | undefined;

    if (!knowledge) {
      logger.error('[SmartRouter] Knowledge orchestrator unavailable for CARD_RECOMMEND plan.');
      return null;
    }

    const result = await knowledge.retrieveKnowledge(userText, roomId, {
      mode: 'FACTS',
      includeMetrics: true,
      preferCardFacts: true,
      deterministicCardSelection: true,
    });

    const cardMatches = (result as any)?.cardMatches;
    if (!Array.isArray(cardMatches) || cardMatches.length === 0) {
      return null;
    }

    const primaryMatch = cardMatches[0];
    const autoSummary =
      primaryMatch && primaryMatch.asset
        ? this.composeCardSummary(primaryMatch.asset, primaryMatch.reason)
        : '';
    const rawSummary =
      (result as any)?.cardSummary?.trim() ||
      result.story?.trim() ||
      autoSummary ||
      'Here’s a card that fits what you asked for.';

    const conciseSummary = this.limitSentences(rawSummary, 2, 200);

    return {
      kind: 'CARD_RECOMMEND',
      intent: 'FACTS',
      reason: 'card_descriptor_intent',
      retrieval,
      selectedCandidates: this.selectTopCandidates(retrieval, 5),
      primaryCardAsset: (result as any)?.primaryCardAsset,
      cardSummary: conciseSummary,
      cardMatches: cardMatches.slice(0, 3).map((match: any) => {
        const stripped = this.stripCardAnnotations(match.reason || '');
        const cleaned = this.removeLeadingAsset(stripped, match.asset);
        const normalized = cleaned || 'Fits what you asked for.';
        return {
          asset: match.asset,
          reason: this.truncateReason(normalized),
        };
      }),
      metadata: {
        classifierRaw:
          classifierRaw ||
          JSON.stringify({ intent: 'FACTS', reason: 'card_descriptor_override' }),
      },
    };
  }

  private limitSentences(text: string, maxSentences: number, maxChars: number): string {
    if (!text) return '';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    const clipped = sentences.slice(0, maxSentences).join(' ');
    if (clipped.length <= maxChars) return clipped;
    return clipped.slice(0, maxChars).trimEnd() + '…';
  }

  private truncateReason(reason: string): string {
    if (!reason) return '';
    const cleaned = reason.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 160) return cleaned;
    return cleaned.slice(0, 157).trimEnd() + '…';
  }

  private stripCardAnnotations(text: string): string {
    return text
      .replace(/\*\*/g, '')
      .replace(/\[CARD:[^\]]+\]/gi, '')
      .replace(/\[CARDFACT:[^\]]+\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private composeCardSummary(asset: string, reason?: string): string {
    const stripped = this.stripCardAnnotations(reason || '');
    let normalizedReason = this.removeLeadingAsset(stripped, asset);
    if (!normalizedReason) {
      normalizedReason = 'fits what you asked for.';
    }
    const normalizedAsset = asset.replace(/[\s*_`~]/g, '').toLowerCase();
    const reasonHasAsset = normalizedReason.toLowerCase().includes(normalizedAsset);
    return reasonHasAsset ? normalizedReason : `${asset} — ${normalizedReason}`;
  }

  private removeLeadingAsset(text: string, asset: string): string {
    if (!text || !asset) {
      return text || '';
    }
    const pattern = new RegExp(`^${this.escapeRegExp(asset)}[\\s:—-]+`, 'i');
    return text.replace(pattern, '').trim();
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async buildChatPlan(
    userText: string,
    roomId: string,
    retrieval: RetrieveCandidatesResult | null,
    classifierRaw?: string
  ): Promise<SmartRoutingPlan> {
    const history = this.getRecentTurns(roomId, 12);
    const recentTranscript = this.formatRecentChat(history, 12);
    const throwbackNotes = this.buildChatNotes(retrieval);

    const prompt = [
      'Recent conversation:',
      recentTranscript,
      '',
      throwbackNotes ? `Relevant throwbacks:\n${throwbackNotes}` : 'Relevant throwbacks: (none)',
      '',
      `Respond as PEPEDAWN to: "${userText}"`,
      '',
      'Guidelines:',
      '- Keep it 1–2 sentences unless the chat calls for more.',
      '- Match the vibe and energy people are using.',
      '- Weave in historic telegram lore only when it enhances the moment.',
      '- Never invent fake card facts.',
      '- If uncertain, invite them to share more detail.',
    ].join('\n');

    try {
      const model = process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
      const result = await callTextModel(this.runtime, {
        model,
        prompt,
        systemPrompt:
          'You are PEPEDAWN, the Fake Rares community host. You are warm, witty, and culturally fluent. ' +
          'Respond like a human participating in the conversation.',
        maxTokens: CHAT_MAX_OUTPUT_TOKENS,
        source: 'Router-CHAT',
      });
      const response = result.text.trim();
      const finalText =
        response.length > 0
          ? response
          : "I'm vibing—keep the drops coming. 🐸";
      return {
        kind: 'CHAT',
        intent: 'CHAT',
        reason: 'classifier_chat',
        retrieval,
        selectedCandidates: this.selectTopCandidates(retrieval, 3),
        chatResponse: finalText,
        metadata: { classifierRaw },
      };
    } catch (error) {
      logger.error({ error }, '[SmartRouter] CHAT generation failed, falling back to emoji listen.');
      return {
        kind: 'NORESPONSE',
        intent: 'NORESPONSE',
        reason: 'chat_generation_failed',
        retrieval,
        emoji: this.pickEmoji(userText),
        metadata: { classifierRaw },
      };
    }
  }

  private normaliseCommand(command?: string): string | null {
    if (!command) return null;
    const trimmed = command.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('/')) {
      return `/${trimmed.replace(/^\/+/, '')}`;
    }
    return trimmed;
  }

  async planRouting(
    text: string,
    roomId: string,
    options?: { forceCardFacts?: boolean }
  ): Promise<SmartRoutingPlan> {
    const trimmed = text.trim();
    const mentionedCard = this.detectMentionedCard(trimmed);
    const looksLikeDescriptor = this.looksLikeCardDescriptor(trimmed);
    if (!trimmed) {
      return {
        kind: 'NORESPONSE',
        intent: 'NORESPONSE',
        reason: 'empty_text',
        retrieval: null,
        emoji: this.pickEmoji(''),
      };
    }

    const intentResult = await this.classifyIntent(roomId, trimmed);
    let intent = intentResult.intent;
    let classifierRaw = intentResult.raw;

    if (intent === 'CMDROUTE') {
      const normalizedCommand = this.normaliseCommand(intentResult.command);
      if (!normalizedCommand) {
        intent = 'NORESPONSE';
      } else {
        return {
          kind: 'CMDROUTE',
          intent: 'CMDROUTE',
          reason: 'classifier_cmdroute',
          retrieval: null,
          command: normalizedCommand,
          metadata: { classifierRaw },
        };
      }
    }

    if (mentionedCard) {
      if (intent !== 'FACTS') {
        logger.debug(
          {
            card: mentionedCard,
            reason: 'named_card_override',
          },
          '[SmartRouter] Overriding intent to FACTS for named card'
        );
      }
      intent = 'FACTS';
      classifierRaw =
        classifierRaw ||
        JSON.stringify({
          intent: 'FACTS',
          reason: 'named_card_override',
          card: mentionedCard,
        });
    }

    // If the classifier chose NORESPONSE but the query clearly looks like a
    // card descriptor ("what is the coldest af pepe", etc.), override to FACTS
    // so we can still run card discovery / facts instead of going silent.
    if (looksLikeDescriptor && intent === 'NORESPONSE') {
      logger.debug(
        {
          reason: 'descriptor_override_from_noreply',
          query: trimmed,
        },
        '[SmartRouter] Overriding NORESPONSE to FACTS for card descriptor-like query'
      );
      intent = 'FACTS';
      classifierRaw =
        classifierRaw ||
        JSON.stringify({
          intent: 'FACTS',
          reason: 'descriptor_override_from_noreply',
        });
    }

    if (intent === 'NORESPONSE') {
      return {
        kind: 'NORESPONSE',
        intent: 'NORESPONSE',
        reason: 'classifier_noreply',
        retrieval: null,
        emoji: this.pickEmoji(trimmed),
        metadata: { classifierRaw },
      };
    }

    const retrievalOptions = this.getRetrieveOptions(intent);
    const retrieval =
      retrievalOptions === null
        ? null
        : await retrieveCandidates(this.runtime, trimmed, roomId, retrievalOptions);
    const topCardAsset = this.getTopCardAsset(retrieval);
    const namesTopCard = mentionedCard
      ? true
      : topCardAsset
      ? this.queryExplicitlyNamesCard(trimmed, topCardAsset)
      : false;

    if (namesTopCard && intent !== 'FACTS') {
      logger.debug(
        {
          card: topCardAsset,
          reason: 'named_card_descriptor',
        },
        '[SmartRouter] Overriding intent to FACTS for named card question'
      );
      intent = 'FACTS';
      classifierRaw =
        classifierRaw ||
        JSON.stringify({
          intent: 'FACTS',
          reason: 'named_card_descriptor',
          card: topCardAsset,
        });
    }

    if (retrieval) {
      const counts = retrieval.metrics.countsBySource;
      logger.info(
        {
          totalPassages: retrieval.metrics.totalPassages,
          totalCandidates: retrieval.metrics.totalCandidates,
          countsBySource: counts,
          weightedBySource: retrieval.metrics.weightedBySource,
        },
        '[SmartRouter] Retrieval summary'
      );
    } else {
      logger.info('[SmartRouter] Retrieval skipped (intent does not require evidence)');
    }

    if (options?.forceCardFacts) {
      const plan = await this.buildCardRecommendPlan(
        trimmed,
        roomId,
        retrieval,
        classifierRaw
      );
      if (plan) {
        return plan;
      }
      logger.warn('[SmartRouter] Card recommendation plan unavailable, falling back to standard FACTS plan.');
    }

    if (intent === 'FACTS') {
      if (this.looksLikeCardDescriptor(trimmed)) {
        const cardPlan = await this.buildCardRecommendPlan(
          trimmed,
          roomId,
          retrieval,
          classifierRaw
        );
        if (cardPlan) {
          return cardPlan;
        }
      }
      if (retrieval) {
        const fastPath = detectCardFastPath(retrieval.candidates, retrieval.metrics);
        const fastCard = fastPath.primaryCandidate?.card_asset;
        const queryNamesCard = fastCard ? this.queryExplicitlyNamesCard(trimmed, fastCard) : false;
        if (fastPath.triggered && fastCard && !queryNamesCard) {
          return {
            kind: 'FAST_PATH_CARD',
            intent: 'FACTS',
            reason: 'card_fast_path',
            retrieval,
            fastPath,
            metadata: { classifierRaw },
          };
        }
        if (fastPath.triggered && fastCard && queryNamesCard) {
          logger.debug(
            {
              card: fastCard,
              reason: 'card_already_named',
            },
            '[SmartRouter] Fast-path suppressed because query explicitly named the card'
          );
        }
      }
      return this.buildFactsPlan(trimmed, roomId, retrieval, classifierRaw, {
        forceCardFacts: options?.forceCardFacts || namesTopCard,
      });
    }

    if (intent === 'LORE') {
      return this.buildLorePlan(trimmed, roomId, retrieval, classifierRaw);
    }

    // Intent must be CHAT at this point
    return this.buildChatPlan(trimmed, roomId, retrieval, classifierRaw);
  }

  private queryExplicitlyNamesCard(text: string, cardAsset: string): boolean {
    const normalized = text.toUpperCase();
    const asset = cardAsset.toUpperCase();
    const regex = new RegExp(`\\b${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      return true;
    }
    return normalized.includes(asset);
  }

  private getTopCardAsset(
    retrieval: RetrieveCandidatesResult | null
  ): string | null {
    if (!retrieval) return null;
    const topCard = retrieval.candidates.find(
      (candidate) =>
        candidate.source_type === 'card_data' && candidate.card_asset
    );
    return topCard?.card_asset ?? null;
  }

  private detectMentionedCard(text: string): string | null {
    const tokens = text.match(/\b[A-Za-z][A-Za-z0-9]{2,}\b/g) || [];
    for (const token of tokens) {
      const upper = token.toUpperCase();
      if (isInFullIndex(upper)) {
        return upper;
      }
    }
    return null;
  }
}


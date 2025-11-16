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

  /**
   * Disambiguate how "PEPEDAWN" is being used in the current message.
   *
   * Because PEPEDAWN is both the bot persona and a card asset, we delegate
   * the distinction to a small LLM instead of hard-coding regex rules.
   *
   * The model decides whether the user is talking *to/about the bot*,
   * asking for *card details*, or clearly mixing both.
   *
   * Returns one of:
   * - "BOT_CHAT"   → treat as conversation about the bot, NOT card intent
   * - "CARD_INTENT"→ treat as card-intent mention
   * - "BOTH"       → ambiguous / mixed; may still allow card overrides
   */
  private async classifyPepedawnUsage(
    roomId: string,
    currentMessage: string
  ): Promise<'BOT_CHAT' | 'CARD_INTENT' | 'BOTH'> {
    const turns = this.getRecentTurns(roomId, 12);
    const transcript = this.formatTranscript(turns);
    const prompt = [
      'You disambiguate whether "PEPEDAWN" refers to the bot persona or the trading card asset.',
      '',
      'Transcript:',
      transcript || '(no prior conversation yet)',
      '',
      `Current message: "${currentMessage}"`,
      '',
      'Respond with STRICT JSON: {"usage":"BOT_CHAT|CARD_INTENT|BOTH"}',
      '',
      'Guidelines:',
      '* BOT_CHAT: they\'re addressing behavior, settings, vibe, or reacting to replies. Prefer this when uncertain.',
      '* CARD_INTENT: they want facts/lore/supply/visuals about the card.',
      '* BOTH: explicitly mixing both.',
    ].join('\n');

    try {
      const model = process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini';
      const result = await callTextModel(this.runtime, {
        model,
        prompt,
        systemPrompt:
          'You disambiguate whether "PEPEDAWN" refers to the bot persona or the trading card asset.',
        maxTokens: 40,
        source: 'Router-PepedawnDisambiguator',
      });
      const text = result.text ?? '';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = safeJSONParse<{ usage?: string }>(
          text.slice(jsonStart, jsonEnd + 1)
        );
        const usage = (parsed?.usage || '').toUpperCase();
        if (usage === 'BOT_CHAT' || usage === 'CARD_INTENT' || usage === 'BOTH') {
          logger.info(
            { usage, raw: text.length > 160 ? `${text.slice(0, 160)}…` : text },
            '[SmartRouter] PEPEDAWN usage disambiguated'
          );
          return usage;
        }
      }
      logger.warn(
        { raw: text },
        '[SmartRouter] PEPEDAWN usage classifier returned unparseable output, defaulting to BOT_CHAT.'
      );
      return 'BOT_CHAT';
    } catch (error) {
      logger.error(
        { error },
        '[SmartRouter] PEPEDAWN usage classifier error, defaulting to BOT_CHAT'
      );
      return 'BOT_CHAT';
    }
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
      'Return STRICT JSON:',
      '{"intent":"LORE|FACTS|CHAT|NORESPONSE|CMDROUTE","command":"/command-or-empty"}',
      '',
      '### Intent rules (in order of priority)',
      '',
      '1. Silence / NORESPONSE: Choose NORESPONSE when any of the following are true:',
      '',
      '   * User is hostile/closing ("stfu", "stop", "enough", "be quieter", "boring", "idc", "lol", "k", "pfffff", a single emoji).',
      '   * The last bot message already answered; the user only reacted (thanks/ok/lol/emoji).',
      '   * The message is directed at another human (mentions someone else, not the bot).',
      '   * One-word greets/valedictions ("gm", "gn", "wagmi") unless the bot was directly asked for info.',
      '   * Off-topic (not Fake Rares / Rare Pepes / crypto-art / Bitcoin / Counterparty) and not clearly tied back to those topics.',
      '2. CMDROUTE: Only when the user typed a real slash command. Populate "command" with it (including /). Never invent commands.',
      '3. FACTS: Concrete info, rules, requirements, specs, "why/what/how," card lookups. If the message names a specific card asset, prefer FACTS.',
      '4. LORE: Storytelling, community memories, historical context explicitly requested.',
      '5. CHAT: Light banter only when the user clearly invites it and is engaged (multi-sentence, non-hostile).',
      '',
      '### Conversation exhaustion detector',
      '',
      '* If user message length is shorter than their prior message and conveys closure (ack/emoji/"nice"), prefer NORESPONSE.',
      '* If bot has sent 2 consecutive replies without a new user ask, prefer NORESPONSE.',
      '',
      '### Off-topic handling',
      '',
      '* If mixed on/off-topic, label by the on-topic ask; otherwise NORESPONSE.',
      '* Do not redirect or probe when off-topic -> NORESPONSE.',
      '',
      '### PEPEDAWN name disambiguation',
      '',
      '* If they talk "to/about the bot," do not treat it as card request.',
      '* If they clearly want card details about PEPEDAWN (asset), that is FACTS.',
      '',
      'Always return exactly one intent and the command (or empty string). No extra text.',
      '',
      '#### Mini examples',
      '',
      '* User: "stfu pepedawn" -> {"intent":"NORESPONSE","command":""}',
      '* User: "rage bait time" -> {"intent":"NORESPONSE","command":""}',
      '* User: "gmfake" -> {"intent":"NORESPONSE","command":""}',
      '* User: "pfffff" -> {"intent":"NORESPONSE","command":""}',
      '* User: "/f fakedust" -> {"intent":"CMDROUTE","command":"/f"}',
      '* User: "why did the URL change" (re group link) -> {"intent":"FACTS","command":""}',
      '* User: "bear market" -> {"intent":"NORESPONSE","command":""}',
      '* User: "just chillin u?" (after prior answer) -> {"intent":"NORESPONSE","command":""}',
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
    // Skip card descriptor check if a card is explicitly mentioned.
    // Card descriptors are for discovery queries, not queries about specific card attributes.
    const mentionedCard = this.detectMentionedCard(userText);
    if (!mentionedCard && this.looksLikeCardDescriptor(userText)) {
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

    // When a card is explicitly mentioned, don't use preferCardFacts (which triggers card discovery).
    // We want normal retrieval to fetch facts about the mentioned card from memories/wiki.
    const preferCardFacts = mentionedCard ? false : (options?.forceCardFacts ?? false);

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

  /**
   * Strips PEPEDAWN from the query when it's used conversationally (addressing the bot).
   * Removes patterns like "hey pepedawn", "pepedawn,", "pepedawn -", etc.
   * Note: This is only called when PEPEDAWN disambiguation returns BOT_CHAT.
   */
  private stripPepedawnFromQuery(text: string): string {
    if (!text) return text;
    
    // Case-insensitive regex to match PEPEDAWN with various punctuation/context
    // Order matters: more specific patterns first
    const patterns = [
      /\bhey\s+pepedawn\s*[,:—-]?\s*/gi,  // "hey pepedawn, " or "hey pepedawn - "
      /\bpepedawn\s*[,:—-]\s*/gi,          // "pepedawn, " or "pepedawn - " (with punctuation)
      /^\s*pepedawn\s*[,:—-]?\s*/gi,       // "pepedawn, " at start
      /\bpepedawn\s+$/gi,                  // "pepedawn " at end (with space)
      /\bpepedawn\s+/gi,                   // "pepedawn " in middle (with space after)
    ];
    
    let cleaned = text;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, ' ');
    }
    
    // Clean up multiple spaces, orphaned punctuation, and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // Remove orphaned punctuation at start (e.g., "'s" left behind)
    cleaned = cleaned.replace(/^['"]\s*/, '').trim();
    
    return cleaned || text; // Return original if stripping would empty the query
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
      throwbackNotes
        ? `Relevant throwbacks:\n${throwbackNotes}`
        : 'Relevant throwbacks:\n(none)',
      '',
      `Respond as PEPEDAWN to: "${userText}"`,
      '',
      '### Output contract',
      '',
      '* If the classifier *should have* chosen NORESPONSE, default to a single neutral emoji.',
      '* Max length:',
      '',
      '  * If user < 5 words -> reply 1-5 words (or a single fitting emoji).',
      '  * If user 5-15 words -> one short sentence (<= 16 words).',
      '  * If user > 15 words -> one sentence (<= 22 words), rarely two if absolutely necessary.',
      '* Never end with a question mark. No probing follow-ups. No "anything else?"',
      '* Match energy: mirror emoji/punctuation intensity; if they are flat, stay flat.',
      '* Hostility or "be quiet" cues (e.g., stfu/stop/boring/pfffff) -> reply with one neutral emoji (e.g., 👂 or 🫡) or a 1-2 word acknowledge (e.g., "noted").',
      '* If the prior two bot replies were consecutive without a new ask -> return a single emoji only.',
      '* If you are unsure, state it in <= 8 words (e.g., "Not sure yet; need details.").',
      '* Do not fabricate card facts or history; if uncertain, be brief and neutral.',
      '',
      '### Style',
      '',
      '* Degen tone is fine (gm/ser/kek) but minimal.',
      '* Never lecture. Never hijack. End cleanly.',
      '* Stay on topic (Fake Rares / Rare Pepes / crypto-art / Bitcoin / Counterparty).',
      '',
      'Return only the final message text (no metadata).',
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
    let mentionedCard = this.detectMentionedCard(trimmed);
    let pepedawnUsage: 'BOT_CHAT' | 'CARD_INTENT' | 'BOTH' | null = null;
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

    // Track if we need to strip PEPEDAWN from the query for RAG search
    // Only strip when PEPEDAWN is used conversationally (BOT_CHAT), NOT when asking about the card (CARD_INTENT)
    // Examples:
    // - "hey pepedawn, what do you think?" → BOT_CHAT → strip "pepedawn" from RAG query
    // - "what is pepedawn's poem?" → CARD_INTENT → keep "pepedawn" in RAG query (we want card facts)
    let queryForRetrieval = trimmed;
    
    if (mentionedCard === 'PEPEDAWN') {
      const usage = await this.classifyPepedawnUsage(roomId, trimmed);
      pepedawnUsage = usage;
      if (usage === 'BOT_CHAT') {
        logger.debug(
          { reason: 'pepedawn_bot_chat', query: trimmed },
          '[SmartRouter] Suppressing named-card override for PEPEDAWN (bot conversation)'
        );
        mentionedCard = null;
        // Strip PEPEDAWN from query for RAG search when it's conversational
        // This prevents PEPEDAWN from polluting the search results when user is just addressing the bot
        queryForRetrieval = this.stripPepedawnFromQuery(trimmed);
        logger.debug(
          { original: trimmed, cleaned: queryForRetrieval },
          '[SmartRouter] Stripped PEPEDAWN from query for RAG search'
        );
      }
      // If usage === 'CARD_INTENT' or 'BOTH', we keep mentionedCard and don't strip PEPEDAWN
      // This ensures queries like "what is pepedawn's poem?" search for PEPEDAWN card facts
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
        : await retrieveCandidates(this.runtime, queryForRetrieval, roomId, retrievalOptions);
    const topCardAsset = this.getTopCardAsset(retrieval);
    let namesTopCard = mentionedCard
      ? true
      : topCardAsset
      ? this.queryExplicitlyNamesCard(trimmed, topCardAsset)
      : false;

    // If retrieval surfaced PEPEDAWN as the top card but the disambiguator
    // judged this as bot chat, do NOT treat it as a named-card descriptor.
    if (topCardAsset === 'PEPEDAWN' && pepedawnUsage === 'BOT_CHAT' && namesTopCard) {
      logger.debug(
        {
          reason: 'pepedawn_bot_chat_suppress_descriptor',
          query: trimmed,
        },
        '[SmartRouter] Suppressing descriptor-based FACTS override for PEPEDAWN (bot conversation)'
      );
      namesTopCard = false;
    }

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

    // Skip card discovery when a card is explicitly mentioned.
    // When a card is mentioned, we want to fetch facts about that specific card,
    // not discover/recommend other cards.
    if (options?.forceCardFacts && !mentionedCard) {
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
      // Skip card descriptor check if a card is explicitly mentioned.
      // Card descriptors are for discovery queries ("what is the sexiest card"),
      // not for queries about a specific card's attributes ("what is pepedawn's poem").
      if (!mentionedCard && this.looksLikeCardDescriptor(trimmed)) {
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
      // Skip fast path and card discovery when a card is explicitly mentioned.
      // When a card is mentioned, we want to fetch facts about that specific card,
      // not discover/recommend other cards.
      if (!mentionedCard && retrieval) {
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
      // When a card is explicitly mentioned, don't use forceCardFacts (which triggers card discovery).
      // We want normal retrieval to fetch facts about the mentioned card from memories/wiki.
      // Use cleaned query (with PEPEDAWN stripped if bot chat) for plan building
      return this.buildFactsPlan(queryForRetrieval, roomId, retrieval, classifierRaw, {
        forceCardFacts: mentionedCard ? false : (options?.forceCardFacts || namesTopCard),
      });
    }

    if (intent === 'LORE') {
      // Use cleaned query (with PEPEDAWN stripped if bot chat) for plan building
      return this.buildLorePlan(queryForRetrieval, roomId, retrieval, classifierRaw);
    }

    // Intent must be CHAT at this point
    // Use cleaned query (with PEPEDAWN stripped if bot chat) for plan building
    return this.buildChatPlan(queryForRetrieval, roomId, retrieval, classifierRaw);
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


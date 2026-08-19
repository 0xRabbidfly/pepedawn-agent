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
import { describeCard, randomCard } from '../utils/cardFacts';
import { answerCardQuery } from '../utils/cardQueries';
import { recallForPrompt } from '../conversation/shadow';
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
  // Conversation is still *about* Fake Rares, so card facts and wiki are the
  // useful grounding. This previously weighted telegram at 3.2 - the highest of
  // any source in any mode - and card_data at 0.4, which meant the bot could not
  // discuss a card conversationally even when it had just retrieved it.
  CHAT: {
    sourceWeights: {
      memory: 2.0,
      wiki: 1.8,
      card_data: 2.4,
      telegram: 0.5,
      unknown: 0.4,
    },
    topKPerSource: Math.max(6, SMART_ROUTER_CONFIG.topKPerSource),
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
    // Questions the card index answers exactly - artist, issuance, supply,
    // series, an artist's largest or smallest card - are looked up rather than
    // retrieved. Semantic search returns whatever text is similar, which is how
    // the bot ended up asserting things it could simply have read off. The fact
    // is stated by code; only the wrapper around it is generated.
    const structured = answerCardQuery(userText);
    if (structured) {
      logger.debug({ kind: structured.kind }, '[SmartRouter] Structured card query');
      return this.buildChatPlan(userText, roomId, retrieval, classifierRaw, {
        knownFact: structured.fact,
      });
    }

    // Matters of taste go down the conversational path, where PEPEDAWN has a
    // voice and can own a pick, rather than the card-recommend path, which
    // builds a factual justification for something that has none.
    if (this.isTasteQuestion(userText)) {
      logger.debug({ query: userText }, '[SmartRouter] Taste question -> opinion, not card lookup');
      return this.buildChatPlan(userText, roomId, retrieval, classifierRaw, {
        tasteQuestion: true,
      });
    }

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

    // Structured card facts live in the card index, not in the vector store, so
    // retrieval alone can answer "tell me about FREEDOMKEK" with whatever thin
    // note happens to be embedded. When a card is named, always fold in what we
    // actually know about it.
    if (mentionedCard) {
      const facts = describeCard(mentionedCard);
      if (facts) {
        story = story && story.length > 0 && !this.isThinAnswer(story)
          ? `${facts}\n\n${story}`
          : facts;
      }
    }

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

  /**
   * True when a composed answer is too thin to be worth appending to the card
   * facts - typically a single clause echoing a stub memory.
   */
  private isThinAnswer(story: string): boolean {
    const words = story.trim().split(/\s+/).filter(Boolean).length;
    return words <= 14;
  }

  /**
   * A question of taste rather than fact - "best", "favourite", "coolest".
   *
   * These were routed to CARD_RECOMMEND, which justifies a pick from card
   * specifications. There is no factual basis for "best", so it reached for the
   * only number in front of it and called a 299-supply card limited. An opinion
   * asked for is an opinion owned.
   */
  private isTasteQuestion(text: string): boolean {
    return /\b(best|favou?rite|coolest|greatest|nicest|prettiest|ugliest|worst|top|most\s+(?:beautiful|underrated|overrated))\b/i.test(
      text
    );
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

  /**
   * Grounding facts for conversation.
   *
   * Previously this filtered to source_type === 'telegram', so chat replies were
   * seeded with old chat-log snippets and never with card facts or wiki — the
   * bot could not talk about a card it had just retrieved. Card data and wiki
   * are what a conversation about a card actually needs; the frozen Telegram
   * archive is being retired (see PEPEDAWN_CHAT_V5.md §2).
   */
  private buildChatNotes(retrieval: RetrieveCandidatesResult | null): string {
    if (!retrieval) return '';
    const useful = retrieval.candidates.filter(
      (c) => c.source_type === 'card_data' || c.source_type === 'wiki' || c.source_type === 'memory'
    );
    if (useful.length === 0) return '';
    return useful
      .slice(0, 5)
      .map((c) => {
        const text = (c.full_text ?? c.text_preview ?? '').replace(/\s+/g, ' ').trim();
        const label =
          c.source_type === 'card_data' ? 'card' : c.source_type === 'memory' ? 'memory' : 'wiki';
        const clipped = text.length > 320 ? `${text.slice(0, 320)}…` : text;
        return `- [${label}] ${clipped}`;
      })
      .join('\n');
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
    classifierRaw?: string,
    options?: { tasteQuestion?: boolean; knownFact?: string }
  ): Promise<SmartRoutingPlan> {
    const history = this.getRecentTurns(roomId, 12);
    const recentTranscript = this.formatRecentChat(history, 12);
    const throwbackNotes = this.buildChatNotes(retrieval);

    // What PEPEDAWN remembers about the people in this room. Rate-limited
    // upstream, so this is usually empty - a bot that constantly references
    // what you said weeks ago is unsettling rather than warm.
    const speakers = history.filter((t) => t.role !== 'bot').map((t) => t.author);
    const roomMemories = await recallForPrompt(roomId, speakers);

    // Nothing retrieved and nothing remembered: invite a contribution rather
    // than bluffing. This is how the corpus grows now the Telegram archive is
    // gone.
    const nothingKnown = !throwbackNotes && !roomMemories;

    // Ranking cards is against the etiquette of this community, so a question of
    // taste is answered by picking a card uniformly at random and saying
    // something true and appreciative about it. The non-determinism lives here,
    // in code — gpt-5.6-luna accepts no temperature, top_p or penalties at all,
    // so nothing varies unless the context does.
    let offeredCard = '';
    if (options?.tasteQuestion) {
      const card = randomCard();
      offeredCard = card ? (describeCard(card.asset) ?? '') : '';
    }

    const prompt = [
      'Recent conversation:',
      recentTranscript,
      '',
      throwbackNotes
        ? `What you know that is relevant (retrieved just now):\n${throwbackNotes}`
        : 'What you know that is relevant: (nothing retrieved)',
      '',
      roomMemories ? `What you remember about people here:\n${roomMemories}\n` : '',
      options?.knownFact
        ? `THIS IS THE ANSWER, and it is exact — state it, do not hedge it, do not add specifications around it:\n${options.knownFact}\nWrap it in one conversational sentence. Do not turn it into a fact sheet.\n`
        : '',
      offeredCard
        ? `This community does not rank its cards, and you would not want to. Instead, here is one drawn at random:
${offeredCard}
Say briefly why it is worth a look — something true about the art, the artist or the era. Make clear it is one of many, not "the best".
`
        : '',
      nothingKnown
        ? 'You have nothing on this. If they asked about a specific card or piece of history, say so plainly and invite them to add it with /fr - once, lightly, not as a sales pitch.\n'
        : '',
      `Respond as PEPEDAWN to: "${userText}"`,
      '',
      '### Using what you know',
      '',
      '* If card facts are listed above and the message touches that card, weave them',
      '  in naturally - the way a collector who knows the piece would mention it.',
      '  One or two concrete details, in the flow of talking. Not a fact sheet.',
      '* Never present a spec as a verdict. Supply, series and issuance are context,',
      '  not proof that something is good, rare or valuable.',
      '* If the question is a matter of taste ("best", "coolest", "favourite"),',
      '  NAME AN ACTUAL CARD and say why you like it, in your own voice. Own it.',
      '  Never hedge with "it depends" or "there is no objective best", and never',
      '  build a justification out of supply, series or issuance numbers.',
      '* Never invent card facts or history. If nothing was retrieved, just talk.',
      '',
      '### Length — this is a hard ceiling',
      '',
      '* Banter or a passing remark: ONE line, 25 words maximum.',
      '* A real question: a short paragraph, 60 words maximum.',
      '* Only when someone explicitly asks for the story: 120 words maximum.',
      '* Never a wall of text. If you cannot say it inside the ceiling, say the',
      '  most useful part and stop.',
      '',
      '### Voice',
      '',
      '* Warm, dry, culturally fluent. A regular in the room, not a service desk.',
      '* You have been here since series 1. You have taste and you own it.',
      '* Match the energy in front of you - brief with brief, relaxed with relaxed.',
      '* Degen register is fine (gm/ser/kek) when it fits. Never forced.',
      '* Do not lecture, do not summarise the conversation, do not offer further help.',
      '* Stay on Fake Rares / Rare Pepes / crypto-art / Bitcoin / Counterparty.',
      '',
      'Return only the final message text (no metadata).',
    ].join('\n');

    try {
      // Conversation is the thing the community actually reads, so it gets a
      // capable model. CHAT_MODEL overrides; the default is no longer the
      // cheapest option available.
      const model = process.env.CHAT_MODEL || process.env.OPENAI_LARGE_MODEL || 'gpt-4o';
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


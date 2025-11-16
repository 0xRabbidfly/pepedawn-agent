import { logger, type IAgentRuntime } from '@elizaos/core';
import {
  SMART_ROUTER_CONFIG,
  passagesToRouterCandidates,
  type RouterCandidate,
  type RouterSourceType,
} from '../config/smartRouterConfig';
import {
  expandQuery,
  searchKnowledgeWithExpansion,
  type RetrievedPassage,
} from '../utils/loreRetrieval';

export interface RetrieveCandidatesOptions {
  topKPerSource?: number;
  sourceWeights?: Record<RouterSourceType, number>;
  matchThresholds?: Partial<Record<RouterSourceType, number>>;
  previewLength?: number;
  skipExpansion?: boolean;
}

export interface RetrieveCandidatesResult {
  expandedQuery: string;
  candidates: RouterCandidate[];
  passagesById: Map<string, RetrievedPassage>;
  metrics: {
    latencyMs: number;
    totalPassages: number;
    totalCandidates: number;
    countsBySource: Record<RouterSourceType, number>;
    weightedBySource: Record<RouterSourceType, number>;
  };
}

export async function retrieveCandidates(
  runtime: IAgentRuntime,
  userText: string,
  roomId: string,
  options?: RetrieveCandidatesOptions
): Promise<RetrieveCandidatesResult> {
  const trimmed = (userText ?? '').trim();

  const start = Date.now();
  const expandedQuery = options?.skipExpansion ? trimmed : expandQuery(trimmed);

  if (!trimmed) {
    logger.debug('[SmartRouting] Empty message received, skipping retrieval.');
    return {
      expandedQuery,
      candidates: [],
      passagesById: new Map(),
      metrics: {
        latencyMs: 0,
        totalPassages: 0,
        totalCandidates: 0,
        countsBySource: {
          memory: 0,
          wiki: 0,
          card_data: 0,
          telegram: 0,
          unknown: 0,
        },
        weightedBySource: {
          memory: 0,
          wiki: 0,
          card_data: 0,
          telegram: 0,
          unknown: 0,
        },
      },
    };
  }

  const topKPerSource = options?.topKPerSource ?? SMART_ROUTER_CONFIG.topKPerSource;
  const previewLength = options?.previewLength ?? SMART_ROUTER_CONFIG.previewLength;
  const weights = options?.sourceWeights ?? SMART_ROUTER_CONFIG.sourceWeights;
  const matchThresholds = options?.matchThresholds ?? SMART_ROUTER_CONFIG.matchThresholds;

  const passages = await searchKnowledgeWithExpansion(runtime, expandedQuery, roomId);

  const candidates = passagesToRouterCandidates(passages, weights, topKPerSource, {
    matchThresholds,
    previewLength,
  });

  const passagesById = new Map<string, RetrievedPassage>();
  for (const passage of passages) {
    passagesById.set(passage.id, passage);
  }

  const countsBySource: Record<RouterSourceType, number> = {
    memory: 0,
    wiki: 0,
    card_data: 0,
    telegram: 0,
    unknown: 0,
  };
  const weightedBySource: Record<RouterSourceType, number> = {
    memory: 0,
    wiki: 0,
    card_data: 0,
    telegram: 0,
    unknown: 0,
  };

  for (const candidate of candidates) {
    countsBySource[candidate.source_type] =
      (countsBySource[candidate.source_type] ?? 0) + 1;
    const contribution =
      candidate.weightedScore ??
      (candidate.similarity || 0) * (candidate.priority_weight || 1);
    weightedBySource[candidate.source_type] =
      (weightedBySource[candidate.source_type] ?? 0) + contribution;
  }

  const latencyMs = Date.now() - start;

  logger.debug(
    `[SmartRouting] Retrieved ${passages.length} passages → ${candidates.length} candidates (latency=${latencyMs}ms)`
  );

  return {
    expandedQuery,
    candidates,
    passagesById,
    metrics: {
      latencyMs,
      totalPassages: passages.length,
      totalCandidates: candidates.length,
      countsBySource,
      weightedBySource,
    },
  };
}


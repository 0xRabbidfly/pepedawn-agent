import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RetrievedPassage } from '../utils/loreRetrieval';

export type RouterMode = 'FACTS' | 'LORE' | 'CHAT';

export interface RouterDecision {
  mode: RouterMode;
  chosen_passage_ids: string[];
  confidence: number; // 0.0 - 1.0
}

export type RouterSourceType = 'memory' | 'wiki' | 'card_data' | 'telegram' | 'unknown';

export interface RouterCandidate {
  id: string;
  source_type: RouterSourceType;
  similarity: number;
  priority_weight: number;
  text_preview: string;
  kind?: 'LORE' | 'FACT' | 'CHAT';
  full_text?: string;
  card_asset?: string;
  metadata?: Record<string, unknown>;
  weightedScore?: number;
}

export interface SmartRouterConfig {
  sourceWeights: Record<RouterSourceType, number>;
  topKPerSource: number;
  matchThresholds: Partial<Record<RouterSourceType, number>>;
  previewLength: number;
  minConfidenceForFactsOrLore: number;
  maxRouterTokens: number;
  routerModelHint: 'SMALL' | 'LARGE';
  fastpath: {
    cardDataAggregateMin: number;
    topSimilarityMin: number;
    dominanceMargin: number;
  };
  rollout: {
    enabled: boolean;
    percentage: number;
  };
}

interface SmartRoutingFileConfig {
  source_weights?: Partial<Record<'memories' | 'wiki' | 'card_data' | 'telegram' | 'unknown', number>>;
  top_k_per_source?: number;
  match_thresholds?: Partial<Record<RouterSourceType, number>>;
  min_confidence_for_facts_or_lore?: number;
  max_router_tokens?: number;
  router_model?: string;
  preview_length?: number;
  fastpath?: Partial<SmartRouterConfig['fastpath']>;
  rollout?: Partial<SmartRouterConfig['rollout']>;
}

const DEFAULT_CONFIG: SmartRouterConfig = {
  sourceWeights: {
    memory: 3.0,
    wiki: 2.0,
    card_data: 1.5,
    telegram: 0.5,
    unknown: 0.5,
  },
  topKPerSource: 5,
  matchThresholds: {
    memory: 0.25,
    wiki: 0.25,
    card_data: 0.35,
    telegram: 0.3,
    unknown: 0.0,
  },
  previewLength: 320,
  minConfidenceForFactsOrLore: 0.6,
  maxRouterTokens: 256,
  routerModelHint: 'SMALL',
  fastpath: {
    cardDataAggregateMin: 0.7,
    topSimilarityMin: 0.8,
    dominanceMargin: 0.1,
  },
  rollout: {
    enabled: true,
    percentage: 100,
  },
};

function resolveConfigPath(): string {
  if (process.env.SMART_ROUTER_CONFIG_PATH) {
    return path.resolve(process.env.SMART_ROUTER_CONFIG_PATH);
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '../../config/smart-routing.config.json');
}

function readConfigFile(): SmartRoutingFileConfig | null {
  try {
    const configPath = resolveConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as SmartRoutingFileConfig;
  } catch (error) {
    console.warn('[SmartRouterConfig] Failed to load smart-routing config file, using defaults.', error);
    return null;
  }
}

function normalizeFileConfig(fileConfig: SmartRoutingFileConfig | null): Partial<SmartRouterConfig> {
  if (!fileConfig) return {};

  const normalized: Partial<SmartRouterConfig> = {};

  if (fileConfig.source_weights) {
    normalized.sourceWeights = {
      ...DEFAULT_CONFIG.sourceWeights,
      memory: fileConfig.source_weights.memories ?? DEFAULT_CONFIG.sourceWeights.memory,
      wiki: fileConfig.source_weights.wiki ?? DEFAULT_CONFIG.sourceWeights.wiki,
      card_data: fileConfig.source_weights.card_data ?? DEFAULT_CONFIG.sourceWeights.card_data,
      telegram: fileConfig.source_weights.telegram ?? DEFAULT_CONFIG.sourceWeights.telegram,
      unknown: fileConfig.source_weights.unknown ?? DEFAULT_CONFIG.sourceWeights.unknown,
    };
  }

  if (typeof fileConfig.top_k_per_source === 'number') {
    normalized.topKPerSource = fileConfig.top_k_per_source;
  }

  if (fileConfig.match_thresholds) {
    normalized.matchThresholds = {
      ...DEFAULT_CONFIG.matchThresholds,
      ...fileConfig.match_thresholds,
    };
  }

  if (typeof fileConfig.preview_length === 'number') {
    normalized.previewLength = fileConfig.preview_length;
  }

  if (typeof fileConfig.min_confidence_for_facts_or_lore === 'number') {
    normalized.minConfidenceForFactsOrLore = fileConfig.min_confidence_for_facts_or_lore;
  }

  if (typeof fileConfig.max_router_tokens === 'number') {
    normalized.maxRouterTokens = fileConfig.max_router_tokens;
  }

  if (typeof fileConfig.router_model === 'string') {
    const hint = fileConfig.router_model.toLowerCase() === 'large' ? 'LARGE' : 'SMALL';
    normalized.routerModelHint = hint;
  }

  if (fileConfig.fastpath) {
    normalized.fastpath = {
      ...DEFAULT_CONFIG.fastpath,
      ...fileConfig.fastpath,
    };
  }

  if (fileConfig.rollout) {
    normalized.rollout = {
      ...DEFAULT_CONFIG.rollout,
      ...fileConfig.rollout,
    };
  }

  return normalized;
}

function applyEnvOverrides(config: SmartRouterConfig): SmartRouterConfig {
  const withEnv = { ...config };

  if (process.env.SMART_ROUTER_TOPK) {
    const parsed = Number(process.env.SMART_ROUTER_TOPK);
    if (!Number.isNaN(parsed) && parsed > 0) {
      withEnv.topKPerSource = parsed;
    }
  }
  if (process.env.SMART_ROUTER_PREVIEW) {
    const parsed = Number(process.env.SMART_ROUTER_PREVIEW);
    if (!Number.isNaN(parsed) && parsed > 0) {
      withEnv.previewLength = parsed;
    }
  }
  if (process.env.SMART_ROUTER_MIN_CONFIDENCE) {
    const parsed = Number(process.env.SMART_ROUTER_MIN_CONFIDENCE);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      withEnv.minConfidenceForFactsOrLore = parsed;
    }
  }
  if (process.env.SMART_ROUTER_MAX_TOKENS) {
    const parsed = Number(process.env.SMART_ROUTER_MAX_TOKENS);
    if (!Number.isNaN(parsed) && parsed > 0) {
      withEnv.maxRouterTokens = parsed;
    }
  }
  if (process.env.SMART_ROUTER_MODEL_HINT) {
    const hint = process.env.SMART_ROUTER_MODEL_HINT.toUpperCase() === 'LARGE' ? 'LARGE' : 'SMALL';
    withEnv.routerModelHint = hint;
  }

  const memoryWeightEnv =
    process.env.SMART_ROUTER_WEIGHT_MEMORIES ??
    process.env.SMART_ROUTER_WEIGHT_ARTIST;
  if (memoryWeightEnv) {
    const parsed = Number(memoryWeightEnv);
    if (!Number.isNaN(parsed)) {
      withEnv.sourceWeights.memory = parsed;
    }
  }
  if (process.env.SMART_ROUTER_WEIGHT_WIKI) {
    const parsed = Number(process.env.SMART_ROUTER_WEIGHT_WIKI);
    if (!Number.isNaN(parsed)) {
      withEnv.sourceWeights.wiki = parsed;
    }
  }
  if (process.env.SMART_ROUTER_WEIGHT_CARD) {
    const parsed = Number(process.env.SMART_ROUTER_WEIGHT_CARD);
    if (!Number.isNaN(parsed)) {
      withEnv.sourceWeights.card_data = parsed;
    }
  }
  if (process.env.SMART_ROUTER_WEIGHT_TG) {
    const parsed = Number(process.env.SMART_ROUTER_WEIGHT_TG);
    if (!Number.isNaN(parsed)) {
      withEnv.sourceWeights.telegram = parsed;
    }
  }
  if (process.env.SMART_ROUTER_WEIGHT_UNKNOWN) {
    const parsed = Number(process.env.SMART_ROUTER_WEIGHT_UNKNOWN);
    if (!Number.isNaN(parsed)) {
      withEnv.sourceWeights.unknown = parsed;
    }
  }

  return withEnv;
}

const SMART_ROUTER_CONFIG_INTERNAL: SmartRouterConfig = (() => {
  const fileConfig = normalizeFileConfig(readConfigFile());
  const merged: SmartRouterConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    sourceWeights: {
      ...DEFAULT_CONFIG.sourceWeights,
      ...(fileConfig.sourceWeights ?? {}),
    },
    matchThresholds: {
      ...DEFAULT_CONFIG.matchThresholds,
      ...(fileConfig.matchThresholds ?? {}),
    },
    fastpath: {
      ...DEFAULT_CONFIG.fastpath,
      ...(fileConfig.fastpath ?? {}),
    },
    rollout: {
      ...DEFAULT_CONFIG.rollout,
      ...(fileConfig.rollout ?? {}),
    },
  };

  const withEnv = applyEnvOverrides(merged);

  // Ensure unknown defaults exist to avoid NaN in downstream calculations
  if (typeof withEnv.sourceWeights.unknown !== 'number') {
    withEnv.sourceWeights.unknown = DEFAULT_CONFIG.sourceWeights.unknown;
  }
  if (withEnv.matchThresholds.unknown === undefined) {
    withEnv.matchThresholds.unknown = DEFAULT_CONFIG.matchThresholds.unknown;
  }

  return withEnv;
})();

export const SMART_ROUTER_CONFIG: SmartRouterConfig = SMART_ROUTER_CONFIG_INTERNAL;

export function passagesToRouterCandidates(
  passages: RetrievedPassage[],
  weights: Record<RouterSourceType, number>,
  topKPerSource: number,
  options?: {
    matchThresholds?: Partial<Record<RouterSourceType, number>>;
    previewLength?: number;
  }
): RouterCandidate[] {
  const matchThresholds = options?.matchThresholds ?? {};
  const previewLength = options?.previewLength ?? SMART_ROUTER_CONFIG.previewLength;

  const grouped: Record<RouterSourceType, RetrievedPassage[]> = {
    memory: [],
    wiki: [],
    card_data: [],
    telegram: [],
    unknown: [],
  };

  for (const passage of passages) {
    const sourceType: RouterSourceType =
      passage.sourceType === 'memory'
        ? 'memory'
        : passage.sourceType === 'wiki'
        ? 'wiki'
        : passage.sourceType === 'card-fact'
        ? 'card_data'
        : passage.sourceType === 'telegram'
        ? 'telegram'
        : 'unknown';
    grouped[sourceType].push(passage);
  }

  const limited: RetrievedPassage[] = [];
  for (const [key, items] of Object.entries(grouped) as Array<[RouterSourceType, RetrievedPassage[]]>) {
    if (items.length === 0) continue;
    const threshold = matchThresholds[key];
    const filtered = typeof threshold === 'number'
      ? items.filter((p) => (p.score ?? 0) >= threshold)
      : items;
    filtered
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, topKPerSource)
      .forEach((p) => limited.push(p));
  }

  return limited.map((passage) => {
    const source_type: RouterSourceType =
      passage.sourceType === 'memory'
        ? 'memory'
        : passage.sourceType === 'wiki'
        ? 'wiki'
        : passage.sourceType === 'card-fact'
        ? 'card_data'
        : passage.sourceType === 'telegram'
        ? 'telegram'
        : 'unknown';

    const kind: RouterCandidate['kind'] =
      source_type === 'memory'
        ? 'LORE'
        : source_type === 'telegram'
        ? 'CHAT'
        : 'FACT';

    const priority_weight =
      typeof weights[source_type] === 'number'
        ? weights[source_type]
        : weights.unknown ?? 1;

    const text = passage.text ?? '';
    const preview =
      previewLength > 0 && text.length > previewLength
        ? `${text.slice(0, previewLength)}…`
        : text;

    return {
      id: passage.id,
      source_type,
      kind,
      similarity: passage.score ?? 0,
      priority_weight,
      text_preview: preview,
      full_text: text,
      card_asset: passage.cardAsset,
      metadata: passage.metadata,
      weightedScore: (passage.score ?? 0) * (priority_weight || 0),
    };
  });
}

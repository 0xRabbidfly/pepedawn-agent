import {
  SMART_ROUTER_CONFIG,
  type RouterCandidate,
} from '../config/smartRouterConfig';
import type { RetrieveCandidatesResult } from './retrieveCandidates';

export interface CardFastPathDecision {
  triggered: boolean;
  primaryCandidate?: RouterCandidate;
  reasons: string[];
  score: number;
  metrics: {
    cardAggregate: number;
    totalAggregate: number;
    cardShare: number;
    topCardSimilarity: number;
    dominanceRatio: number;
    topCandidateId?: string;
    topCandidateWeighted?: number;
  };
}

function candidateWeightedScore(candidate: RouterCandidate): number {
  if (typeof candidate.weightedScore === 'number') {
    return candidate.weightedScore;
  }
  const similarity = candidate.similarity ?? 0;
  const weight = candidate.priority_weight ?? 0;
  return similarity * weight;
}

export function detectCardFastPath(
  candidates: RouterCandidate[],
  metrics?: RetrieveCandidatesResult['metrics'],
  overrides?: Partial<typeof SMART_ROUTER_CONFIG.fastpath>
): CardFastPathDecision {
  const config = {
    ...SMART_ROUTER_CONFIG.fastpath,
    ...(overrides ?? {}),
  };

  const reasons: string[] = [];

  if (!candidates.length) {
    reasons.push('no candidates retrieved');
    return {
      triggered: false,
      reasons,
      score: 0,
      metrics: {
        cardAggregate: 0,
        totalAggregate: 0,
        cardShare: 0,
        topCardSimilarity: 0,
        dominanceRatio: 0,
        topCandidateId: undefined,
        topCandidateWeighted: undefined,
      },
    };
  }

  const cardCandidates = candidates.filter((c) => c.source_type === 'card_data');
  if (!cardCandidates.length) {
    reasons.push('no card_data candidates available');
  }

  const weightedTotals = (() => {
    if (metrics) {
      const total =
        (metrics.weightedBySource.memory ?? 0) +
        (metrics.weightedBySource.card_data ?? 0) +
        (metrics.weightedBySource.wiki ?? 0) +
        (metrics.weightedBySource.telegram ?? 0) +
        (metrics.weightedBySource.unknown ?? 0);
      const cardAggregate = metrics.weightedBySource.card_data ?? 0;
      return { cardAggregate, totalAggregate: total };
    }
    let cardAggregate = 0;
    let totalAggregate = 0;
    for (const candidate of candidates) {
      const weighted = candidateWeightedScore(candidate);
      totalAggregate += weighted;
      if (candidate.source_type === 'card_data') {
        cardAggregate += weighted;
      }
    }
    return { cardAggregate, totalAggregate };
  })();

  const totalAggregate = weightedTotals.totalAggregate;
  const cardAggregate = weightedTotals.cardAggregate;
  const cardShare =
    totalAggregate > 0 ? cardAggregate / totalAggregate : 0;
  const shareCondition =
    totalAggregate > 0 && cardShare >= config.cardDataAggregateMin;

  if (shareCondition) {
    reasons.push(
      `card share ${cardShare.toFixed(3)} ≥ threshold ${config.cardDataAggregateMin}`
    );
  } else {
    reasons.push(
      `card share ${cardShare.toFixed(3)} < threshold ${config.cardDataAggregateMin}`
    );
  }

  const topCardSimilarity = cardCandidates.reduce(
    (max, candidate) => Math.max(max, candidate.similarity ?? 0),
    0
  );
  const similarityCondition =
    topCardSimilarity >= config.topSimilarityMin;

  if (similarityCondition) {
    reasons.push(
      `top card similarity ${topCardSimilarity.toFixed(3)} ≥ threshold ${config.topSimilarityMin}`
    );
  } else {
    reasons.push(
      `top card similarity ${topCardSimilarity.toFixed(3)} < threshold ${config.topSimilarityMin}`
    );
  }

  const sortedByWeighted = candidates
    .map((candidate) => ({
      candidate,
      weighted: candidateWeightedScore(candidate),
    }))
    .sort((a, b) => b.weighted - a.weighted);

  const topEntry = sortedByWeighted[0];
  const secondEntry = sortedByWeighted[1];

  const topCandidate = topEntry?.candidate;
  const topWeighted = topEntry?.weighted ?? 0;
  const secondWeighted = secondEntry?.weighted ?? 0;

  const dominanceRatio =
    secondWeighted > 0
      ? (topWeighted - secondWeighted) / Math.max(secondWeighted, 1e-6)
      : topWeighted > 0
      ? Number.POSITIVE_INFINITY
      : 0;

  const dominanceCondition =
    topCandidate?.source_type === 'card_data' &&
    topWeighted > 0 &&
    dominanceRatio >= config.dominanceMargin;

  if (dominanceCondition) {
    reasons.push(
      `dominance ratio ${Number.isFinite(dominanceRatio) ? dominanceRatio.toFixed(3) : '∞'} ≥ margin ${config.dominanceMargin}`
    );
  } else {
    if (!topCandidate) {
      reasons.push('no top candidate determined');
    } else if (topCandidate.source_type !== 'card_data') {
      reasons.push('top candidate is not card_data source');
    } else if (!(topWeighted > 0)) {
      reasons.push('top card candidate weighted score is zero');
    } else {
      reasons.push(
        `dominance ratio ${Number.isFinite(dominanceRatio) ? dominanceRatio.toFixed(3) : '∞'} < margin ${config.dominanceMargin}`
      );
    }
  }

  const primaryCandidate = cardCandidates
    .map((candidate) => ({
      candidate,
      weighted: candidateWeightedScore(candidate),
    }))
    .sort((a, b) => b.weighted - a.weighted)[0]?.candidate;

  const triggered =
    dominanceCondition && (shareCondition || similarityCondition);

  const normalizedShare =
    config.cardDataAggregateMin > 0
      ? cardShare / config.cardDataAggregateMin
      : cardShare;
  const normalizedSimilarity =
    config.topSimilarityMin > 0
      ? topCardSimilarity / config.topSimilarityMin
      : topCardSimilarity;
  const score = Math.max(normalizedShare, normalizedSimilarity);

  return {
    triggered,
    primaryCandidate,
    reasons,
    score,
    metrics: {
      cardAggregate,
      totalAggregate,
      cardShare,
      topCardSimilarity,
      dominanceRatio,
      topCandidateId: topCandidate?.id,
      topCandidateWeighted: topWeighted,
    },
  };
}


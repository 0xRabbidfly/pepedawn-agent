import { describe, it, expect } from 'bun:test';
import { detectCardFastPath } from '../../router/cardFastPath';
import type { RouterCandidate } from '../../config/smartRouterConfig';

function makeCandidate(partial: Partial<RouterCandidate>): RouterCandidate {
  return {
    id: partial.id ?? 'id',
    source_type: partial.source_type ?? 'card_data',
    similarity: partial.similarity ?? 0.8,
    priority_weight: partial.priority_weight ?? 1,
    text_preview: partial.text_preview ?? '',
    kind: partial.kind,
    full_text: partial.full_text,
    card_asset: partial.card_asset,
    metadata: partial.metadata,
    weightedScore: partial.weightedScore,
  };
}

describe('detectCardFastPath', () => {
  it('does not trigger when there are no candidates', () => {
    const decision = detectCardFastPath([]);
    expect(decision.triggered).toBe(false);
  });

  it('does not trigger when there are no card_data candidates', () => {
    const candidates: RouterCandidate[] = [
      makeCandidate({ id: 'wiki-1', source_type: 'wiki', similarity: 0.9 }),
    ];
    const decision = detectCardFastPath(candidates);
    expect(decision.triggered).toBe(false);
  });

  it('triggers when card share, similarity, and dominance conditions are all met', () => {
    const candidates: RouterCandidate[] = [
      makeCandidate({
        id: 'card-1',
        source_type: 'card_data',
        similarity: 0.95,
        priority_weight: 3,
        card_asset: 'FAKEPARTY',
      }),
      makeCandidate({
        id: 'wiki-1',
        source_type: 'wiki',
        similarity: 0.5,
        priority_weight: 1,
      }),
    ];

    const decision = detectCardFastPath(candidates);

    expect(decision.triggered).toBe(true);
    expect(decision.primaryCandidate?.source_type).toBe('card_data');
    expect(decision.primaryCandidate?.card_asset).toBe('FAKEPARTY');
  });

  it('does not trigger when top card is not dominant enough', () => {
    const candidates: RouterCandidate[] = [
      makeCandidate({
        id: 'card-1',
        source_type: 'card_data',
        similarity: 0.8,
        priority_weight: 1,
        card_asset: 'FAKEPARTY',
      }),
      makeCandidate({
        id: 'card-2',
        source_type: 'card_data',
        similarity: 0.78,
        priority_weight: 1,
        card_asset: 'ANOTHER',
      }),
    ];

    const decision = detectCardFastPath(candidates);
    expect(decision.triggered).toBe(false);
  });
});



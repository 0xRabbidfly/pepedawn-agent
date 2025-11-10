export interface CardVisualFactSection {
  heading: string;
  content: string | null;
}

export interface CardVisualFactSections {
  textOnCard: CardVisualFactSection;
  visualBreakdown: CardVisualFactSection;
  memeticDna: CardVisualFactSection;
}

export interface CardVisualFact {
  version: number;
  card: {
    asset: string;
    series: number | null;
    cardNumber: number | null;
    artist: string | null;
    supply: number | null;
    issuance: string | null;
    collection: string | null;
  };
  analysis: {
    raw: string;
    sections: CardVisualFactSections;
  };
}

export interface CardVisualMemory {
  version: number;
  asset: string;
  collection: string | null;
  series: number | null;
  cardNumber: number | null;
  artist: string | null;
  supply: number | null;
  issuance: string | null;
  textOnCard: string[];
  memeticReferences: string[];
  visualSummary: string;
  keywords: string[];
  embeddingInput: string;
  embeddingBlocks: Array<{
    id: string;
    label: string;
    text: string;
    priority: number;
    type: 'combined' | 'text' | 'memetic' | 'visual' | 'raw' | 'other';
    vector?: number[];
  }>;
  generatedAt: string;
  sourceFactVersion: number;
}

export interface CardVisualEmbeddingRecord {
  id: string;
  vector: number[];
  metadata: {
    asset: string;
    collection: string | null;
    series: number | null;
    cardNumber: number | null;
    artist: string | null;
    keywords: string[];
    version: number;
    blockId: string;
    blockLabel: string;
    blockPriority: number;
    blockType: 'combined' | 'text' | 'memetic' | 'visual' | 'raw' | 'other';
  };
}


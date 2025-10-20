# Data Model — LLM-LORE

## Entities

- TelegramMessage
  - messageId: string
  - chatId: string
  - userId: string
  - timestamp: string
  - text: string
  - tags?: string[]

- WikiSection
  - pageId: string
  - pageSlug: string
  - anchor?: string
  - sectionText: string
  - tags?: string[]

- Embedding
  - id: string
  - sourceType: 'telegram' | 'wiki'
  - sourceRef: string  # messageId or pageSlug#anchor
  - vector: number[]
  - meta: { chatId?: string; timestamp?: string; tags?: string[] }

- LoreRequest
  - query: string
  - chatId?: string
  - userId?: string
  - minHits: number  # default 8
  - limit: number    # default 24

- RetrievedPassage
  - sourceType: 'telegram' | 'wiki'
  - sourceRef: string
  - text: string
  - score: number

- ClusterSummary
  - id: string
  - passageRefs: string[]
  - summary: string
  - citations: string[]  # compact IDs

- LoreResponse
  - story: string
  - sourcesLine?: string  # e.g., "Sources: tg:1234, wiki:purple-era"

## Relationships

- Embedding belongs to one TelegramMessage or WikiSection
- RetrievedPassage references one Embedding
- ClusterSummary aggregates multiple RetrievedPassage
- LoreResponse references ClusterSummary via citations

## Constraints

- Embedding.sourceRef must be unique per sourceType
- Vector length consistent with EMBEDDING_MODEL
- MIN_HITS ≤ RETRIEVAL_LIMIT



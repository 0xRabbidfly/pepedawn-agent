# PEPEDAWN Database Schema

**Last Updated:** 2025-11-11  
**Version:** v3.14.0

This document describes the complete database schema for the PEPEDAWN Telegram bot, including both the ElizaOS core database and the custom transaction history database.

---

## Table of Contents

1. [Database Architecture](#database-architecture)
2. [ElizaOS Core Database](#elizaos-core-database)
3. [Transaction History Database](#transaction-history-database)
4. [Key Relationships](#key-relationships)
5. [Important Indexes](#important-indexes)
6. [Data Types Reference](#data-types-reference)

---

## Database Architecture

PEPEDAWN uses **two separate PGLite databases**:

### 1. ElizaOS Core Database
- **Path:** `.eliza/.elizadb`
- **Purpose:** Stores agent configuration, memories, conversations, embeddings, and relationships
- **Managed by:** ElizaOS framework
- **Tables:** 17 core tables

### 2. Transaction History Database
- **Path:** `data/transactions/`
- **Purpose:** Stores Fake Rare market transaction history (sales, listings)
- **Managed by:** `TransactionHistory` service
- **Tables:** 2 tables (transactions, metadata)

> ⚠️ **CRITICAL:** PGLite does NOT support concurrent access. Always stop the bot before querying the database directly.

---

## ElizaOS Core Database

### Table: `agents`

Stores agent configuration and personality settings.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `enabled` | boolean | NO | `true` | Whether agent is active |
| `created_at` | timestamp with time zone | NO | `now()` | Creation timestamp |
| `updated_at` | timestamp with time zone | NO | `now()` | Last update timestamp |
| `name` | text | NO | - | Agent name |
| `username` | text | YES | - | Agent username |
| `system` | text | YES | `''` | System prompt |
| `bio` | jsonb | YES | `[]` | Agent bio/background |
| `message_examples` | jsonb | NO | `[]` | Example messages |
| `post_examples` | jsonb | NO | `[]` | Example posts |
| `topics` | jsonb | NO | `[]` | Topics of interest |
| `adjectives` | jsonb | NO | `[]` | Personality adjectives |
| `knowledge` | jsonb | NO | `[]` | Knowledge base |
| `plugins` | jsonb | NO | `[]` | Enabled plugins |
| `settings` | jsonb | NO | `{}` | Agent settings |
| `style` | jsonb | NO | `{}` | Response style config |

**Primary Key:** `id`  
**Indexes:** `agents_pkey` (UNIQUE on `id`)

---

### Table: `cache`

Stores temporary cached data with expiration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `key` | text | NO | - | Cache key |
| `agent_id` | uuid | NO | - | Agent ID |
| `value` | jsonb | NO | - | Cached value |
| `created_at` | timestamp with time zone | NO | `now()` | Creation timestamp |
| `expires_at` | timestamp with time zone | YES | - | Expiration timestamp |

**Primary Key:** `(key, agent_id)`  
**Indexes:** `cache_key_agent_id_pk` (UNIQUE on `key`, `agent_id`)

---

### Table: `central_messages`

Stores centralized message history across all channels.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Message ID |
| `channel_id` | text | NO | - | Channel/room ID |
| `author_id` | text | NO | - | Message author ID |
| `content` | text | NO | - | Message text content |
| `raw_message` | jsonb | YES | - | Full raw message object |
| `in_reply_to_root_message_id` | text | YES | - | Reply thread root ID |
| `source_type` | text | YES | - | Source platform (e.g., "telegram") |
| `source_id` | text | YES | - | Source-specific ID |
| `metadata` | jsonb | YES | - | Additional metadata |
| `created_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Last update timestamp |

**Primary Key:** `id`  
**Indexes:** `central_messages_pkey` (UNIQUE on `id`)

---

### Table: `channel_participants`

Maps users to channels (many-to-many relationship).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `channel_id` | text | NO | - | Channel ID |
| `user_id` | text | NO | - | User ID |

**Primary Key:** `(channel_id, user_id)`  
**Indexes:** `channel_participants_channel_id_user_id_pk` (UNIQUE on `channel_id`, `user_id`)

---

### Table: `channels`

Stores channel/group information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Channel ID |
| `server_id` | uuid | NO | - | Server ID |
| `name` | text | NO | - | Channel name |
| `type` | text | NO | - | Channel type |
| `source_type` | text | YES | - | Source platform |
| `source_id` | text | YES | - | Source-specific ID |
| `topic` | text | YES | - | Channel topic |
| `metadata` | jsonb | YES | - | Additional metadata |
| `created_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Last update timestamp |

**Primary Key:** `id`  
**Indexes:** `channels_pkey` (UNIQUE on `id`)

---

### Table: `components`

Stores component data for entity relationships.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Component ID |
| `entityId` | uuid | NO | - | Entity ID |
| `agentId` | uuid | NO | - | Agent ID |
| `roomId` | uuid | NO | - | Room ID |
| `worldId` | uuid | YES | - | World ID |
| `sourceEntityId` | uuid | YES | - | Source entity ID |
| `type` | text | NO | - | Component type |
| `data` | jsonb | YES | `{}` | Component data |
| `createdAt` | timestamp without time zone | NO | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Indexes:** `components_pkey` (UNIQUE on `id`)

---

### Table: `embeddings`

Stores vector embeddings for semantic search across multiple dimensions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Embedding ID |
| `memory_id` | uuid | YES | - | Associated memory ID |
| `created_at` | timestamp without time zone | NO | `now()` | Creation timestamp |
| `dim_384` | vector(384) | YES | - | 384-dimensional embedding |
| `dim_512` | vector(512) | YES | - | 512-dimensional embedding |
| `dim_768` | vector(768) | YES | - | 768-dimensional embedding |
| `dim_1024` | vector(1024) | YES | - | 1024-dimensional embedding |
| `dim_1536` | vector(1536) | YES | - | 1536-dimensional embedding (OpenAI text-embedding-3-small) |
| `dim_3072` | vector(3072) | YES | - | 3072-dimensional embedding |

**Primary Key:** `id`  
**Indexes:**
- `embeddings_pkey` (UNIQUE on `id`)
- `idx_embedding_memory` (on `memory_id`)

**Notes:**
- PEPEDAWN uses `dim_1536` for OpenAI `text-embedding-3-small` model
- Vector columns use pgvector extension for similarity search

---

### Table: `entities`

Stores user/entity information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | - | Entity ID |
| `agent_id` | uuid | NO | - | Agent ID |
| `created_at` | timestamp without time zone | NO | `now()` | Creation timestamp |
| `names` | text[] | NO | `'{}'` | Array of entity names |
| `metadata` | jsonb | NO | `{}` | Additional metadata |

**Primary Key:** `id`  
**Indexes:**
- `entities_pkey` (UNIQUE on `id`)
- `id_agent_id_unique` (UNIQUE on `id`, `agent_id`)

---

### Table: `logs`

Stores system logs and events.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Log ID |
| `created_at` | timestamp with time zone | NO | `now()` | Creation timestamp |
| `entityId` | uuid | NO | - | Entity ID |
| `body` | jsonb | NO | - | Log body/data |
| `type` | text | NO | - | Log type |
| `roomId` | uuid | NO | - | Room ID |

**Primary Key:** `id`

---

### Table: `memories`

**The most important table** - stores all memories including conversations, knowledge, and user-contributed memories.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | - | Memory ID |
| `type` | text | NO | - | Memory type (see below) |
| `createdAt` | timestamp without time zone | NO | `now()` | Creation timestamp |
| `content` | jsonb | NO | - | Memory content (see below) |
| `entityId` | uuid | YES | - | Entity ID |
| `agentId` | uuid | NO | - | Agent ID |
| `roomId` | uuid | YES | - | Room ID |
| `worldId` | uuid | YES | - | World ID |
| `unique` | boolean | NO | `true` | Uniqueness flag |
| `metadata` | jsonb | NO | `{}` | Additional metadata |

**Primary Key:** `id`  
**Indexes:**
- `memories_pkey` (UNIQUE on `id`)
- `idx_memories_type_room` (on `type`, `roomId`)
- `idx_memories_world_id` (on `worldId`)
- `idx_memories_document_id` (on `metadata->>'documentId'`)
- `idx_memories_metadata_type` (on `metadata->>'type'`)
- `idx_fragments_order` (on `metadata->>'documentId'`, `metadata->>'position'`)

#### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `messages` | Conversation messages | User chat messages |
| `knowledge` | Knowledge base entries | Wiki facts, user memories, card info |
| `fragments` | Document fragments | Split wiki documents |

#### Content Structure (JSONB)

For `knowledge` type memories:

```json
{
  "text": "[MEMORY:userId:timestamp] User memory text",
  "metadata": {
    "sourceType": "memory",
    "userId": "1013723568",
    "displayName": "John",
    "roomId": "-1001586933558",
    "messageId": "12345",
    "timestamp": 1699999999999
  }
}
```

For `messages` type:

```json
{
  "text": "Message content",
  "userId": "1013723568",
  "userName": "John"
}
```

#### Special Memory Markers

- `[MEMORY:userId:timestamp]` - User-contributed memory
- `[CARD:CARDNAME]` - Card-specific memory (hybrid search)

---

### Table: `message_servers`

Stores server/platform information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | - | Server ID |
| `name` | text | NO | - | Server name |
| `source_type` | text | NO | - | Source platform |
| `source_id` | text | YES | - | Source-specific ID |
| `metadata` | jsonb | YES | - | Additional metadata |
| `created_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | timestamp without time zone | NO | `CURRENT_TIMESTAMP` | Last update timestamp |

**Primary Key:** `id`  
**Indexes:** `message_servers_pkey` (UNIQUE on `id`)

---

### Table: `participants`

Maps entities to rooms (many-to-many relationship).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Participant ID |
| `created_at` | timestamp with time zone | NO | `now()` | Creation timestamp |
| `entityId` | uuid | YES | - | Entity ID |
| `roomId` | uuid | YES | - | Room ID |
| `agentId` | uuid | YES | - | Agent ID |
| `roomState` | text | YES | - | Room state |

**Primary Key:** `id`  
**Indexes:**
- `participants_pkey` (UNIQUE on `id`)
- `idx_participants_room` (on `roomId`)
- `idx_participants_user` (on `entityId`)

---

### Table: `relationships`

Stores relationships between entities.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Relationship ID |
| `created_at` | timestamp with time zone | NO | `now()` | Creation timestamp |
| `sourceEntityId` | uuid | NO | - | Source entity ID |
| `targetEntityId` | uuid | NO | - | Target entity ID |
| `agentId` | uuid | NO | - | Agent ID |
| `tags` | text[] | YES | - | Relationship tags |
| `metadata` | jsonb | YES | - | Additional metadata |

**Primary Key:** `id`  
**Indexes:**
- `relationships_pkey` (UNIQUE on `id`)
- `unique_relationship` (UNIQUE on `sourceEntityId`, `targetEntityId`, `agentId`)
- `idx_relationships_users` (on `sourceEntityId`, `targetEntityId`)

---

### Table: `rooms`

Stores room/conversation information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Room ID |
| `agentId` | uuid | YES | - | Agent ID |
| `source` | text | NO | - | Source platform |
| `type` | text | NO | - | Room type |
| `serverId` | text | YES | - | Server ID |
| `worldId` | uuid | YES | - | World ID |
| `name` | text | YES | - | Room name |
| `metadata` | jsonb | YES | - | Additional metadata |
| `channelId` | text | YES | - | Channel ID |
| `createdAt` | timestamp without time zone | NO | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Indexes:** `rooms_pkey` (UNIQUE on `id`)

---

### Table: `server_agents`

Maps agents to servers (many-to-many relationship).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `server_id` | uuid | NO | - | Server ID |
| `agent_id` | uuid | NO | - | Agent ID |

**Primary Key:** `(server_id, agent_id)`  
**Indexes:** `server_agents_server_id_agent_id_pk` (UNIQUE on `server_id`, `agent_id`)

---

### Table: `tasks`

Stores task information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Task ID |
| `name` | text | NO | - | Task name |
| `description` | text | YES | - | Task description |
| `roomId` | uuid | YES | - | Room ID |
| `worldId` | uuid | YES | - | World ID |
| `entityId` | uuid | YES | - | Entity ID |
| `agent_id` | uuid | NO | - | Agent ID |
| `tags` | text[] | YES | `'{}'` | Task tags |
| `metadata` | jsonb | YES | `{}` | Additional metadata |
| `created_at` | timestamp with time zone | YES | `now()` | Creation timestamp |
| `updated_at` | timestamp with time zone | YES | `now()` | Last update timestamp |

**Primary Key:** `id`  
**Indexes:** `tasks_pkey` (UNIQUE on `id`)

---

### Table: `worlds`

Stores world/environment information.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | World ID |
| `agentId` | uuid | NO | - | Agent ID |
| `name` | text | NO | - | World name |
| `metadata` | jsonb | YES | - | Additional metadata |
| `serverId` | text | NO | `'local'` | Server ID |
| `createdAt` | timestamp without time zone | NO | `now()` | Creation timestamp |

**Primary Key:** `id`  
**Indexes:** `worlds_pkey` (UNIQUE on `id`)

---

## Transaction History Database

### Table: `transactions`

Stores Fake Rare market transaction history (sales and listings).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `tx_hash` | text | NO | - | Counterparty transaction hash (64-char hex) |
| `type` | text | NO | - | Transaction type (see below) |
| `asset` | text | NO | - | Asset name or longname |
| `amount` | bigint | NO | - | Quantity of asset (positive integer) |
| `price` | bigint | NO | - | Price in satoshis or smallest unit |
| `payment_asset` | text | NO | - | Payment asset (e.g., "XCP", "BTC") |
| `timestamp` | bigint | NO | - | Unix timestamp of block confirmation |
| `block_index` | bigint | NO | - | Counterparty block height |
| `notified` | integer | NO | `0` | Whether Telegram notification was sent (0 or 1) |
| `tokenscan_url` | text | NO | - | Link to TokenScan explorer |
| `xchain_url` | text | NO | - | Link to XChain explorer |
| `created_at` | bigint | NO | - | Record creation time (database insert timestamp) |

**Primary Key:** `tx_hash`  
**Indexes:**
- `transactions_pkey` (UNIQUE on `tx_hash`)
- `idx_timestamp` (on `timestamp DESC`)
- `idx_type_timestamp` (on `type`, `timestamp DESC`)
- `idx_notified` (on `notified` WHERE `notified = 0`)

**Constraints:**
- `type` must be one of: `'DIS_SALE'`, `'DIS_LISTING'`, `'DEX_SALE'`, `'DEX_LISTING'`
- `amount` must be > 0
- `price` must be >= 0
- `block_index` must be > 0
- `notified` must be 0 or 1

#### Transaction Types

| Type | Description |
|------|-------------|
| `DIS_SALE` | Dispenser sale (vending machine purchase) |
| `DIS_LISTING` | Dispenser listing (vending machine setup) |
| `DEX_SALE` | DEX order match (atomic swap sale) |
| `DEX_LISTING` | DEX order (atomic swap listing) |

---

### Table: `metadata`

Stores transaction database metadata (e.g., schema version).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `key` | text | NO | - | Metadata key |
| `value` | text | NO | - | Metadata value |

**Primary Key:** `key`  
**Indexes:** `metadata_pkey` (UNIQUE on `key`)

**Common Keys:**
- `schema_version` - Current schema version (integer)

---

## Key Relationships

### ElizaOS Core Database

```
agents (1) ──────────────────────────────────────> (N) memories
  │                                                      │
  │                                                      │
  └──> (N) entities ──> (N) participants ──> (N) rooms ─┘
                │                                   │
                │                                   │
                └──> (N) relationships              └──> (N) central_messages
                                                    │
                                                    └──> (N) embeddings
```

### Key Foreign Key Relationships

- `memories.agentId` → `agents.id`
- `memories.entityId` → `entities.id`
- `memories.roomId` → `rooms.id`
- `embeddings.memory_id` → `memories.id`
- `participants.entityId` → `entities.id`
- `participants.roomId` → `rooms.id`
- `participants.agentId` → `agents.id`

---

## Important Indexes

### Performance-Critical Indexes

#### ElizaOS Core Database

1. **Memory Type & Room Lookup**
   - `idx_memories_type_room` - Fast filtering by memory type and room
   - Used by: Conversation history, knowledge retrieval

2. **Embedding Lookup**
   - `idx_embedding_memory` - Fast embedding lookup by memory ID
   - Used by: Semantic search, vector similarity

3. **Document Fragments**
   - `idx_fragments_order` - Ordered document fragment retrieval
   - Used by: Wiki document reconstruction

4. **Metadata Filtering**
   - `idx_memories_metadata_type` - Fast filtering by metadata type
   - Used by: Source type filtering (wiki/telegram/memory)

5. **Participant Queries**
   - `idx_participants_room` - Fast room participant lookup
   - `idx_participants_user` - Fast user participation lookup

#### Transaction History Database

1. **Recent Transactions**
   - `idx_timestamp` - Fast chronological queries (DESC order)
   - Used by: `/fm` command, recent activity

2. **Type-Specific Queries**
   - `idx_type_timestamp` - Fast filtering by transaction type
   - Used by: `/fm S` (sales only), `/fm L` (listings only)

3. **Notification Queue**
   - `idx_notified` - Fast lookup of unnotified transactions
   - Used by: Transaction notification service

---

## Data Types Reference

### PostgreSQL Types Used

| Type | Description | Example |
|------|-------------|---------|
| `uuid` | Universally unique identifier | `550e8400-e29b-41d4-a716-446655440000` |
| `text` | Variable-length string | `"PEPEDAWN"` |
| `bigint` | 64-bit integer | `1000000000` |
| `integer` | 32-bit integer | `1` |
| `boolean` | True/false value | `true` |
| `jsonb` | Binary JSON (indexed) | `{"key": "value"}` |
| `text[]` | Array of text | `["name1", "name2"]` |
| `timestamp with time zone` | Timestamp with timezone | `2025-11-11 19:12:18+00` |
| `timestamp without time zone` | Timestamp without timezone | `2025-11-11 19:12:18` |
| `vector(N)` | N-dimensional vector (pgvector) | `[0.1, 0.2, ...]` |

### JSONB Structure Examples

#### Memory Content (Knowledge Type)

```json
{
  "text": "[MEMORY:1013723568:1699999999999] PEPEDAWN is the rarest Fake Rare",
  "metadata": {
    "sourceType": "memory",
    "userId": "1013723568",
    "displayName": "John",
    "roomId": "-1001586933558",
    "messageId": "12345",
    "timestamp": 1699999999999
  }
}
```

#### Memory Content (Card-Specific)

```json
{
  "text": "[CARD:PEPEDAWN] This card features a sunrise theme with warm colors",
  "metadata": {
    "sourceType": "memory",
    "cardName": "PEPEDAWN",
    "userId": "1013723568",
    "displayName": "John",
    "roomId": "-1001586933558",
    "messageId": "12345",
    "timestamp": 1699999999999
  }
}
```

---

## Database Maintenance

### Backup & Restore

```bash
# Backup ElizaOS database
tar -czf elizadb-backup-$(date +%Y%m%d-%H%M%S).tar.gz .eliza/.elizadb

# Restore ElizaOS database
./scripts/kill-bot.sh
tar -xzf elizadb-backup-YYYYMMDD-HHMMSS.tar.gz
./scripts/safe-restart.sh

# Backup transaction database
tar -czf transactions-backup-$(date +%Y%m%d-%H%M%S).tar.gz data/transactions

# Restore transaction database
./scripts/kill-bot.sh
tar -xzf transactions-backup-YYYYMMDD-HHMMSS.tar.gz
./scripts/safe-restart.sh
```

### Query Database

```bash
# Stop bot first (REQUIRED)
./scripts/kill-bot.sh

# Run preset queries
npm run db:query

# Run custom query
npm run db:query "SELECT * FROM memories WHERE type='knowledge' LIMIT 10"

# Restart bot
./scripts/safe-restart.sh
```

### Schema Migrations

Schema migrations are handled automatically on bot startup:

1. **ElizaOS Core:** Managed by ElizaOS framework
2. **Transaction History:** Managed by `TransactionHistory` service
   - Current version tracked in `metadata` table (`schema_version` key)
   - Migrations run automatically in `initialize()` method

---

## Notes & Best Practices

### 1. Concurrent Access

⚠️ **NEVER query the database while the bot is running** - PGLite does not support concurrent access and will corrupt the database.

### 2. Memory Types

- Use `type='messages'` for conversation history
- Use `type='knowledge'` for wiki facts, user memories, and card info
- Use `type='fragments'` for split wiki documents

### 3. User Memories

- Always prefix with `[MEMORY:userId:timestamp]`
- Store metadata in `content.metadata` field
- Use `sourceType: 'memory'` in metadata

### 4. Card-Specific Memories

- Include `[CARD:CARDNAME]` marker in text
- Enables hybrid search (card-specific + general lore)
- Store card name in `metadata.cardName`

### 5. Embeddings

- PEPEDAWN uses `dim_1536` for OpenAI `text-embedding-3-small`
- One embedding per memory (1:1 relationship)
- Embeddings are generated asynchronously after memory creation

### 6. Transaction Deduplication

- `tx_hash` is the primary key (unique constraint)
- Prevents duplicate transaction notifications
- Use `INSERT ... ON CONFLICT DO NOTHING` for safe inserts

---

## Related Documentation

- [PEPEDAWN_SPEC_REFERENCE.md](./PEPEDAWN_SPEC_REFERENCE.md) - Feature specifications
- [PEPEDAWN_FLOW_DIAGRAMS.md](./PEPEDAWN_FLOW_DIAGRAMS.md) - System flow diagrams
- [PEPEDAWN_AI_OVERVIEW.md](./PEPEDAWN_AI_OVERVIEW.md) - AI/LLM integration
- [scripts/query-db.js](../scripts/query-db.js) - Database query tool

---

**Document Version:** 1.0  
**Last Schema Update:** v3.14.0 (2025-11-11)


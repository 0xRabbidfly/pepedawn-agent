# Quickstart — LLM-LORE

## Env

Copy `.env` and set:

```
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=...
TEXT_MODEL=gpt-4o-mini
VECTOR_DB_DSN=postgres://local/vector
RETRIEVAL_LIMIT=24
MIN_HITS=8
STORY_LENGTH_WORDS=120-180
```

## Run

```
cd pepe-tg
bun install
bun run dev
```

Send in Telegram: `@pepedawn_bot tell me about the purple subasset era`.

## Notes
- Global retrieval scope (all chats) + wiki
- Compact sources line, e.g., `Sources: tg:1234, wiki:purple-era`
- If few results: expand wiki → global chats
- Target 120–180 words; small variability per run

# PEPEDAWN AI Experience

PEPEDAWN blends Retrieval-Augmented Generation, multimodal analysis, and proactive knowledge curation so every Telegram interaction feels like an OG lore-keeper is online 24/7. This document showcases the headline ways we deploy AI across the bot experience.

---

## Knowledge-Orchestrated Responses

- **Hybrid Retrieval Pipeline (`KnowledgeOrchestratorService`)**  
  Expands queries, performs hybrid vector search, and adaptively chooses between pure-fact and storyteller paths before replying.
- **Persona Storytelling (`storyComposer`)**  
  GPT-4o turns clustered evidence into historian-style lore drops that sound like a seasoned Fake Rares archivist.

## Vision-Powered Card Intelligence

- **`/fv` Memetic Sommelier**  
  GPT-4o Vision extracts on-card text, dissects composition, and decodes meme DNA for any Fake Rare, returned in a share-worthy format.
- **`/ft` Fake Test Coach**  
  Replicate CLIP embeddings catch derivatives, while GPT-4o Vision scores new art against Fake ethos so creators get instant, AI-grade feedback.

## Live Lore Harvesting & Onboarding

- **Lore Detector Evaluator**  
  A lightweight LLM reviews every chat, flags new canon, and files curated memories so community knowledge compounds automatically.
- **Newcomer Educator Action**  
  Small-model prompts assess user skill level, fetch the right facts, and respond with tailored onboarding guidance.

## Model Governance & Observability

- **Central Model Gateway**  
  Normalizes GPT-5, o-series reasoning, and Vision calls, enforcing telemetry and cost controls for every request.
- **Telemetry Service**  
  Logs per-model spend, latency, and source metrics, powering the `/fc` cost command and giving ops real-time visibility.

## Multi-Provider Knowledge Indexing

- **`plugin-knowledge-index` Pipelines**  
  Use the `@ai-sdk` stack to run OpenAI, Anthropic, Google, or OpenRouter models for document synthesis, chunk generation, and embeddings—keeping the knowledge base fresh and vendor-agnostic.

---

### Why It Matters

- Every command feels bespoke thanks to persona-driven prompting and citation-aware summaries.  
- Visual tooling defends the collection while coaching artists, striking the perfect balance between protection and creativity.  
- Operations stay in control with first-class telemetry, cost guardrails, and multi-cloud redundancy baked into the indexing layer.

PEPEDAWN isn’t just answering questions—it’s preserving Fake Rares culture with industrial-grade AI under the hood.








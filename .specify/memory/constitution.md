<!--
Sync Impact Report
- Version change: [unknown/template] → 1.0.0
- Modified principles: template placeholders → concrete agent principles
- Added sections: Additional Constraints; Development Workflow
- Removed sections: None (testing/TDD guidance explicitly excluded)
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (testing → verification; tests dirs optional)
  - ✅ .specify/templates/spec-template.md (remove mandatory testing; rename verification fields)
  - ✅ .specify/templates/tasks-template.md (remove TDD-first wording; tests optional)
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Provide original adoption date
-->

# Fake-Rare-TG-Agent Constitution

## Core Principles

### I. Single-Responsibility Agent
The Telegram agent and its plugins MUST focus on a narrow, well-defined mission: to
deliver the Fake Rare domain experience through conversational interfaces, with
minimal surface area. Features MUST be scoped as independent, user-facing slices
that can be delivered and operated without cross-cutting entanglement.

Rationale: Focus reduces complexity, operational risk, and accelerates delivery.

### II. Explicit Configuration and Secret Hygiene
All operational configuration MUST be provided via environment variables or
checked-in config templates. Secrets (e.g., TELEGRAM_BOT_TOKEN, model provider
keys) MUST never be committed to the repository and MUST be loaded at runtime
through environment-specific files or secret managers. Default-safe values and
clear setup instructions MUST be provided.

Rationale: Prevent secret leakage and ensure reproducible, environment-specific deploys.

### III. Stable Chat Contracts and Backward Compatibility
Public bot behaviors (commands, message patterns, callback data) constitute a
contract. Changes MUST be backward compatible or gated behind explicit versioned
opt-ins. Deprecations MUST include a migration note and a grace window.

Rationale: Predictability preserves user trust and enables incremental rollout.

### IV. Operational Observability and Resilience
The system MUST provide structured logs with levels, trace identifiers where
possible, and clear error messages. Message handling MUST be idempotent where
retries may occur, and rate limits MUST be respected. Failure modes MUST fail
closed (safe) and surface actionable diagnostics.

Rationale: Operability is essential for bots interacting with external platforms.

### V. Versioned Delivery and Change Transparency
All user-visible or plugin API changes MUST follow semantic versioning. A
CHANGELOG entry MUST accompany modifications that affect behaviors or
configuration. Breaking changes require a major version bump and an upgrade
guide.

Rationale: Transparent versioning reduces integration surprises for maintainers and users.

## Additional Constraints

- Stack: Node.js + Bun, ElizaOS framework, Telegram Bot API. Keep dependencies
  minimal and reviewed.
- Security: Principle of least privilege for tokens and webhooks; avoid logging
  secrets or PII; validate and sanitize external inputs.
- Performance: Aim for responsive interactions; avoid blocking operations in the
  message loop; offload long-running work asynchronously when feasible.
- Configuration: Provide example `.env` templates and `elizaconfig` guidance.
- Data: Persist only what is necessary for features; document any stored data and
  retention expectations.

## Development Workflow

- Planning: Express work as independent, user-facing slices aligned to the agent’s
  mission. Keep PRs small and scoped to a single slice when possible.
- Reviews: Every change MUST be reviewed for principle alignment, security,
  backwards compatibility, and observability. Favor clarity over cleverness.
- Verification: Manual or scripted verification steps are expected for critical
  chat flows. Automated tests are OPTIONAL and not mandated by this constitution.
- Releases: Update version per semantic versioning and add CHANGELOG notes. Provide
  migration notes for any behavior changes. Prefer gradual rollout where possible.

## Governance

- Authority: This constitution supersedes informal practices. Conflicts are
  resolved by amending this document.
- Amendments: Proposed via PR including rationale, migration considerations, and
  version bump. Approval requires maintainer review.
- Compliance: Reviewers MUST check for alignment with principles, especially
  security, configuration hygiene, compatibility, and operability.
- Versioning Policy: Follow SemVer for constitution itself. See version line below.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): Provide original adoption date | **Last Amended**: 2025-10-17
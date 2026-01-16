# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.12] - 2025-12-25

### Security

#### Critical Fixes

- **CRIT-001**: SQL injection prevention in temporal queries with ISO date validation
- **CRIT-002**: SQL injection prevention in pgvector dimension parameter
- **CRIT-003**: Path traversal prevention in file sync using `isPathSafe()`
- **CRIT-004**: Block permissive mode in production environment
- **CRIT-005**: SSL certificate validation for PostgreSQL connections
- **CRIT-007**: CORS configuration with `@fastify/cors`
- **CRIT-009**: Redis adapter race condition fixes with `ConnectionGuard`
- **CRIT-012**: Rate limiter fail-closed with local fallback strategy

#### High Priority Fixes

- **HIGH-001**: IP address spoofing fix using Fastify `trustProxy`
- **HIGH-002**: FTS5 operator sanitization (AND, OR, NOT, NEAR)
- **HIGH-003**: Content-Type validation preHandler hook
- **HIGH-004**: Response compression with `@fastify/compress`
- **HIGH-005**: Hide error details in production (5xx responses)
- **HIGH-011**: PostgreSQL pool cleanup on connection failure
- **HIGH-012**: SQLite async transaction escape detection
- **HIGH-017**: X-Request-ID header generation and propagation
- **HIGH-018**: HMAC-signed pagination cursors

#### Medium Priority Fixes

- **MED-001**: Security headers with `@fastify/helmet`
- **MED-002**: X-RateLimit-\* response headers
- **MED-005**: Connection pool monitoring metrics
- **MED-007**: Date range validation (1970-2100)
- **MED-010**: ReDoS pattern detection
- **MED-011**: Security event logging
- **MED-012**: MAX_ENTRIES_PER_IMPORT limit

### Added

#### New Utilities

- `src/utils/connection-guard.ts` - Atomic connection handling for Redis adapters
- `src/utils/pagination.ts` - HMAC-signed cursor validation
- `src/utils/security-logger.ts` - Security event logging with structured JSON
- `src/core/adapters/local-rate-limiter.adapter.ts` - In-memory rate limiting
- `src/core/adapters/redis-rate-limiter.adapter.ts` - Redis-backed rate limiting with fail modes

#### Security Test Suite (220 tests)

- `tests/security/sql-injection.test.ts` - 55 SQL injection tests
- `tests/security/path-traversal.test.ts` - 72 path traversal tests
- `tests/security/dos-stress.test.ts` - 68 DoS stress tests
- `tests/security/permission-race.test.ts` - 25 TOCTOU race condition tests

#### Coverage Improvements (600+ new tests)

- RL services coverage: 0% → 70%+ (116 tests)
- Latent memory services coverage: 0% → 70%+ (214 tests)
- Circuit breaker coverage: 8% → 100% (40 tests)
- Dead letter queue coverage: 16% → 80%+ (73 tests)
- Query rewrite stage coverage: 3% → 70%+ (44 tests)

### Changed

- Rate limiter now defaults to fail-closed with local fallback
- Redis adapters use ConnectionGuard for atomic connection handling
- Example files excluded from TypeScript build
- Exported `escapeFTSQuery` alias for backwards compatibility

### Performance

- Test suite expanded from ~1,800 to 2,706 tests
- All tests complete in under 45 seconds

## [0.9.11] - 2025-12-24

### Added

#### Query Rewriting / HyDE

- Intent classifier with pattern-based detection (lookup, how_to, debug, explore, compare, configure)
- Query expander with 50+ programming synonyms dictionary
- HyDE (Hypothetical Document Embedding) generator with intent-specific prompts
- New `rewriteStage` in query pipeline
- Configuration section: `queryRewrite`

#### Latent Memory / KV-Cache

- New `memory_latent` MCP tool with 7 actions (create, get, search, inject, warm_session, stats, prune)
- Tiered KV-cache: L1 (in-memory LRU) + L2 (persistent SQLite/Redis)
- Embedding compression: Random projection (1536→256 dims), scalar quantization
- Context injector with JSON, Markdown, and natural language formats
- Database migration: `0019_add_latent_memories.sql`

#### Hierarchical Summarization

- New `memory_summarize` MCP tool with 6 actions (build, status, get, search, drill_down, delete)
- Leiden algorithm for community detection on embedding similarity
- 4-level hierarchy: chunk → topic → domain → global
- LLM-based summarizer with level-aware prompts
- Coarse-to-fine retrieval for efficient hierarchical search
- Database migration: `0020_add_summaries.sql`

#### RL Policy Training Enhancements

- Dataset export in multiple formats: HuggingFace, OpenAI, Anthropic, CSV, JSONL
- Model loader with multi-format support (ONNX, SafeTensors, JSON, checkpoints)
- Policy evaluator with A/B testing, confusion matrix, temporal tracking
- New MCP actions: `export_dataset`, `train`, `load_model`, `list_models`, `evaluate`, `compare`
- Enhanced configuration section for RL training hyperparameters

#### LoRA Export / Parametric Internalization

- New `memory_lora` MCP tool with 3 actions (export, list_adapters, generate_script)
- Training data generator from guidelines with positive and contrastive examples
- Multiple export formats: Alpaca, ShareGPT, OpenAI Messages, Anthropic Prompts
- LoRA adapter config generation (rank, alpha, dropout, target modules)
- Automatic training script generation with PEFT configuration
- Configuration section: `lora`

### Changed

- Updated competitive analysis documentation to reflect all gaps as closed
- Enhanced query pipeline with rewrite stage support

### Documentation

- Added `docs/lora-export.md` - LoRA export user guide
- Updated `docs/competitive-analysis.md` - All competitive gaps now marked as implemented
- Added comprehensive README files for each new service

## [0.9.4] - 2025-12-19

### Added

- Claude Code hooks for end-of-session review enforcement (`Stop`, `UserPromptSubmit`)
- Client-assisted observation flow: `memory_observe` now supports `draft` + `commit` (no server-side LLM required)

### Changed

- Claude Code hook installer now generates/installs `stop.sh` and `userpromptsubmit.sh` in addition to existing hooks

## [0.9.3] - 2025-12-18

### Added

- Centralized version module (`src/version.ts`) - single source of truth
- REST API server with Fastify (`src/restapi/`)
- Memory extraction service for LLM-powered auto-capture (`memory_observe`)
- Performance benchmarks suite (`tests/benchmarks/`)
- Server mode utility for MCP/REST/both modes
- QUICKSTART.md for rapid onboarding

### Changed

- Version now read from `package.json` everywhere (no more hardcoded versions)
- Documentation updated with performance metrics and roadmap
- Updated all docs to reflect current version and features

### Performance

- Documented benchmark results: 4.5M ops/sec for simple queries
- Sub-millisecond p99 latency (< 0.5ms) for most operations

## [0.9.2] - 2025-12-18

### Fixed

- Fixed TypeScript type errors in query service for RelationType parameters
- Removed unused `getRelatedEntryIds` function (replaced by `getRelatedEntryIdsWithTraversal`)

## [0.9.1] - 2025-12-18

### Added

- Verification system with pre/post-check blocking for critical guidelines
- Hook generator for Claude Code, Cursor, and VS Code integration
- Critical guidelines service for priority-based enforcement
- Session-level guideline acknowledgments

### Changed

- Enhanced validation service with improved input sanitization
- Improved type guards across the codebase
- Better IDE detection utilities

### Documentation

- Added competitive analysis document
- Added improvement recommendations document

## [0.9.0] - 2025-12-18

### Added

- Configurable paths for backups, exports, and logs via environment variables
- Centralized `.env` configuration system with `AGENT_MEMORY_*` prefix
- Configurable timestamp formatting (`AGENT_MEMORY_TIMESTAMP_FORMAT`)
- Path tilde expansion support for all configurable paths
- Docker setup guide and path behavior documentation

### Changed

- Upgraded Docker base image to `node:25-slim`
- Pruned dev dependencies in Docker build for smaller images
- Improved configuration documentation with collapsible sections

### Fixed

- Security: Updated npm to fix glob CVE-2025-64756
- Added npm package attestations for supply chain security

### Security

- CVE-2025-64756: Fixed glob vulnerability in dependencies

## [0.8.5] - 2024-12-17

### Added

- Delete action for `memory_project` tool
- Improved internal documentation structure
- Comprehensive documentation overhaul

### Changed

- Updated documentation links to new structure
- Clarified `memory_project` and `memory_org` use "create" action (not "add")

### Fixed

- Code formatting across codebase (trailing whitespace)

## [0.8.0] - 2024-12

### Added

- 80% test coverage threshold enforcement
- Comprehensive test suite (1079 tests across 59 files)
- Full-text search (FTS5) support
- Conversation history tracking (`memory_conversation` tool)
- Task decomposition support (`memory_task` tool)
- Multi-agent voting infrastructure (`memory_voting` tool)
- Usage analytics (`memory_analytics` tool)
- Rate limiting for API protection
- Semantic search with vector embeddings
- Query caching for improved performance

### Changed

- Action-based tool bundling (19 tools instead of 45+)
- Improved error messages with suggestions
- Enhanced conflict detection (5-second window)

### Fixed

- Database lock handling in concurrent scenarios
- Migration ordering issues
- Windows path handling

## [0.7.0] - 2024-11

### Added

- Initial public release
- Core memory sections: tools, guidelines, knowledge
- Hierarchical scoping (global, org, project, session)
- Append-only versioning with conflict detection
- Multi-agent file locks
- Permission system
- Export/import functionality
- SQLite backend with Drizzle ORM

---

[0.9.12]: https://github.com/user/agent-memory/compare/v0.9.11...v0.9.12
[0.9.11]: https://github.com/user/agent-memory/compare/v0.9.4...v0.9.11
[0.9.4]: https://github.com/user/agent-memory/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/user/agent-memory/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/user/agent-memory/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/user/agent-memory/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/user/agent-memory/compare/v0.8.5...v0.9.0
[0.8.5]: https://github.com/user/agent-memory/compare/v0.8.0...v0.8.5
[0.8.0]: https://github.com/user/agent-memory/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/user/agent-memory/releases/tag/v0.7.0

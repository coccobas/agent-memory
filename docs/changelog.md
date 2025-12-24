# Changelog

All notable changes to Agent Memory are documented here.

## [Unreleased]

### Added
- PostgreSQL adapter support for enterprise deployments
- Redis adapters for distributed caching, locking, and events
- `reindex` CLI command for regenerating embeddings
- `review` CLI command for interactive entry review
- Adapter abstraction layer for multi-backend support
- Health check service with reconnection logic
- Transaction retry with exponential backoff

### Changed
- Configuration now uses registry-based system with Zod validation
- Services no longer use singleton patterns (dependency injection)
- Default permissions mode is now "strict" (deny-by-default)

### Fixed
- Path traversal vulnerability in export handler
- Path traversal vulnerability in backup restore
- Migration system now only tolerates missing tables for DROP/ALTER

---

## [0.9.8] - 2024-12

### Changed
- Removed singleton patterns from services
- Improved dependency injection throughout codebase

## [0.9.7] - 2024-12

### Added
- PostgreSQL adapter support (Phase 2)
- Connection pooling configuration

## [0.9.6] - 2024-12

### Added
- Complete dependency injection refactoring
- Embedding queue with retry mechanism
- Backfill service for missing embeddings

### Changed
- Async consistency improvements in query handlers

---

## Version History

For detailed commit history, see [GitHub Releases](https://github.com/anthropics/agent-memory/releases).

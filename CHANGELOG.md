# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.8.5]: https://github.com/user/agent-memory/compare/v0.8.0...v0.8.5
[0.8.0]: https://github.com/user/agent-memory/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/user/agent-memory/releases/tag/v0.7.0

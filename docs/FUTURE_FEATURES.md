# Future Features

> **⚠️ IMPORTANT: AI AGENTS - IGNORE THIS FILE**
> 
> This file contains planned features that are NOT yet implemented. Do NOT reference this file when answering questions about current functionality. Do NOT suggest implementing features from this file unless explicitly asked. This file is for human reference only.

---

## MCP Response Format Optimization

**Status:** Planned (Not Implemented)

**Goal:** Reduce token consumption in MCP tool responses when guidelines are retrieved via `memory_guideline` and `memory_query` by implementing response format options and content summarization.

### Problem

When guidelines are retrieved via MCP tools, the full guideline content is returned including complete `content` fields (can be thousands of tokens), full `rationale`, complete `examples` arrays, and all metadata. This causes excessive token consumption in the agent's context window.

### Solution Overview

Implement response format options (`full`, `compact`, `summary`) that allow callers to request minimal data. Add content summarization, optional field control (rationale, examples, metadata), and smart query result optimization. Target 50-70% token reduction for typical queries while maintaining backward compatibility.

### Key Features

1. **Response Format Options**: `full` (default), `compact` (essential fields only), `summary` (minimal fields)
2. **Content Summarization**: Auto-generate summaries for long content
3. **Optional Field Control**: Include/exclude rationale, examples, metadata
4. **Query Result Optimization**: Auto-format large result sets to compact mode
5. **Database-Level Summaries**: Optional summary field in schema for fast retrieval

### Implementation Phases

1. Response format options in handlers
2. Content summarization service
3. Optional field control
4. Query result optimization
5. Database-level summaries (optional)
6. Response compression utilities
7. Handler parameter updates
8. Performance monitoring

### Success Metrics

- Target: 50-70% token reduction for typical queries
- Compact format: 70-80% reduction vs full
- Summary format: 85-90% reduction vs full
- Backward compatible: Full format remains default

### Files to Modify

- `src/services/response-formatter.service.ts` (NEW)
- `src/mcp/handlers/guidelines.handler.ts`
- `src/mcp/handlers/query.handler.ts`
- `src/mcp/types.ts`
- `src/mcp/server.ts`
- `src/db/repositories/guidelines.ts` (optional)

**See full plan:** `.cursor/plans/optimize_ide_rules_context_window_69c65219.plan.md`


## Database Configuration via Config File

**Status:** Planned (Not Implemented)

**Goal:** Allow database file path and configuration options to be set via environment variables or a configuration file, providing more flexibility for deployment and user preferences.

### Problem

Currently, database configuration is primarily controlled via environment variables (e.g., `AGENT_MEMORY_DB_PATH`). While this works, it would be more user-friendly to also support a configuration file (e.g., JSON, YAML, or TOML) that can be placed in the project directory or user's home directory. This would make it easier to:
- Set up project-specific database locations
- Configure multiple options in one place
- Share configuration with team members
- Have a persistent configuration without managing environment variables

### Solution Overview

Implement a configuration file system that:
1. Supports multiple config file formats (JSON, YAML, TOML)
2. Checks multiple locations (project root, user home, system-wide)
3. Merges configuration from multiple sources (env vars > config file > defaults)
4. Validates configuration options
5. Provides clear error messages for invalid configurations

### Key Features

1. **Config File Support**: Support JSON, YAML, and/or TOML configuration files
2. **Multiple Search Paths**: Check project root, user home directory, system-wide locations
3. **Configuration Merging**: Environment variables override config file, config file overrides defaults
4. **All Options Configurable**: Database path, vector DB path, embedding provider, semantic threshold, cache settings, etc.
5. **Validation**: Validate paths, ranges, and required settings
6. **Documentation**: Clear examples and documentation for configuration options

### Configuration Options to Support

- `database.path` - Database file path
- `database.vectorPath` - Vector database path
- `embedding.provider` - Embedding provider (openai, local, disabled)
- `embedding.openaiApiKey` - OpenAI API key
- `embedding.openaiModel` - OpenAI model name
- `embedding.semanticThreshold` - Default similarity threshold
- `cache.enabled` - Enable query caching
- `performance.logging` - Enable performance logging
- `init.skipAutoInit` - Skip automatic database initialization

### Implementation Phases

1. Create configuration loader service
2. Add config file format parsers (JSON first, then YAML/TOML)
3. Implement search path logic
4. Add configuration merging logic
5. Update connection.ts to use config service
6. Add configuration validation
7. Create example config files
8. Update documentation

### Success Metrics

- All database-related environment variables can be set via config file
- Config file takes precedence over defaults but not over env vars
- Clear error messages for invalid configurations
- Backward compatible: existing env var usage continues to work

### Files to Modify

- `src/utils/config.service.ts` (NEW)
- `src/db/connection.ts`
- `src/db/init.ts`
- `docs/configuration.md` (NEW)
- `examples/config.example.json` (NEW)
- `examples/config.example.yaml` (NEW)




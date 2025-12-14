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


## Differential Versioning

**Status:** Proposed (Not Implemented)

**Goal:** Storage optimization AND clear change visibility for version history.

### Problem

Current append-only versioning stores complete content for every version, even when only small changes are made. This leads to:
- Increased storage usage
- No clear visibility into what changed between versions
- Manual comparison needed for auditing

### Solution Overview

Implement hybrid differential versioning that:
1. Stores full snapshots every N versions (e.g., every 10)
2. Stores only diffs between snapshots
3. Uses JSON Patch (RFC 6902) for structured data
4. Provides clear change history with diffs

### Expected Benefits

- **Storage:** ~60-80% reduction
- **Audit Trail:** Clear diffs showing exactly what changed
- **Read Performance:** Fast for recent versions, reasonable for historical

**See full plan:** [FUTURE_DIFFERENTIAL_VERSIONING.md](./FUTURE_DIFFERENTIAL_VERSIONING.md)


## Unified Data Access Layer

**Status:** Proposed (Not Implemented)

**Goal:** Establish consistent data access patterns by routing all repository access through a unified service layer.

### Problem

Currently, the codebase uses mixed data access patterns:
- MCP handlers sometimes access repositories directly (`toolRepo.create(...)`)
- MCP handlers sometimes go through services (`checkPermission(...)`, `logAction(...)`)
- Services access repositories directly

This inconsistency makes it harder to:
- Add cross-cutting concerns (logging, caching, transactions) uniformly
- Maintain consistent business rules across all data operations
- Test components in isolation
- Refactor data access without touching multiple layers

### Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MCP Handlers                        │
└─────────────────────────────────────────────────────────┘
        │                              │
        │ (Direct access)              │ (Through services)
        ▼                              ▼
┌───────────────┐              ┌───────────────┐
│  Repositories │◄─────────────│   Services    │
└───────────────┘              └───────────────┘
```

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     MCP Handlers                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │   Unified Data Service  │
              │   (facade/coordinator)  │
              └─────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │  toolRepo │    │ guideRepo │    │ knowRepo  │
   └───────────┘    └───────────┘    └───────────┘
```

### Solution Overview

Create a unified `DataService` facade that:
1. Provides single entry point for all data operations
2. Automatically applies cross-cutting concerns (permissions, audit, validation)
3. Handles transactions consistently
4. Enables easier testing through dependency injection

### Key Features

1. **Unified Interface**: Single service for tools, guidelines, knowledge CRUD
2. **Automatic Cross-Cutting**: Permissions, audit logging, validation applied automatically
3. **Transaction Support**: Wrap multi-step operations in transactions
4. **Consistent Error Handling**: Uniform error types and messages
5. **Testability**: Easy to mock for unit testing

### Example API

```typescript
// Before (mixed patterns)
await checkPermission(agentId, scopeType, scopeId, 'write');
const tool = toolRepo.create({ name, description, ... });
await logAction({ operation: 'create', ... });

// After (unified)
const tool = await dataService.tools.create({
  data: { name, description, ... },
  context: { agentId, scopeType, scopeId }
});
// Permissions, audit, validation handled internally
```

### Implementation Phases

1. Create `DataService` facade with tool operations
2. Add guideline and knowledge operations
3. Migrate handlers to use `DataService`
4. Add transaction support
5. Remove direct repository imports from handlers
6. Update tests

### Success Metrics

- All handlers use `DataService` exclusively (no direct repo imports)
- Cross-cutting concerns applied uniformly
- Easier to add new cross-cutting features
- Improved test coverage through mocking
- Backward compatible: existing behavior unchanged

### Files to Modify

- `src/services/data.service.ts` (NEW)
- `src/mcp/handlers/tools.handler.ts`
- `src/mcp/handlers/guidelines.handler.ts`
- `src/mcp/handlers/knowledge.handler.ts`
- All other handlers using direct repository access

### Trade-offs

| Aspect | Consideration |
|--------|---------------|
| **Pros** | Consistency, testability, single place for cross-cutting concerns |
| **Cons** | Additional abstraction layer, slight overhead, more boilerplate |
| **When to implement** | When adding new cross-cutting features becomes painful |

### Priority

**LOW** - Current architecture works well for the project's scale. This becomes more valuable as the codebase grows or when needing to add features that touch all data operations.



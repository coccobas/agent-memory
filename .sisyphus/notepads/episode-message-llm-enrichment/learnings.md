# Episode Message LLM Enrichment - Learnings

## 2026-01-25 Implementation Complete

### Schema Patterns

- Experiences table uses versioned content: `experiences` has metadata, `experienceVersions` has content
- Must join with `experienceVersions` via `currentVersionId` to get scenario/outcome/content
- Knowledge categories are limited to: `decision`, `fact`, `context`, `reference`

### Maintenance Task Patterns

- All LLM tasks follow same structure: check extraction service, query data, call LLM, parse response, update DB
- Use `IExtractionService.generate()` for LLM calls with structured prompts
- Always handle JSON parsing failures gracefully with fallback
- Config should have `enabled: false` by default for LLM tasks (cost control)

### Orchestrator Registration

- Add result type import to orchestrator
- Add task to default tasks array
- Add execution block with progress callback
- Add private runner method
- Update logging to include new task
- Update mergeConfig to include new config

### Testing Patterns

- Mock `IExtractionService` needs `extractForClassification` method
- Use dynamic imports in tests to avoid module loading issues
- Test both "service unavailable" and "happy path" scenarios
- Verify result structure has all expected properties

### Episode Repository

- `list()` takes filter and pagination as separate arguments
- Use `getMessagesByEpisode()` not `getMessagesForEpisode()`

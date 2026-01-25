# MCP Question Elicitation - Learnings

## 2026-01-23

### Config Pattern

- Config sections live in `src/config/registry/sections/` with a standard structure
- Each section exports a `ConfigSectionMeta` with name, description, and options
- Options define envKey, defaultValue, description, schema (zod), and parse type
- Registry index at `src/config/registry/index.ts` imports and registers all sections
- Config interface at `src/config/index.ts` must be updated to include new section types

### Service Pattern

- Services implement an interface (e.g., `IElicitationService`)
- Services are added to `AppContextServices` in `src/core/context.ts`
- Services are typically created via factory functions (e.g., `createElicitationService`)
- Services can have optional dependencies injected via setter methods

### Error Handling Pattern

- Validation errors use `ErrorCodes.MISSING_REQUIRED_FIELD` (E1000)
- `createValidationError` creates errors with field context
- Error messages follow pattern: "Validation error: {field} - {message}"
- `mapError` in `src/utils/error-mapper.ts` normalizes errors for responses

### Tool Runner Integration

- Tool execution happens in `runTool` at `src/mcp/tool-runner.ts`
- Catch block is the right place to intercept validation errors
- Helper functions can be added at module level for specific concerns
- Recursive retry is safe since we limit attempts and check for different errors

### Elicitation Design Decisions

- Allowlist approach for security (only specific fields can be elicited)
- Max 2 retries by default to prevent infinite loops
- Timeout configurable (default 30s) for user response
- Graceful fallback: if elicitation fails, original error is returned
- MCP client is injected via setter to allow testing without real MCP connection

### MCP Server Wiring (2026-01-23)

- MCP SDK provides `server.elicitInput()` for server-to-client elicitation
- Elicitation uses `elicitation/create` request with form-based schema
- ElicitResult has `action: 'accept' | 'decline' | 'cancel'` and `content` object
- Form schema uses `requestedSchema` (not `schema`) with standard JSON Schema format
- Server instance is stored in singleton pattern (like notification service)
- Elicitation client adapter wraps server.elicitInput() to match McpQuestionClient interface
- Service creation happens in `src/core/factory/context-wiring.ts` via dynamic import
- Server wiring happens in `src/mcp/server.ts` after server creation
- MCP client is wired to service via setter method for testability
- Cleanup happens in shutdown handler alongside notification server cleanup

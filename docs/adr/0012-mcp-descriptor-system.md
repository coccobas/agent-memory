# ADR-0012: MCP Descriptor System

## Status

Accepted

## Context

The MCP (Model Context Protocol) server exposes many tools, each requiring:

- Input parameter schema (JSON Schema)
- Handler function
- Description for AI consumption
- Consistent error handling

Hand-coding each tool's schema and handler leads to:

- Boilerplate duplication
- Inconsistent parameter validation
- Divergence between schema and implementation

## Decision

Implement a descriptor-based system for tool definition:

**Tool Descriptors:**
Each tool is defined by a descriptor object:

```typescript
interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (context: AppContext, params: Record<string, unknown>) => Promise<unknown>;
}
```

**Factory Pattern for CRUD Operations:**
`createCrudHandlers()` generates standard handlers:

- `add`: Create new entry
- `update`: Modify existing entry
- `get`: Retrieve by ID or name
- `list`: Query with filters
- `history`: Version history
- `deactivate`: Soft delete
- `delete`: Hard delete
- `bulk_add`, `bulk_update`, `bulk_delete`: Batch operations

**Handler Configuration:**

```typescript
createCrudHandlers<Entry, CreateInput, UpdateInput>({
  entryType: 'guideline',
  getRepo: (context) => context.repos.guidelines,
  responseKey: 'guideline',
  extractAddParams: (params, defaults) => ({ ... }),
  // ...
});
```

## Consequences

**Positive:**

- Consistent behavior across all entry types
- Single source of truth for CRUD operations
- Reduced boilerplate (each entry type is ~50 lines)
- Easy to add new entry types

**Negative:**

- Learning curve for the factory pattern
- Custom operations require breaking out of the pattern
- Debugging through abstraction layers

## References

- Factory: `src/mcp/handlers/factory.ts`
- Descriptors: `src/mcp/descriptors/`
- Tool runner: `src/mcp/tool-runner.ts`
- Entry type configs: `src/mcp/handlers/guideline.ts`, etc.

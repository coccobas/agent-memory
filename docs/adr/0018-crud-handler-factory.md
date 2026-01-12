# ADR-0018: CRUD Handler Factory Pattern

## Status

Accepted

## Context

Agent Memory has three primary entry types (guidelines, knowledge, tools) that share identical CRUD operations:
- add, update, get, list, delete, deactivate
- history (version tracking)
- bulk_add, bulk_update, bulk_delete

Implementing these operations separately for each type resulted in ~400 lines of nearly identical code per type, with only entity-specific validation differing. This led to:
- Code duplication (~1200 lines of redundant code)
- Inconsistent behavior across types (bug fixes applied unevenly)
- Difficult maintenance (changes required in 3+ places)

## Decision

Generate standardized CRUD handlers using a factory pattern. Each entry type provides a configuration object; the factory generates all handlers with consistent behavior.

### Factory Interface

```typescript
interface CrudHandlerConfig<T> {
  entityName: string;                    // 'guideline' | 'knowledge' | 'tool'
  repository: Repository<T>;             // Type-specific repository
  schema: {
    add: ZodSchema;                      // Validation for add action
    update: ZodSchema;                   // Validation for update action
    // ... other action schemas
  };
  transform?: {
    beforeAdd?: (input: unknown) => T;   // Pre-processing hooks
    afterGet?: (entity: T) => unknown;   // Post-processing hooks
  };
}

function createCrudHandlers<T>(config: CrudHandlerConfig<T>): ActionHandlers {
  return {
    add: createAddHandler(config),
    update: createUpdateHandler(config),
    get: createGetHandler(config),
    list: createListHandler(config),
    delete: createDeleteHandler(config),
    deactivate: createDeactivateHandler(config),
    history: createHistoryHandler(config),
    bulk_add: createBulkAddHandler(config),
    bulk_update: createBulkUpdateHandler(config),
    bulk_delete: createBulkDeleteHandler(config),
  };
}
```

### Handler Capabilities

Each generated handler includes:

1. **Input Validation**: Zod schema validation with clear error messages
2. **Permission Checks**: Verify agent has required permissions for scope
3. **Audit Logging**: Record createdBy/updatedBy with timestamps
4. **Error Handling**: Consistent error codes and messages
5. **Scope Resolution**: Handle scope inheritance automatically
6. **Pagination**: Consistent limit/offset handling for list operations
7. **Transactions**: Wrap mutations in database transactions

### Usage Example

```typescript
// src/mcp/handlers/guideline.ts (~50 lines vs ~400 without factory)
export const guidelineHandlers = createCrudHandlers({
  entityName: 'guideline',
  repository: guidelineRepository,
  schema: {
    add: guidelineAddSchema,
    update: guidelineUpdateSchema,
  },
  transform: {
    beforeAdd: (input) => ({
      ...input,
      priority: input.priority ?? 50,  // Default priority
    }),
  },
});
```

### Middleware Injection

The factory supports middleware injection for cross-cutting concerns:

```typescript
createCrudHandlers(config, {
  middleware: [
    permissionMiddleware,      // Check agent permissions
    validationMiddleware,      // Validate input schemas
    auditMiddleware,           // Log all mutations
    rateLimitMiddleware,       // Throttle requests
  ],
});
```

## Consequences

**Positive:**
- ~70% reduction in handler code (1200 → 350 lines)
- Guaranteed consistent behavior across all entry types
- Bug fixes apply to all types automatically
- Adding new entry types requires only configuration
- Middleware changes apply uniformly
- Easier to test (test factory once, trust generated handlers)

**Negative:**
- Factory abstraction adds indirection (harder to trace specific behavior)
- Type-specific edge cases require factory extension points
- Debugging requires understanding factory internals
- Over-abstraction risk if types diverge significantly

## References

- Code locations:
  - `src/mcp/handlers/factory.ts` - Handler factory implementation
  - `src/mcp/handlers/guideline.ts` - Guideline handler config
  - `src/mcp/handlers/knowledge.ts` - Knowledge handler config
  - `src/mcp/handlers/tool.ts` - Tool handler config
- Related ADRs: ADR-0012 (MCP Descriptor System)
- Principles: S6 (Single Responsibility Services), D1 (Action-Based Tools)

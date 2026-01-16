# ADR-0009: Scope Inheritance Model

## Status

Accepted

## Context

Memory entries (guidelines, knowledge, tools) need to be organized hierarchically:

- Some entries apply globally across all projects
- Some entries are organization-specific
- Some entries are project-specific
- Some entries are session-specific (temporary)

When querying for entries, we need to determine which scope levels to include.

## Decision

Implement a four-level scope hierarchy with inheritance:

```
global → org → project → session
```

**Scope Types:**

- `global`: Universal entries, no scopeId required
- `org`: Organization-wide, requires scopeId
- `project`: Project-specific, requires scopeId
- `session`: Temporary/experimental, requires scopeId

**Inheritance Rules:**

1. When `inherit: true` (default), queries include parent scopes
2. Scope priority: More specific scopes override less specific
3. For same-named entries, project beats org beats global
4. `inherit: false` restricts query to exact scope only

**Implementation:**

- `buildScopeConditions()` constructs SQL WHERE clauses
- `buildExactScopeConditions()` for exact match only
- `buildGlobalScopeConditions()` for global fallback lookup

## Consequences

**Positive:**

- Natural hierarchy matches organizational structure
- Inheritance reduces duplication (define once at global, override at project)
- Flexible querying with inherit flag

**Negative:**

- Complexity in query building
- Potential confusion about which scope an entry comes from
- Performance considerations with multi-scope queries

## References

- Code location: `src/db/repositories/entry-utils.ts`
- Schema definition: `src/db/schema.ts` (ScopeType)
- Query handler: `src/mcp/handlers/query/index.ts`

# ADR-0001: ADR Record Template

## Status

Accepted

## Context

We need a standard format for documenting architectural decisions to ensure consistency and discoverability across the codebase.

## Decision

Use the following template for all ADRs:

```markdown
# ADR-NNNN: Title

## Status
Accepted | Deprecated | Superseded by ADR-XXXX

## Context
What is the issue we're addressing?

## Decision
What did we decide?

## Consequences
What are the results (positive and negative)?

## References
- Code locations: `src/path/file.ts:line`
- Related ADRs: ADR-XXXX
```

## Consequences

**Positive:**
- Consistent documentation format
- Easy to find and reference decisions
- Clear traceability from code to rationale

**Negative:**
- Overhead of maintaining documentation
- Risk of ADRs becoming stale

## References

- Michael Nygard's ADR format: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

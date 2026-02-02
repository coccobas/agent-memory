# ADR-0042: Sample Architecture Decision

## Status

Accepted

## Context

We need to document how the sample project handles data persistence. The team has been discussing whether to use a relational database or a document store for storing user preferences.

## Decision

We will use SQLite for local development and PostgreSQL for production. This provides a consistent SQL interface across environments while allowing lightweight development workflows.

## Consequences

**Positive:**

- Consistent query language across all environments
- Easy migration path from development to production
- Strong ACID guarantees for data integrity
- Excellent tooling and community support

**Negative:**

- Requires database schema migrations
- Less flexible schema evolution compared to document stores
- Operational overhead for production database management

## References

- Code locations: `src/db/schema.ts:1-50`
- Related ADRs: ADR-0011 (Drizzle ORM Adoption)

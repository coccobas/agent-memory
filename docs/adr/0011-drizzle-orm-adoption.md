# ADR-0011: Drizzle ORM Adoption

## Status

Accepted

## Context

The application needs a data access layer that provides:
- Type safety for database operations
- Query building without raw SQL strings
- Schema definition in TypeScript
- Support for SQLite (primary) and PostgreSQL (future)

Options considered:
1. **Raw SQL**: Maximum control, no type safety
2. **Prisma**: Full ORM, heavy abstraction, code generation
3. **Drizzle ORM**: Lightweight, TypeScript-native, SQL-like syntax
4. **Kysely**: Query builder, less schema tooling

## Decision

Adopt Drizzle ORM as the data access layer:

**Schema Definition:**
- Define tables in `src/db/schema.ts` using `sqliteTable()`
- Export types (`Guideline`, `NewGuideline`, etc.) for use in repositories
- Use Drizzle Kit for migrations

**Query Patterns:**
```typescript
// Select with conditions
db.select().from(guidelines).where(eq(guidelines.id, id)).get();

// Insert
db.insert(guidelines).values(newGuideline).run();

// Update
db.update(guidelines).set({ isActive: false }).where(eq(guidelines.id, id)).run();
```

**Repository Pattern:**
- Each entity type has a repository factory (e.g., `createGuidelineRepository`)
- Repositories encapsulate all database operations for their entity
- Repositories receive `DatabaseDeps` for dependency injection

## Consequences

**Positive:**
- Full TypeScript type inference from schema
- Lightweight runtime (no heavy ORM overhead)
- SQL-like syntax (easy to reason about generated queries)
- Good migration tooling with Drizzle Kit

**Negative:**
- Less abstraction than full ORMs (more SQL knowledge required)
- Smaller ecosystem than Prisma
- Manual relationship handling in some cases

## References

- Schema: `src/db/schema.ts`
- Repository pattern: `src/db/repositories/*.ts`
- Drizzle config: `drizzle.config.ts`
- Migrations: `src/db/migrations/`

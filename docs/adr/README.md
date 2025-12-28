# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) that document significant architectural decisions made in the Agent Memory project.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](./0001-record-template.md) | ADR Record Template | Accepted | 2024-12 |
| [0007](./0007-transaction-retry-logic.md) | Transaction Retry Logic | Accepted | 2024-12 |
| [0008](./0008-appcontext-requirement.md) | AppContext Requirement | Accepted | 2024-12 |
| [0009](./0009-scope-inheritance-model.md) | Scope Inheritance Model | Accepted | 2024-12 |
| [0010](./0010-permission-deny-by-default.md) | Permission Deny-by-Default | Accepted | 2024-12 |
| [0011](./0011-drizzle-orm-adoption.md) | Drizzle ORM Adoption | Accepted | 2024-12 |
| [0012](./0012-mcp-descriptor-system.md) | MCP Descriptor System | Accepted | 2024-12 |
| [0013](./0013-multi-backend-abstraction.md) | Multi-Backend Abstraction | Accepted | 2024-12 |
| [0014](./0014-embedding-async-pattern.md) | Embedding Async Pattern | Accepted | 2024-12 |

## ADR Numbering

- Numbers 0001-0006 are reserved for future retrospective documentation
- Numbers 0007+ document active decisions in the codebase
- ADR references appear in code comments as `ADR-NNNN`

## ADR Lifecycle

1. **Proposed**: Under discussion
2. **Accepted**: Approved and implemented
3. **Deprecated**: No longer recommended
4. **Superseded**: Replaced by a newer ADR

## Contributing

When making significant architectural decisions:

1. Copy `0001-record-template.md` to a new file with the next available number
2. Fill in all sections
3. Add a reference in this README
4. Reference the ADR in relevant code comments using `// ADR-NNNN`

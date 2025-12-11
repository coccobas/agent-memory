# Cursor Rules for Agent Memory

This directory contains Cursor rules that document how the Agent Memory software works and how we write software.

## Rule Files

### `architecture.mdc` (Always Applied)
**Description**: Agent Memory architecture and how the software works

Covers:
- System overview and design principles
- Technology stack
- Architecture layers (MCP Server, Handlers, Services, Repositories, Database)
- Memory sections (Tools, Guidelines, Knowledge)
- Hierarchical scoping system
- Versioning and conflict resolution
- Query system and semantic search
- Multi-agent coordination
- Error handling
- Performance characteristics
- MDAP support

**When to reference**: Understanding the overall system architecture, how components interact, and design decisions.

### `coding-standards.mdc` (Always Applied)
**Description**: Coding standards and how we write software

Covers:
- TypeScript configuration and strict mode
- Code style (formatting, naming conventions)
- Project structure and file organization
- Design patterns (Repository, Service, Handler)
- Error handling patterns
- Transaction management
- Parameter validation
- Documentation standards (JSDoc)
- Code quality (linting, type checking)
- Testing guidelines
- Version control (commit messages)
- Performance considerations

**When to reference**: Writing new code, refactoring, understanding code style and conventions.

### `patterns.mdc` (Auto-Attached to TypeScript files)
**Description**: Design patterns and conventions used in the codebase

Covers:
- Action-based routing pattern
- Append-only versioning pattern
- Scope inheritance pattern
- Permission check pattern
- Audit logging pattern
- Duplicate detection pattern
- Red flag detection pattern
- Query caching pattern
- Embedding generation pattern
- Type casting pattern

**When to reference**: Implementing new features, understanding existing patterns, maintaining consistency.

### `testing.mdc` (Auto-Attached to test files)
**Description**: Testing guidelines and patterns

Covers:
- Testing framework (Vitest)
- Test structure and organization
- Test helpers and fixtures
- Unit tests (repositories, services)
- Integration tests (handlers, MCP tools)
- Test coverage goals
- Test best practices
- Running and debugging tests

**When to reference**: Writing tests, understanding test patterns, debugging test issues.

## How Cursor Uses These Rules

- **Always Applied**: `architecture.mdc` and `coding-standards.mdc` are always included in context
- **Auto-Attached**: `patterns.mdc` is included when TypeScript files are referenced, `testing.mdc` when test files are referenced
- **Manual**: You can reference specific rules using `@ruleName` in chat

## Quick Reference

### When Writing New Code
1. Check `coding-standards.mdc` for style and conventions
2. Check `patterns.mdc` for applicable design patterns
3. Check `architecture.mdc` for system understanding

### When Adding Tests
1. Check `testing.mdc` for test structure and patterns
2. Check `coding-standards.mdc` for test organization

### When Understanding the System
1. Start with `architecture.mdc` for high-level overview
2. Check `patterns.mdc` for specific implementation patterns
3. Reference `coding-standards.mdc` for code organization

## Updating Rules

When the codebase evolves:
1. Update relevant rule files to reflect changes
2. Keep examples current with actual code
3. Document new patterns as they emerge
4. Update architecture docs when system changes

## Rule Format

Rules use MDC (Markdown with frontmatter) format:

```mdc
---
description: Brief description
globs: ["**/*.ts"]  # Files this rule applies to
alwaysApply: true   # Always include in context
---

# Content

Markdown content here...
```

See [Cursor Rules Documentation](https://docs.cursor.com/context/rules) for more details.









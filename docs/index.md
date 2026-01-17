# Agent Memory Documentation

Agent Memory is the high-speed memory layer for AI agents—persistent, permissioned, and enforceable—so your agents remember the right things, at the right time, without bloating context.

## Choose Your Path

| I want to...             | Start here                                                     |
| ------------------------ | -------------------------------------------------------------- |
| Get running in 2 minutes | [Quickstart](tutorials/quickstart.md)                          |
| Learn the full workflow  | [First Workflow Tutorial](tutorials/first-workflow.md)         |
| Set up my IDE            | [IDE Setup Guide](guides/ide-setup.md)                         |
| Enable semantic search   | [Semantic Search Tutorial](tutorials/semantic-search-setup.md) |
| Deploy with Docker       | [Docker Guide](guides/docker.md)                               |
| Use PostgreSQL           | [PostgreSQL Setup](guides/postgresql-setup.md)                 |
| Scale to multiple nodes  | [Redis Distributed](guides/redis-distributed.md)               |
| Plan for scale           | [Scaling Guide](SCALING.md)                                    |
| Understand the API       | [MCP Tools Reference](reference/mcp-tools.md)                  |

---

## Documentation Structure

This documentation follows the [Diátaxis framework](https://diataxis.fr/):

### [Tutorials](tutorials/) — Learning-oriented

Step-by-step lessons for beginners:

- [Quickstart](tutorials/quickstart.md) — Get running in 2 minutes
- [First Workflow](tutorials/first-workflow.md) — Complete beginner tutorial
- [Semantic Search Setup](tutorials/semantic-search-setup.md) — Enable AI-powered search
- [First Hook](tutorials/first-hook.md) — Add runtime enforcement

### [Guides](guides/) — Goal-oriented

How to accomplish specific tasks:

**Setup**

- [IDE Setup](guides/ide-setup.md) — Claude, Cursor, VS Code configuration
- [Docker Deployment](guides/docker.md) — Container deployment
- [PostgreSQL Setup](guides/postgresql-setup.md) — Enterprise database
- [Redis Distributed](guides/redis-distributed.md) — Multi-node scaling
- [Windows Setup](guides/platform/windows.md) — Windows-specific setup
- [Linux Setup](guides/platform/linux.md) — Linux-specific setup

**Integration**

- [Hooks & Enforcement](guides/hooks.md) — Runtime rule enforcement
- [Rules Sync](guides/rules-sync.md) — Sync guidelines to IDE

**Usage**

- [Workflows](guides/workflows.md) — Common usage patterns
- [Semantic Search](guides/semantic-search.md) — Vector search tuning
- [Examples](guides/examples.md) — Usage examples
- [Performance Tuning](guides/performance.md) — Optimization

**Operations**

- [Scaling Guide](SCALING.md) — Deployment tiers and migration
- [Troubleshooting](guides/troubleshooting.md) — Common issues
- [Security](explanation/security-model.md) — Production security

### [Reference](reference/) — Information-oriented

Precise technical specifications:

- [MCP Tools](reference/mcp-tools.md) — Complete tool reference
- [REST API](reference/rest-api.md) — HTTP API documentation
- [CLI Commands](reference/cli.md) — Command-line interface
- [Environment Variables](reference/environment-variables.md) — Configuration options
- [Error Codes](reference/error-codes.md) — Error reference

### [Explanation](explanation/) — Understanding-oriented

Concepts and design decisions:

- [Architecture](explanation/architecture.md) — System design
- [Data Model](explanation/data-model.md) — Scopes, entry types, versioning
- [Security Model](explanation/security-model.md) — Authentication, permissions
- [Adapter System](explanation/adapter-system.md) — Multi-backend abstraction

---

## Quick Links

| Resource                                             | Description       |
| ---------------------------------------------------- | ----------------- |
| [GitHub](https://github.com/anthropics/agent-memory) | Source code       |
| [Changelog](changelog.md)                            | Release notes     |
| [Contributing](contributing/)                        | How to contribute |

---

## Highlights

- **Hierarchical scopes** with inheritance (global → org → project → session)
- **Three memory types**: guidelines, knowledge, tools
- **Fast search**: Full-text + optional semantic search
- **Multi-backend**: SQLite (default) or PostgreSQL (enterprise)
- **Distributed ready**: Redis for multi-node deployments
- **Governance**: Permissions, audit logs, file locks, verification hooks

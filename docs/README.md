# Agent Memory Documentation

Complete documentation for Agent Memory MCP server.

## Quick Links

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Installation, configuration, first workflow |
| [API Reference](api-reference.md) | MCP tools, REST API, CLI commands |
| [Quickstart](quickstart.md) | Get running in 2 minutes |

---

## Guides

### Setup & Configuration

- [IDE Setup](guides/ide-setup.md) - Claude Desktop, Claude Code, Cursor, VS Code
- [Docker Setup](guides/docker-setup.md) - Container deployment
- [Windows Setup](guides/windows-setup.md) - Windows-specific configuration

### Usage

- [Workflows](guides/workflows.md) - Common usage patterns and workflows
- [Examples](guides/examples.md) - Real-world usage examples
- [Semantic Search](guides/semantic-search.md) - Vector search setup and tuning

### Operations

- [Performance](guides/performance.md) - Performance tuning and optimization
- [Troubleshooting](guides/troubleshooting.md) - Common issues and solutions
- [Testing](guides/testing.md) - Test suite and writing tests

### Integration

- [Rules Sync](guides/rules-sync.md) - Sync IDE rules with memory

---

## Reference

### Core

- [Architecture](architecture.md) - System design and components
- [Data Model](data-model.md) - Entry types, scopes, inheritance
- [Security](security.md) - Security model and best practices

### Configuration

- [Environment Variables](reference/environment-variables.md) - Core configuration
- [Environment Variables (Advanced)](reference/environment-variables-advanced.md) - Advanced tuning
- [Initialization & Migrations](reference/initialization.md) - Database setup

### Advanced

- [Multi-Agent Support](reference/mdap-support.md) - Coordination, voting, file locks
- [Error Codes](reference/error-codes.md) - Error reference

---

## Contributing

- [Contributing Guide](contributing.md) - How to contribute
- [Development Guide](guides/development.md) - Development setup
- [Maintenance Checklist](MAINTENANCE.md) - Release process

---

## Documentation Index

### Root Documentation

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview |
| [quickstart.md](quickstart.md) | 2-minute setup |
| [installation.md](installation.md) | Detailed installation |

### API & Reference

| File | Description |
|------|-------------|
| [api-reference.md](api-reference.md) | Complete API documentation |
| [architecture.md](architecture.md) | System architecture |
| [data-model.md](data-model.md) | Data structures |

### Guide Files

| File | Description |
|------|-------------|
| [workflows.md](guides/workflows.md) | Usage patterns |
| [examples.md](guides/examples.md) | Real-world examples |
| [ide-setup.md](guides/ide-setup.md) | IDE configuration |
| [semantic-search.md](guides/semantic-search.md) | Vector search |
| [performance.md](guides/performance.md) | Performance tuning |
| [troubleshooting.md](guides/troubleshooting.md) | Problem solving |
| [testing.md](guides/testing.md) | Testing guide |
| [docker-setup.md](guides/docker-setup.md) | Docker deployment |
| [windows-setup.md](guides/windows-setup.md) | Windows setup |
| [development.md](guides/development.md) | Development |
| [rules-sync.md](guides/rules-sync.md) | Rules synchronization |

### Reference Files

| File | Description |
|------|-------------|
| [environment-variables.md](reference/environment-variables.md) | Configuration |
| [environment-variables-advanced.md](reference/environment-variables-advanced.md) | Advanced config |
| [mdap-support.md](reference/mdap-support.md) | Multi-agent support |
| [initialization.md](reference/initialization.md) | DB initialization |
| [error-codes.md](reference/error-codes.md) | Error reference |

---

## Document Sources

Documentation is generated from and validated against:

- MCP tools: `src/mcp/server.ts` and handlers
- REST API: `src/restapi/server.ts`
- Configuration: `src/config/index.ts`
- CLI: `src/cli.ts`

If you find a mismatch, please [open an issue](https://github.com/anthropics/agent-memory/issues).

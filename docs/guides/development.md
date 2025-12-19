# Development Guide

Setup for contributing to Agent Memory.

## Prerequisites

- Node.js >= 20
- npm >= 9

## Setup

```bash
git clone https://github.com/anthropics/agent-memory.git
cd agent-memory
npm install    # Install dependencies
npm run build  # Compile TypeScript to dist/
```

## Development Commands

### Run in Development Mode

```bash
npm run dev
```

Starts the MCP server with hot reload using `tsx watch`. Changes to source files automatically restart the server.

### Build

```bash
npm run build      # Build all (MCP + REST)
npm run build:mcp  # Build MCP server only
npm run build:rest # Build REST API only
npm run clean      # Remove dist/, coverage/, .tsbuildinfo
```

### Validate

```bash
npm run validate
```

Runs the full validation suite: lint → format check → typecheck → tests. **Use this before committing.**

### Individual Checks

| Command | What it does |
|:--------|:-------------|
| `npm run lint` | Run ESLint on src/ |
| `npm run lint:fix` | Run ESLint and auto-fix issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without changes |
| `npm run typecheck` | Run TypeScript compiler (no emit) |

### Tests

```bash
npm run test        # Run tests in watch mode
npm run test:run    # Run tests once
npm run test:coverage  # Run with coverage report
```

### Benchmarks

```bash
npm run bench       # Run all benchmarks in watch mode
npm run bench:run   # Run all benchmarks once
npm run bench:query # Query benchmarks only
npm run bench:write # Write benchmarks only
npm run bench:search # Search benchmarks only
```

### Database

```bash
npm run db:generate  # Generate migrations from schema changes
npm run db:migrate   # Apply migrations
npm run db:studio    # Open Drizzle Studio (database GUI)
npm run db:backup    # Backup database to data/backup-{timestamp}.db
npm run db:restore <file>  # Restore from backup file
```

### Documentation

```bash
npm run docs:lint     # Lint markdown (markdownlint + vale)
npm run docs:lint:md  # Lint with markdownlint only
```

Requires vale: `brew install vale` (macOS) or see [vale docs](https://vale.sh/docs/vale-cli/installation/).

### Rules Sync

```bash
npm run sync-rules         # Sync rules to detected IDE
npm run sync-rules:watch   # Watch and auto-sync on changes
```

## Local Data

Development data is stored in `<repo>/data/`. Override with:

```bash
export AGENT_MEMORY_DATA_DIR=~/.agent-memory/data
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point
├── config/             # Configuration loading
├── db/                 # Database schema, migrations, repositories
├── mcp/                # MCP server and tool handlers
├── restapi/            # REST API server
├── services/           # Business logic services
└── utils/              # Shared utilities

tests/
├── unit/               # Unit tests
├── integration/        # Integration tests
└── benchmarks/         # Performance benchmarks
```

## Debugging

Enable debug logging:

```bash
AGENT_MEMORY_LOG_LEVEL=debug npm run dev
```

Log levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`

## CI Workflow

The CI runs:

```bash
npm run ci:test
```

Which executes: restore migrations → build → lint → format check → typecheck → tests

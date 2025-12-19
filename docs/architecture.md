# Architecture

Agent Memory is a structured memory backend for AI agents. It exposes a Model Context Protocol (MCP) interface and an optional REST API.

## Components

- **MCP Server** (`src/mcp/*`)
  - JSON-RPC over stdio.
  - Tools for querying, writing, and managing memory entries.

- **REST API** (`src/restapi/*`)
  - HTTP wrapper for read-only access (`/v1/query`, `/v1/context`).
  - Requires API key auth.

- **Database Layer** (`src/db/*`)
  - SQLite (better-sqlite3) for core data.
  - Drizzle ORM for schema and migrations.

- **Vector Store** (`@lancedb/lancedb`)
  - Optional semantic search embeddings stored in LanceDB.

- **Services** (`src/services/*`)
  - Business logic: permissions, queries, extraction, backups, etc.

## Data Flow (MCP)

1. Client sends a tool request via MCP.
2. Request is validated and permissions are checked.
3. Service layer executes query or mutation.
4. Results are returned to the client with timestamps normalized.

## Data Flow (REST)

1. Client calls `/v1/query` or `/v1/context` with API key.
2. Permission checks are enforced using `agentId`.
3. Results are returned as JSON.

## Reliability & Safety

- Write operations are versioned.
- Conflict detection and audit logging are built-in.
- Rate limiting is enabled by default.

# REST API Reference

HTTP API for programmatic access to Agent Memory.

## Overview

The REST API provides HTTP endpoints for querying and managing memory entries. It's ideal for:

- Non-MCP integrations
- Custom applications
- Backend services
- Testing and debugging

---

## Enabling REST API

REST is **disabled by default**. Enable with environment variables:

```bash
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret-key
agent-memory rest
```

Or run alongside MCP:

```bash
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secret-key
agent-memory both
```

---

## Configuration

| Variable                          | Default     | Description                               |
| --------------------------------- | ----------- | ----------------------------------------- |
| `AGENT_MEMORY_REST_ENABLED`       | `false`     | Enable REST API server                    |
| `AGENT_MEMORY_REST_HOST`          | `127.0.0.1` | Server bind address                       |
| `AGENT_MEMORY_REST_PORT`          | `8787`      | Server port                               |
| `AGENT_MEMORY_REST_API_KEY`       | —           | Single API key for authentication         |
| `AGENT_MEMORY_REST_API_KEYS`      | —           | Multiple keys (JSON or CSV `key:agentId`) |
| `AGENT_MEMORY_REST_AGENT_ID`      | `rest-api`  | Default agent ID for requests             |
| `AGENT_MEMORY_REST_AUTH_DISABLED` | `false`     | Disable auth (not recommended)            |

---

## Authentication

Include in every request (except `/health`):

**Header Options:**

- `Authorization: Bearer <API_KEY>`
- `X-API-Key: <API_KEY>`

**Example:**

```bash
curl http://127.0.0.1:8787/v1/context \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"scopeType": "global"}'
```

---

## Endpoints

### GET /health

Health check endpoint. **No authentication required.**

```bash
curl http://127.0.0.1:8787/health
```

**Response:**

```json
{
  "ok": true,
  "uptimeSec": 3600
}
```

---

### GET /metrics

Prometheus-compatible metrics endpoint. **No authentication required.**

```bash
curl http://127.0.0.1:8787/metrics
```

Returns metrics in Prometheus format for monitoring.

---

### GET /v1/openapi.json

OpenAPI 3.0 specification for the REST API. **No authentication required.**

```bash
curl http://127.0.0.1:8787/v1/openapi.json
```

Use this to generate client SDKs or import into API tools like Postman.

---

### GET /v1/tools

List all available MCP tools and their schemas.

```bash
curl http://127.0.0.1:8787/v1/tools \
  -H "Authorization: Bearer your-secret-key"
```

**Response:**

```json
{
  "tools": [
    {
      "name": "memory_query",
      "description": "Query and aggregate memory...",
      "inputSchema": {...}
    }
  ]
}
```

---

### POST /v1/tools/:tool

Execute any MCP tool via REST. This provides full access to all Agent Memory functionality.

**Request:**

```bash
curl -X POST http://127.0.0.1:8787/v1/tools/memory_guideline \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "scopeType": "project",
    "scopeId": "proj-123",
    "name": "no-console-log",
    "content": "Never use console.log in production"
  }'
```

**Parameters:**

The request body matches the MCP tool's input schema. See [MCP Tools Reference](mcp-tools.md) for each tool's parameters.

**Example - Create a project:**

```bash
curl -X POST http://127.0.0.1:8787/v1/tools/memory_project \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "name": "my-api",
    "rootPath": "/path/to/project"
  }'
```

**Example - Start a session:**

```bash
curl -X POST http://127.0.0.1:8787/v1/tools/memory_session \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "projectId": "proj-123",
    "name": "Add authentication",
    "agentId": "my-agent"
  }'
```

---

### POST /v1/query

Search memory entries with filters.

**Request:**

```bash
curl -X POST http://127.0.0.1:8787/v1/query \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "types": ["guidelines", "knowledge"],
    "scope": {
      "type": "project",
      "id": "proj-def456",
      "inherit": true
    },
    "search": "authentication",
    "semanticSearch": true,
    "semanticThreshold": 0.7,
    "limit": 20
  }'
```

**Parameters:**

| Parameter           | Type    | Description                                        |
| ------------------- | ------- | -------------------------------------------------- |
| `agentId`           | string  | Agent identifier for audit                         |
| `types`             | array   | Entry types: `tools`, `guidelines`, `knowledge`    |
| `scope.type`        | string  | Scope level: `global`, `org`, `project`, `session` |
| `scope.id`          | string  | Scope ID (required for non-global)                 |
| `scope.inherit`     | boolean | Include parent scopes                              |
| `search`            | string  | Free-text search query                             |
| `semanticSearch`    | boolean | Enable semantic/vector search                      |
| `semanticThreshold` | number  | Similarity threshold (0-1)                         |
| `limit`             | number  | Max results (default: 20)                          |
| `offset`            | number  | Skip N results                                     |

**Response:**

```json
{
  "results": {
    "tools": [...],
    "guidelines": [...],
    "knowledge": [...]
  },
  "meta": {
    "total": 15,
    "limit": 20,
    "offset": 0
  }
}
```

---

### POST /v1/context

Get aggregated context for a scope. Equivalent to `memory_query` action `context`.

**Request:**

```bash
curl -X POST http://127.0.0.1:8787/v1/context \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-app",
    "scopeType": "project",
    "scopeId": "proj-def456",
    "inherit": true,
    "compact": false,
    "limitPerType": 50
  }'
```

**Parameters:**

| Parameter      | Type    | Description                           |
| -------------- | ------- | ------------------------------------- |
| `agentId`      | string  | Agent identifier                      |
| `scopeType`    | string  | Scope level                           |
| `scopeId`      | string  | Scope ID                              |
| `inherit`      | boolean | Include parent scopes (default: true) |
| `compact`      | boolean | Return compact results                |
| `limitPerType` | number  | Max entries per type                  |

**Response:**

```json
{
  "scope": {
    "type": "project",
    "id": "proj-def456"
  },
  "tools": [...],
  "guidelines": [...],
  "knowledge": [...],
  "meta": {
    "counts": {
      "tools": 5,
      "guidelines": 12,
      "knowledge": 8
    }
  }
}
```

---

## Error Responses

Errors return a JSON payload with an error message:

```json
{
  "error": "Unauthorized"
}
```

### HTTP Status Codes

| Status | Meaning                    |
| ------ | -------------------------- |
| 200    | Success                    |
| 400    | Invalid request parameters |
| 401    | Missing or invalid API key |
| 403    | Insufficient permissions   |
| 429    | Rate limited               |
| 500    | Server error               |

### Rate Limiting

The REST API enforces rate limits. When exceeded:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

---

## Multiple API Keys

For multi-tenant setups, configure multiple API keys:

**JSON format:**

```bash
AGENT_MEMORY_REST_API_KEYS='[{"key":"key1","agentId":"app-a"},{"key":"key2","agentId":"app-b"}]'
```

**CSV format:**

```bash
AGENT_MEMORY_REST_API_KEYS='key1:app-a,key2:app-b'
```

Each key is associated with an `agentId` for audit trails.

---

## CORS

For browser-based clients, configure CORS headers:

```bash
AGENT_MEMORY_REST_CORS_ORIGIN=https://your-app.com
```

---

## Examples

### Python Client

```python
import requests

API_URL = "http://127.0.0.1:8787"
API_KEY = "your-secret-key"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Get project context
response = requests.post(
    f"{API_URL}/v1/context",
    headers=headers,
    json={
        "scopeType": "project",
        "scopeId": "proj-123",
        "inherit": True
    }
)
context = response.json()
```

### JavaScript/Node.js

```javascript
const API_URL = 'http://127.0.0.1:8787';
const API_KEY = 'your-secret-key';

async function searchMemory(query) {
  const response = await fetch(`${API_URL}/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      search: query,
      types: ['guidelines', 'knowledge'],
      scope: { type: 'global', inherit: true },
    }),
  });
  return response.json();
}
```

---

## See Also

- [MCP Tools](mcp-tools.md) - MCP tool reference
- [CLI Reference](cli.md) - Command-line interface
- [Environment Variables](environment-variables.md) - All configuration options

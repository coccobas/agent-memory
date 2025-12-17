# Environment Variables

Complete reference for Agent Memory environment variables. For a copy/paste template, see `.env.example`.

## Quick Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `data/memory.db` | SQLite database file path (resolved from project root) |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `data/vectors.lance` | LanceDB vector database path (resolved from project root) |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `auto` | Embedding provider (`openai` if API key set, otherwise `local`) |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | OpenAI API key |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum semantic similarity |
| `AGENT_MEMORY_PERF` | `0` | Enable performance logging |
| `AGENT_MEMORY_DEBUG` | `0` | Enable debug mode |
| `AGENT_MEMORY_QUERY_CACHE_SIZE` | `200` | Query cache max entries (set to `0` to disable caching) |
| `AGENT_MEMORY_QUERY_CACHE_TTL_MS` | `300000` | Query cache TTL (ms) |
| `AGENT_MEMORY_SKIP_INIT` | `0` | Skip auto-initialization |

---

## Database Configuration

### AGENT_MEMORY_DB_PATH

Path to the SQLite database file.

- **Default:** `data/memory.db` (relative to the Agent Memory project root; for npm installs this is the `agent-memory` module directory)
- **Type:** File path (absolute or relative)
- **Supports:** `~` expansion on Unix/macOS (`$HOME`) and Windows (`%USERPROFILE%`)

**Example:**
```bash
# Unix/Linux/macOS
export AGENT_MEMORY_DB_PATH=/var/lib/agent-memory/memory.db

# Windows PowerShell
$env:AGENT_MEMORY_DB_PATH = "C:\data\agent-memory\memory.db"
```

**Notes:**
- Directory is created automatically if it doesn't exist
- Use absolute paths for production deployments
- Database uses WAL mode for better concurrency
- If you run from multiple IDEs (Cursor/Claude Code/Docker), prefer a shared absolute path (example: `~/.agent-memory/memory.db`)

---

### AGENT_MEMORY_VECTOR_DB_PATH

Path to the LanceDB vector database directory.

- **Default:** `data/vectors.lance` (relative to the Agent Memory project root; for npm installs this is the `agent-memory` module directory)
- **Type:** Directory path
- **Supports:** `~` expansion on Unix/macOS (`$HOME`) and Windows (`%USERPROFILE%`)

**Example:**
```bash
export AGENT_MEMORY_VECTOR_DB_PATH=/var/lib/agent-memory/vectors.lance
```

**Notes:**
- Used for semantic search embeddings
- Created automatically on first embedding generation

---

## Embedding Configuration

### AGENT_MEMORY_EMBEDDING_PROVIDER

Specifies which embedding provider to use for semantic search.

- **Default:** `auto` (OpenAI if `AGENT_MEMORY_OPENAI_API_KEY` is set, otherwise `local`)
- **Values:** `openai`, `local`, `disabled` (or leave unset for auto)

| Value | Description |
|-------|-------------|
| `openai` | Use OpenAI embeddings (requires API key) |
| `local` | Use local Xenova transformers (no API key needed) |
| `disabled` | Disable semantic search entirely |

**Example:**
```bash
# Use local embeddings (no API key required)
export AGENT_MEMORY_EMBEDDING_PROVIDER=local

# Disable semantic search
export AGENT_MEMORY_EMBEDDING_PROVIDER=disabled
```

---

### AGENT_MEMORY_OPENAI_API_KEY

OpenAI API key for embedding generation.

- **Required:** Only when `AGENT_MEMORY_EMBEDDING_PROVIDER=openai`
- **Type:** API key string

**Example:**
```bash
export AGENT_MEMORY_OPENAI_API_KEY=sk-...
```

**Security:**
- Never commit this value to version control
- Use secret management in production
- Consider using `local` provider to avoid API key requirements

---

### AGENT_MEMORY_OPENAI_MODEL

OpenAI embedding model to use.

- **Default:** `text-embedding-3-small`
- **Type:** Model name string

**Available Models:**
- `text-embedding-3-small` - Fast, cost-effective (default)
- `text-embedding-3-large` - Higher quality, higher cost
- `text-embedding-ada-002` - Legacy model

**Example:**
```bash
export AGENT_MEMORY_OPENAI_MODEL=text-embedding-3-large
```

---

### AGENT_MEMORY_SEMANTIC_THRESHOLD

Minimum similarity score for semantic search results.

- **Default:** `0.7`
- **Type:** Float between 0 and 1
- **Higher values:** More relevant but fewer results
- **Lower values:** More results but less relevant

**Example:**
```bash
# More strict matching
export AGENT_MEMORY_SEMANTIC_THRESHOLD=0.85

# More lenient matching
export AGENT_MEMORY_SEMANTIC_THRESHOLD=0.5
```

---

## Performance Configuration

### AGENT_MEMORY_PERF

Enable performance logging for debugging and optimization.

- **Default:** `0` (disabled)
- **Enable:** Set to `1`

**Example:**
```bash
export AGENT_MEMORY_PERF=1
```

**Output Format:**
```
[agent-memory] memory_query scope=project types=tools,guidelines results=15/42 durationMs=8
```

**Logged Information:**
- Query type and parameters
- Result counts
- Execution duration in milliseconds
- Cache hits/misses

---

### AGENT_MEMORY_DEBUG

Enable debug mode for verbose logging.

- **Default:** `0` (disabled)
- **Enable:** Set to `1`

**Example:**
```bash
export AGENT_MEMORY_DEBUG=1
```

**Notes:**
- Produces significantly more log output
- Use only during development or troubleshooting
- May impact performance

---

## Cache Configuration

Agent Memory maintains an in-memory query cache. Caching applies per-scope (cache keys include scope type + scope id).

### AGENT_MEMORY_QUERY_CACHE_SIZE

Maximum number of cached query results.

- **Default:** `200`
- **Disable caching:** Set to `0`

```bash
export AGENT_MEMORY_QUERY_CACHE_SIZE=0
```

### AGENT_MEMORY_QUERY_CACHE_TTL_MS

Time-to-live for cached query results (milliseconds).

- **Default:** `300000` (5 minutes)

```bash
export AGENT_MEMORY_QUERY_CACHE_TTL_MS=60000
```

---

## Advanced Configuration

These variables provide finer control over caching, rate limiting, retries, and validation. Defaults shown here match the runtime configuration.

### Vector Similarity

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DISTANCE_METRIC` | `cosine` | Vector distance metric (`cosine`, `l2`, `dot`) |

### Cache Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CACHE_LIMIT_MB` | `100` | Total cache memory budget (MB) |
| `AGENT_MEMORY_SCOPE_CACHE_TTL_MS` | `600000` | Scope chain cache TTL (ms) |
| `AGENT_MEMORY_MAX_PREPARED_STATEMENTS` | `100` | Prepared statement cache size |
| `AGENT_MEMORY_QUERY_CACHE_MEMORY_MB` | `50` | Query cache memory cap (MB) |
| `AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD` | `0.8` | Eviction starts above this fraction of the memory budget |
| `AGENT_MEMORY_CACHE_EVICTION_TARGET` | `0.8` | Eviction continues until below this fraction |

### Memory Coordinator

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD` | `0.85` | Proactive eviction threshold (fraction of heap) |
| `AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS` | `30000` | Memory coordinator check interval (ms) |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RATE_LIMIT` | `1` | Set to `0` to disable all rate limiting |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX` | `100` | Per-agent max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS` | `60000` | Per-agent window (ms) |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX` | `1000` | Global max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS` | `60000` | Global window (ms) |
| `AGENT_MEMORY_RATE_LIMIT_BURST_MAX` | `20` | Burst max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS` | `1000` | Burst window (ms) |

### Semantic Search Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT` | `0.7` | Hybrid scoring weight for semantic similarity |
| `AGENT_MEMORY_DUPLICATE_THRESHOLD` | `0.8` | Duplicate-detection similarity threshold |

### Validation Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_NAME_MAX_LENGTH` | `500` | Max characters |
| `AGENT_MEMORY_TITLE_MAX_LENGTH` | `1000` | Max characters |
| `AGENT_MEMORY_DESCRIPTION_MAX_LENGTH` | `10000` | Max characters |
| `AGENT_MEMORY_CONTENT_MAX_LENGTH` | `100000` | Max characters |
| `AGENT_MEMORY_RATIONALE_MAX_LENGTH` | `5000` | Max characters |
| `AGENT_MEMORY_METADATA_MAX_BYTES` | `50000` | Max JSON bytes |
| `AGENT_MEMORY_PARAMETERS_MAX_BYTES` | `50000` | Max JSON bytes |
| `AGENT_MEMORY_EXAMPLES_MAX_BYTES` | `100000` | Max JSON bytes |
| `AGENT_MEMORY_TAGS_MAX_COUNT` | `50` | Max tags per entry |
| `AGENT_MEMORY_EXAMPLES_MAX_COUNT` | `20` | Max examples per tool/guideline |
| `AGENT_MEMORY_BULK_OPERATION_MAX` | `100` | Max items per bulk request |

### Pagination Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DEFAULT_QUERY_LIMIT` | `20` | Default result limit |
| `AGENT_MEMORY_MAX_QUERY_LIMIT` | `100` | Maximum allowed limit |

### Health & Reconnection

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval (ms) |
| `AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS` | `3` | Max reconnection attempts |
| `AGENT_MEMORY_RECONNECT_BASE_DELAY_MS` | `1000` | Reconnect base delay (ms) |
| `AGENT_MEMORY_RECONNECT_MAX_DELAY_MS` | `5000` | Reconnect max delay (ms) |

### Retry Behavior

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RETRY_MAX_ATTEMPTS` | `3` | Max retries |
| `AGENT_MEMORY_RETRY_INITIAL_DELAY_MS` | `100` | Initial delay (ms) |
| `AGENT_MEMORY_RETRY_MAX_DELAY_MS` | `5000` | Max delay (ms) |
| `AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |

### Conflict Detection

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CONFLICT_WINDOW_MS` | `5000` | Conflict window (ms) |
| `AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD` | `0.7` | High correlation threshold |

### Logging / Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `NODE_ENV` | - | Environment name (`development`, `production`, etc.) |

## Initialization Configuration

### AGENT_MEMORY_SKIP_INIT

Skip automatic database initialization on startup.

- **Default:** `0` (auto-init runs)
- **Enable:** Set to `1`

**Example:**
```bash
export AGENT_MEMORY_SKIP_INIT=1
```

**Use Cases:**
- Running against a pre-initialized database
- Custom initialization workflows
- Testing scenarios
- CI/CD pipelines with separate init step

---

## Setting Environment Variables

### Unix/Linux/macOS

**Temporary (current session):**
```bash
export AGENT_MEMORY_DB_PATH=/custom/path/memory.db
```

**Permanent (add to ~/.bashrc or ~/.zshrc):**
```bash
echo 'export AGENT_MEMORY_DB_PATH=/custom/path/memory.db' >> ~/.bashrc
source ~/.bashrc
```

### Windows PowerShell

**Temporary (current session):**
```powershell
$env:AGENT_MEMORY_DB_PATH = "C:\data\memory.db"
```

**Permanent (user level):**
```powershell
[Environment]::SetEnvironmentVariable("AGENT_MEMORY_DB_PATH", "C:\data\memory.db", "User")
```

### Windows Command Prompt

**Temporary (current session):**
```cmd
set AGENT_MEMORY_DB_PATH=C:\data\memory.db
```

### Docker

```dockerfile
ENV AGENT_MEMORY_DB_PATH=/data/memory.db
ENV AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance
ENV AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

Or via docker-compose:

```yaml
services:
  agent-memory:
    volumes:
      - ./data:/data
    environment:
      - AGENT_MEMORY_DB_PATH=/data/memory.db
      - AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance
      - AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

**Tip:** Avoid `~` in `docker-compose.yml` volume paths (Compose may not expand it). Use an absolute path or `${HOME}`.

---

## Configuration for Common Scenarios

### Development Setup

```bash
export AGENT_MEMORY_PERF=1
export AGENT_MEMORY_DEBUG=1
export AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

### Production Setup

```bash
export AGENT_MEMORY_DB_PATH=/var/lib/agent-memory/memory.db
export AGENT_MEMORY_VECTOR_DB_PATH=/var/lib/agent-memory/vectors.lance
export AGENT_MEMORY_EMBEDDING_PROVIDER=openai
export AGENT_MEMORY_OPENAI_API_KEY=sk-...
export AGENT_MEMORY_SEMANTIC_THRESHOLD=0.8
```

### Minimal Setup (No Semantic Search)

```bash
export AGENT_MEMORY_EMBEDDING_PROVIDER=disabled
```

### CI/CD Testing

```bash
export AGENT_MEMORY_DB_PATH=:memory:
export AGENT_MEMORY_SKIP_INIT=1
export AGENT_MEMORY_EMBEDDING_PROVIDER=disabled
export AGENT_MEMORY_QUERY_CACHE_SIZE=0
```

---

## See Also

- [Getting Started](../getting-started.md) - Initial setup guide
- [Development Guide](../guides/development.md) - Development setup
- [Windows Setup](../guides/windows-setup.md) - Windows-specific configuration
- [Architecture](../architecture.md) - System design details

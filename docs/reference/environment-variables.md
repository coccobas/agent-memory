# Environment Variables

Complete reference for Agent Memory environment variables. For a copy/paste template, see `.env.example`.

Most users only need:
- `AGENT_MEMORY_DB_PATH` (set a stable absolute path if you use multiple IDEs/install methods)
- `AGENT_MEMORY_EMBEDDING_PROVIDER` + `AGENT_MEMORY_OPENAI_API_KEY` (if using OpenAI embeddings)
- `AGENT_MEMORY_QUERY_CACHE_SIZE` (set to `0` to disable caching)

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

<details>
<summary><strong>Database Configuration</strong></summary>

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

> **Docker Note:** This variable is **ignored** when running in Docker. The container hardcodes the path to `/data/memory.db` internally. Control the host location via the volume mount (`-v ~/.agent-memory:/data`). See the [Docker Setup Guide](../guides/docker-setup.md) for details.

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

> **Docker Note:** This variable is **ignored** when running in Docker. The container hardcodes the path to `/data/vectors.lance` internally. Control the host location via the volume mount (`-v ~/.agent-memory:/data`). See the [Docker Setup Guide](../guides/docker-setup.md) for details.

</details>

<details>
<summary><strong>Embedding Configuration</strong></summary>

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

</details>

<details>
<summary><strong>Performance & Debug Logging</strong></summary>

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

</details>

<details>
<summary><strong>Cache Configuration</strong></summary>

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

</details>

## Advanced Configuration

For rate limiting, retries, validation limits, memory pressure tuning, and the rest of the knobs, see [Advanced Environment Variables](./environment-variables-advanced.md).

<details>
<summary><strong>Initialization</strong></summary>

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

</details>

<details>
<summary><strong>Examples</strong></summary>

### Unix/macOS

```bash
export AGENT_MEMORY_DB_PATH=~/.agent-memory/memory.db
export AGENT_MEMORY_VECTOR_DB_PATH=~/.agent-memory/vectors.lance
export AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

### Windows (PowerShell)

```powershell
$env:AGENT_MEMORY_DB_PATH = "$HOME\\.agent-memory\\memory.db"
$env:AGENT_MEMORY_VECTOR_DB_PATH = "$HOME\\.agent-memory\\vectors.lance"
$env:AGENT_MEMORY_EMBEDDING_PROVIDER = "local"
```

### Docker (bind mount)

Mount a host folder to `/data` and point the server to `/data/*`:

```yaml
services:
  agent-memory:
    volumes:
      - ${HOME}/.agent-memory:/data
    environment:
      - AGENT_MEMORY_DB_PATH=/data/memory.db
      - AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance
```

Avoid `~` in `docker-compose.yml` volume paths (Compose may not expand it).

---

</details>

<details>
<summary><strong>Common Scenarios</strong></summary>

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

</details>

## See Also

- [Getting Started](../getting-started.md) - Initial setup guide
- [Docker Setup](../guides/docker-setup.md) - Docker installation and configuration
- [Development Guide](../guides/development.md) - Development setup
- [Windows Setup](../guides/windows-setup.md) - Windows-specific configuration
- [Architecture](../architecture.md) - System design details

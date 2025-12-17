# Environment Variables

Complete reference for all Agent Memory environment variables.

## Quick Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `data/memory.db` | SQLite database file path |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `data/vectors.lance` | LanceDB vector database path |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `openai` | Embedding provider |
| `AGENT_MEMORY_OPENAI_API_KEY` | - | OpenAI API key |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum semantic similarity |
| `AGENT_MEMORY_PERF` | - | Enable performance logging |
| `AGENT_MEMORY_DEBUG` | - | Enable debug mode |
| `AGENT_MEMORY_CACHE` | `1` | Enable query caching |
| `AGENT_MEMORY_SKIP_INIT` | - | Skip auto-initialization |

---

## Database Configuration

### AGENT_MEMORY_DB_PATH

Path to the SQLite database file.

- **Default:** `data/memory.db` (relative to working directory)
- **Type:** File path (absolute or relative)

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

---

### AGENT_MEMORY_VECTOR_DB_PATH

Path to the LanceDB vector database directory.

- **Default:** `data/vectors.lance` (relative to working directory)
- **Type:** Directory path

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

- **Default:** `openai`
- **Values:** `openai`, `local`, `disabled`

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

- **Default:** Disabled
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

- **Default:** Disabled
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

### AGENT_MEMORY_CACHE

Enable or disable query caching.

- **Default:** `1` (enabled)
- **Disable:** Set to `0`

**Example:**
```bash
# Disable caching (useful for debugging)
export AGENT_MEMORY_CACHE=0
```

**Cache Details:**
- Global scope queries are cached (5-minute TTL)
- Cache is automatically invalidated on writes
- LRU eviction when cache fills

---

## Initialization Configuration

### AGENT_MEMORY_SKIP_INIT

Skip automatic database initialization on startup.

- **Default:** Disabled (auto-init runs)
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
ENV AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

Or via docker-compose:

```yaml
services:
  agent-memory:
    environment:
      - AGENT_MEMORY_DB_PATH=/data/memory.db
      - AGENT_MEMORY_EMBEDDING_PROVIDER=local
```

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
export AGENT_MEMORY_CACHE=0
```

---

## See Also

- [Getting Started](../getting-started.md) - Initial setup guide
- [Development Guide](../guides/development.md) - Development setup
- [Windows Setup](../guides/windows-setup.md) - Windows-specific configuration
- [Architecture](../architecture.md) - System design details

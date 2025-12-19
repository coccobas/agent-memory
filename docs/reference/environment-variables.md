# Environment Variables (Core)

This is the core configuration you are most likely to change. For tuning and advanced settings, see `docs/reference/environment-variables-advanced.md`.

## Runtime

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_MODE` | `mcp` | Server mode: `mcp`, `rest`, or `both` (CLI arg overrides). |
| `NODE_ENV` | `development` | Node environment. |
| `LOG_LEVEL` | `info` | Logging level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). |
| `AGENT_MEMORY_DEBUG` | `false` | Enables debug logging and diagnostics. |
| `AGENT_MEMORY_PERF` | `false` | Enables performance logging. |

## Paths

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_DATA_DIR` | (see below) | Base data directory for DB, vector DB, exports, backups, logs. |
| `AGENT_MEMORY_DB_PATH` | `<dataDir>/memory.db` | SQLite database path. |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `<dataDir>/vectors.lance` | Vector database path. |
| `AGENT_MEMORY_BACKUP_PATH` | `<dataDir>/backups` | Backup directory path. |
| `AGENT_MEMORY_EXPORT_PATH` | `<dataDir>/exports` | Export directory path. |
| `AGENT_MEMORY_LOG_PATH` | `<dataDir>/logs` | Log directory path. |

**Data dir default**:

- When installed under `node_modules`: `~/.agent-memory/data`
- When running from source: `<repo>/data`

## REST API

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_REST_ENABLED` | `false` | Enables REST API when `true`. |
| `AGENT_MEMORY_REST_HOST` | `127.0.0.1` | REST bind address. |
| `AGENT_MEMORY_REST_PORT` | `8787` | REST port. |
| `AGENT_MEMORY_REST_API_KEY` | (none) | Required for REST unless auth is disabled. |
| `AGENT_MEMORY_REST_AUTH_DISABLED` | `false` | If `true`, disables REST auth (local/dev only). |

## Permissions

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_PERMISSIONS_MODE` | `strict` | Use `permissive` to allow access when no permissions exist. |

## Embeddings (semantic search)

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `auto` | `openai`, `local`, or `disabled`. `auto` picks OpenAI if key is set, otherwise local. |
| `AGENT_MEMORY_OPENAI_API_KEY` | (none) | OpenAI API key (embeddings). |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | Embedding model name. |
| `AGENT_MEMORY_DISTANCE_METRIC` | `cosine` | Vector distance metric: `cosine`, `l2`, `dot`. |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum similarity threshold. |

## Extraction (LLM-assisted capture)

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_EXTRACTION_PROVIDER` | `auto` | `openai`, `anthropic`, `ollama`, `disabled`, or auto. |
| `AGENT_MEMORY_EXTRACTION_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI extraction model. |
| `AGENT_MEMORY_EXTRACTION_ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic extraction model. |
| `AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL` | (none) | Override OpenAI base URL (LocalAI/LM Studio). |
| `AGENT_MEMORY_ANTHROPIC_API_KEY` | (none) | Anthropic API key. |
| `AGENT_MEMORY_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama base URL. |
| `AGENT_MEMORY_OLLAMA_MODEL` | `llama3.2` | Ollama model. |
| `AGENT_MEMORY_EXTRACTION_MAX_TOKENS` | `4096` | Max tokens for extraction. |
| `AGENT_MEMORY_EXTRACTION_TEMPERATURE` | `0.2` | Sampling temperature. |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD` | `0.7` | Global confidence threshold. |

## Database Initialization

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_SKIP_INIT` | `false` | If `true`, skips automatic DB init/migrations. |
| `AGENT_MEMORY_DEV_MODE` | `false` | Enables dev-oriented behaviors. |
| `AGENT_MEMORY_AUTO_FIX_CHECKSUMS` | `false` | Auto-fix migration checksums (dev use). |

# Environment Variables Reference

This document lists all environment variables supported by Agent Memory.

<!-- AUTO-GENERATED:ENV-VARS-START -->

### General

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_TYPE` | `sqlite` | Database backend: sqlite (default) or postgresql (enterprise). |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DB_PATH` | `memory.db` | Path to SQLite database file. Supports ~ expansion. Relative paths resolved from AGENT_MEMORY_DATA_DIR. |
| `AGENT_MEMORY_SKIP_INIT` | `false` | Skip database initialization on startup. Useful for read-only deployments. |
| `AGENT_MEMORY_PERF` | `false` | Enable verbose database logging for performance analysis. |
| `AGENT_MEMORY_DEV_MODE` | `false` | Enable development mode with relaxed validation and auto-checksum fixes. |
| `AGENT_MEMORY_AUTO_FIX_CHECKSUMS` | `false` | Automatically fix checksum mismatches. Defaults to devMode value. |
| `AGENT_MEMORY_DB_BUSY_TIMEOUT_MS` | `5000` | SQLite busy timeout in milliseconds. How long to wait for locks. |

### Postgresql

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_PG_HOST` | `localhost` | PostgreSQL server hostname. |
| `AGENT_MEMORY_PG_PORT` | `5432` | PostgreSQL server port. |
| `AGENT_MEMORY_PG_DATABASE` | `agent_memory` | PostgreSQL database name. |
| `AGENT_MEMORY_PG_USER` | `postgres` | PostgreSQL username. |
| `AGENT_MEMORY_PG_PASSWORD` | (hidden) | PostgreSQL password. |
| `AGENT_MEMORY_PG_SSL` | `false` | Enable SSL/TLS for PostgreSQL connections. |
| `AGENT_MEMORY_PG_POOL_MIN` | `2` | Minimum connections in the connection pool. |
| `AGENT_MEMORY_PG_POOL_MAX` | `10` | Maximum connections in the connection pool. |
| `AGENT_MEMORY_PG_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout in milliseconds. |
| `AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS` | `10000` | Connection acquisition timeout in milliseconds. |
| `AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS` | `30000` | Statement timeout in milliseconds. 0 = no timeout. |

### VectorDb

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_VECTOR_DB_PATH` | `vectors.lance` | Path to LanceDB vector database directory. |
| `AGENT_MEMORY_DISTANCE_METRIC` | `cosine` | Distance metric for vector similarity: cosine, l2, or dot. |

### Embedding

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_EMBEDDING_PROVIDER` | `local` | Embedding provider: openai (requires API key), local (built-in), or disabled. |
| `AGENT_MEMORY_OPENAI_API_KEY` | (hidden) | OpenAI API key for embeddings. |
| `AGENT_MEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model to use. |
| `AGENT_MEMORY_EMBEDDING_MAX_CONCURRENCY` | `16` | Maximum concurrent embedding requests. |
| `AGENT_MEMORY_EMBEDDING_MAX_RETRIES` | `3` | Maximum retry attempts for failed embedding jobs. |
| `AGENT_MEMORY_EMBEDDING_RETRY_DELAY_MS` | `1000` | Base delay in ms between retries (doubles each attempt). |

### Extraction

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_EXTRACTION_PROVIDER` | `disabled` | Extraction provider: openai, anthropic, ollama, or disabled. |
| `AGENT_MEMORY_OPENAI_API_KEY` | (hidden) | OpenAI API key for extraction. |
| `AGENT_MEMORY_EXTRACTION_OPENAI_BASE_URL` | — | Custom OpenAI-compatible API base URL (for LM Studio, LocalAI, etc.). |
| `AGENT_MEMORY_EXTRACTION_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use for extraction. |
| `AGENT_MEMORY_ANTHROPIC_API_KEY` | (hidden) | Anthropic API key for extraction. |
| `AGENT_MEMORY_EXTRACTION_ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | Anthropic model to use for extraction. |
| `AGENT_MEMORY_OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL. |
| `AGENT_MEMORY_OLLAMA_MODEL` | `llama3.2` | Ollama model to use for extraction. |
| `AGENT_MEMORY_EXTRACTION_MAX_TOKENS` | `4096` | Maximum tokens for extraction responses. |
| `AGENT_MEMORY_EXTRACTION_TEMPERATURE` | `0.2` | LLM temperature for extraction (0-1). |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_THRESHOLD` | `0.7` | Default confidence threshold for auto-storing extracted entries. |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: fatal, error, warn, info, debug, or trace. |
| `AGENT_MEMORY_DEBUG` | `false` | Enable debug mode with additional logging. |
| `AGENT_MEMORY_PERF` | `false` | Enable performance logging. |

### Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CACHE_LIMIT_MB` | `512` | Total cache memory limit in megabytes. |
| `AGENT_MEMORY_QUERY_CACHE_TTL_MS` | `300000` | Query cache TTL in milliseconds. |
| `AGENT_MEMORY_SCOPE_CACHE_TTL_MS` | `600000` | Scope cache TTL in milliseconds. |
| `AGENT_MEMORY_MAX_PREPARED_STATEMENTS` | `500` | Maximum number of prepared statements to cache. |
| `AGENT_MEMORY_QUERY_CACHE_SIZE` | `1000` | Maximum number of query results to cache. |
| `AGENT_MEMORY_QUERY_CACHE_MEMORY_MB` | `200` | Query cache memory limit in megabytes. |
| `AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD` | `0.75` | Cache pressure threshold (0-1) to trigger eviction. |
| `AGENT_MEMORY_CACHE_EVICTION_TARGET` | `0.6` | Target cache usage (0-1) after eviction. |

### Memory

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD` | `0.85` | Heap usage threshold (0-1) to trigger memory pressure handling. |
| `AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS` | `30000` | Memory check interval in milliseconds. |

### RateLimit

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RATE_LIMIT` | `true` | Enable rate limiting. Set to "0" to disable. |

### SemanticSearch

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Default similarity threshold for semantic search (0-1). |
| `AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT` | `0.7` | Weight of semantic score in combined scoring (0-1). |
| `AGENT_MEMORY_DUPLICATE_THRESHOLD` | `0.8` | Similarity threshold for duplicate detection (0-1). |

### Recency

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DECAY_HALF_LIFE_DAYS` | `14` | Default decay half-life in days. |
| `AGENT_MEMORY_RECENCY_WEIGHT` | `0.5` | Default recency weight in scoring (0-1). |
| `AGENT_MEMORY_MAX_RECENCY_BOOST` | `2` | Maximum recency boost multiplier. |
| `AGENT_MEMORY_USE_UPDATED_AT` | `true` | Use updatedAt (vs createdAt) for recency calculations. |

### Validation

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_NAME_MAX_LENGTH` | `500` | Maximum length for name fields. |
| `AGENT_MEMORY_TITLE_MAX_LENGTH` | `1000` | Maximum length for title fields. |
| `AGENT_MEMORY_DESCRIPTION_MAX_LENGTH` | `10000` | Maximum length for description fields. |
| `AGENT_MEMORY_CONTENT_MAX_LENGTH` | `100000` | Maximum length for content fields. |
| `AGENT_MEMORY_RATIONALE_MAX_LENGTH` | `5000` | Maximum length for rationale fields. |
| `AGENT_MEMORY_METADATA_MAX_BYTES` | `50000` | Maximum size for metadata in bytes. |
| `AGENT_MEMORY_PARAMETERS_MAX_BYTES` | `50000` | Maximum size for parameters in bytes. |
| `AGENT_MEMORY_EXAMPLES_MAX_BYTES` | `100000` | Maximum size for examples in bytes. |
| `AGENT_MEMORY_TAGS_MAX_COUNT` | `50` | Maximum number of tags per entry. |
| `AGENT_MEMORY_EXAMPLES_MAX_COUNT` | `20` | Maximum number of examples per entry. |
| `AGENT_MEMORY_BULK_OPERATION_MAX` | `100` | Maximum entries in bulk operations. |
| `AGENT_MEMORY_REGEX_PATTERN_MAX_LENGTH` | `500` | Maximum length for regex patterns. |
| `AGENT_MEMORY_VALIDATION_RULES_LIMIT` | `1000` | Maximum validation rules to query. |

### Pagination

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DEFAULT_QUERY_LIMIT` | `20` | Default number of results per page. |
| `AGENT_MEMORY_MAX_QUERY_LIMIT` | `100` | Maximum number of results per page. |

### Health

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval in milliseconds. |
| `AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS` | `3` | Maximum reconnection attempts. |
| `AGENT_MEMORY_RECONNECT_BASE_DELAY_MS` | `1000` | Base delay between reconnection attempts in milliseconds. |
| `AGENT_MEMORY_RECONNECT_MAX_DELAY_MS` | `5000` | Maximum delay between reconnection attempts in milliseconds. |

### Retry

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RETRY_MAX_ATTEMPTS` | `3` | Maximum retry attempts. |
| `AGENT_MEMORY_RETRY_INITIAL_DELAY_MS` | `100` | Initial delay between retries in milliseconds. |
| `AGENT_MEMORY_RETRY_MAX_DELAY_MS` | `5000` | Maximum delay between retries in milliseconds. |
| `AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER` | `2` | Backoff multiplier for retry delays. |

### Transaction

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_TX_RETRIES` | `3` | Maximum transaction retry attempts. |
| `AGENT_MEMORY_TX_DELAY_MS` | `10` | Initial delay between transaction retries in milliseconds. |
| `AGENT_MEMORY_TX_MAX_DELAY_MS` | `1000` | Maximum delay between transaction retries in milliseconds. |
| `AGENT_MEMORY_TX_BACKOFF` | `2` | Backoff multiplier for transaction retry delays. |

### Conflict

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CONFLICT_WINDOW_MS` | `5000` | Conflict detection window in milliseconds. |
| `AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD` | `0.7` | Threshold for high error correlation detection (0-1). |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Node.js environment: development, production, or test. |

### Timestamps

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_TIMEZONE` | `local` | Timezone for display: local, utc, or IANA timezone (e.g., Europe/Rome). |

### Output

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_OUTPUT_FORMAT` | `json` | Output format: json or compact. |

### Rest

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_REST_ENABLED` | `false` | Enable REST API server. |
| `AGENT_MEMORY_REST_HOST` | `127.0.0.1` | REST API server host. |
| `AGENT_MEMORY_REST_PORT` | `8787` | REST API server port. |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_REST_AUTH_DISABLED` | `false` | Disable REST API authentication (not recommended for production). |
| `AGENT_MEMORY_REST_API_KEY` | (hidden) | Single REST API key for authentication. |
| `AGENT_MEMORY_REST_API_KEYS` | (hidden) | Multiple REST API keys as JSON or CSV (key:agentId format). |
| `AGENT_MEMORY_REST_AGENT_ID` | `rest-api` | Default agent ID for REST API requests. |

### Paths

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DATA_DIR` | `data` | Base data directory. Supports ~ expansion. |
| `AGENT_MEMORY_BACKUP_PATH` | `backups` | Backup directory path. |
| `AGENT_MEMORY_EXPORT_PATH` | `exports` | Export directory path. |
| `AGENT_MEMORY_LOG_PATH` | `logs` | Log directory path. |

### Backup

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_BACKUP_SCHEDULE` | (empty) | Cron expression for scheduled backups. E.g., "0 0 * * *" for daily at midnight. |
| `AGENT_MEMORY_BACKUP_RETENTION` | `5` | Number of backups to retain. |
| `AGENT_MEMORY_BACKUP_ENABLED` | `false` | Enable backup scheduler. Defaults to true if schedule is set. |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_REDIS_ENABLED` | `false` | Enable Redis for distributed operations. |
| `AGENT_MEMORY_REDIS_URL` | (hidden) | Redis connection URL (overrides host/port if set). |
| `AGENT_MEMORY_REDIS_HOST` | `localhost` | Redis server hostname. |
| `AGENT_MEMORY_REDIS_PORT` | `6379` | Redis server port. |
| `AGENT_MEMORY_REDIS_PASSWORD` | (hidden) | Redis password. |
| `AGENT_MEMORY_REDIS_DB` | `0` | Redis database number. |
| `AGENT_MEMORY_REDIS_TLS` | `false` | Enable TLS/SSL for Redis connections. |
| `AGENT_MEMORY_REDIS_KEY_PREFIX` | `agentmem:` | Key prefix for namespacing Redis keys. |
| `AGENT_MEMORY_REDIS_CACHE_TTL_MS` | `3600000` | Cache TTL in milliseconds (default: 1 hour). |
| `AGENT_MEMORY_REDIS_LOCK_TTL_MS` | `30000` | Lock TTL in milliseconds (default: 30 seconds). |
| `AGENT_MEMORY_REDIS_LOCK_RETRY_COUNT` | `3` | Lock acquisition retry count. |
| `AGENT_MEMORY_REDIS_LOCK_RETRY_DELAY_MS` | `200` | Delay between lock acquisition retries in milliseconds. |
| `AGENT_MEMORY_REDIS_EVENT_CHANNEL` | `agentmem:events` | Redis pub/sub channel for events. |
| `AGENT_MEMORY_REDIS_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout in milliseconds. |
| `AGENT_MEMORY_REDIS_MAX_RETRIES` | `3` | Maximum retries per Redis request. |

<!-- AUTO-GENERATED:ENV-VARS-END -->

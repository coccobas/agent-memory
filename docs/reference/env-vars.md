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
| `AGENT_MEMORY_PG_SSL_REJECT_UNAUTHORIZED` | `true` | Verify SSL certificates (reject unauthorized). Set to false only in development/testing. Required in production. |
| `AGENT_MEMORY_PG_POOL_MIN` | `2` | Minimum connections in the connection pool. |
| `AGENT_MEMORY_PG_POOL_MAX` | `10` | Maximum connections in the connection pool. |
| `AGENT_MEMORY_PG_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout in milliseconds. |
| `AGENT_MEMORY_PG_CONNECTION_TIMEOUT_MS` | `10000` | Connection acquisition timeout in milliseconds. |
| `AGENT_MEMORY_PG_STATEMENT_TIMEOUT_MS` | `30000` | Statement timeout in milliseconds. 0 = no timeout. |

### VectorDb

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_VECTOR_BACKEND` | `auto` | Vector storage backend: auto (pgvector for PostgreSQL, LanceDB for SQLite), pgvector, or lancedb. |
| `AGENT_MEMORY_VECTOR_DB_PATH` | `vectors.lance` | Path to LanceDB vector database directory (only used when backend is lancedb). |
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
| `AGENT_MEMORY_EXTRACTION_STRICT_ALLOWLIST` | `false` | Enforce base URL allowlist (block non-allowed hosts). Set to true for production security. |
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
| `AGENT_MEMORY_MAX_IMPORT_ENTRIES` | `10000` | Maximum number of entries allowed per import operation to prevent resource exhaustion. |

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

### Capture

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CAPTURE_ENABLED` | `true` | Enable the capture service. |
| `AGENT_MEMORY_CAPTURE_SESSION_END_ENABLED` | `true` | Enable experience extraction at session end. |
| `AGENT_MEMORY_CAPTURE_SESSION_END_MIN_TURNS` | `3` | Minimum turns required before session-end capture. |
| `AGENT_MEMORY_CAPTURE_SESSION_END_MIN_TOKENS` | `500` | Minimum tokens required before session-end capture. |
| `AGENT_MEMORY_CAPTURE_SESSION_END_EXTRACT_EXPERIENCES` | `true` | Extract experiences at session end. |
| `AGENT_MEMORY_CAPTURE_SESSION_END_EXTRACT_KNOWLEDGE` | `true` | Extract knowledge at session end. |
| `AGENT_MEMORY_CAPTURE_TURN_BASED_ENABLED` | `false` | Enable turn-based capture triggers. |
| `AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_TURNS` | `10` | Trigger capture after this many turns. |
| `AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_TOKENS` | `5000` | Trigger capture after this many tokens. |
| `AGENT_MEMORY_CAPTURE_TURN_BASED_TRIGGER_ON_ERROR` | `true` | Trigger capture when a tool error occurs. |
| `AGENT_MEMORY_CAPTURE_TURN_BASED_MAX_CAPTURES` | `5` | Maximum number of turn-based captures per session. |
| `AGENT_MEMORY_CAPTURE_DEDUP_ENABLED` | `true` | Enable content deduplication. |
| `AGENT_MEMORY_CAPTURE_DEDUP_THRESHOLD` | `0.9` | Similarity threshold for deduplication (0-1). |
| `AGENT_MEMORY_CAPTURE_DEDUP_HASH_ALGORITHM` | `sha256` | Hash algorithm for deduplication. |
| `AGENT_MEMORY_CAPTURE_CONFIDENCE_EXPERIENCE` | `0.7` | Confidence threshold for experience extraction. |
| `AGENT_MEMORY_CAPTURE_CONFIDENCE_KNOWLEDGE` | `0.7` | Confidence threshold for knowledge extraction. |
| `AGENT_MEMORY_CAPTURE_CONFIDENCE_GUIDELINE` | `0.75` | Confidence threshold for guideline extraction. |
| `AGENT_MEMORY_CAPTURE_CONFIDENCE_TOOL` | `0.65` | Confidence threshold for tool extraction. |

### Rl

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RL_ENABLED` | `true` | Master kill switch for all RL features. |
| `AGENT_MEMORY_RL_FEEDBACK_ENABLED` | `true` | Enable feedback data collection for RL training. |
| `AGENT_MEMORY_RL_FEEDBACK_OUTCOME_INFERENCE` | `rule_based` | Method for inferring outcomes from user behavior. |
| `AGENT_MEMORY_RL_FEEDBACK_ATTRIBUTION` | `linear` | Attribution method for assigning credit to memories. |
| `AGENT_MEMORY_RL_FEEDBACK_RETENTION_DAYS` | `90` | Number of days to retain feedback data before cleanup. |
| `AGENT_MEMORY_RL_EXTRACTION_POLICY_ENABLED` | `true` | Use learned extraction policy instead of confidence thresholds. |
| `AGENT_MEMORY_RL_EXTRACTION_MODEL_PATH` | (empty) | Path to trained extraction policy model (empty = use defaults). |
| `AGENT_MEMORY_RL_RETRIEVAL_POLICY_ENABLED` | `true` | Use learned retrieval policy instead of always retrieving. |
| `AGENT_MEMORY_RL_RETRIEVAL_MODEL_PATH` | (empty) | Path to trained retrieval policy model (empty = use defaults). |
| `AGENT_MEMORY_RL_CONSOLIDATION_POLICY_ENABLED` | `true` | Use learned consolidation policy instead of quality gates. |
| `AGENT_MEMORY_RL_CONSOLIDATION_MODEL_PATH` | (empty) | Path to trained consolidation policy model (empty = use defaults). |
| `AGENT_MEMORY_RL_TRAINING_ENABLED` | `false` | Enable RL policy training features. |
| `AGENT_MEMORY_RL_TRAINING_SCHEDULE` | `0 3 * * 0` | Cron expression for automated training runs (weekly Sunday 3am). |
| `AGENT_MEMORY_RL_TRAINING_MIN_EXAMPLES` | `1000` | Minimum feedback examples required before training. |
| `AGENT_MEMORY_RL_EPOCHS` | `3` | Number of training epochs for DPO training. |
| `AGENT_MEMORY_RL_BATCH_SIZE` | `8` | Batch size for training (adjust based on GPU memory). |
| `AGENT_MEMORY_RL_LEARNING_RATE` | `0.00005` | Learning rate for optimizer (typically 1e-5 to 1e-4). |
| `AGENT_MEMORY_RL_BETA` | `0.1` | DPO beta parameter for KL penalty (0.01-0.5). |
| `AGENT_MEMORY_RL_EVAL_SPLIT` | `0.2` | Fraction of data to use for evaluation (0.05-0.5). |
| `AGENT_MEMORY_RL_MODEL_PATH` | `./models/rl` | Directory path for storing trained RL models. |
| `AGENT_MEMORY_RL_EXPORT_FORMAT` | `jsonl` | Default export format for training datasets. |

### QueryRewrite

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_QUERY_REWRITE_ENABLED` | `true` | Enable query rewriting features. |
| `AGENT_MEMORY_HYDE_ENABLED` | `true` | Enable HyDE (Hypothetical Document Embedding). |
| `AGENT_MEMORY_HYDE_DOCUMENT_COUNT` | `1` | Number of hypothetical documents to generate per query. |
| `AGENT_MEMORY_HYDE_TEMPERATURE` | `0.7` | Temperature for HyDE document generation (0-2). |
| `AGENT_MEMORY_HYDE_MAX_TOKENS` | `256` | Maximum tokens per hypothetical document. |
| `AGENT_MEMORY_QUERY_EXPANSION_ENABLED` | `true` | Enable query expansion with synonyms and relations. |
| `AGENT_MEMORY_EXPANSION_USE_DICTIONARY` | `true` | Use built-in synonym dictionary for expansion. |
| `AGENT_MEMORY_EXPANSION_USE_RELATIONS` | `true` | Use relation graph for query expansion. |
| `AGENT_MEMORY_EXPANSION_USE_LLM` | `false` | Use LLM for semantic query expansion (slower, more accurate). |
| `AGENT_MEMORY_MAX_QUERY_EXPANSIONS` | `3` | Maximum number of query expansions to generate. |
| `AGENT_MEMORY_EXPANSION_WEIGHT` | `0.5` | Weight for expanded queries relative to original (0-1). |
| `AGENT_MEMORY_QUERY_DECOMPOSITION_ENABLED` | `false` | Enable multi-hop query decomposition. |
| `AGENT_MEMORY_INTENT_CLASSIFICATION_MODE` | `pattern` | Intent classification mode: pattern (fast), llm (accurate), or hybrid. |
| `AGENT_MEMORY_QUERY_REWRITE_PROVIDER` | `ollama` | LLM provider for HyDE and LLM-based expansion. |
| `AGENT_MEMORY_QUERY_REWRITE_MODEL` | — | Model override for query rewriting (uses provider default if not set). |

### Lora

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_LORA_ENABLED` | `true` | Enable LoRA export features. |
| `AGENT_MEMORY_LORA_DEFAULT_FORMAT` | `alpaca` | Default export format: alpaca, sharegpt, openai-messages, or anthropic-prompts. |
| `AGENT_MEMORY_LORA_EXAMPLES_PER_GUIDELINE` | `3` | Number of training examples to generate per guideline. |
| `AGENT_MEMORY_LORA_INCLUDE_NEGATIVE` | `false` | Include contrastive (negative) examples for better learning. |
| `AGENT_MEMORY_LORA_OUTPUT_PATH` | `./lora-export` | Default output directory for LoRA exports. |
| `AGENT_MEMORY_LORA_SPLIT_RATIO` | `0.1` | Train/eval split ratio (0.1 = 90% train, 10% eval). |
| `AGENT_MEMORY_LORA_RANK` | `16` | LoRA rank (r). Common values: 8, 16, 32, 64. |
| `AGENT_MEMORY_LORA_ALPHA` | `32` | LoRA alpha (typically 2x rank). Controls adaptation strength. |
| `AGENT_MEMORY_LORA_DROPOUT` | `0.05` | LoRA dropout rate (0.0-1.0). Prevents overfitting. |
| `AGENT_MEMORY_LORA_TARGET_MODEL` | `llama` | Target model architecture for adapter config: llama, mistral, gpt2, bloom, t5, or default. |
| `AGENT_MEMORY_LORA_GENERATE_SCRIPT` | `true` | Generate training script stub with exports. |
| `AGENT_MEMORY_LORA_MIN_PRIORITY` | `0` | Minimum guideline priority to include (0-100). |
| `AGENT_MEMORY_LORA_INCLUDE_METADATA` | `true` | Include guideline metadata in training examples. |

<!-- AUTO-GENERATED:ENV-VARS-END -->

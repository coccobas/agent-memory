# Advanced Environment Variables

Advanced tuning for Agent Memory. If you're just getting started, use the shorter guide in `docs/reference/environment-variables.md`.

Defaults shown here match the runtime configuration.

<details>
<summary><strong>Vector Similarity</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DISTANCE_METRIC` | `cosine` | Vector distance metric (`cosine`, `l2`, `dot`) |

</details>

<details>
<summary><strong>Cache Limits</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CACHE_LIMIT_MB` | `100` | Total cache memory budget (MB) |
| `AGENT_MEMORY_SCOPE_CACHE_TTL_MS` | `600000` | Scope chain cache TTL (ms) |
| `AGENT_MEMORY_MAX_PREPARED_STATEMENTS` | `100` | Prepared statement cache size |
| `AGENT_MEMORY_QUERY_CACHE_MEMORY_MB` | `50` | Query cache memory cap (MB) |
| `AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD` | `0.8` | Eviction starts above this fraction of the memory budget |
| `AGENT_MEMORY_CACHE_EVICTION_TARGET` | `0.8` | Eviction continues until below this fraction |

</details>

<details>
<summary><strong>Memory Coordinator</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD` | `0.85` | Proactive eviction threshold (fraction of heap) |
| `AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS` | `30000` | Memory coordinator check interval (ms) |

</details>

<details>
<summary><strong>Rate Limiting</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RATE_LIMIT` | `1` | Set to `0` to disable all rate limiting |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX` | `100` | Per-agent max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS` | `60000` | Per-agent window (ms) |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX` | `1000` | Global max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS` | `60000` | Global window (ms) |
| `AGENT_MEMORY_RATE_LIMIT_BURST_MAX` | `20` | Burst max requests per window |
| `AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS` | `1000` | Burst window (ms) |

</details>

<details>
<summary><strong>Semantic Search Tuning</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT` | `0.7` | Hybrid scoring weight for semantic similarity |
| `AGENT_MEMORY_DUPLICATE_THRESHOLD` | `0.8` | Duplicate-detection similarity threshold |

</details>

<details>
<summary><strong>Validation Limits</strong></summary>

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

</details>

<details>
<summary><strong>Pagination Defaults</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_DEFAULT_QUERY_LIMIT` | `20` | Default result limit |
| `AGENT_MEMORY_MAX_QUERY_LIMIT` | `100` | Maximum allowed limit |

</details>

<details>
<summary><strong>Health & Reconnection</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval (ms) |
| `AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS` | `3` | Max reconnection attempts |
| `AGENT_MEMORY_RECONNECT_BASE_DELAY_MS` | `1000` | Reconnect base delay (ms) |
| `AGENT_MEMORY_RECONNECT_MAX_DELAY_MS` | `5000` | Reconnect max delay (ms) |

</details>

<details>
<summary><strong>Retry Behavior</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_RETRY_MAX_ATTEMPTS` | `3` | Max retries |
| `AGENT_MEMORY_RETRY_INITIAL_DELAY_MS` | `100` | Initial delay (ms) |
| `AGENT_MEMORY_RETRY_MAX_DELAY_MS` | `5000` | Max delay (ms) |
| `AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |

</details>

<details>
<summary><strong>Conflict Detection</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MEMORY_CONFLICT_WINDOW_MS` | `5000` | Conflict window (ms) |
| `AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD` | `0.7` | High correlation threshold |

</details>

<details>
<summary><strong>Logging / Runtime</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `NODE_ENV` | - | Environment name (`development`, `production`, etc.) |
</details>

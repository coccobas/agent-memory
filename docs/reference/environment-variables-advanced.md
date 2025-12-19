# Environment Variables (Advanced)

This file documents tuning and advanced options. Defaults are from `src/config/index.ts`.

## Cache & Memory

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_CACHE_LIMIT_MB` | `100` | Total memory limit for caches. |
| `AGENT_MEMORY_QUERY_CACHE_TTL_MS` | `300000` | Query cache TTL (ms). |
| `AGENT_MEMORY_SCOPE_CACHE_TTL_MS` | `600000` | Scope cache TTL (ms). |
| `AGENT_MEMORY_MAX_PREPARED_STATEMENTS` | `100` | Max prepared statements. |
| `AGENT_MEMORY_QUERY_CACHE_SIZE` | `200` | Query cache size. |
| `AGENT_MEMORY_QUERY_CACHE_MEMORY_MB` | `50` | Query cache memory cap. |
| `AGENT_MEMORY_CACHE_PRESSURE_THRESHOLD` | `0.8` | Cache pressure threshold. |
| `AGENT_MEMORY_CACHE_EVICTION_TARGET` | `0.8` | Eviction target under pressure. |
| `AGENT_MEMORY_HEAP_PRESSURE_THRESHOLD` | `0.85` | Heap pressure threshold. |
| `AGENT_MEMORY_MEMORY_CHECK_INTERVAL_MS` | `30000` | Memory check interval (ms). |

## Rate Limiting

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_RATE_LIMIT` | `1` | Set to `0` to disable rate limiting. |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_MAX` | `100` | Per-agent max requests. |
| `AGENT_MEMORY_RATE_LIMIT_PER_AGENT_WINDOW_MS` | `60000` | Per-agent window (ms). |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_MAX` | `1000` | Global max requests. |
| `AGENT_MEMORY_RATE_LIMIT_GLOBAL_WINDOW_MS` | `60000` | Global window (ms). |
| `AGENT_MEMORY_RATE_LIMIT_BURST_MAX` | `20` | Burst max requests. |
| `AGENT_MEMORY_RATE_LIMIT_BURST_WINDOW_MS` | `1000` | Burst window (ms). |

## Semantic Search Scoring

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_SEMANTIC_THRESHOLD` | `0.7` | Minimum semantic similarity. |
| `AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT` | `0.7` | Semantic score weight in ranking. |
| `AGENT_MEMORY_DUPLICATE_THRESHOLD` | `0.8` | Duplicate detection threshold. |

## Recency / Decay

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_DECAY_HALF_LIFE_DAYS` | `14` | Default decay half-life (days). |
| `AGENT_MEMORY_DECAY_HALF_LIFE_GUIDELINE` | `30` | Guideline half-life. |
| `AGENT_MEMORY_DECAY_HALF_LIFE_KNOWLEDGE` | `14` | Knowledge half-life. |
| `AGENT_MEMORY_DECAY_HALF_LIFE_TOOL` | `7` | Tool half-life. |
| `AGENT_MEMORY_RECENCY_WEIGHT` | `0.5` | Recency weight. |
| `AGENT_MEMORY_MAX_RECENCY_BOOST` | `2.0` | Max recency boost. |
| `AGENT_MEMORY_USE_UPDATED_AT` | `true` | Use updatedAt for recency. |

## Limits & Validation

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_NAME_MAX_LENGTH` | `500` | Max name length. |
| `AGENT_MEMORY_TITLE_MAX_LENGTH` | `1000` | Max title length. |
| `AGENT_MEMORY_DESCRIPTION_MAX_LENGTH` | `10000` | Max description length. |
| `AGENT_MEMORY_CONTENT_MAX_LENGTH` | `100000` | Max content length. |
| `AGENT_MEMORY_RATIONALE_MAX_LENGTH` | `5000` | Max rationale length. |
| `AGENT_MEMORY_METADATA_MAX_BYTES` | `50000` | Max metadata size (bytes). |
| `AGENT_MEMORY_PARAMETERS_MAX_BYTES` | `50000` | Max parameters size (bytes). |
| `AGENT_MEMORY_EXAMPLES_MAX_BYTES` | `100000` | Max examples size (bytes). |
| `AGENT_MEMORY_TAGS_MAX_COUNT` | `50` | Max tags per entry. |
| `AGENT_MEMORY_EXAMPLES_MAX_COUNT` | `20` | Max examples per entry. |
| `AGENT_MEMORY_BULK_OPERATION_MAX` | `100` | Max items per bulk call. |

## Pagination

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_DEFAULT_QUERY_LIMIT` | `20` | Default query limit. |
| `AGENT_MEMORY_MAX_QUERY_LIMIT` | `100` | Max query limit. |

## Health & Retry

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check interval. |
| `AGENT_MEMORY_MAX_RECONNECT_ATTEMPTS` | `3` | Max reconnect attempts. |
| `AGENT_MEMORY_RECONNECT_BASE_DELAY_MS` | `1000` | Base reconnect delay. |
| `AGENT_MEMORY_RECONNECT_MAX_DELAY_MS` | `5000` | Max reconnect delay. |
| `AGENT_MEMORY_RETRY_MAX_ATTEMPTS` | `3` | Max retry attempts. |
| `AGENT_MEMORY_RETRY_INITIAL_DELAY_MS` | `100` | Retry initial delay. |
| `AGENT_MEMORY_RETRY_MAX_DELAY_MS` | `5000` | Retry max delay. |
| `AGENT_MEMORY_RETRY_BACKOFF_MULTIPLIER` | `2` | Retry backoff multiplier. |

## Conflict Detection

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_CONFLICT_WINDOW_MS` | `5000` | Conflict window for similarity checks. |
| `AGENT_MEMORY_HIGH_ERROR_CORRELATION_THRESHOLD` | `0.7` | Error correlation threshold. |

## Extraction Thresholds (Per Type)

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_GUIDELINE` | `0.75` | Guideline threshold. |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_KNOWLEDGE` | `0.7` | Knowledge threshold. |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_TOOL` | `0.65` | Tool threshold. |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_ENTITY` | `0.7` | Entity threshold. |
| `AGENT_MEMORY_EXTRACTION_CONFIDENCE_RELATIONSHIP` | `0.75` | Relationship threshold. |

## Timezone

| Variable | Default | Description |
| --- | --- | --- |
| `AGENT_MEMORY_TIMEZONE` | `local` | Display timezone for timestamps. |

# Semantic Search Guide

Configure and use vector-based semantic search for intelligent memory retrieval.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Using Semantic Search](#using-semantic-search)
- [Tuning](#tuning)
- [Hybrid Search](#hybrid-search)
- [Troubleshooting](#troubleshooting)

---

## Overview

Semantic search uses vector embeddings to find conceptually similar content, even when exact keywords don't match.

### Comparison

| Search Type | Query | Matches |
|-------------|-------|---------|
| **Keyword** | "JWT authentication" | Documents containing "JWT" or "authentication" |
| **Semantic** | "how do we verify user identity" | Documents about auth, login, tokens, sessions |

### How It Works

1. Text is converted to numerical vectors (embeddings)
2. Vectors are stored in LanceDB
3. Queries are converted to vectors
4. Similar vectors are found using cosine similarity

---

## Setup

### Option 1: OpenAI Embeddings (Recommended)

Best quality, requires API key.

```bash
AGENT_MEMORY_OPENAI_API_KEY=sk-your-api-key agent-memory mcp
```

Or in MCP client config:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "npx",
      "args": ["-y", "agent-memory@latest", "mcp"],
      "env": {
        "AGENT_MEMORY_OPENAI_API_KEY": "sk-your-api-key"
      }
    }
  }
}
```

**Model:** Uses `text-embedding-3-small` by default.

```bash
# Change embedding model
AGENT_MEMORY_OPENAI_MODEL=text-embedding-3-large agent-memory mcp
```

### Option 2: Local Embeddings

No API required, runs locally.

```bash
AGENT_MEMORY_EMBEDDING_PROVIDER=local agent-memory mcp
```

**Note:** Local embeddings have lower quality than OpenAI but require no external calls.

### Option 3: Disabled

Text search only (FTS5).

```bash
AGENT_MEMORY_EMBEDDING_PROVIDER=disabled agent-memory mcp
```

### Verify Setup

```json
// Tool: memory_health
{}

// Response includes:
{
  "vectorDb": {
    "connected": true,
    "provider": "openai",
    "entries": 150
  }
}
```

---

## Using Semantic Search

### Basic Semantic Query

```json
// Tool: memory_query
{
  "action": "search",
  "search": "how do we handle user login",
  "semanticSearch": true
}
```

### With Threshold

Higher threshold = more relevant but fewer results:

```json
{
  "action": "search",
  "search": "error handling patterns",
  "semanticSearch": true,
  "semanticThreshold": 0.8  // Only highly similar results
}
```

Lower threshold = more results but potentially less relevant:

```json
{
  "action": "search",
  "search": "database operations",
  "semanticSearch": true,
  "semanticThreshold": 0.5  // Broader results
}
```

### Scoped Semantic Search

```json
{
  "action": "search",
  "search": "API design patterns",
  "semanticSearch": true,
  "scope": {
    "type": "project",
    "id": "proj-123",
    "inherit": true
  }
}
```

### Filter by Type

```json
{
  "action": "search",
  "search": "code formatting rules",
  "semanticSearch": true,
  "types": ["guidelines"]  // Only search guidelines
}
```

---

## Tuning

### Similarity Threshold

```bash
# Default threshold (0-1)
AGENT_MEMORY_SEMANTIC_THRESHOLD=0.7
```

| Threshold | Use Case |
|-----------|----------|
| 0.9+ | Very strict, only near-exact matches |
| 0.7-0.8 | Default, good relevance |
| 0.5-0.6 | Broader search, may include less relevant |
| < 0.5 | Very broad, useful for exploration |

### Score Weight in Hybrid Search

When combining semantic and keyword scores:

```bash
# Weight for semantic score (0-1)
AGENT_MEMORY_SEMANTIC_SCORE_WEIGHT=0.7  # 70% semantic, 30% keyword
```

### Distance Metric

```bash
# Distance metric for similarity
AGENT_MEMORY_DISTANCE_METRIC=cosine  # Default, best for text
# Options: cosine, l2, dot
```

---

## Hybrid Search

Hybrid search combines semantic and full-text search for best results.

### How Hybrid Works

1. Run semantic search → get similarity scores
2. Run FTS5 keyword search → get relevance scores
3. Combine scores with configured weights
4. Return merged, deduplicated results

### Enable Hybrid Search

```json
{
  "action": "search",
  "search": "JWT token validation",
  "semanticSearch": true,  // Enable semantic
  "useFts5": true          // Enable full-text
}
```

### Example Results

Query: "user authentication flow"

| Result | Semantic Score | FTS Score | Combined |
|--------|---------------|-----------|----------|
| "JWT auth guide" | 0.92 | 0.85 | 0.90 |
| "Login process" | 0.88 | 0.40 | 0.74 |
| "Auth middleware" | 0.75 | 0.90 | 0.80 |

---

## Embedding Storage

### Vector Database Location

```bash
# Default location
~/.agent-memory/data/vectors.lance/

# Custom location
AGENT_MEMORY_VECTOR_DB_PATH=/custom/path/vectors.lance
```

### Re-generate Embeddings

If embeddings become stale or you change providers:

1. Delete vector database:
```bash
rm -rf ~/.agent-memory/data/vectors.lance/
```

2. Restart server:
```bash
agent-memory mcp
```

3. Re-index existing entries (embeddings generated on access)

---

## Duplicate Detection

Semantic search powers duplicate detection during storage.

### Configuration

```bash
# Similarity threshold for duplicate warning
AGENT_MEMORY_DUPLICATE_THRESHOLD=0.8
```

### Behavior

When adding new entries, if an entry with similarity > threshold exists:
- Warning is logged
- Original entry is returned for comparison
- You can choose to update existing or create new

---

## Troubleshooting

### No Semantic Results

**Check if embeddings are enabled:**

```json
// Tool: memory_health
{}
```

Look for `vectorDb.connected: true`.

**Verify API key:**

```bash
# Test OpenAI API
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $AGENT_MEMORY_OPENAI_API_KEY"
```

### Poor Quality Results

**Lower the threshold:**

```json
{
  "action": "search",
  "search": "your query",
  "semanticSearch": true,
  "semanticThreshold": 0.5
}
```

**Try hybrid search:**

```json
{
  "action": "search",
  "search": "your query",
  "semanticSearch": true,
  "useFts5": true
}
```

### Slow Semantic Search

**Check vector count:**

Large vector databases are slower. Consider:

1. Scope queries to specific projects
2. Filter by entry type
3. Consolidate similar entries

```json
// Tool: memory_consolidate
{
  "action": "find_similar",
  "scopeType": "project",
  "threshold": 0.9
}
```

### OpenAI Rate Limits

If you hit rate limits:

1. Add delay between requests
2. Use local embeddings for development
3. Batch operations to reduce API calls

```bash
# Switch to local for development
AGENT_MEMORY_EMBEDDING_PROVIDER=local agent-memory mcp
```

### Missing Embeddings

Some entries may not have embeddings if they were created before semantic search was enabled.

**Force regeneration:**

Updating an entry regenerates its embedding:

```json
// Tool: memory_guideline
{
  "action": "update",
  "id": "guideline-123",
  "content": "Same content with minor edit.",
  "changeReason": "Regenerate embedding"
}
```

---

## Best Practices

### 1. Write Clear Content

Better embeddings come from clear, descriptive text:

```json
// Good - clear and descriptive
{
  "content": "Always use TypeScript strict mode with noImplicitAny to catch type errors at compile time"
}

// Less effective - vague
{
  "content": "Use strict mode"
}
```

### 2. Use Appropriate Thresholds

| Content Type | Recommended Threshold |
|--------------|----------------------|
| Guidelines | 0.7-0.8 (balanced) |
| Knowledge | 0.6-0.7 (broader context) |
| Tools | 0.8-0.9 (more specific) |

### 3. Combine with Tags

Tags provide exact filtering; semantic provides fuzzy matching:

```json
{
  "action": "search",
  "search": "authentication",
  "semanticSearch": true,
  "tags": {
    "include": ["security"]  // Must have security tag
  }
}
```

### 4. Monitor Costs

OpenAI embeddings cost money. Monitor usage:

- Use local embeddings for development
- Batch operations where possible
- Consider caching query embeddings

---

## See Also

- [Performance Guide](performance.md) - Optimization tips
- [API Reference](../api-reference.md) - Query parameters
- [Troubleshooting](troubleshooting.md) - Common issues

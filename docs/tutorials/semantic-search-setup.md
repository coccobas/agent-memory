# Semantic Search Setup Tutorial

Enable AI-powered semantic search to find memories by meaning, not just keywords.

**What you'll learn:**

- How to enable semantic search with OpenAI or local embeddings
- How to query using semantic search
- How to tune threshold settings

**Prerequisites:**

- Completed [Quickstart](quickstart.md)
- (Optional) OpenAI API key for best results

**Time:** ~5 minutes

---

## What is Semantic Search?

Semantic search finds conceptually similar content, even when exact keywords don't match:

| Search Type  | Query                            | Matches                                        |
| ------------ | -------------------------------- | ---------------------------------------------- |
| **Keyword**  | "JWT authentication"             | Documents containing "JWT" or "authentication" |
| **Semantic** | "how do we verify user identity" | Documents about auth, login, tokens, sessions  |

---

## Step 1: Choose Your Embedding Provider

### Option A: OpenAI (Recommended)

Best quality results. Set your API key:

```bash
AGENT_MEMORY_OPENAI_API_KEY=sk-your-api-key agent-memory mcp
```

Or in your MCP config:

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

### Option B: Local Embeddings

No API required, runs locally (lower quality):

```bash
AGENT_MEMORY_EMBEDDING_PROVIDER=local agent-memory mcp
```

### Option C: Disabled

Text search only:

```bash
AGENT_MEMORY_EMBEDDING_PROVIDER=disabled agent-memory mcp
```

---

## Step 2: Verify Setup

Check that semantic search is enabled:

```json
{
  "action": "status"
}
```

**Tool:** `memory_observe`

Look for:

```json
{
  "vectorDb": {
    "connected": true,
    "provider": "openai",
    "entries": 150
  }
}
```

---

## Step 3: Your First Semantic Query

Search by meaning:

```json
{
  "action": "search",
  "search": "how do we handle user login",
  "semanticSearch": true
}
```

**Tool:** `memory_query`

---

## Step 4: Tune the Threshold

The threshold controls how similar results must be (0-1):

| Threshold | Results                              |
| --------- | ------------------------------------ |
| 0.9+      | Very strict, near-exact matches only |
| 0.7-0.8   | **Default**, good relevance          |
| 0.5-0.6   | Broader, may include less relevant   |

```json
{
  "action": "search",
  "search": "error handling patterns",
  "semanticSearch": true,
  "semanticThreshold": 0.8
}
```

---

## Step 5: Combine with Filters

Get the best of both worlds:

```json
{
  "action": "search",
  "search": "authentication flow",
  "semanticSearch": true,
  "types": ["guidelines"],
  "scope": {
    "type": "project",
    "id": "proj-123",
    "inherit": true
  }
}
```

---

## Troubleshooting

### No semantic results?

1. Check `memory_health` for `vectorDb.connected: true`
2. Verify your OpenAI API key is valid
3. Lower the threshold to 0.5

### Slow queries?

1. Scope queries to specific projects
2. Filter by entry type
3. Use local embeddings for development

---

## Next Steps

- [Semantic Search Guide](../guides/semantic-search.md) - Full tuning options
- [Performance Tuning](../guides/performance.md) - Optimization tips
- [First Hook](first-hook.md) - Add enforcement to your workflow

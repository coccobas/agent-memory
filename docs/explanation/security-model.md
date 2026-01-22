# Security Model

This document explains Agent Memory's security architecture, authentication, and permission system.

## Authentication

### REST API

REST is disabled by default. When enabled:

- Requests must include `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`
- Set `AGENT_MEMORY_REST_API_KEY` to a strong secret
- **Do not** disable auth in shared environments

```bash
# Enable REST with authentication
AGENT_MEMORY_REST_ENABLED=true
AGENT_MEMORY_REST_API_KEY=your-secure-key-here
agent-memory rest
```

**Warning:** `AGENT_MEMORY_REST_AUTH_DISABLED=true` is for local/dev only.

### MCP

MCP runs over stdio and inherits the client's trust boundary. Control access through:

- Client host configuration
- OS-level permissions
- Rate limiting (enabled by default)

---

## Permission System

### Default Behavior

Permissions are **deny-by-default**:

- No permission = no access
- Explicit grants required for each agent/scope/type combination

### Permission Levels

| Level   | Access                         |
| ------- | ------------------------------ |
| `read`  | View entries in scope          |
| `write` | Create, update, delete entries |
| `admin` | Manage permissions for scope   |

### Granting Permissions

```json
{
  "action": "grant",
  "agent_id": "claude-code",
  "scope_type": "project",
  "scope_id": "proj-123",
  "entry_type": "guideline",
  "permission": "write",
  "admin_key": "your-admin-key"
}
```

**Tool:** `memory_permission`

### Permissive Mode

For development or single-agent setups:

```bash
AGENT_MEMORY_PERMISSIONS_MODE=permissive
```

**Warning:** Not recommended for untrusted agents or shared environments.

### Production Security Blocks

Starting from v0.9.17, agent-memory implements **hard blocks** that prevent insecure configurations in production environments:

| Configuration                              | Production Behavior                |
| ------------------------------------------ | ---------------------------------- |
| `AGENT_MEMORY_DEV_MODE=true`               | **Throws error** at startup        |
| `AGENT_MEMORY_PERMISSIONS_MODE=permissive` | **Throws error** at startup        |
| Ollama with external URLs                  | **Throws error** - SSRF protection |

**Why?** These configurations bypass authentication and permission checks, which is dangerous in production.

**Override (staging/testing only):**

```bash
AGENT_MEMORY_ALLOW_DEV_MODE_IN_PRODUCTION=true
```

This allows dev mode and permissive mode in production. **Only use for trusted staging environments.**

---

## Rate Limiting

Rate limiting protects against abuse:

| Limit Type | Default  | Description                   |
| ---------- | -------- | ----------------------------- |
| Per-agent  | 100/min  | Requests per agent per minute |
| Global     | 1000/min | Total requests per minute     |
| Burst      | 20/sec   | Maximum burst requests        |

### Disable Rate Limiting

```bash
AGENT_MEMORY_RATE_LIMIT=0
```

---

## File Safety

### Path Traversal Protection

Export and backup filenames are validated:

- Absolute paths rejected
- `../` sequences blocked
- Final path must be within configured directory

### Data Directory

Data paths default to user-writable locations:

| Context             | Default Path            |
| ------------------- | ----------------------- |
| Running from source | `<repo>/data/`          |
| Installed via npm   | `~/.agent-memory/data/` |

Override with:

```bash
AGENT_MEMORY_DATA_DIR=/custom/path
```

---

## Secrets Management

### Best Practices

1. **Never commit API keys to git**
2. Use environment variables or secret managers
3. Rotate keys periodically
4. Use separate keys for dev/prod

### Environment Variables for Secrets

| Variable                         | Purpose                 |
| -------------------------------- | ----------------------- |
| `AGENT_MEMORY_REST_API_KEY`      | REST API authentication |
| `AGENT_MEMORY_OPENAI_API_KEY`    | Embeddings API          |
| `AGENT_MEMORY_ANTHROPIC_API_KEY` | Extraction API          |
| `AGENT_MEMORY_PG_PASSWORD`       | PostgreSQL password     |
| `AGENT_MEMORY_REDIS_PASSWORD`    | Redis password          |

---

## Logging Security

### Redaction

Sensitive fields are automatically redacted in logs:

- `authorization`
- `token`
- `apiKey`
- `password`
- `secret`

### Log Levels

```bash
# Production - errors only
LOG_LEVEL=error

# Development - more verbose
LOG_LEVEL=debug
```

### MCP Protocol Safety

In MCP mode, logs go to stderr to avoid corrupting the JSON-RPC protocol on stdout.

---

## Client-Side Security

### FTS Search Snippets

Search results include `snippet` fields with HTML `<mark>` tags. The content is user-supplied, so **sanitize before rendering**:

```javascript
import DOMPurify from 'dompurify';
const safeHtml = DOMPurify.sanitize(snippet, { ALLOWED_TAGS: ['mark'] });
```

### Exports

Markdown and YAML exports contain raw user content. Use a sanitizing renderer when converting to HTML.

---

## Multi-Agent Security

### File Locks

Prevent concurrent edits with file locks:

```json
{
  "action": "checkout",
  "file_path": "/path/to/file.ts",
  "agent_id": "claude-code"
}
```

**Tool:** `memory_file_lock`

### Agent Identification

Each agent should use a unique `agentId`:

- Enables per-agent rate limiting
- Enables per-agent permissions
- Provides audit trail

---

## Security Checklist

### Production Deployment

- [ ] REST API key is set and strong
- [ ] `AGENT_MEMORY_REST_AUTH_DISABLED` is NOT set
- [ ] `AGENT_MEMORY_PERMISSIONS_MODE` is NOT `permissive`
- [ ] Rate limiting is enabled
- [ ] Secrets are in environment variables, not config files
- [ ] Log level is appropriate (not `debug` or `trace`)

### Development Environment

- [ ] Use permissive mode if needed
- [ ] Use local embeddings to avoid API costs
- [ ] Consider disabling rate limiting for testing

---

## See Also

- [Architecture](architecture.md) - System overview
- [Environment Variables](../reference/environment-variables.md) - All security-related config
- [Troubleshooting](../guides/troubleshooting.md) - Common security issues

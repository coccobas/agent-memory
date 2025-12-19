# Security

This document summarizes key security considerations and defaults.

## Authentication

### REST API

REST is disabled by default. When enabled:

- Requests must include `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`.
- Set `AGENT_MEMORY_REST_API_KEY` to a strong secret.
- **Do not** disable auth in shared environments. `AGENT_MEMORY_REST_AUTH_DISABLED=true` is for local/dev only.

### MCP

MCP runs over stdio and inherits the client’s trust boundary. Control access through the client host and OS-level permissions.

## Permissions

- Permissions are **deny-by-default**.
- If you want legacy open access, set `AGENT_MEMORY_PERMISSIONS_MODE=permissive` (not recommended for untrusted agents).

## File Safety

- Export and backup filenames are validated to prevent path traversal.
- Data paths default to user-writable locations; override with environment variables if needed.

## Secrets

- Never commit API keys to git.
- Use environment variables or secret managers.

## Logging

- Sensitive fields are redacted in logs (`authorization`, `token`, `apiKey`, etc.).
- In test environments, logging is disabled to reduce noise.

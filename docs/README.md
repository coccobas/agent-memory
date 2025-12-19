# Agent Memory Documentation

This documentation set is rebuilt from scratch to match the current codebase.
Use this index to find the right entry point.

## Start Here

- **Getting Started**: `docs/getting-started.md`
- **API Reference** (MCP tools, REST API, CLI): `docs/api-reference.md`
- **Environment Variables** (core): `docs/reference/environment-variables.md`
- **Doc Inventory**: `docs/DOC_INVENTORY.md`

## Guides

- Development: `docs/guides/development.md`
- Testing: `docs/guides/testing.md`
- Docker Setup: `docs/guides/docker-setup.md`
- Windows Setup: `docs/guides/windows-setup.md`
- Rules Sync: `docs/guides/rules-sync.md`

## Reference

- Architecture: `docs/architecture.md`
- Data Model: `docs/data-model.md`
- Initialization & Migrations: `docs/reference/initialization.md`
- Error Codes: `docs/reference/error-codes.md`
- Environment Variables (advanced tuning): `docs/reference/environment-variables-advanced.md`
- MDAP Support (large-scale agentic workflows): `docs/reference/mdap-support.md`
- Security: `docs/security.md`
- Maintenance Checklist: `docs/MAINTENANCE.md`

## Contributing

- `docs/contributing.md`

## Scope and Accuracy

- The MCP tool list comes from `src/mcp/server.ts` and tool handlers.
- The REST API surface comes from `src/restapi/server.ts`.
- Defaults and environment variables come from `src/config/index.ts`.

If you spot a mismatch, please open an issue or send a PR.

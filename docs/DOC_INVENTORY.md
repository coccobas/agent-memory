# Documentation Inventory

This inventory maps product surface area to documentation coverage.

## Product Surface

- MCP tools (see `src/mcp/server.ts`)
- REST API (`src/restapi/server.ts`)
- CLI (`src/cli.ts`, `src/commands/*`)
- Configuration (`src/config/index.ts`)
- Data model and migrations (`src/db/*`)
- Security and permissions (`src/services/permission.service.ts`, REST auth)

## Doc Coverage

| Area | Primary Docs |
| --- | --- |
| MCP tools | `docs/api-reference.md` |
| REST API | `docs/api-reference.md` |
| CLI | `docs/api-reference.md` |
| Config / env | `docs/reference/environment-variables.md`, `docs/reference/environment-variables-advanced.md` |
| Data model | `docs/data-model.md` |
| Architecture | `docs/architecture.md` |
| Security | `docs/security.md` |
| Initialization | `docs/reference/initialization.md` |
| Development | `docs/guides/development.md` |
| Testing | `docs/guides/testing.md` |
| Docker | `docs/guides/docker-setup.md` |
| Windows | `docs/guides/windows-setup.md` |
| Rules sync | `docs/guides/rules-sync.md` |

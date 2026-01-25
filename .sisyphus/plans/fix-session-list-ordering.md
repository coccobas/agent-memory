# Fix Session List Ordering

## Summary

Session `list()` returns oldest-first due to missing ORDER BY clause. Should return newest-first to match other repositories (conversations, episodes, evidence, maintenance-jobs).

## Tasks

- [x] Add `desc` import to scopes.ts
- [x] Add `orderBy(desc(sessions.startedAt))` to session list query
- [x] Run typecheck to verify
- [x] Test via MCP tool to confirm fix

## Files

- `src/db/repositories/scopes.ts` (lines 7, 473)

## Analysis

See conversation for full analysis of codebase patterns.

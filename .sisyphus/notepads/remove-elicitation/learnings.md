# Learnings - Remove Elicitation Service

## Status: COMPLETE

## 2026-01-23 Session: ses_412f32e22ffeDFf4tpVwmBxyMR

### Key Findings

1. **Elicitation files were never tracked in git**
   - The files `elicitation.service.ts`, `elicitation.client.ts`, `elicitation.ts` (config section), and `elicitation.service.test.ts` were local-only
   - Deleting them didn't require a git commit for the deletion itself
   - All code changes (removing imports/references) were committed in a single commit

2. **lint-staged auto-formatting can re-add removed imports**
   - When running `git commit`, lint-staged auto-formatted files
   - If the imported file still exists, the formatter may re-add the import
   - Solution: Delete files BEFORE committing, or commit in correct order

3. **Pre-existing issues in codebase**
   - `lint:architecture` has 4 pre-existing violations (singleton accessor pattern)
   - `permissions.test.ts` has 1 pre-existing test failure (uses `action` instead of `permission`)
   - These are unrelated to the elicitation removal

### Successful Patterns

- Phased removal: Remove usages first, then types, then config, then files
- Build verification after each phase catches cascading errors early
- LSP diagnostics help identify remaining references quickly

### Commit Strategy

- Single commit was sufficient since all changes were related
- Commit message: `refactor(mcp): remove elicitation service usages`

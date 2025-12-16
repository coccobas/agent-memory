# Version Update Guide

This guide documents all locations where the version number must be updated when releasing a new version of Agent Memory.

## Quick Update Command

For a simple version bump, you can use npm:

```bash
# Patch version (0.8.2 -> 0.8.3)
npm version patch --no-git-tag-version

# Minor version (0.8.3 -> 0.9.0)
npm version minor --no-git-tag-version

# Major version (0.9.0 -> 1.0.0)
npm version major --no-git-tag-version
```

**Note:** The `--no-git-tag-version` flag prevents npm from auto-committing and tagging, giving you control over the commit message.

## Files Requiring Manual Update

After running `npm version`, you must manually update these additional files:

### 1. `src/mcp/server.ts` (3 locations)

**Location 1:** Health check response (~line 1204)
```typescript
serverVersion: 'X.Y.Z',  // <-- UPDATE THIS
```

**Location 2:** Main server initialization (~line 1411)
```typescript
const server = new Server(
  {
    name: 'agent-memory',
    version: 'X.Y.Z',  // <-- UPDATE THIS
  },
  ...
);
```

**Location 3:** Fallback minimal server (~line 1636)
```typescript
server = new Server(
  {
    name: 'agent-memory',
    version: 'X.Y.Z',  // <-- UPDATE THIS
  },
  ...
);
```

### 2. `docker-compose.yml` (~line 41)

Update the version label:
```yaml
labels:
  - 'com.agent-memory.version=X.Y.Z'  # <-- UPDATE THIS
```

### 3. `CODE_REVIEW.md` (if exists)

Update the version in the header:
```markdown
**Version:** X.Y.Z
```

## Files Auto-Updated by npm

These files are automatically updated by `npm version`:

| File | Field |
|------|-------|
| `package.json` | `"version": "X.Y.Z"` |
| `package-lock.json` | `"version": "X.Y.Z"` (root and package entry) |

## Version Update Checklist

- [ ] Run `npm version <patch|minor|major> --no-git-tag-version`
- [ ] Update `src/mcp/server.ts` (3 locations: lines ~1204, ~1411, ~1636)
- [ ] Update `docker-compose.yml` label (line ~41)
- [ ] Update `CODE_REVIEW.md` version (if applicable)
- [ ] Run `npm run build` to verify no errors
- [ ] Run `npm test` to verify tests pass
- [ ] Rebuild Docker: `docker-compose build`
- [ ] Commit with message: `chore: bump version to X.Y.Z`
- [ ] Create git tag: `git tag vX.Y.Z`
- [ ] Push: `git push && git push --tags`

## Search Command

To find all version references in the codebase:

```bash
grep -rn "0\.8\." --include="*.ts" --include="*.json" --include="*.md" | grep -v node_modules | grep -v dist
```

## Semantic Versioning Guidelines

- **PATCH** (0.8.2 → 0.8.3): Bug fixes, minor improvements, no API changes
- **MINOR** (0.8.3 → 0.9.0): New features, backward-compatible API additions
- **MAJOR** (0.9.0 → 1.0.0): Breaking changes, major refactors, API removals

---

*Last updated: 2025-12-16 for version 0.8.5*

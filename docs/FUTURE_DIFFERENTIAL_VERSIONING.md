# Future Feature: Differential Versioning

> **Status:** Proposed
> **Priority:** Low
> **Created:** 2025-12-14
> **Goal:** Storage optimization AND clear change visibility

---

## Current State

The system uses **append-only full versioning**:
- Each update creates a complete new version record
- All fields are stored in full, even if only one changed
- Previous versions are never modified

**Location:** `src/db/repositories/tools.ts`, `guidelines.ts`, `knowledge.ts`

---

## Proposed Enhancement: Hybrid Differential Versioning

### Strategy

| Version | Storage Type | Reason |
|---------|--------------|--------|
| v1 | Full snapshot | Base version |
| v2-v10 | Diff only | Space savings |
| v11 | Full snapshot | Fast reconstruction |
| v12-v20 | Diff only | Space savings |
| ... | Pattern repeats | Balance of both |

### Implementation Options

#### Option A: JSON Patch (RFC 6902) - Recommended

```typescript
// Stores operations like:
[
  { "op": "replace", "path": "/content", "value": "Updated text..." },
  { "op": "add", "path": "/examples/2", "value": "New example" }
]
```

- Works great for structured data (parameters, examples JSON)
- Reversible (can apply forward or backward)
- ~5KB npm package (`fast-json-patch`)

#### Option B: Text Diff (unified format)

```diff
@@ -1,5 +1,5 @@
-Use absolute imports.
+Use absolute imports. Group by: stdlib, third-party, local.
```

- Better for long text content
- Human-readable diffs
- ~10KB npm package (`diff`)

### Schema Changes Required

```sql
-- Add to tool_versions, guideline_versions, knowledge_versions
ALTER TABLE tool_versions ADD COLUMN is_snapshot BOOLEAN DEFAULT FALSE;
ALTER TABLE tool_versions ADD COLUMN diff_from_version_id TEXT;
ALTER TABLE tool_versions ADD COLUMN diff_patch JSON;  -- JSON Patch or text diff
```

### New TypeScript Types

```typescript
interface DiffVersion {
  isSnapshot: boolean;
  diffFromVersionId?: string;
  diffPatch?: JsonPatch[] | string;  // JSON Patch array or unified diff string
}

interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}
```

### Repository Changes

```typescript
// In update() method:
const SNAPSHOT_INTERVAL = 10;

const isSnapshot = newVersionNum % SNAPSHOT_INTERVAL === 1 || newVersionNum === 1;

if (isSnapshot) {
  // Store full content
  newVersion.isSnapshot = true;
  newVersion.content = fullContent;
} else {
  // Store diff from previous version
  newVersion.isSnapshot = false;
  newVersion.diffFromVersionId = latestVersion.id;
  newVersion.diffPatch = computeDiff(previousContent, newContent);
}
```

### New API Methods

```typescript
// Get diff between any two versions
getVersionDiff(entryId: string, fromVersion: number, toVersion: number): Diff

// Reconstruct full content for any version
reconstructVersion(entryId: string, versionNum: number): FullContent

// Get change history with diffs
getChangeHistory(entryId: string): VersionWithDiff[]
```

---

## Trade-offs Analysis

| Aspect | Current (Full) | Differential |
|--------|---------------|--------------|
| **Storage** | ~100% | ~20-40% |
| **Write speed** | Fast | Slightly slower (compute diff) |
| **Read latest** | Fast | Fast (pointer to current) |
| **Read old version** | Fast | Slower (reconstruct from snapshots) |
| **Audit trail** | Compare manually | Clear diff available |
| **Complexity** | Simple | Moderate |
| **Dependencies** | None | +1 package (fast-json-patch or diff) |

---

## Implementation Steps

1. [ ] Add new columns to version tables (migration)
2. [ ] Add `fast-json-patch` dependency
3. [ ] Implement `computeDiff()` utility
4. [ ] Implement `reconstructVersion()` utility
5. [ ] Modify `update()` in all three repositories
6. [ ] Add `getVersionDiff()` API method
7. [ ] Add `memory_query` action for diff retrieval
8. [ ] Update tests
9. [ ] Migration script for existing data (optional - can leave existing as snapshots)

---

## Dependencies

```json
{
  "dependencies": {
    "fast-json-patch": "^3.1.1"
  }
}
```

Alternative: `rfc6902` or `diff` (for text-based diffing)

---

## References

- [RFC 6902 - JSON Patch](https://tools.ietf.org/html/rfc6902)
- [fast-json-patch npm](https://www.npmjs.com/package/fast-json-patch)
- [diff npm](https://www.npmjs.com/package/diff)

---

*This feature is logged for future implementation. Current append-only versioning works well for typical use cases.*

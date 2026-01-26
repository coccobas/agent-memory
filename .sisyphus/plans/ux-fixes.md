# UX Fixes Plan

## Context

### Original Request

Fix 5 UX issues identified during Agent Memory MCP testing:

1. `_display` shows "unknown" project name
2. Query parsing strips question words but leaves articles
3. Search results missing content snippets
4. CLI commands classified as knowledge instead of tool
5. `_suggestions` shows near-duplicate after storing

### Interview Summary

**Key Discussions**:

- All 5 issues confirmed with root cause analysis
- File locations identified via grep and file reading
- Fixes designed to be minimal and targeted

**Research Findings**:

- Issue #1: `detectedProjectName` is null when project exists but wasn't created
- Issue #2: Regex strips "How does" but leaves "the" in query extraction
- Issue #3: Results map only extracts id/name/score, not content
- Issue #4: LLM classification overrides pattern matching for CLI commands
- Issue #5: Suggestion extraction runs on just-stored content

---

## Work Objectives

### Core Objective

Fix all 5 UX issues to improve Agent Memory tool usability.

### Concrete Deliverables

- Fixed `_display` showing actual project name
- Query parsing that strips articles
- Search results with content snippets
- CLI commands correctly classified as tools
- Filtered suggestions that don't include just-stored content

### Definition of Done

- [x] All 5 issues fixed and verified
- [x] No regressions in existing functionality
- [x] `npm run validate` passes

### Must Have

- Minimal, targeted fixes
- Backward compatible changes

### Must NOT Have (Guardrails)

- DO NOT refactor unrelated code
- DO NOT change API signatures
- DO NOT add new dependencies
- DO NOT modify test infrastructure

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (bun test / vitest)
- **User wants tests**: Manual verification for this UX testing session
- **Framework**: Existing test framework

### Manual Execution Verification

After each fix, run the MCP server and test the specific scenario:

1. `memory_quickstart` should show project name
2. Query "How does the database work?" should extract "database work"
3. Search results should include snippet field
4. "npm run dev starts..." should classify as tool
5. After storing, `_suggestions` should not contain near-duplicate

---

## TODOs

### Issue #1: Fix `_display` showing "unknown" project name

- [x] 1. Add project name fetch when projectId exists but name is null

  **What to do**:
  - In `src/mcp/descriptors/memory_quickstart.ts` around line 227-233
  - After extracting `detectedProjectName` from `createdProjectName` or `_context`
  - If `detectedProjectName` is still null but `detectedProjectId` exists:
    - Fetch project from `ctx.repos.projects.get(detectedProjectId)`
    - Set `detectedProjectName = project.name`

  **Current code (lines 227-233)**:

  ```typescript
  // Extract detected project from context result
  const contextWithMeta = contextResult as {
    _context?: { project?: { id: string; name?: string } };
  };
  const detectedProjectId = projectId ?? contextWithMeta?._context?.project?.id;
  const detectedProjectName =
    createdProjectName ?? contextWithMeta?._context?.project?.name ?? null;
  ```

  **Replace with**:

  ```typescript
  // Extract detected project from context result
  const contextWithMeta = contextResult as {
    _context?: { project?: { id: string; name?: string } };
  };
  const detectedProjectId = projectId ?? contextWithMeta?._context?.project?.id;

  // Resolve project name: try createdProjectName, then context, then fetch from DB
  let detectedProjectName: string | null =
    createdProjectName ?? contextWithMeta?._context?.project?.name ?? null;

  // If we have a projectId but no name, fetch it from the database
  if (!detectedProjectName && detectedProjectId) {
    try {
      const project = await ctx.repos.projects.get(detectedProjectId);
      if (project) {
        detectedProjectName = project.name;
      }
    } catch {
      // Non-fatal - fall back to null
    }
  }
  ```

  **Must NOT do**:
  - Don't change the `_display` format string
  - Don't modify other parts of quickstart

  **Parallelizable**: YES (with 2, 3, 4, 5)

  **References**:
  - `src/mcp/descriptors/memory_quickstart.ts:227-233` - Current project name resolution
  - `src/utils/minto-formatter.ts:68` - Where `_display` uses projectName
  - `src/repositories/project.repository.ts` - Project repo with `get()` method

  **Acceptance Criteria**:
  - [ ] Run `memory_quickstart` on existing project
  - [ ] `_display` shows "Ready: agent-memory | ..." instead of "Ready: unknown | ..."

  **Commit**: YES
  - Message: `fix(quickstart): resolve project name from DB when not in context`
  - Files: `src/mcp/descriptors/memory_quickstart.ts`

---

### Issue #2: Fix query parsing to strip articles

- [x] 2. Add article stripping regex to query extraction

  **What to do**:
  - In `src/services/intent-detection/patterns.ts` around line 440-456
  - In the `extractParams` function, case 'retrieve'
  - Add a new `.replace()` to strip leading articles after question word stripping

  **Current code (lines 440-456)**:

  ```typescript
  case 'retrieve': {
    // Extract search query - progressively strip common question patterns
    const query = text
      .replace(
        /^(what|how|where|when|why)\s+(do|does|did|is|are|was|were|should|can|could|would)\s+/i,
        ''
      )
      .replace(/^(what|anything)\s+about\s+/i, '')
      .replace(/^(find|search|look\s+up|get|show|tell\s+me\s+about)\s+/i, '')
      // Clean up "we/you/I know about", "we have about", etc.
      .replace(/^(we|you|i|they)\s+(know|have|store|remember)\s+(about\s+)?/i, '')
      // Clean up leftover "I/we" after "How should I/we..." extraction
      .replace(/^(i|we)\s+/i, '')
      // Clean up trailing question words
      .replace(/\?+$/, '')
      .trim();
    params.query = query;
  ```

  **Add after the `(i|we)` replace and before `\?+$`**:

  ```typescript
      // Clean up leading articles (the, a, an)
      .replace(/^(the|a|an)\s+/i, '')
  ```

  **Must NOT do**:
  - Don't change other parts of extractParams
  - Don't modify intent detection logic

  **Parallelizable**: YES (with 1, 3, 4, 5)

  **References**:
  - `src/services/intent-detection/patterns.ts:440-456` - Query extraction logic
  - Test: "How does the database work?" should become "database work"

  **Acceptance Criteria**:
  - [ ] Query "How does the database work?" extracts as "database work"
  - [ ] Query "What is the auth flow?" extracts as "auth flow"
  - [ ] Query "Tell me about a test case" extracts as "test case"

  **Commit**: YES
  - Message: `fix(intent-detection): strip leading articles from search queries`
  - Files: `src/services/intent-detection/patterns.ts`

---

### Issue #3: Add content snippets to search results

- [x] 3. Extract and include content snippets in handleRetrieve results

  **What to do**:
  - In `src/services/unified-memory/dispatcher.ts` around lines 305-326
  - In the `handleRetrieve` function, inside the `.map()` that builds results
  - Extract content from each entry type and create a truncated snippet

  **Current code (lines 305-326)**:

  ```typescript
  // Map query results to dispatch results format
  const results: DispatchResult['results'] = queryResult.results.map((r) => {
    // Extract name/title from nested entity objects
    let name: string | undefined;
    let title: string | undefined;

    if (r.type === 'tool' && 'tool' in r) {
      name = r.tool.name;
    } else if (r.type === 'guideline' && 'guideline' in r) {
      name = r.guideline.name;
    } else if (r.type === 'knowledge' && 'knowledge' in r) {
      title = r.knowledge.title;
    }

    return {
      type: r.type,
      id: r.id,
      ...(title ? { title } : {}),
      ...(name ? { name } : {}),
      score: r.score,
    };
  });
  ```

  **Replace with**:

  ```typescript
  // Map query results to dispatch results format
  const results: DispatchResult['results'] = queryResult.results.map((r) => {
    // Extract name/title and content from nested entity objects
    let name: string | undefined;
    let title: string | undefined;
    let content: string | undefined;

    if (r.type === 'tool' && 'tool' in r) {
      name = r.tool.name;
      content = r.tool.description;
    } else if (r.type === 'guideline' && 'guideline' in r) {
      name = r.guideline.name;
      content = r.guideline.currentVersion?.content ?? r.guideline.content;
    } else if (r.type === 'knowledge' && 'knowledge' in r) {
      title = r.knowledge.title;
      content = r.knowledge.currentVersion?.content ?? r.knowledge.content;
    }

    // Create truncated snippet
    const snippet = content
      ? content.length > 150
        ? content.substring(0, 150) + '...'
        : content
      : undefined;

    return {
      type: r.type,
      id: r.id,
      ...(title ? { title } : {}),
      ...(name ? { name } : {}),
      ...(snippet ? { snippet } : {}),
      score: r.score,
    };
  });
  ```

  **Also update the DispatchResult type (around line 45-51)**:

  ```typescript
  results?: Array<{
    type: string;
    id: string;
    title?: string;
    name?: string;
    snippet?: string;  // ADD THIS LINE
    score?: number;
  }>;
  ```

  **Must NOT do**:
  - Don't change other handlers
  - Don't modify query pipeline

  **Parallelizable**: YES (with 1, 2, 4, 5)

  **References**:
  - `src/services/unified-memory/dispatcher.ts:45-51` - DispatchResult type definition
  - `src/services/unified-memory/dispatcher.ts:305-326` - handleRetrieve mapping logic

  **Acceptance Criteria**:
  - [ ] Search results include `snippet` field
  - [ ] Snippets are truncated to ~150 chars with "..."
  - [ ] Snippet contains actual content, not just title

  **Commit**: YES
  - Message: `feat(dispatcher): add content snippets to search results`
  - Files: `src/services/unified-memory/dispatcher.ts`

---

### Issue #4: Add CLI command patterns for tool classification

- [x] 4. Add high-weight CLI patterns that match commands at start of text

  **What to do**:
  - In `src/services/classification/pattern-matcher.ts` around line 211-269
  - Add new patterns to TOOL_PATTERNS array with high weight (0.95)
  - These patterns should match CLI commands at the START of text

  **Add to TOOL_PATTERNS array (after line 268, before the closing bracket)**:

  ```typescript
  // High-priority CLI patterns - commands at start of text are very likely tools
  {
    id: 'tool_npm_start_text',
    regex: /^npm\s+(run|install|test|start|build|exec|ci|init|publish)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'NPM command at start of text',
  },
  {
    id: 'tool_yarn_start_text',
    regex: /^(yarn|pnpm|bun)\s+\w+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Yarn/PNPM/Bun command at start',
  },
  {
    id: 'tool_docker_start_text',
    regex: /^docker(-compose)?\s+\w+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Docker command at start',
  },
  {
    id: 'tool_git_start_text',
    regex: /^git\s+(clone|pull|push|commit|checkout|branch|merge|rebase|log|status|diff|add|reset|stash)\b/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Git command at start',
  },
  {
    id: 'tool_python_start_text',
    regex: /^(python|python3|pip|pip3|pipenv|poetry)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Python command at start',
  },
  {
    id: 'tool_node_start_text',
    regex: /^(node|npx|tsx|ts-node|deno)\s+/i,
    type: 'tool',
    baseWeight: 0.95,
    description: 'Node/TS/Deno command at start',
  },
  {
    id: 'tool_shell_start_text',
    regex: /^(bash|sh|zsh|curl|wget|ssh|scp|rsync|chmod|chown|mkdir|rm|cp|mv|cat|grep|sed|awk)\s+/i,
    type: 'tool',
    baseWeight: 0.9,
    description: 'Shell command at start',
  },
  ```

  **Must NOT do**:
  - Don't modify existing patterns
  - Don't change pattern matching logic
  - Don't modify LLM fallback behavior

  **Parallelizable**: YES (with 1, 2, 3, 5)

  **References**:
  - `src/services/classification/pattern-matcher.ts:211-269` - TOOL_PATTERNS array
  - Test: "npm run dev starts the development server" should match `tool_npm_start_text`

  **Acceptance Criteria**:
  - [ ] "npm run dev starts the development server" classified as tool
  - [ ] "docker-compose up -d" classified as tool
  - [ ] "git commit -m 'message'" classified as tool
  - [ ] Confidence >= 0.9 for these patterns

  **Commit**: YES
  - Message: `feat(classification): add high-priority CLI patterns for tool detection`
  - Files: `src/services/classification/pattern-matcher.ts`

---

### Issue #5: Filter near-duplicate suggestions after storing

- [x] 5. Add duplicate filtering to suggestions in tool-runner

  **What to do**:
  - In `src/mcp/tool-runner.ts` around lines 300-323
  - After building the suggestions list
  - If the result contains stored content info, filter out similar suggestions

  **Add helper function (before `runTool` function, around line 90)**:

  ```typescript
  /**
   * Simple word-based similarity for duplicate detection
   * Uses Jaccard similarity: |intersection| / |union|
   */
  function calculateWordSimilarity(a: string, b: string): number {
    const wordsA = new Set(
      a
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    const wordsB = new Set(
      b
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
  ```

  **Modify the suggestions block (around lines 300-323)**:

  Find this code:

  ```typescript
      // Add extraction suggestions if any found
      if (suggestions.length > 0 || pendingSuggestions.length > 0) {
        const regexItems = suggestions.map((s) => ({
  ```

  Replace with:

  ```typescript
      // Filter suggestions that are too similar to just-stored content (Issue #5)
      // This prevents suggesting to store what was just stored
      const storedResult = result as { stored?: { title?: string; content?: string } } | null;
      const storedTitle = storedResult?.stored?.title?.toLowerCase() ?? '';
      const storedContent = (storedResult?.stored?.content ?? storedResult?.stored?.title ?? '').toLowerCase();

      const filteredSuggestions = suggestions.filter((s) => {
        const suggestionText = s.title.toLowerCase();
        // Filter if >80% similar to stored content
        return calculateWordSimilarity(suggestionText, storedContent) < 0.8 &&
               calculateWordSimilarity(suggestionText, storedTitle) < 0.8;
      });

      const filteredPending = pendingSuggestions.filter((s) => {
        const suggestionText = s.title.toLowerCase();
        return calculateWordSimilarity(suggestionText, storedContent) < 0.8 &&
               calculateWordSimilarity(suggestionText, storedTitle) < 0.8;
      });

      // Add extraction suggestions if any found after filtering
      if (filteredSuggestions.length > 0 || filteredPending.length > 0) {
        const regexItems = filteredSuggestions.map((s) => ({
  ```

  And update the rest of the block to use `filteredSuggestions` and `filteredPending` instead of `suggestions` and `pendingSuggestions`.

  **Must NOT do**:
  - Don't modify suggestion extraction logic
  - Don't change extraction hook behavior
  - Don't remove legitimate suggestions

  **Parallelizable**: YES (with 1, 2, 3, 4)

  **References**:
  - `src/mcp/tool-runner.ts:300-323` - Suggestion handling block
  - `src/mcp/descriptors/memory_remember.ts` - Returns `stored` object with title

  **Acceptance Criteria**:
  - [ ] After storing "Always run npm test before committing", no similar suggestion appears
  - [ ] Unrelated suggestions still appear
  - [ ] 80% similarity threshold correctly filters duplicates

  **Commit**: YES
  - Message: `fix(tool-runner): filter near-duplicate suggestions after storing`
  - Files: `src/mcp/tool-runner.ts`

---

## Commit Strategy

| After Task | Message                                                                   | Files                | Verification |
| ---------- | ------------------------------------------------------------------------- | -------------------- | ------------ |
| 1          | `fix(quickstart): resolve project name from DB when not in context`       | memory_quickstart.ts | Manual test  |
| 2          | `fix(intent-detection): strip leading articles from search queries`       | patterns.ts          | Manual test  |
| 3          | `feat(dispatcher): add content snippets to search results`                | dispatcher.ts        | Manual test  |
| 4          | `feat(classification): add high-priority CLI patterns for tool detection` | pattern-matcher.ts   | Manual test  |
| 5          | `fix(tool-runner): filter near-duplicate suggestions after storing`       | tool-runner.ts       | Manual test  |

---

## Success Criteria

### Verification Commands

```bash
npm run validate  # Should pass - lint, typecheck, tests
```

### Final Checklist

- [x] Issue #1: `_display` shows actual project name
- [x] Issue #2: Query extraction strips articles
- [x] Issue #3: Search results include snippets
- [x] Issue #4: CLI commands classified as tools
- [x] Issue #5: No duplicate suggestions after storing
- [x] All existing tests still pass

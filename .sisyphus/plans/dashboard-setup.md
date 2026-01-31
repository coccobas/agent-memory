# Agent Memory Dashboard Setup

## TL;DR

> **Quick Summary**: Build a React dashboard for visualizing Agent Memory data with card-based Vercel/Stripe-style UI, dark mode, and collapsible sidebar navigation.
>
> **Deliverables**:
>
> - Tailwind v4 configuration with dark theme
> - Typed API client for Agent Memory REST API
> - Dashboard layout with collapsible sidebar
> - 6 pages: Dashboard, Guidelines, Knowledge, Tools, Experiences, Graph
> - Data tables with sorting, filtering, pagination
> - Overview charts for entry counts
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Foundation → Layout → API → Pages
> **Project Location**: `/Users/coccobas/Development/memory/agent-memory-dashboard/`
> **All commits/evidence go to**: `agent-memory-dashboard` (the dashboard project)

---

## Prerequisites: Agent Memory REST API

### API Server Configuration

The dashboard connects to the Agent Memory REST API. Before running the dashboard:

1. **Start the REST API server** in the agent-memory project:

   ```bash
   cd /Users/coccobas/Development/memory/agent-memory
   AGENT_MEMORY_REST_ENABLED=true \
   AGENT_MEMORY_REST_PORT=3100 \
   AGENT_MEMORY_REST_API_KEY=dashboard-dev-key \
   AGENT_MEMORY_REST_CORS_ORIGINS=http://localhost:5173 \
   npm run start:rest
   ```

   **CORS Note**: The `AGENT_MEMORY_REST_CORS_ORIGINS` must match the Vite dev server origin exactly.
   Without this, browser requests from `http://localhost:5173` to `http://localhost:3100` will be blocked.
   For production, update to match your deployment domain.

2. **Verify API is running**:
   ```bash
   curl -s http://localhost:3100/health | jq
   # Expected: {"ok": true, ...}
   ```

### API Contract Reference

**Base URL**: `http://localhost:3100`

**Authentication**: All `/v1/tools/*` endpoints require:

```
Authorization: Bearer dashboard-dev-key
```

**Response Wrapper**: All **tool execution** responses from `POST /v1/tools/:tool` follow this structure:

```json
{
  "success": true,
  "data": {
    /* tool-specific output */
  }
}
```

**Note**: Other REST endpoints (like `GET /v1/tools`) have different shapes - only tool execution uses this wrapper.

**Tool Output Keys by Entity**:

| Tool              | Response Key in `data` | Example                                     |
| ----------------- | ---------------------- | ------------------------------------------- |
| memory_guideline  | `guidelines`           | `{ success: true, data: { guidelines: [] }` |
| memory_knowledge  | `knowledge`            | `{ success: true, data: { knowledge: [] }`  |
| memory_tool       | `tools`                | `{ success: true, data: { tools: [] }`      |
| memory_experience | `experiences`          | `{ success: true, data: { experiences: [] ` |
| memory_session    | `sessions`             | `{ success: true, data: { sessions: [] }`   |
| graph_node        | `nodes`                | `{ success: true, data: { nodes: [] }`      |
| graph_edge        | `edges`                | `{ success: true, data: { edges: [] }`      |

**Dashboard Environment Variable**:

Create `.env.local` in the dashboard project:

```bash
VITE_API_BASE_URL=http://localhost:3100
VITE_API_KEY=dashboard-dev-key
```

**IMPORTANT**: Do NOT commit `.env.local` to git. It's already in `.gitignore`.

---

## Data Scope Strategy (v1)

**v1 shows GLOBAL scope only.** All entity queries default to `scopeType='global'` with no `scopeId`.

| Entity      | v1 Scope       | Future Enhancement             |
| ----------- | -------------- | ------------------------------ |
| Guidelines  | Global only    | Add project/org scope selector |
| Knowledge   | Global only    | Add project/org scope selector |
| Tools       | Global only    | Add project/org scope selector |
| Experiences | Global only    | Add project/org scope selector |
| Sessions    | All (no scope) | Filter by project              |
| Graph       | Global only    | Add scope filter               |

**Why global-only for v1:**

- Simpler UX (no scope selector needed)
- Matches "admin overview" use case
- Guaranteed to show data if any exists

**Future scope selector** (NOT in v1):

- Add dropdown to header: "Scope: Global / [Project Name]"
- Pass `scopeType` and `scopeId` to all hooks

---

## Pagination Strategy (v1)

**v1 uses CLIENT-SIDE pagination via TanStack Table, but requires cursor-based fetching to get ALL rows.**

### API Pagination Reality

The Agent Memory REST API has these pagination constraints:

| Constraint    | Value  | Implication                                  |
| ------------- | ------ | -------------------------------------------- |
| Default limit | 20     | Without `limit` param, only 20 rows returned |
| Max limit     | 100    | Cannot fetch more than 100 rows per request  |
| Pagination    | Cursor | Uses `meta.nextCursor`/`meta.hasMore`        |

**Response meta structure (actual):**

```json
{
  "success": true,
  "data": {
    "guidelines": [...],
    "meta": {
      "returnedCount": 20,
      "hasMore": true,
      "truncated": false,
      "nextCursor": "<opaque-string>"
    }
  }
}
```

**Meta field notes**:

- `returnedCount`: Number of items in this response
- `hasMore`: Whether more pages exist
- `truncated`: Whether results were truncated (separate from pagination)
- `nextCursor`: Opaque string for next page (absent when `hasMore=false`)
- **NO `meta.total`**: To know total count, you must fetch all pages

### Fetch Strategy: Cursor Loop

To get all rows for client-side table pagination, the API client implements `fetchAllByCursor()`:

```typescript
async function fetchAllByCursor<T>(
  fetcher: (cursor?: string) => Promise<{ items: T[]; meta: PaginationMeta }>
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetcher(cursor);
    allItems.push(...response.items);
    cursor = response.meta.hasMore ? response.meta.nextCursor : undefined;
  } while (cursor);

  return allItems;
}
```

### Client-Side Table Features

| Aspect         | v1 Approach                              | Rationale                                |
| -------------- | ---------------------------------------- | ---------------------------------------- |
| Fetch strategy | `fetchAllByCursor()` loop                | Gets ALL rows despite API pagination     |
| Pagination     | TanStack Table `getPaginationRowModel()` | Built-in, no extra API calls after fetch |
| Page size      | 20 rows (configurable in UI)             | Standard default                         |
| Sorting        | Client-side via `getSortedRowModel()`    | TanStack Table handles                   |
| Filtering      | Client-side via `getFilteredRowModel()`  | TanStack Table handles                   |

### Graph Entities

Graph endpoints use offset-based pagination (not cursor):

```json
{
  "success": true,
  "data": {
    "nodes": [...],
    "meta": { "returnedCount": 20, "limit": 20, "offset": 0 }
  }
}
```

The API client implements `fetchAllByOffset()` for graph entities.

**When to migrate to server-side** (NOT in v1):

- If total rows exceed ~500 (network overhead becomes noticeable)
- Wire TanStack Table `manualPagination: true`
- Pass `cursor` or `offset` from table state to API

---

## DataTable UX Specification (v1)

### Filtering

| Feature               | v1 Behavior                                  |
| --------------------- | -------------------------------------------- |
| Filter type           | **Global search** (single input above table) |
| Filter scope          | Searches all visible columns                 |
| Filter UX             | Text input with placeholder "Search..."      |
| No per-column filters | Simpler UX for v1                            |

### Sorting

| Feature        | v1 Behavior                                  |
| -------------- | -------------------------------------------- |
| Sort trigger   | Click column header                          |
| Sort indicator | Arrow icon (↑/↓) next to active column       |
| Sort states    | Unsorted → Ascending → Descending → Unsorted |
| Default sort   | `createdAt` descending (newest first)        |

### Pagination

| Feature           | v1 Behavior                 |
| ----------------- | --------------------------- |
| Page size         | 20 rows (default)           |
| Page size options | Dropdown: 10, 20, 50, 100   |
| Navigation        | "Previous" / "Next" buttons |
| Page indicator    | "Page X of Y" text          |
| Position          | Below table, right-aligned  |

### Acceptance Verification

For each data page, verify:

```
1. Type "test" in search input → rows reduce to those containing "test"
2. Clear search → all rows return
3. Click "Name" header → rows sort by name ascending
4. Click "Name" header again → rows sort by name descending
5. Click "Next" button → page 2 rows appear
6. Change page size to 50 → more rows visible per page
```

---

## UI States Specification (v1)

### Loading State

| State        | UI Behavior                                              |
| ------------ | -------------------------------------------------------- |
| Initial load | Full-page spinner centered in content area               |
| Component    | Use `Loader2` icon from lucide-react with spin animation |
| Text         | "Loading..." below spinner                               |

### Error States

| Error Type         | Detection                  | UI Behavior                                              |
| ------------------ | -------------------------- | -------------------------------------------------------- |
| Unauthorized (401) | `code: "UNAUTHORIZED"`     | Message: "Authentication required. Check API key."       |
| Server unreachable | Fetch error / CORS blocked | Message: "Cannot connect to API. Is the server running?" |
| Other API error    | `success: false`           | Message: Display `error.message`                         |

### Empty State

| State     | UI Behavior                                     |
| --------- | ----------------------------------------------- |
| No data   | Message: "No [entity type] found"               |
| Component | Centered in table area                          |
| Subtext   | "Data will appear here once added via the API." |

### Acceptance Verification

```
# Test error states (without API running):
1. Stop the REST API server
2. Navigate to http://localhost:5173/guidelines
3. Assert: Error message "Cannot connect to API..." appears

# Test with wrong API key:
1. Set VITE_API_KEY to "wrong-key" in .env.local
2. Restart dev server, navigate to /guidelines
3. Assert: Error message "Authentication required..." appears
```

---

## Authentication Header (Clarification)

The dashboard uses **`Authorization: Bearer <key>`** format (not `X-API-Key`).

The REST API supports both formats, but we use Bearer for consistency with OAuth patterns.

```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,  // ← This format
}
```

---

## Context

### Original Request

Build a React dashboard to visualize Agent Memory database with:

- Card-based design (Vercel/Stripe style)
- Dark mode default
- Collapsible sidebar navigation

### Current Project State

| Aspect          | Status                                                       |
| --------------- | ------------------------------------------------------------ |
| Location        | `/Users/coccobas/Development/memory/agent-memory-dashboard/` |
| Vite + React 19 | ✅ Scaffolded (default template)                             |
| Dependencies    | ✅ All installed                                             |
| Tailwind v4     | ⚠️ Package installed, NOT configured                         |
| Path aliases    | ❌ Not configured                                            |
| App structure   | ❌ Only default counter App.tsx (imports App.css)            |

### Research Findings (Context7 - Latest Docs)

**Tailwind CSS v4** (from `/tailwindlabs/tailwindcss.com`):

- Use `@tailwindcss/vite` plugin in vite.config.ts
- CSS-first config: `@import "tailwindcss"` (no JS config file needed)
- Class-based dark mode: `@custom-variant dark (&:where(.dark, .dark *));`

**TanStack Query v5** (from `/websites/tanstack_query_v5`):

- `QueryClient` + `QueryClientProvider` wrapper
- `useQuery({ queryKey, queryFn })` for data fetching
- `useMutation({ mutationFn, onSuccess })` for mutations
- `queryClient.invalidateQueries()` for cache invalidation

**TanStack Table v8** (from `/websites/tanstack_table`):

- `useReactTable` with `getCoreRowModel`, `getFilteredRowModel`, `getSortedRowModel`, `getPaginationRowModel`
- Columns defined with `useMemo` (CRITICAL for performance)
- `flexRender` for rendering cells

**React Router v7** (from `/remix-run/react-router`):

- `createBrowserRouter` + `RouterProvider`
- Route objects with `element`, optional `loader`/`action`
- `Outlet` for nested routes
- `Link` for navigation

**Zustand v5** (from `/websites/zustand_pmnd_rs`):

- `create<State>()` with TypeScript
- `persist` middleware from `zustand/middleware`
- `createJSONStorage(() => localStorage)` for persistence

**Recharts v3** (from `/recharts/recharts`):

- `ResponsiveContainer` wrapper (REQUIRED for responsive charts)
- `BarChart`, `LineChart`, `ComposedChart` components
- Include `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Legend`

---

## Work Objectives

### Core Objective

Create a production-ready dashboard for viewing Agent Memory entries (guidelines, knowledge, tools, experiences) with a modern dark-mode UI.

### Concrete Deliverables

- `vite.config.ts` - Configured with Tailwind v4 + path aliases
- `tsconfig.app.json` - Path aliases for `@/*`
- `.env.local` - API configuration (gitignored)
- `src/index.css` - Dark theme with Tailwind v4
- `src/api/client.ts` - Typed API client with auth
- `src/api/types.ts` - TypeScript types for all entities
- `src/lib/utils.ts` - Utility functions (cn helper)
- `src/api/hooks/*.ts` - TanStack Query hooks per entity
- `src/components/layout/*` - Sidebar, Header, DashboardLayout
- `src/components/ui/*` - Button, Card, DataTable, Badge
- `src/pages/*` - Dashboard, Guidelines, Knowledge, Tools, Experiences, Graph
- `src/stores/ui.store.ts` - Sidebar state with localStorage persistence
- `src/App.tsx` - Router configuration

### Definition of Done

- [ ] `npm run dev` starts without errors
- [ ] Dark theme renders correctly (body bg-color is `#09090b`)
- [ ] Sidebar collapses/expands and persists state
- [ ] All 6 pages accessible via routing
- [ ] API data displays in tables (when REST server running)
- [ ] `npm run build` succeeds with no TS errors

### Must Have

- Dark mode as default (no theme switcher)
- Collapsible sidebar with icon-only mode
- TanStack Table for all data listings
- TanStack Query for all API calls
- Responsive layout (desktop-first)
- Authorization header in API calls
- Sidebar and layout components with `data-testid` attributes

### Must NOT Have (Guardrails)

- ❌ NO `tailwind.config.js` file (v4 uses CSS-first config)
- ❌ NO inline column definitions in TanStack Table (use `useMemo`)
- ❌ NO Zustand for server state (use TanStack Query)
- ❌ NO force-directed graph visualization (v1 = simple lists)
- ❌ NO theme switcher (dark mode only)
- ❌ NO CRUD operations (v1 = read-only)
- ❌ NO committing `.env.local` or API keys

---

## Cross-Repository Workflow

**This plan operates across two repositories:**

| Repository             | Path                                                         | Purpose                   |
| ---------------------- | ------------------------------------------------------------ | ------------------------- |
| agent-memory           | `/Users/coccobas/Development/memory/agent-memory/`           | Plan storage, REST API    |
| agent-memory-dashboard | `/Users/coccobas/Development/memory/agent-memory-dashboard/` | Code changes, git commits |

**Rules:**

1. **All code changes** → `agent-memory-dashboard`
2. **All git commits** → `agent-memory-dashboard`
3. **Plan file lives in** → `agent-memory/.sisyphus/plans/`
4. **Evidence files** → `agent-memory-dashboard/.sisyphus/evidence/`

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: NO (new project)
- **User wants tests**: Manual verification for v1
- **Framework**: None for v1

### Manual Verification Procedures

Each TODO includes executable verification commands that can be run by the agent.

### Playwright Prerequisites (CRITICAL)

**For Tasks 6-16 that use Playwright verification, these prerequisites must be met:**

1. **Create evidence directory FIRST** (before any Playwright tasks):

   ```bash
   mkdir -p /Users/coccobas/Development/memory/agent-memory-dashboard/.sisyphus/evidence
   ```

   Note: This directory is gitignored (add to `.gitignore` if not already).

2. **Start the dev server** before Playwright verification:

   ```bash
   cd /Users/coccobas/Development/memory/agent-memory-dashboard
   npm run dev
   # Wait for "Local: http://localhost:5173" message
   ```

3. **For API-dependent tasks (10-16)**, also start the REST API:

   ```bash
   cd /Users/coccobas/Development/memory/agent-memory
   AGENT_MEMORY_REST_ENABLED=true \
   AGENT_MEMORY_REST_PORT=3100 \
   AGENT_MEMORY_REST_API_KEY=dashboard-dev-key \
   AGENT_MEMORY_REST_CORS_ORIGINS=http://localhost:5173 \
   npm run start:rest
   ```

4. **Run Playwright verification** via the `playwright` skill.

5. **After verification**, stop dev server (Ctrl+C or kill process).

### Evidence Output

- All screenshots go to: `agent-memory-dashboard/.sisyphus/evidence/`
- Evidence files are NOT committed (for local verification only)
- Add to `.gitignore`: `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Configure Tailwind v4 + path aliases + clean App.css
└── Task 2: Create utility functions (cn helper)

Wave 2 (After Wave 1):
├── Task 3: Create API client + types (with correct response shapes)
├── Task 4: Create UI store (Zustand)
└── Task 5: Create base UI components (Card, Button, Badge)

Wave 3 (After Wave 2):
├── Task 6: Create layout components (Sidebar, Header, DashboardLayout)
└── Task 7: Set up React Router

Wave 4 (After Wave 3):
├── Task 8: Create TanStack Query hooks
└── Task 9: Create DataTable component

Wave 5 (After Wave 4):
├── Task 10: Dashboard page with charts
├── Task 11: Guidelines page
├── Task 12: Knowledge page
├── Task 13: Tools page
├── Task 14: Experiences page
└── Task 15: Graph page

Wave 6 (Final):
└── Task 16: Final integration + build verification
```

### Dependency Matrix

| Task  | Depends On | Blocks     | Can Parallelize With |
| ----- | ---------- | ---------- | -------------------- |
| 1     | None       | 3, 4, 5, 6 | 2                    |
| 2     | None       | 5          | 1                    |
| 3     | 1          | 8          | 4, 5                 |
| 4     | 1          | 6          | 3, 5                 |
| 5     | 1, 2       | 6, 9       | 3, 4                 |
| 6     | 4, 5       | 7          | None                 |
| 7     | 6          | 10-15      | None                 |
| 8     | 3          | 10-15      | 9                    |
| 9     | 5          | 10-15      | 8                    |
| 10-15 | 7, 8, 9    | 16         | Each other           |
| 16    | 10-15      | None       | None                 |

---

## TODOs

### Phase 1: Foundation

- [ ] 1. Configure Tailwind v4 + Path Aliases + Clean App.css

  **What to do**:
  - Update `vite.config.ts` to add `@tailwindcss/vite` plugin and `@` path alias
  - Update `tsconfig.app.json` to add `paths` and `baseUrl`
  - Replace `src/index.css` with Tailwind v4 dark theme configuration
  - Delete `src/App.css` file
  - **Update `src/App.tsx` to remove the `import './App.css'` line** (CRITICAL: prevents build error)
  - Create `.env.local` with API configuration

  **Must NOT do**:
  - DO NOT create `tailwind.config.js` (v4 doesn't need it)
  - DO NOT use PostCSS config (v4 uses Vite plugin)
  - DO NOT commit `.env.local`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration-only task, no complex logic
  - **Skills**: [`coding-standards`]
    - `coding-standards`: TypeScript config best practices

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - Context7 Tailwind v4 Vite setup:
    ```typescript
    // vite.config.ts
    import tailwindcss from '@tailwindcss/vite';
    import { defineConfig } from 'vite';
    export default defineConfig({
      plugins: [tailwindcss()],
    });
    ```
  - Context7 Tailwind v4 dark mode:
    ```css
    @import 'tailwindcss';
    @custom-variant dark (&:where(.dark, .dark *));
    ```

  **Existing Files to Modify**:
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/vite.config.ts` - Add tailwindcss plugin + resolve alias
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/tsconfig.app.json` - Add baseUrl and paths
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/src/index.css` - Replace with Tailwind v4 config
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/src/App.tsx` - Remove `import './App.css'`
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/src/App.css` - DELETE this file
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/index.html` - Add `class="dark"` to `<html>` element

  **Files to Create**:
  - `/Users/coccobas/Development/memory/agent-memory-dashboard/.env.local`

  **vite.config.ts Target** (ESM-safe - no `__dirname`):

  ```typescript
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import tailwindcss from '@tailwindcss/vite';
  import { fileURLToPath, URL } from 'node:url';

  // ESM-safe pattern: use import.meta.url instead of __dirname
  export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  });
  ```

  **Note**: The project uses `"type": "module"` in package.json, so `__dirname` is not available.
  We use `fileURLToPath(new URL('./src', import.meta.url))` which is the ESM-safe equivalent.

  **tsconfig.app.json Target** (add to compilerOptions):

  ```json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@/*": ["./src/*"]
      }
    }
  }
  ```

  **.env.local Target**:

  ```bash
  VITE_API_BASE_URL=http://localhost:3100
  VITE_API_KEY=dashboard-dev-key
  ```

  **src/index.css Target**:

  ```css
  @import 'tailwindcss';

  @custom-variant dark (&:where(.dark, .dark *));

  @theme {
    --color-background: #09090b;
    --color-foreground: #fafafa;
    --color-card: #18181b;
    --color-card-foreground: #fafafa;
    --color-muted: #27272a;
    --color-muted-foreground: #a1a1aa;
    --color-border: #27272a;
    --color-primary: #3b82f6;
    --color-primary-foreground: #ffffff;
    --color-destructive: #ef4444;
    --color-success: #22c55e;
    --color-warning: #f59e0b;
    --radius-sm: 0.25rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
  }

  html {
    color-scheme: dark;
  }

  body {
    @apply bg-background text-foreground antialiased;
  }
  ```

  **index.html Modification** (CRITICAL for dark mode activation):
  - Current: `<html lang="en">`
  - Change to: `<html lang="en" class="dark">`

  The Tailwind v4 `@custom-variant dark` requires the `dark` class on an ancestor element.
  Since we're dark-mode-only, we set it statically on `<html>`.

  **src/App.tsx Modification**:
  - Current file has `import './App.css'` near the top
  - REMOVE that line entirely

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # 1. App.css deleted and import removed
  test ! -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/App.css
  echo "App.css deleted: $?"

  grep -c "App.css" /Users/coccobas/Development/memory/agent-memory-dashboard/src/App.tsx || echo "Import removed: 0 matches"

  # 2. Dark mode class added to index.html
  grep -c 'class="dark"' /Users/coccobas/Development/memory/agent-memory-dashboard/index.html
  # Assert: >= 1 (dark class present on html element)

  # 3. Build succeeds (primary verification - more reliable than dev server check)
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build 2>&1 | tail -10
  # Assert: Exit code 0, no errors, no "Cannot find module" messages

  # 4. Tailwind theme variables in CSS output
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && grep -l "background" dist/assets/*.css
  # Assert: CSS file found with theme variables

  # 5. .env.local exists AND is not staged/tracked
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/.env.local && echo ".env.local exists"
  # Verify .env.local is NOT in git staging or tracked files
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && git ls-files --error-unmatch .env.local 2>/dev/null && echo "ERROR: .env.local is tracked!" && exit 1 || echo ".env.local correctly untracked"
  # Also verify it won't be staged (caught by .gitignore)
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && git check-ignore -q .env.local && echo ".env.local is ignored by .gitignore" || echo "WARNING: .env.local not in .gitignore!"
  ```

  **Note**: Dev server verification is done via Playwright (Task 6+) rather than `timeout` command which may not exist on macOS.

  **Evidence to Capture**:
  - [ ] Terminal output from `npm run build` (success, no errors)
  - [ ] Confirmation App.css deleted and import removed
  - [ ] Confirmation `class="dark"` added to index.html

  **Commit**: NO (commit with Task 2 as a single Wave 1 commit)
  - **DO NOT commit**: `.env.local`

---

- [ ] 2. Create Utility Functions

  **What to do**:
  - Create `src/lib/utils.ts` with `cn()` helper for class merging
  - Uses `clsx` + `tailwind-merge` (already installed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single small file creation
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - shadcn/ui cn helper pattern (standard approach)

  **Target File** (`src/lib/utils.ts`):

  ```typescript
  import { type ClassValue, clsx } from 'clsx';
  import { twMerge } from 'tailwind-merge';

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # Verify file exists and exports cn
  cat /Users/coccobas/Development/memory/agent-memory-dashboard/src/lib/utils.ts
  # Assert: Contains "export function cn"

  # Verify TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit 2>&1 | grep -i error || echo "No TS errors"
  ```

  **Commit**: YES (Wave 1 combined commit with Task 1)
  - Message: `feat(setup): configure Tailwind v4, dark theme, path aliases, and cn utility`
  - Files: `vite.config.ts`, `tsconfig.app.json`, `src/index.css`, `src/App.tsx`, `index.html`, `src/lib/utils.ts`
  - Pre-commit: `npm run build`

---

### Phase 2: Core Infrastructure

- [ ] 3. Create API Client + Types (with Correct Response Shapes)

  **What to do**:
  - Create `src/api/client.ts` - Fetch wrapper with error handling AND Authorization header
  - Create `src/api/types.ts` - TypeScript types for all entities AND correct response wrappers
  - Read API config from environment variables (`VITE_API_BASE_URL`, `VITE_API_KEY`)
  - Parse REST wrapper: `{ success: boolean, data: {...}, error?: {...} }`
  - Use correct response keys: `guidelines`, `knowledge`, `tools`, `experiences`, `sessions`, `nodes`, `edges`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Multiple files but straightforward patterns
  - **Skills**: [`coding-standards`, `backend-patterns`]
    - `coding-standards`: TypeScript types
    - `backend-patterns`: API client patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **API Response Examples** (verified from agent-memory codebase):

  **IMPORTANT**: Entities use `*WithVersion` pattern where mutable fields live under `currentVersion`:

  ```json
  // POST /v1/tools/memory_guideline { action: "list", limit: 100 }
  {
    "success": true,
    "data": {
      "guidelines": [
        {
          "id": "guid_abc123",
          "name": "no-any-types",
          "scopeType": "global",
          "isActive": true,
          "createdAt": "2025-01-15T10:00:00Z",
          "updatedAt": "2025-01-15T10:00:00Z",
          "currentVersion": {
            "id": "ver_xyz789",
            "content": "Never use 'any' type in TypeScript",
            "category": "typescript",
            "priority": 100,
            "rationale": "Type safety enforcement"
          }
        }
      ],
      "meta": {
        "returnedCount": 20,
        "hasMore": true,
        "nextCursor": "<opaque-encoded-string>"
      }
    }
  }

  // POST /v1/tools/memory_knowledge { action: "list", limit: 100 }
  {
    "success": true,
    "data": {
      "knowledge": [
        {
          "id": "know_def456",
          "scopeType": "global",
          "isActive": true,
          "createdAt": "2025-01-15T10:00:00Z",
          "currentVersion": {
            "id": "ver_abc123",
            "title": "Auth Architecture",
            "content": "Using JWT with RS256 for API auth",
            "category": "decision",
            "confidence": 0.95,
            "source": "architecture-review"
          }
        }
      ],
      "meta": { "returnedCount": 5, "hasMore": false }
    }
  }

  // Graph entities use offset pagination, not cursor
  // POST /v1/tools/graph_node { action: "list", limit: 100, offset: 0 }
  {
    "success": true,
    "data": {
      "nodes": [...],
      "meta": { "returnedCount": 20, "limit": 100, "offset": 0 }
    }
  }

  // Tool execution error (has success: false)
  {
    "success": false,
    "error": { "message": "Invalid parameters", "code": "VALIDATION_ERROR" }
  }

  // Auth middleware error (NO success flag - different shape!)
  {
    "error": "Unauthorized",
    "code": "UNAUTHORIZED",
    "retryAfterMs": 60000  // Optional: present for rate limiting
  }
  ```

  **Key Observations:**
  1. `content`, `category`, `priority`, `rationale`, `title`, `confidence`, `source` are in `currentVersion`
  2. `id`, `name`, `scopeType`, `isActive`, `createdAt`, `updatedAt` are on base entity
  3. Pagination uses `meta.hasMore` + `meta.nextCursor` (no `meta.total`)
  4. Graph uses `meta.offset` + `meta.limit` (offset-based, not cursor)
  5. Auth errors have different shape than tool errors
  6. `nextCursor` is an opaque encoded string (do not interpret its internal format)

  **Target Files**:

  `src/api/types.ts`:

  ```typescript
  // =============================================================
  // BASE ENTITY TYPES (what API returns - *WithVersion pattern)
  // =============================================================

  // Version objects contain mutable fields
  export interface GuidelineVersion {
    id: string;
    content: string;
    category?: string;
    priority?: number;
    rationale?: string;
  }

  export interface KnowledgeVersion {
    id: string;
    title: string;
    content: string;
    category: 'decision' | 'fact' | 'context' | 'reference';
    confidence?: number;
    source?: string;
  }

  export interface ToolVersion {
    id: string;
    description?: string;
    category: 'mcp' | 'cli' | 'function' | 'api';
    parameters?: Record<string, unknown>;
    constraints?: string;
  }

  export interface ExperienceVersion {
    id: string;
    title: string;
    content: string;
    scenario?: string;
    outcome?: string;
    level: 'case' | 'strategy';
    confidence?: number;
  }

  // Base entities (immutable fields + currentVersion)
  export interface GuidelineWithVersion {
    id: string;
    name: string;
    scopeType: string;
    scopeId?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    currentVersion: GuidelineVersion;
  }

  export interface KnowledgeWithVersion {
    id: string;
    scopeType: string;
    scopeId?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    currentVersion: KnowledgeVersion;
  }

  export interface ToolWithVersion {
    id: string;
    name: string;
    scopeType: string;
    scopeId?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    currentVersion: ToolVersion;
  }

  export interface ExperienceWithVersion {
    id: string;
    scopeType: string;
    scopeId?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    currentVersion: ExperienceVersion;
  }

  // Session (no version pattern)
  export interface Session {
    id: string;
    name?: string;
    purpose?: string;
    status: 'active' | 'completed' | 'discarded' | 'paused';
    createdAt: string;
    endedAt?: string;
  }

  // Graph entities (no version pattern)
  export interface GraphNode {
    id: string;
    name: string;
    nodeTypeName: string;
    properties?: Record<string, unknown>;
    isActive: boolean;
    createdAt: string;
  }

  export interface GraphEdge {
    id: string;
    sourceId: string;
    targetId: string;
    edgeTypeName: string;
    weight?: number;
    createdAt: string;
  }

  // =============================================================
  // FLATTENED TYPES (for UI display - helper transforms)
  // =============================================================

  // UI-friendly flattened types (merge base + currentVersion)
  export interface Guideline {
    id: string;
    name: string;
    content: string;
    category?: string;
    priority?: number;
    rationale?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export interface Knowledge {
    id: string;
    title: string;
    content: string;
    category: 'decision' | 'fact' | 'context' | 'reference';
    confidence?: number;
    source?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export interface Tool {
    id: string;
    name: string;
    description?: string;
    category: 'mcp' | 'cli' | 'function' | 'api';
    parameters?: Record<string, unknown>;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export interface Experience {
    id: string;
    title: string;
    content: string;
    scenario?: string;
    outcome?: string;
    level: 'case' | 'strategy';
    confidence?: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  // =============================================================
  // PAGINATION TYPES
  // =============================================================

  // Cursor-based pagination (guidelines, knowledge, tools, experiences)
  export interface CursorPaginationMeta {
    returnedCount: number;
    hasMore: boolean;
    nextCursor?: string;
  }

  // Offset-based pagination (graph nodes, edges)
  export interface OffsetPaginationMeta {
    returnedCount: number;
    limit: number;
    offset: number;
  }

  // =============================================================
  // API RESPONSE WRAPPERS
  // =============================================================

  // Tool execution success
  export interface ApiSuccessResponse<T> {
    success: true;
    data: T;
  }

  // Tool execution error
  export interface ApiToolErrorResponse {
    success: false;
    error: {
      message: string;
      code?: string;
    };
  }

  // Auth middleware error (different shape - no success field!)
  export interface ApiAuthErrorResponse {
    error: string;
    code: string;
  }

  // Union for error handling
  export type ApiResponse<T> = ApiSuccessResponse<T> | ApiToolErrorResponse;

  // Tool-specific response data shapes
  export interface GuidelinesData {
    guidelines: GuidelineWithVersion[];
    meta: CursorPaginationMeta;
  }

  export interface KnowledgeData {
    knowledge: KnowledgeWithVersion[];
    meta: CursorPaginationMeta;
  }

  export interface ToolsData {
    tools: ToolWithVersion[];
    meta: CursorPaginationMeta;
  }

  export interface ExperiencesData {
    experiences: ExperienceWithVersion[];
    meta: CursorPaginationMeta;
  }

  export interface SessionsData {
    sessions: Session[];
    meta: CursorPaginationMeta;
  }

  export interface NodesData {
    nodes: GraphNode[];
    meta: OffsetPaginationMeta;
  }

  export interface EdgesData {
    edges: GraphEdge[];
    meta: OffsetPaginationMeta;
  }
  ```

  `src/api/client.ts`:

  ```typescript
  import type {
    ApiResponse,
    ApiAuthErrorResponse,
    CursorPaginationMeta,
    OffsetPaginationMeta,
    GuidelinesData,
    KnowledgeData,
    ToolsData,
    ExperiencesData,
    SessionsData,
    NodesData,
    EdgesData,
    GuidelineWithVersion,
    KnowledgeWithVersion,
    ToolWithVersion,
    ExperienceWithVersion,
    Session,
    GraphNode,
    GraphEdge,
  } from './types';

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100';
  const API_KEY = import.meta.env.VITE_API_KEY || '';
  const MAX_LIMIT = 100; // API max limit per request

  export class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  // Type guard for auth errors (different shape - no success field)
  function isAuthError(json: unknown): json is ApiAuthErrorResponse {
    return typeof json === 'object' && json !== null && 'error' in json && !('success' in json);
  }

  export async function apiCall<T>(toolName: string, params: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${API_BASE}/v1/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY && { Authorization: `Bearer ${API_KEY}` }),
      },
      body: JSON.stringify(params),
    });

    const json = await response.json();

    // Handle auth middleware errors (different shape)
    if (isAuthError(json)) {
      throw new ApiError(json.error, response.status, json.code);
    }

    // Handle tool execution errors
    const typedJson = json as ApiResponse<T>;
    if (!typedJson.success) {
      throw new ApiError(
        typedJson.error?.message || `API error: ${response.status}`,
        response.status,
        typedJson.error?.code
      );
    }

    return typedJson.data;
  }

  // =============================================================
  // CURSOR-BASED PAGINATION HELPER (for entities with hasMore/nextCursor)
  // =============================================================

  interface CursorPagedResponse<T> {
    items: T[];
    meta: CursorPaginationMeta;
  }

  async function fetchAllByCursor<T>(
    fetcher: (cursor?: string) => Promise<CursorPagedResponse<T>>
  ): Promise<T[]> {
    const allItems: T[] = [];
    let cursor: string | undefined;

    do {
      const response = await fetcher(cursor);
      allItems.push(...response.items);
      cursor = response.meta.hasMore ? response.meta.nextCursor : undefined;
    } while (cursor);

    return allItems;
  }

  // =============================================================
  // OFFSET-BASED PAGINATION HELPER (for graph entities)
  // =============================================================

  interface OffsetPagedResponse<T> {
    items: T[];
    meta: OffsetPaginationMeta;
  }

  async function fetchAllByOffset<T>(
    fetcher: (offset: number) => Promise<OffsetPagedResponse<T>>
  ): Promise<T[]> {
    const allItems: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetcher(offset);
      allItems.push(...response.items);
      hasMore = response.meta.returnedCount === response.meta.limit;
      offset += response.meta.limit;
    }

    return allItems;
  }

  // =============================================================
  // API METHODS (with cursor/offset looping for full datasets)
  // =============================================================

  export const api = {
    guidelines: {
      // Single page (for custom pagination)
      listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
        apiCall<GuidelinesData>('memory_guideline', {
          action: 'list',
          scopeType,
          limit: MAX_LIMIT,
          ...(scopeId && { scopeId }),
          ...(cursor && { cursor }),
        }),

      // All items (loops through all pages)
      listAll: async (scopeType = 'global', scopeId?: string): Promise<GuidelineWithVersion[]> => {
        return fetchAllByCursor(async (cursor) => {
          const data = await api.guidelines.listPage(scopeType, scopeId, cursor);
          return { items: data.guidelines, meta: data.meta };
        });
      },
    },

    knowledge: {
      listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
        apiCall<KnowledgeData>('memory_knowledge', {
          action: 'list',
          scopeType,
          limit: MAX_LIMIT,
          ...(scopeId && { scopeId }),
          ...(cursor && { cursor }),
        }),

      listAll: async (scopeType = 'global', scopeId?: string): Promise<KnowledgeWithVersion[]> => {
        return fetchAllByCursor(async (cursor) => {
          const data = await api.knowledge.listPage(scopeType, scopeId, cursor);
          return { items: data.knowledge, meta: data.meta };
        });
      },
    },

    tools: {
      listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
        apiCall<ToolsData>('memory_tool', {
          action: 'list',
          scopeType,
          limit: MAX_LIMIT,
          ...(scopeId && { scopeId }),
          ...(cursor && { cursor }),
        }),

      listAll: async (scopeType = 'global', scopeId?: string): Promise<ToolWithVersion[]> => {
        return fetchAllByCursor(async (cursor) => {
          const data = await api.tools.listPage(scopeType, scopeId, cursor);
          return { items: data.tools, meta: data.meta };
        });
      },
    },

    experiences: {
      listPage: (scopeType = 'global', scopeId?: string, cursor?: string) =>
        apiCall<ExperiencesData>('memory_experience', {
          action: 'list',
          scopeType,
          limit: MAX_LIMIT,
          ...(scopeId && { scopeId }),
          ...(cursor && { cursor }),
        }),

      listAll: async (scopeType = 'global', scopeId?: string): Promise<ExperienceWithVersion[]> => {
        return fetchAllByCursor(async (cursor) => {
          const data = await api.experiences.listPage(scopeType, scopeId, cursor);
          return { items: data.experiences, meta: data.meta };
        });
      },
    },

    sessions: {
      listPage: (cursor?: string) =>
        apiCall<SessionsData>('memory_session', {
          action: 'list',
          limit: MAX_LIMIT,
          ...(cursor && { cursor }),
        }),

      listAll: async (): Promise<Session[]> => {
        return fetchAllByCursor(async (cursor) => {
          const data = await api.sessions.listPage(cursor);
          return { items: data.sessions, meta: data.meta };
        });
      },
    },

    graph: {
      // Graph uses offset pagination
      nodesPage: (offset = 0) =>
        apiCall<NodesData>('graph_node', { action: 'list', limit: MAX_LIMIT, offset }),

      edgesPage: (offset = 0) =>
        apiCall<EdgesData>('graph_edge', { action: 'list', limit: MAX_LIMIT, offset }),

      nodesAll: async (): Promise<GraphNode[]> => {
        return fetchAllByOffset(async (offset) => {
          const data = await api.graph.nodesPage(offset);
          return { items: data.nodes, meta: data.meta };
        });
      },

      edgesAll: async (): Promise<GraphEdge[]> => {
        return fetchAllByOffset(async (offset) => {
          const data = await api.graph.edgesPage(offset);
          return { items: data.edges, meta: data.meta };
        });
      },
    },
  };
  ```

  `src/api/transforms.ts` (NEW FILE - flattens \*WithVersion to UI types):

  ```typescript
  import type {
    GuidelineWithVersion,
    KnowledgeWithVersion,
    ToolWithVersion,
    ExperienceWithVersion,
    Guideline,
    Knowledge,
    Tool,
    Experience,
  } from './types';

  // Flatten GuidelineWithVersion -> Guideline (for UI display)
  export function flattenGuideline(g: GuidelineWithVersion): Guideline {
    return {
      id: g.id,
      name: g.name,
      content: g.currentVersion.content,
      category: g.currentVersion.category,
      priority: g.currentVersion.priority,
      rationale: g.currentVersion.rationale,
      isActive: g.isActive,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  export function flattenKnowledge(k: KnowledgeWithVersion): Knowledge {
    return {
      id: k.id,
      title: k.currentVersion.title,
      content: k.currentVersion.content,
      category: k.currentVersion.category,
      confidence: k.currentVersion.confidence,
      source: k.currentVersion.source,
      isActive: k.isActive,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    };
  }

  export function flattenTool(t: ToolWithVersion): Tool {
    return {
      id: t.id,
      name: t.name,
      description: t.currentVersion.description,
      category: t.currentVersion.category,
      parameters: t.currentVersion.parameters,
      isActive: t.isActive,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  export function flattenExperience(e: ExperienceWithVersion): Experience {
    return {
      id: e.id,
      title: e.currentVersion.title,
      content: e.currentVersion.content,
      scenario: e.currentVersion.scenario,
      outcome: e.currentVersion.outcome,
      level: e.currentVersion.level,
      confidence: e.currentVersion.confidence,
      isActive: e.isActive,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  # Assert: Exit code 0

  # Files exist with correct exports
  grep -l "Authorization" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/client.ts
  # Assert: Authorization header is present

  grep -l "fetchAllByCursor" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/client.ts
  # Assert: Cursor pagination helper exists

  grep -l "fetchAllByOffset" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/client.ts
  # Assert: Offset pagination helper exists

  grep -l "isAuthError" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/client.ts
  # Assert: Auth error type guard exists

  grep -l "flattenGuideline" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/transforms.ts
  # Assert: Transform functions exist

  # API client uses import.meta.env
  grep -c "import.meta.env" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/client.ts
  # Assert: >= 2 (for base URL and API key)
  ```

  **Commit**: YES
  - Message: `feat(api): add typed API client with cursor pagination and transforms`
  - Files: `src/api/client.ts`, `src/api/types.ts`, `src/api/transforms.ts`

---

- [ ] 4. Create UI Store (Zustand)

  **What to do**:
  - Create `src/stores/ui.store.ts` for sidebar state
  - Use Zustand v5 with `persist` middleware
  - Store: `sidebarCollapsed: boolean`, `toggleSidebar: () => void`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (from Context7 Zustand):

  ```typescript
  import { create } from 'zustand';
  import { persist, createJSONStorage } from 'zustand/middleware';

  type State = {
    value: number;
    action: () => void;
  };

  export const useStore = create<State>()(
    persist(
      (set, get) => ({
        value: 0,
        action: () => set({ value: get().value + 1 }),
      }),
      {
        name: 'storage-key',
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
  ```

  **Target File** (`src/stores/ui.store.ts`):

  ```typescript
  import { create } from 'zustand';
  import { persist, createJSONStorage } from 'zustand/middleware';

  interface UIState {
    sidebarCollapsed: boolean;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
  }

  export const useUIStore = create<UIState>()(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      }),
      {
        name: 'agent-memory-ui',
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # File exists and exports useUIStore
  grep -l "export const useUIStore" /Users/coccobas/Development/memory/agent-memory-dashboard/src/stores/ui.store.ts
  # Assert: File found

  # TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  ```

  **Commit**: YES (group with Task 3)
  - Message: `feat(stores): add UI store with sidebar state persistence`
  - Files: `src/stores/ui.store.ts`

---

- [ ] 5. Create Base UI Components

  **What to do**:
  - Create `src/components/ui/button.tsx`
  - Create `src/components/ui/card.tsx`
  - Create `src/components/ui/badge.tsx`
  - All components use `cn()` helper and CSS variables from theme

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation
  - **Skills**: [`frontend-patterns`, `coding-standards`]
    - `frontend-patterns`: React component patterns
    - `coding-standards`: TypeScript best practices

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Tasks 6, 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern to follow**: shadcn/ui component style (forwardRef, cn, variants)

  **Target Files**:

  `src/components/ui/button.tsx`:

  ```typescript
  import * as React from 'react';
  import { cn } from '@/lib/utils';

  export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline' | 'ghost';
    size?: 'default' | 'sm' | 'lg' | 'icon';
  }

  const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'default', ...props }, ref) => {
      return (
        <button
          className={cn(
            'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'disabled:pointer-events-none disabled:opacity-50',
            {
              'bg-primary text-primary-foreground hover:bg-primary/90':
                variant === 'default',
              'bg-destructive text-white hover:bg-destructive/90':
                variant === 'destructive',
              'border border-border bg-transparent hover:bg-muted':
                variant === 'outline',
              'hover:bg-muted': variant === 'ghost',
            },
            {
              'h-10 px-4 py-2': size === 'default',
              'h-9 px-3': size === 'sm',
              'h-11 px-8': size === 'lg',
              'h-10 w-10': size === 'icon',
            },
            className
          )}
          ref={ref}
          {...props}
        />
      );
    }
  );
  Button.displayName = 'Button';

  export { Button };
  ```

  `src/components/ui/card.tsx`:

  ```typescript
  import * as React from 'react';
  import { cn } from '@/lib/utils';

  const Card = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >(({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  ));
  Card.displayName = 'Card';

  const CardHeader = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >(({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  ));
  CardHeader.displayName = 'CardHeader';

  const CardTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
  >(({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-2xl font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    />
  ));
  CardTitle.displayName = 'CardTitle';

  const CardDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
  >(({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  ));
  CardDescription.displayName = 'CardDescription';

  const CardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ));
  CardContent.displayName = 'CardContent';

  export { Card, CardHeader, CardTitle, CardDescription, CardContent };
  ```

  `src/components/ui/badge.tsx`:

  ```typescript
  import * as React from 'react';
  import { cn } from '@/lib/utils';

  export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'success' | 'warning';
  }

  function Badge({ className, variant = 'default', ...props }: BadgeProps) {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
          {
            'bg-primary text-primary-foreground': variant === 'default',
            'bg-muted text-muted-foreground': variant === 'secondary',
            'bg-destructive text-white': variant === 'destructive',
            'bg-success text-white': variant === 'success',
            'bg-warning text-white': variant === 'warning',
          },
          className
        )}
        {...props}
      />
    );
  }

  export { Badge };
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # Files exist
  ls /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/
  # Assert: button.tsx, card.tsx, badge.tsx exist

  # TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  ```

  **Commit**: YES
  - Message: `feat(ui): add Button, Card, and Badge components`
  - Files: `src/components/ui/*.tsx`

---

### Phase 3: Layout

- [ ] 6. Create Layout Components

  **What to do**:
  - Create `src/components/layout/sidebar.tsx` - Collapsible navigation
  - Create `src/components/layout/header.tsx` - Top header bar
  - Create `src/components/layout/dashboard-layout.tsx` - Main layout wrapper
  - Use Lucide icons (already installed)
  - Sidebar uses `useUIStore` for collapse state
  - **Add `data-testid` attributes for testing**:
    - Sidebar: `data-testid="sidebar"`
    - Toggle button: `aria-label="Toggle sidebar"`

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI layout work
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]
    - `frontend-patterns`: React component patterns
    - `frontend-ui-ux`: Modern UI/UX design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Navigation Items**:
  - Dashboard (LayoutDashboard icon) - `/`
  - Guidelines (ScrollText icon) - `/guidelines`
  - Knowledge (Brain icon) - `/knowledge`
  - Tools (Wrench icon) - `/tools`
  - Experiences (Lightbulb icon) - `/experiences`
  - Graph (Network icon) - `/graph`

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:5173
  2. Wait for: selector "[data-testid='sidebar']" to be visible
  3. Verify: sidebar element exists
  4. Click: button with aria-label "Toggle sidebar"
  5. Wait: 500ms for animation
  6. Verify: sidebar has class indicating collapsed state OR width changed
  7. Reload page
  8. Verify: sidebar remains in collapsed state (persistence works)
  9. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-6-layout.png
  ```

  **Commit**: YES
  - Message: `feat(layout): add Sidebar, Header, and DashboardLayout`
  - Files: `src/components/layout/*.tsx`

---

- [ ] 7. Set Up React Router

  **What to do**:
  - Update `src/App.tsx` with `createBrowserRouter` + `RouterProvider`
  - Define routes for all pages (placeholder components initially)
  - Wrap routes in `DashboardLayout`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: Tasks 10-15
  - **Blocked By**: Task 6

  **References**:

  **Pattern References** (from Context7 React Router v7):

  ```typescript
  import { createBrowserRouter, RouterProvider, Outlet } from 'react-router';

  const router = createBrowserRouter([
    {
      path: '/',
      element: <Root />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'guidelines', element: <Guidelines /> },
        // ...
      ],
    },
  ]);

  export default function App() {
    return <RouterProvider router={router} />;
  }
  ```

  **Target Structure** (`src/App.tsx`):

  ```typescript
  import { createBrowserRouter, RouterProvider } from 'react-router-dom';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { DashboardLayout } from '@/components/layout/dashboard-layout';

  // Placeholder pages (will be replaced)
  const Dashboard = () => <div>Dashboard</div>;
  const Guidelines = () => <div>Guidelines</div>;
  const Knowledge = () => <div>Knowledge</div>;
  const Tools = () => <div>Tools</div>;
  const Experiences = () => <div>Experiences</div>;
  const Graph = () => <div>Graph</div>;

  const queryClient = new QueryClient();

  const router = createBrowserRouter([
    {
      path: '/',
      element: <DashboardLayout />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'guidelines', element: <Guidelines /> },
        { path: 'knowledge', element: <Knowledge /> },
        { path: 'tools', element: <Tools /> },
        { path: 'experiences', element: <Experiences /> },
        { path: 'graph', element: <Graph /> },
      ],
    },
  ]);

  export default function App() {
    return (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  # Agent navigates all routes:
  1. Navigate to: http://localhost:5173
  2. Assert: "Dashboard" text visible
  3. Navigate to: http://localhost:5173/guidelines
  4. Assert: "Guidelines" text visible
  5. Navigate to: http://localhost:5173/knowledge
  6. Assert: "Knowledge" text visible
  7. Navigate to: http://localhost:5173/tools
  8. Assert: "Tools" text visible
  9. Navigate to: http://localhost:5173/experiences
  10. Assert: "Experiences" text visible
  11. Navigate to: http://localhost:5173/graph
  12. Assert: "Graph" text visible
  ```

  **Commit**: YES
  - Message: `feat(router): configure React Router with all page routes`
  - Files: `src/App.tsx`

---

### Phase 4: Data Layer

- [ ] 8. Create TanStack Query Hooks

  **What to do**:
  - Create `src/api/hooks/use-guidelines.ts`
  - Create `src/api/hooks/use-knowledge.ts`
  - Create `src/api/hooks/use-tools.ts`
  - Create `src/api/hooks/use-experiences.ts`
  - Create `src/api/hooks/use-sessions.ts`
  - Create `src/api/hooks/use-graph.ts`
  - Create `src/api/hooks/index.ts` (barrel export)
  - Each hook uses `useQuery` with proper queryKey
  - **Use `api.*.listAll()` to fetch all pages** (cursor looping)
  - **Use flatten transforms** to convert `*WithVersion` → UI types

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`frontend-patterns`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Tasks 10-15
  - **Blocked By**: Task 3

  **References**:

  **Pattern References** (from Context7 TanStack Query v5):

  ```typescript
  import { useQuery } from '@tanstack/react-query';

  export function useGuidelines() {
    return useQuery({
      queryKey: ['guidelines'],
      queryFn: () => api.guidelines.listAll(), // Uses cursor looping
    });
  }
  ```

  **Target Example** (`src/api/hooks/use-guidelines.ts`):

  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import { api } from '@/api/client';
  import { flattenGuideline } from '@/api/transforms';
  import type { Guideline } from '@/api/types';

  export function useGuidelines(scopeType = 'global', scopeId?: string) {
    return useQuery({
      queryKey: ['guidelines', scopeType, scopeId],
      queryFn: async (): Promise<Guideline[]> => {
        // listAll() handles cursor pagination internally
        const items = await api.guidelines.listAll(scopeType, scopeId);
        // Flatten *WithVersion objects to UI-friendly types
        return items.map(flattenGuideline);
      },
    });
  }
  ```

  **Target Example** (`src/api/hooks/use-graph.ts`):

  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import { api } from '@/api/client';
  import type { GraphNode, GraphEdge } from '@/api/types';

  export function useGraphNodes() {
    return useQuery({
      queryKey: ['graph', 'nodes'],
      queryFn: async (): Promise<GraphNode[]> => {
        // nodesAll() handles offset pagination internally
        return api.graph.nodesAll();
      },
    });
  }

  export function useGraphEdges() {
    return useQuery({
      queryKey: ['graph', 'edges'],
      queryFn: async (): Promise<GraphEdge[]> => {
        return api.graph.edgesAll();
      },
    });
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # All hook files exist
  ls /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/
  # Assert: use-guidelines.ts, use-knowledge.ts, use-tools.ts, use-experiences.ts, use-sessions.ts, use-graph.ts, index.ts

  # Hooks use listAll (not list)
  grep -c "listAll" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/use-guidelines.ts
  # Assert: >= 1

  # Hooks use flatten transforms
  grep -c "flattenGuideline" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/use-guidelines.ts
  # Assert: >= 1

  # Graph hooks use nodesAll/edgesAll
  grep -c "nodesAll\|edgesAll" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/use-graph.ts
  # Assert: >= 2

  # TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  ```

  **Commit**: YES
  - Message: `feat(api): add TanStack Query hooks with cursor pagination and transforms`
  - Files: `src/api/hooks/*.ts`

---

- [ ] 9. Create DataTable Component

  **What to do**:
  - Create `src/components/ui/data-table.tsx`
  - Generic TanStack Table wrapper component
  - Uses `useMemo` for columns (CRITICAL)
  - Implement UX per "DataTable UX Specification" section above

  **UX Features to Implement** (see DataTable UX Specification):
  - **Global search**: Text input above table, placeholder "Search..."
  - **Sorting**: Click header to cycle (unsorted → asc → desc), show arrow indicator
  - **Pagination**: "Previous"/"Next" buttons, "Page X of Y", page size dropdown (10/20/50/100)
  - **Default sort**: `createdAt` descending

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 8)
  - **Blocks**: Tasks 10-15
  - **Blocked By**: Task 5

  **References**:

  **Pattern References** (from Context7 TanStack Table):

  ```typescript
  import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    SortingState,
  } from '@tanstack/react-table';

  // CRITICAL: columns MUST be memoized
  const columns = React.useMemo<ColumnDef<Person>[]>(() => [...], []);

  // Sorting state
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true }  // Default: newest first
  ]);

  // Global filter state
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  ```

  **Component Props**:

  ```typescript
  interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    isLoading?: boolean;
    error?: Error | null;
    emptyMessage?: string;
  }
  ```

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # File exists with required features
  cat /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/data-table.tsx | grep -c "useMemo"
  # Assert: >= 1 (columns are memoized)

  grep -c "globalFilter" /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/data-table.tsx
  # Assert: >= 1 (global filter implemented)

  grep -c "getPaginationRowModel" /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/data-table.tsx
  # Assert: >= 1 (pagination implemented)

  # TypeScript compiles
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  ```

  **Commit**: YES
  - Message: `feat(ui): add DataTable component with search, sort, and pagination`
  - Files: `src/components/ui/data-table.tsx`

---

### Phase 5: Pages

- [ ] 10. Create Dashboard Page

  **What to do**:
  - Create `src/pages/dashboard.tsx`
  - Show entry counts (guidelines, knowledge, tools, experiences)
  - Use Recharts for visualization
  - Card-based layout
  - **Add `data-testid="stats-card"` to stat cards**

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 11-15)
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 7, 8, 9

  **References**:

  **Pattern References** (from Context7 Recharts):

  ```jsx
  import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}>
      <XAxis dataKey="name" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="count" fill="#3b82f6" />
    </BarChart>
  </ResponsiveContainer>;
  ```

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  # With API running at localhost:3100:
  1. Navigate to: http://localhost:5173
  2. Wait for: selector "[data-testid='stats-card']" to be visible (timeout 5s)
  3. Count: elements matching "[data-testid='stats-card']"
  4. Assert: count >= 4 (one per entity type: guidelines, knowledge, tools, experiences)
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-10-dashboard.png
  ```

  **Commit**: YES
  - Message: `feat(pages): add Dashboard page with stats and charts`
  - Files: `src/pages/dashboard.tsx`

---

- [ ] 11. Create Guidelines Page

  **What to do**:
  - Create `src/pages/guidelines.tsx`
  - Use DataTable component
  - Columns: name, category, priority, status, createdAt
  - Use `useGuidelines` hook

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 10, 12-15)
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 7, 8, 9

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  1. Navigate to: http://localhost:5173/guidelines
  2. Wait for: selector "table" to be visible (timeout 5s)
  3. Assert: Table header contains text "Name"
  4. Assert: Table header contains text "Category"
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-11-guidelines.png
  ```

  **Commit**: YES (group with other pages)

---

- [ ] 12. Create Knowledge Page

  **What to do**:
  - Create `src/pages/knowledge.tsx`
  - Same pattern as Guidelines
  - Columns: title, category, confidence, source, createdAt

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  1. Navigate to: http://localhost:5173/knowledge
  2. Wait for: selector "table" to be visible (timeout 5s)
  3. Assert: Table header contains text "Title"
  4. Assert: Table header contains text "Category"
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-12-knowledge.png
  ```

  **Commit**: YES (group with other pages)

---

- [ ] 13. Create Tools Page

  **What to do**:
  - Create `src/pages/tools.tsx`
  - Columns: name, category, description, createdAt

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  1. Navigate to: http://localhost:5173/tools
  2. Wait for: selector "table" to be visible (timeout 5s)
  3. Assert: Table header contains text "Name"
  4. Assert: Table header contains text "Description"
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-13-tools.png
  ```

  **Commit**: YES (group with other pages)

---

- [ ] 14. Create Experiences Page

  **What to do**:
  - Create `src/pages/experiences.tsx`
  - Columns: title, level, scenario, outcome, confidence, createdAt

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  1. Navigate to: http://localhost:5173/experiences
  2. Wait for: selector "table" to be visible (timeout 5s)
  3. Assert: Table header contains text "Title"
  4. Assert: Table header contains text "Level"
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-14-experiences.png
  ```

  **Commit**: YES (group with other pages)

---

- [ ] 15. Create Graph Page

  **What to do**:
  - Create `src/pages/graph.tsx`
  - v1: Simple node list + edge list (NOT force-directed visualization)
  - Two DataTables: Nodes and Edges

  **Node Table Columns**:
  - id (truncated)
  - name
  - nodeTypeName
  - isActive (badge)
  - createdAt

  **Edge Table Columns**:
  - id (truncated)
  - sourceId (truncated)
  - targetId (truncated)
  - edgeTypeName
  - weight

  **Must NOT do**:
  - DO NOT implement force-directed graph visualization
  - DO NOT use D3 force simulation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5

  **Acceptance Criteria**:

  **Automated Verification** (using playwright skill):

  ```
  1. Navigate to: http://localhost:5173/graph
  2. Wait for: page contains text "Nodes" (section heading)
  3. Wait for: page contains text "Edges" (section heading)
  4. Assert: Two tables visible on page
  5. Screenshot: agent-memory-dashboard/.sisyphus/evidence/task-15-graph.png
  ```

  **Commit**: YES
  - Message: `feat(pages): add all data pages (Guidelines, Knowledge, Tools, Experiences, Graph)`
  - Files: `src/pages/*.tsx`

---

### Phase 6: Final Integration

- [ ] 16. Final Integration + Build Verification

  **What to do**:
  - Update `src/App.tsx` to import actual page components from `src/pages/`
  - Run `npm run build` and verify no errors
  - Test all routes work
  - Verify dark theme renders correctly (body background = `#09090b`)
  - Create `.sisyphus/evidence/` directory in dashboard project

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`coding-standards`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 10-15

  **Acceptance Criteria**:

  **Automated Verification**:

  ```bash
  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  # Assert: Exit code 0

  # Dist folder created
  ls -la /Users/coccobas/Development/memory/agent-memory-dashboard/dist/
  # Assert: index.html exists

  # No TypeScript errors
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npx tsc --noEmit
  # Assert: Exit code 0
  ```

  **Automated Verification** (using playwright skill):

  ```
  # Full navigation test:
  1. Start dev server: npm run dev
  2. Navigate to each route: /, /guidelines, /knowledge, /tools, /experiences, /graph
  3. For each page: verify no console errors
  4. Verify dark theme: body computed background-color is rgb(9, 9, 11) or equivalent
  5. Screenshot each page to agent-memory-dashboard/.sisyphus/evidence/final-*.png
  ```

  **Commit**: YES
  - Message: `feat: complete Agent Memory Dashboard v1`
  - Files: `src/App.tsx`, any remaining fixes

---

## Commit Strategy

All commits go to the **agent-memory-dashboard** repository.

| After Task | Message                                                                | Files                                                              |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1-2        | `feat(config): configure Tailwind v4 with dark theme and path aliases` | vite.config.ts, tsconfig.app.json, src/index.css, src/lib/utils.ts |
| 3-4        | `feat(api): add API client and UI store`                               | src/api/\*, src/stores/\*                                          |
| 5          | `feat(ui): add Button, Card, and Badge components`                     | src/components/ui/\*.tsx                                           |
| 6          | `feat(layout): add Sidebar, Header, and DashboardLayout`               | src/components/layout/\*.tsx                                       |
| 7          | `feat(router): configure React Router with all page routes`            | src/App.tsx                                                        |
| 8-9        | `feat(data): add TanStack Query hooks and DataTable`                   | src/api/hooks/\*, src/components/ui/data-table.tsx                 |
| 10-15      | `feat(pages): add all data pages`                                      | src/pages/\*.tsx                                                   |
| 16         | `feat: complete Agent Memory Dashboard v1`                             | Final fixes                                                        |

---

## Success Criteria

### Verification Commands

```bash
# 1. Dev server starts
cd /Users/coccobas/Development/memory/agent-memory-dashboard
npm run dev
# Expected: Listening on http://localhost:5173

# 2. Build succeeds
npm run build
# Expected: dist/ folder created, no errors

# 3. TypeScript clean
npx tsc --noEmit
# Expected: No errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All pages accessible via sidebar navigation
- [ ] Dark theme renders correctly (body bg = #09090b)
- [ ] Sidebar collapse state persists across page reload
- [ ] API data displays in tables (when REST server running with auth)
- [ ] Build completes without errors
- [ ] No `.env.local` or API keys committed to git

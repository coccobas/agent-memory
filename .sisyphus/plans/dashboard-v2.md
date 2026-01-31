# Agent Memory Dashboard v2 Enhancements

## TL;DR

> **Quick Summary**: Enhance the Agent Memory Dashboard with 7 new features: code splitting, analytics page with charts, export functionality, global search, keyboard shortcuts, full CRUD operations, and interactive graph visualization.
>
> **Deliverables**:
>
> - Code splitting with React.lazy() for all pages
> - Analytics page with 4 chart types (bar, pie, line, gauge)
> - Export to JSON/CSV from all data tables
> - Global search in header with command palette (Cmd+K)
> - Keyboard shortcuts for navigation and actions
> - Full CRUD (Create/Edit/Delete) for Guidelines, Knowledge, Tools, Experiences
> - Interactive force-directed graph visualization
>
> **Estimated Effort**: Large (5-7 days)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Code Splitting → Analytics/Export/Search → CRUD → Graph
> **Project Location**: `/Users/coccobas/Development/memory/agent-memory-dashboard/`

---

## Prerequisites

### Existing v1 Infrastructure

The dashboard v1 is complete with:

- 9 pages: Dashboard, Guidelines, Knowledge, Tools, Experiences, Sessions, Episodes, Graph, Librarian
- TanStack Query hooks for all entities
- TanStack Table with sorting/filtering/pagination
- Zustand UI store for sidebar state
- Modal component for detail views
- Scope selector already implemented
- Entry detail modals already implemented

### REST API Server

```bash
cd /Users/coccobas/Development/memory/agent-memory
AGENT_MEMORY_REST_ENABLED=true \
AGENT_MEMORY_REST_PORT=3100 \
AGENT_MEMORY_REST_API_KEY=dashboard-dev-key \
AGENT_MEMORY_REST_CORS_ORIGINS=http://localhost:5173 \
npm run start:rest
```

---

## Context

### Original Request

Enhance the Agent Memory Dashboard with all proposed v2 features.

### Metis Review Findings

**Features Already Complete** (excluded from this plan):

- Scope/Project Selector - Already in header.tsx
- Entry Detail Modals - Already in all 4 entity pages

**Recommended Implementation Order**:

1. Code splitting (enables safe addition of graph library)
2. Analytics page (bounded scope, uses existing recharts)
3. Export functionality (low complexity, high utility)
4. Global search (uses existing memory_query API)
5. Keyboard shortcuts (low complexity)
6. CRUD operations (highest complexity)
7. Graph visualization (lazy-loaded, react-force-graph-2d)

**Technical Recommendations**:

- Use `react-force-graph-2d` for graph (70KB, native React, TypeScript built-in)
- Lazy-load graph page with React.lazy() + Suspense
- Follow mutation patterns from `use-librarian.ts` for CRUD
- Extend `ui.store.ts` for search state

---

## Work Objectives

### Core Objective

Transform the read-only dashboard into a full-featured admin interface with CRUD operations, analytics visualization, search, and interactive graph exploration.

### Concrete Deliverables

**Code Splitting**:

- `src/App.tsx` - Lazy-loaded routes with Suspense
- Initial bundle < 500KB (currently 808KB)

**Analytics**:

- `src/pages/analytics.tsx` - Analytics dashboard with 4 charts
- `src/api/hooks/use-analytics.ts` - TanStack Query hooks for analytics API

**Export**:

- `src/components/ui/export-button.tsx` - Reusable export component
- Integration with all DataTable instances

**Search**:

- `src/components/ui/command-palette.tsx` - Cmd+K search modal
- `src/api/hooks/use-search.ts` - Search hook using memory_query

**Keyboard Shortcuts**:

- `src/hooks/use-keyboard-shortcuts.ts` - Global shortcut handler
- Shortcut overlay (? key)

**CRUD**:

- `src/components/ui/entity-form.tsx` - Reusable form component
- `src/api/hooks/use-mutations.ts` - Create/Update/Delete mutations
- Modal forms for each entity type

**Graph**:

- `src/pages/graph.tsx` - Updated with ForceGraph2D
- `react-force-graph-2d` package added

### Definition of Done

- [ ] Initial bundle < 500KB after code splitting
- [ ] Analytics page loads with 4 charts when API running
- [ ] Export button downloads JSON/CSV from any table
- [ ] Cmd+K opens search, results navigate to correct page
- [ ] Keyboard shortcuts work (g+d = dashboard, g+g = guidelines, etc.)
- [ ] Can create, edit, and delete entries for all 4 entity types
- [ ] Graph page shows interactive force-directed visualization
- [ ] `npm run build` succeeds with no TS errors

### Must Have

- Lazy loading for all route pages
- Confirmation dialogs for delete operations
- Loading states for all async operations
- Error handling for failed mutations
- Debounced search input
- Export preserves current filter/sort

### Must NOT Have (Guardrails)

- ❌ NO graph analysis features (keep visualization simple)
- ❌ NO inline editing in tables (use modal forms only)
- ❌ NO hard delete without confirmation
- ❌ NO importing graph library in main bundle (must be lazy-loaded)
- ❌ NO custom chart implementations (use Recharts only)
- ❌ NO complex keyboard chord sequences (keep shortcuts simple)

---

## Verification Strategy

### Test Decision

- **User wants tests**: Manual verification
- **Framework**: None (Playwright for UI verification)

### Manual Verification Procedures

Each TODO includes executable verification commands.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Code splitting for all pages

Wave 2 (After Wave 1):
├── Task 2: Analytics page with charts
├── Task 3: Export functionality
└── Task 4: Global search with command palette

Wave 3 (After Wave 2):
├── Task 5: Keyboard shortcuts
└── Task 6: CRUD - Mutations infrastructure

Wave 4 (After Wave 3):
├── Task 7: CRUD - Entity forms (Guidelines, Knowledge)
├── Task 8: CRUD - Entity forms (Tools, Experiences)
└── Task 9: Graph visualization

Wave 5 (Final):
└── Task 10: Integration testing and polish
```

### Dependency Matrix

| Task | Depends On | Blocks     | Can Parallelize With |
| ---- | ---------- | ---------- | -------------------- |
| 1    | None       | 2, 3, 4, 9 | None                 |
| 2    | 1          | 10         | 3, 4                 |
| 3    | 1          | 10         | 2, 4                 |
| 4    | 1          | 5, 10      | 2, 3                 |
| 5    | 4          | 10         | 6                    |
| 6    | 1          | 7, 8       | 5                    |
| 7    | 6          | 10         | 8                    |
| 8    | 6          | 10         | 7                    |
| 9    | 1          | 10         | 7, 8                 |
| 10   | 2-9        | None       | None                 |

---

## TODOs

### Wave 1: Foundation

- [ ] 1. Code Splitting for All Pages

  **What to do**:
  - Update `src/App.tsx` to use `React.lazy()` for all page imports
  - Add `Suspense` wrapper with loading fallback
  - Verify bundle size reduction

  **Must NOT do**:
  - DO NOT eager-load any page components
  - DO NOT remove ErrorBoundary wrapping

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Blocks**: Tasks 2, 3, 4, 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - React.lazy() documentation: https://react.dev/reference/react/lazy
  - Current App.tsx structure

  **Target Implementation**:

  ```typescript
  // src/App.tsx
  import { Suspense, lazy } from 'react';
  import { Loader2 } from 'lucide-react';

  const DashboardPage = lazy(() => import('@/pages/dashboard').then(m => ({ default: m.DashboardPage })));
  const GuidelinesPage = lazy(() => import('@/pages/guidelines').then(m => ({ default: m.GuidelinesPage })));
  // ... repeat for all pages

  function PageLoader() {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // In router config, wrap each element:
  { index: true, element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense> }
  ```

  **Acceptance Criteria**:

  ```bash
  # Build and check bundle size
  cd /Users/coccobas/Development/memory/agent-memory-dashboard
  npm run build 2>&1 | grep -E "index.*\.js"
  # Assert: Main bundle < 500KB

  # Verify lazy loading works (check for chunk files)
  ls dist/assets/*.js | wc -l
  # Assert: Multiple JS chunks (not just one)
  ```

  **Commit**: YES
  - Message: `perf(bundle): add code splitting with React.lazy for all pages`
  - Files: `src/App.tsx`

---

### Wave 2: Read Features

- [ ] 2. Analytics Page with Charts

  **What to do**:
  - Create `src/api/hooks/use-analytics.ts` with hooks for memory_analytics API
  - Create `src/pages/analytics.tsx` with 4 chart sections:
    - Bar chart: Tool executions by tool name
    - Pie chart: Notification distribution by severity
    - Line chart: Trends over time (7-day default)
    - Gauge/Card: Session health score
  - Add Analytics to sidebar navigation
  - Add route in App.tsx

  **Must NOT do**:
  - DO NOT create custom chart components (use Recharts directly)
  - DO NOT add date range picker in v2 (hardcode 7 days)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:

  **API Reference**:
  - `memory_analytics` with actions: `get_tool_stats`, `get_notification_stats`, `get_dashboard`
  - Returns: `{ toolStats: { byTool: [...] }, notificationStats: [...], health: { score, grade } }`

  **Pattern References**:
  - Existing Recharts usage in `src/pages/dashboard.tsx`
  - Hook patterns in `src/api/hooks/use-librarian.ts`

  **Target Files**:

  `src/api/hooks/use-analytics.ts`:

  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import { api } from '../client';

  export function useToolStats(timeRange: 'day' | 'week' | 'month' = 'week') {
    return useQuery({
      queryKey: ['analytics', 'tools', timeRange],
      queryFn: () => api.analytics.getToolStats(timeRange),
    });
  }

  export function useNotificationStats() {
    return useQuery({
      queryKey: ['analytics', 'notifications'],
      queryFn: () => api.analytics.getNotificationStats(),
    });
  }

  export function useDashboardStats() {
    return useQuery({
      queryKey: ['analytics', 'dashboard'],
      queryFn: () => api.analytics.getDashboard(),
    });
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify analytics page exists and exports correctly
  grep -l "AnalyticsPage" /Users/coccobas/Development/memory/agent-memory-dashboard/src/pages/index.ts
  # Assert: Found

  # Verify Recharts components used
  grep -c "BarChart\|PieChart\|LineChart" /Users/coccobas/Development/memory/agent-memory-dashboard/src/pages/analytics.tsx
  # Assert: >= 3

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `feat(analytics): add analytics page with tool stats, notifications, and health charts`
  - Files: `src/pages/analytics.tsx`, `src/api/hooks/use-analytics.ts`, `src/api/hooks/index.ts`, `src/pages/index.ts`, `src/App.tsx`, `src/components/layout/sidebar.tsx`

---

- [ ] 3. Export Functionality

  **What to do**:
  - Create `src/components/ui/export-button.tsx` - Button with dropdown (JSON/CSV)
  - Create `src/lib/export.ts` - Export utilities
  - Integrate ExportButton into DataTable component
  - Export respects current filter/sort state

  **Must NOT do**:
  - DO NOT export raw API response shape (flatten for usability)
  - DO NOT add server-side export (client-side only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:

  **Target Implementation**:

  `src/lib/export.ts`:

  ```typescript
  export function exportToJSON<T>(data: T[], filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${filename}.json`);
  }

  export function exportToCSV<T extends Record<string, unknown>>(data: T[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `${filename}.csv`);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  ```

  `src/components/ui/export-button.tsx`:

  ```typescript
  import { Download } from 'lucide-react';
  import { Button } from './button';
  import { exportToJSON, exportToCSV } from '@/lib/export';

  interface ExportButtonProps<T> {
    data: T[];
    filename: string;
  }

  export function ExportButton<T extends Record<string, unknown>>({ data, filename }: ExportButtonProps<T>) {
    return (
      <div className="relative group">
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
        <div className="absolute right-0 mt-1 hidden group-hover:block bg-card border border-border rounded-md shadow-lg z-10">
          <button
            onClick={() => exportToJSON(data, filename)}
            className="block w-full px-4 py-2 text-sm text-left hover:bg-muted"
          >
            Export as JSON
          </button>
          <button
            onClick={() => exportToCSV(data, filename)}
            className="block w-full px-4 py-2 text-sm text-left hover:bg-muted"
          >
            Export as CSV
          </button>
        </div>
      </div>
    );
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify export utilities exist
  grep -l "exportToJSON" /Users/coccobas/Development/memory/agent-memory-dashboard/src/lib/export.ts
  # Assert: Found

  # Verify ExportButton component exists
  grep -l "ExportButton" /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/export-button.tsx
  # Assert: Found

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(export): add JSON/CSV export functionality to data tables`
  - Files: `src/lib/export.ts`, `src/components/ui/export-button.tsx`, `src/components/ui/data-table.tsx`

---

- [ ] 4. Global Search with Command Palette

  **What to do**:
  - Create `src/components/ui/command-palette.tsx` - Modal search UI (Cmd+K)
  - Create `src/api/hooks/use-search.ts` - Search hook using memory_query
  - Add search trigger button in Header
  - Search results grouped by entity type
  - Click result navigates to entity page with entry highlighted/opened

  **Must NOT do**:
  - DO NOT search on every keystroke (use 300ms debounce)
  - DO NOT show more than 10 results per entity type

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Tasks 5, 10
  - **Blocked By**: Task 1

  **References**:

  **API Reference**:
  - `memory_query` with action `search` and parameter `search: "<query>"`
  - Returns mixed results from all entity types

  **Pattern References**:
  - cmdk library patterns (but implement manually for simplicity)
  - Modal component from `src/components/ui/modal.tsx`

  **Target Implementation**:

  `src/api/hooks/use-search.ts`:

  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import { api } from '../client';

  export function useGlobalSearch(query: string, enabled: boolean) {
    return useQuery({
      queryKey: ['search', query],
      queryFn: () => api.search(query),
      enabled: enabled && query.length >= 2,
      staleTime: 1000 * 60, // 1 minute
    });
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify command palette component exists
  grep -l "CommandPalette" /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/command-palette.tsx
  # Assert: Found

  # Verify Cmd+K handler in component
  grep -c "metaKey.*KeyK\|ctrlKey.*KeyK" /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/ui/command-palette.tsx
  # Assert: >= 1

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(search): add global search with command palette (Cmd+K)`
  - Files: `src/components/ui/command-palette.tsx`, `src/api/hooks/use-search.ts`, `src/api/hooks/index.ts`, `src/components/layout/header.tsx`, `src/api/client.ts`

---

### Wave 3: Interaction Features

- [ ] 5. Keyboard Shortcuts

  **What to do**:
  - Create `src/hooks/use-keyboard-shortcuts.ts` - Global shortcut handler
  - Add shortcut overlay (? key shows available shortcuts)
  - Implement navigation shortcuts:
    - `g d` - Go to Dashboard
    - `g g` - Go to Guidelines
    - `g k` - Go to Knowledge
    - `g t` - Go to Tools
    - `g e` - Go to Experiences
    - `g s` - Go to Sessions
    - `g p` - Go to Episodes
    - `g r` - Go to Graph
    - `g l` - Go to Librarian
    - `g a` - Go to Analytics
    - `/` or `Cmd+K` - Open search
    - `?` - Show shortcuts help
    - `Escape` - Close modals/search

  **Must NOT do**:
  - DO NOT use complex chord sequences (keep it simple: prefix + key)
  - DO NOT conflict with browser shortcuts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 10
  - **Blocked By**: Task 4

  **References**:

  **Target Implementation**:

  `src/hooks/use-keyboard-shortcuts.ts`:

  ```typescript
  import { useEffect, useCallback, useState } from 'react';
  import { useNavigate } from 'react-router-dom';

  export function useKeyboardShortcuts() {
    const navigate = useNavigate();
    const [prefix, setPrefix] = useState<string | null>(null);

    const handleKeyDown = useCallback(
      (e: KeyboardEvent) => {
        // Ignore if typing in input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        if (prefix === 'g') {
          setPrefix(null);
          switch (e.key) {
            case 'd':
              navigate('/');
              break;
            case 'g':
              navigate('/guidelines');
              break;
            case 'k':
              navigate('/knowledge');
              break;
            case 't':
              navigate('/tools');
              break;
            case 'e':
              navigate('/experiences');
              break;
            case 's':
              navigate('/sessions');
              break;
            case 'p':
              navigate('/episodes');
              break;
            case 'r':
              navigate('/graph');
              break;
            case 'l':
              navigate('/librarian');
              break;
            case 'a':
              navigate('/analytics');
              break;
          }
        } else if (e.key === 'g') {
          setPrefix('g');
          setTimeout(() => setPrefix(null), 1000); // Reset after 1s
        }
      },
      [navigate, prefix]
    );

    useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify keyboard shortcuts hook exists
  grep -l "useKeyboardShortcuts" /Users/coccobas/Development/memory/agent-memory-dashboard/src/hooks/use-keyboard-shortcuts.ts
  # Assert: Found

  # Verify navigation shortcuts are defined
  grep -c "navigate\('/\|navigate\('/guidelines" /Users/coccobas/Development/memory/agent-memory-dashboard/src/hooks/use-keyboard-shortcuts.ts
  # Assert: >= 2

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(shortcuts): add keyboard shortcuts for navigation (g+key pattern)`
  - Files: `src/hooks/use-keyboard-shortcuts.ts`, `src/App.tsx` or layout component

---

- [ ] 6. CRUD - Mutations Infrastructure

  **What to do**:
  - Create `src/api/hooks/use-mutations.ts` with mutations for all 4 entity types
  - Each entity needs: `useCreate{Entity}`, `useUpdate{Entity}`, `useDelete{Entity}`
  - Add mutation methods to `src/api/client.ts`
  - Handle optimistic updates and cache invalidation

  **Must NOT do**:
  - DO NOT add UI in this task (just the hooks/API)
  - DO NOT use hard delete (use deactivate action)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`backend-patterns`, `frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1

  **References**:

  **API Reference**:
  - `memory_guideline` with actions: `add`, `update`, `deactivate`
  - `memory_knowledge` with actions: `add`, `update`, `deactivate`
  - `memory_tool` with actions: `add`, `update`, `deactivate`
  - `memory_experience` with actions: `add`, `update`, `deactivate`

  **Pattern References**:
  - Existing mutations in `src/api/hooks/use-librarian.ts` (approve, reject, skip)

  **Target Implementation**:

  `src/api/hooks/use-mutations.ts`:

  ```typescript
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { api } from '../client';

  // Guidelines
  export function useCreateGuideline() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: CreateGuidelineInput) => api.guidelines.create(data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guidelines'] }),
    });
  }

  export function useUpdateGuideline() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateGuidelineInput }) =>
        api.guidelines.update(id, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guidelines'] }),
    });
  }

  export function useDeleteGuideline() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.guidelines.deactivate(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guidelines'] }),
    });
  }

  // Repeat for Knowledge, Tools, Experiences...
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify mutations hook file exists
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/use-mutations.ts
  # Assert: Exit code 0

  # Verify all CRUD mutations exist
  grep -c "useCreate\|useUpdate\|useDelete" /Users/coccobas/Development/memory/agent-memory-dashboard/src/api/hooks/use-mutations.ts
  # Assert: >= 12 (3 per entity * 4 entities)

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(crud): add mutation hooks for all entity types`
  - Files: `src/api/hooks/use-mutations.ts`, `src/api/hooks/index.ts`, `src/api/client.ts`, `src/api/types.ts`

---

### Wave 4: CRUD UI & Graph

- [ ] 7. CRUD - Entity Forms (Guidelines, Knowledge)

  **What to do**:
  - Create `src/components/ui/entity-form.tsx` - Reusable form component
  - Create `src/components/forms/guideline-form.tsx` - Guideline create/edit form
  - Create `src/components/forms/knowledge-form.tsx` - Knowledge create/edit form
  - Add "New" button to Guidelines and Knowledge pages
  - Add Edit and Delete actions to table rows
  - Confirmation dialog for delete

  **Must NOT do**:
  - DO NOT allow editing id, createdAt, updatedAt fields
  - DO NOT delete without confirmation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Task 6

  **References**:

  **Form Fields**:

  Guideline Form:
  - `name` (required, string)
  - `content` (required, textarea)
  - `category` (optional, string)
  - `priority` (optional, number 1-100)
  - `rationale` (optional, textarea)

  Knowledge Form:
  - `title` (required, string)
  - `content` (required, textarea)
  - `category` (required, select: decision/fact/context/reference)
  - `confidence` (optional, number 0-1)
  - `source` (optional, string)

  **Pattern References**:
  - Modal component from `src/components/ui/modal.tsx`
  - Librarian recommendation actions pattern

  **Acceptance Criteria**:

  ```bash
  # Verify form components exist
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/forms/guideline-form.tsx
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/forms/knowledge-form.tsx
  # Assert: Both exist

  # Verify delete confirmation exists
  grep -c "confirm\|Confirm" /Users/coccobas/Development/memory/agent-memory-dashboard/src/pages/guidelines.tsx
  # Assert: >= 1

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(crud): add create/edit/delete UI for Guidelines and Knowledge`
  - Files: `src/components/forms/guideline-form.tsx`, `src/components/forms/knowledge-form.tsx`, `src/pages/guidelines.tsx`, `src/pages/knowledge.tsx`

---

- [ ] 8. CRUD - Entity Forms (Tools, Experiences)

  **What to do**:
  - Create `src/components/forms/tool-form.tsx` - Tool create/edit form
  - Create `src/components/forms/experience-form.tsx` - Experience create/edit form
  - Add "New" button to Tools and Experiences pages
  - Add Edit and Delete actions to table rows
  - Confirmation dialog for delete

  **Must NOT do**:
  - DO NOT allow editing id, createdAt, updatedAt fields
  - DO NOT delete without confirmation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 7, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Task 6

  **References**:

  **Form Fields**:

  Tool Form:
  - `name` (required, string)
  - `description` (optional, textarea)
  - `category` (required, select: mcp/cli/function/api)
  - `constraints` (optional, textarea)

  Experience Form:
  - `title` (required, string)
  - `content` (required, textarea)
  - `scenario` (optional, textarea)
  - `outcome` (optional, textarea)
  - `level` (required, select: case/strategy)
  - `confidence` (optional, number 0-1)

  **Acceptance Criteria**:

  ```bash
  # Verify form components exist
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/forms/tool-form.tsx
  test -f /Users/coccobas/Development/memory/agent-memory-dashboard/src/components/forms/experience-form.tsx
  # Assert: Both exist

  # Build succeeds
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ```

  **Commit**: YES
  - Message: `feat(crud): add create/edit/delete UI for Tools and Experiences`
  - Files: `src/components/forms/tool-form.tsx`, `src/components/forms/experience-form.tsx`, `src/pages/tools.tsx`, `src/pages/experiences.tsx`

---

- [ ] 9. Graph Visualization

  **What to do**:
  - Install `react-force-graph-2d` package
  - Update `src/pages/graph.tsx` to use ForceGraph2D
  - Lazy-load the graph component with React.lazy()
  - Node click opens detail modal
  - Node colors by type
  - Edge labels for relationship type
  - Zoom and pan controls

  **Must NOT do**:
  - DO NOT import graph library in main bundle (must be lazy-loaded)
  - DO NOT add graph analysis features (pathfinding, clustering)
  - DO NOT use 3D version (2D only for performance)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-patterns`, `frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 7, 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:

  **Library**: `react-force-graph-2d` (70KB, native React)

  **Target Implementation**:

  ```typescript
  // src/pages/graph.tsx
  import { Suspense, lazy, useState, useMemo } from 'react';
  import { useGraphNodes, useGraphEdges } from '@/api/hooks';
  import { Modal } from '@/components/ui/modal';
  import { Loader2 } from 'lucide-react';

  const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

  const nodeColors: Record<string, string> = {
    entity: '#3b82f6',
    tool: '#22c55e',
    guideline: '#f59e0b',
    knowledge: '#8b5cf6',
    experience: '#ec4899',
    default: '#6b7280',
  };

  export function GraphPage() {
    const { data: nodes, isLoading: nodesLoading } = useGraphNodes();
    const { data: edges, isLoading: edgesLoading } = useGraphEdges();
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    const graphData = useMemo(() => ({
      nodes: nodes?.map(n => ({
        id: n.id,
        name: n.name,
        type: n.nodeTypeName,
        color: nodeColors[n.nodeTypeName] || nodeColors.default,
        ...n,
      })) ?? [],
      links: edges?.map(e => ({
        source: e.sourceId,
        target: e.targetId,
        label: e.edgeTypeName,
      })) ?? [],
    }), [nodes, edges]);

    if (nodesLoading || edgesLoading) {
      return <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>;
    }

    return (
      <div className="h-[calc(100vh-200px)]">
        <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
          <ForceGraph2D
            graphData={graphData}
            nodeLabel="name"
            nodeColor="color"
            linkLabel="label"
            onNodeClick={(node) => setSelectedNode(node as GraphNode)}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
          />
        </Suspense>

        <Modal
          isOpen={!!selectedNode}
          onClose={() => setSelectedNode(null)}
          title={selectedNode?.name ?? 'Node Details'}
        >
          {selectedNode && (
            <div className="space-y-2">
              <div><strong>Type:</strong> {selectedNode.nodeTypeName}</div>
              <div><strong>ID:</strong> <code>{selectedNode.id}</code></div>
              {selectedNode.properties && (
                <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                  {JSON.stringify(selectedNode.properties, null, 2)}
                </pre>
              )}
            </div>
          )}
        </Modal>
      </div>
    );
  }
  ```

  **Acceptance Criteria**:

  ```bash
  # Verify package installed
  grep -c "react-force-graph-2d" /Users/coccobas/Development/memory/agent-memory-dashboard/package.json
  # Assert: >= 1

  # Verify lazy loading
  grep -c "lazy.*import.*react-force-graph" /Users/coccobas/Development/memory/agent-memory-dashboard/src/pages/graph.tsx
  # Assert: >= 1

  # Verify graph chunk is separate
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  ls dist/assets/*.js | wc -l
  # Assert: > previous chunk count (graph is separate)
  ```

  **Commit**: YES
  - Message: `feat(graph): add interactive force-directed graph visualization`
  - Files: `package.json`, `package-lock.json`, `src/pages/graph.tsx`

---

### Wave 5: Polish

- [ ] 10. Integration Testing and Polish

  **What to do**:
  - Verify all features work together
  - Fix any integration issues
  - Ensure consistent styling across new components
  - Update sidebar with Analytics link (if not done)
  - Final bundle size check

  **Must NOT do**:
  - DO NOT add new features
  - DO NOT refactor working code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-patterns`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (final task)
  - **Blocks**: None
  - **Blocked By**: Tasks 2-9

  **Acceptance Criteria**:

  ```bash
  # Final build check
  cd /Users/coccobas/Development/memory/agent-memory-dashboard && npm run build
  # Assert: Exit code 0

  # Bundle size check
  npm run build 2>&1 | grep -E "index.*\.js"
  # Assert: Main bundle < 500KB

  # All routes accessible (manual Playwright verification)
  # Navigate to: /, /guidelines, /knowledge, /tools, /experiences, /sessions, /episodes, /graph, /librarian, /analytics
  # Assert: All load without errors
  ```

  **Commit**: YES (if any fixes made)
  - Message: `chore(polish): integration fixes and final polish`

---

## Commit Strategy

| Wave | After Task | Message                                         | Pre-commit      |
| ---- | ---------- | ----------------------------------------------- | --------------- |
| 1    | 1          | `perf(bundle): add code splitting`              | `npm run build` |
| 2    | 2          | `feat(analytics): add analytics page`           | `npm run build` |
| 2    | 3          | `feat(export): add JSON/CSV export`             | `npm run build` |
| 2    | 4          | `feat(search): add command palette`             | `npm run build` |
| 3    | 5          | `feat(shortcuts): add keyboard shortcuts`       | `npm run build` |
| 3    | 6          | `feat(crud): add mutation hooks`                | `npm run build` |
| 4    | 7          | `feat(crud): Guidelines/Knowledge forms`        | `npm run build` |
| 4    | 8          | `feat(crud): Tools/Experiences forms`           | `npm run build` |
| 4    | 9          | `feat(graph): add force-directed visualization` | `npm run build` |
| 5    | 10         | `chore(polish): integration fixes`              | `npm run build` |

---

## Success Criteria

### Final Checklist

- [ ] Initial bundle < 500KB
- [ ] All 10 pages load without errors
- [ ] Analytics shows 4 charts with real data
- [ ] Export downloads valid JSON/CSV files
- [ ] Cmd+K opens search, results are clickable
- [ ] Keyboard shortcuts navigate correctly
- [ ] Can create new entries for all 4 entity types
- [ ] Can edit existing entries
- [ ] Can delete (deactivate) entries with confirmation
- [ ] Graph shows nodes and edges with interactions
- [ ] `npm run build` succeeds

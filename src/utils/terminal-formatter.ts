/**
 * Terminal Formatter - Rich terminal visualizations for MCP responses
 *
 * Provides tree views, status icons, unicode boxes, and badges for
 * better visual representation in terminal environments.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Icons and Symbols
// ─────────────────────────────────────────────────────────────────────────────

export const icons = {
  // Status
  healthy: '●',
  degraded: '◐',
  error: '○',
  active: '●',
  inactive: '○',

  // Checkmarks
  success: '✓',
  failure: '✗',
  warning: '⚠',

  // Types
  guideline: '📋',
  knowledge: '💡',
  tool: '🔧',
  task: '☐',
  session: '⏱',
  project: '📁',

  // Tree
  branch: '├──',
  lastBranch: '└──',
  vertical: '│',
  indent: '   ',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Box Drawing Characters
// ─────────────────────────────────────────────────────────────────────────────

const box = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function padLeft(str: string, len: number): string {
  return ' '.repeat(Math.max(0, len - str.length)) + str;
}

function repeat(char: string, count: number): string {
  return char.repeat(Math.max(0, count));
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Line
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusLineOptions {
  status: 'healthy' | 'degraded' | 'error';
  items: Array<{ label: string; value: string; status?: 'active' | 'inactive' }>;
}

/**
 * Format a status line with icons
 *
 * Example: ● Healthy  │  Session: ● active  │  DB: ● connected
 */
export function formatStatusLine(options: StatusLineOptions): string {
  const statusIcon = icons[options.status];
  const statusLabel = options.status.charAt(0).toUpperCase() + options.status.slice(1);

  const parts = [`${statusIcon} ${statusLabel}`];

  for (const item of options.items) {
    const itemIcon = item.status ? icons[item.status] : '';
    parts.push(`${item.label}: ${itemIcon} ${item.value}`.trim());
  }

  return parts.join('  │  ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format compact badges
 *
 * Example: [10 guidelines] [10 knowledge] [session: active]
 */
export function formatBadges(items: Array<{ label: string; value?: string | number }>): string {
  return items
    .map((item) => {
      if (item.value !== undefined) {
        return `[${item.value} ${item.label}]`;
      }
      return `[${item.label}]`;
    })
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree View
// ─────────────────────────────────────────────────────────────────────────────

export interface TreeNode {
  label: string;
  icon?: string;
  children?: TreeNode[];
  meta?: string; // Additional info shown after label
}

/**
 * Format a tree structure
 *
 * Example:
 * Memory Context
 * ├── 📋 Guidelines (10)
 * │   ├── workflow (7)
 * │   └── code_style (3)
 * └── 💡 Knowledge (10)
 */
export function formatTree(root: TreeNode, prefix = ''): string {
  const lines: string[] = [];
  const icon = root.icon ? `${root.icon} ` : '';
  const meta = root.meta ? ` ${root.meta}` : '';

  lines.push(`${prefix}${icon}${root.label}${meta}`);

  if (root.children && root.children.length > 0) {
    const childPrefix = prefix
      ? prefix.replace(icons.branch, icons.vertical + '  ').replace(icons.lastBranch, '   ')
      : '';

    // Capture children array for use in callback (TypeScript narrowing)
    const children = root.children;
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const connector = isLast ? icons.lastBranch : icons.branch;

      // For nested children, we need to add proper indentation
      const nestedPrefix = childPrefix + (isLast ? '    ' : icons.vertical + '   ');

      if (child.children && child.children.length > 0) {
        const childIcon = child.icon ? `${child.icon} ` : '';
        const childMeta = child.meta ? ` ${child.meta}` : '';
        lines.push(`${childPrefix}${connector} ${childIcon}${child.label}${childMeta}`);

        // Capture grandchildren array for use in callback (TypeScript narrowing)
        const grandchildren = child.children;
        grandchildren.forEach((grandchild, gIndex) => {
          const gIsLast = gIndex === grandchildren.length - 1;
          const gConnector = gIsLast ? icons.lastBranch : icons.branch;
          const gIcon = grandchild.icon ? `${grandchild.icon} ` : '';
          const gMeta = grandchild.meta ? ` ${grandchild.meta}` : '';
          lines.push(`${nestedPrefix}${gConnector} ${gIcon}${grandchild.label}${gMeta}`);
        });
      } else {
        const childIcon = child.icon ? `${child.icon} ` : '';
        const childMeta = child.meta ? ` ${child.meta}` : '';
        lines.push(`${childPrefix}${connector} ${childIcon}${child.label}${childMeta}`);
      }
    });
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Unicode Box
// ─────────────────────────────────────────────────────────────────────────────

export interface BoxOptions {
  title?: string;
  width?: number;
}

/**
 * Format content in a unicode box
 *
 * Example:
 * ╭─ Critical Guideline ─────────────────────────────╮
 * │ no-business-logic-in-handlers          [P: 95]   │
 * │ MCP handlers must be thin orchestration only.    │
 * ╰──────────────────────────────────────────────────╯
 */
export function formatBox(lines: string[], options: BoxOptions = {}): string {
  const width = options.width || Math.max(...lines.map((l) => l.length), 40) + 4;
  const innerWidth = width - 2; // Account for side borders

  const result: string[] = [];

  // Top border with optional title
  if (options.title) {
    const titlePart = `${box.horizontal} ${options.title} `;
    const remainingWidth = width - titlePart.length - 2;
    result.push(
      `${box.topLeft}${titlePart}${repeat(box.horizontal, remainingWidth)}${box.topRight}`
    );
  } else {
    result.push(`${box.topLeft}${repeat(box.horizontal, width - 2)}${box.topRight}`);
  }

  // Content lines - pad to innerWidth-1 to leave room for trailing space before border
  const contentWidth = innerWidth - 1;
  for (const line of lines) {
    const paddedLine = padRight(line, contentWidth);
    result.push(`${box.vertical} ${truncate(paddedLine, contentWidth)}${box.vertical}`);
  }

  // Bottom border
  result.push(`${box.bottomLeft}${repeat(box.horizontal, width - 2)}${box.bottomRight}`);

  return result.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar Chart
// ─────────────────────────────────────────────────────────────────────────────

export interface BarChartItem {
  label: string;
  value: number;
}

/**
 * Format a horizontal bar chart
 *
 * Example:
 * workflow   ███████░░░░░░░░  7
 * fact       ████████░░░░░░░  8
 * code_style ███░░░░░░░░░░░░  3
 */
export function formatBarChart(
  items: BarChartItem[],
  options: { maxWidth?: number; labelWidth?: number } = {}
): string {
  if (items.length === 0) return '';

  const maxValue = Math.max(...items.map((i) => i.value));
  const maxWidth = options.maxWidth || 15;
  const labelWidth = options.labelWidth || Math.max(...items.map((i) => i.label.length));

  return items
    .map((item) => {
      const label = padRight(item.label, labelWidth);
      const filledWidth = Math.round((item.value / maxValue) * maxWidth);
      const emptyWidth = maxWidth - filledWidth;
      const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
      return `${label} ${bar}  ${item.value}`;
    })
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────────────────────

export interface TableOptions {
  headers?: string[];
  alignRight?: number[]; // Column indices to right-align
}

/**
 * Format data as a table with unicode borders
 *
 * Example:
 * ╭─────────────────┬───────────────────────╮
 * │ Metric          │ Value                 │
 * ├─────────────────┼───────────────────────┤
 * │ Total Entries   │ 20                    │
 * ╰─────────────────┴───────────────────────╯
 */
export function formatTable(rows: string[][], options: TableOptions = {}): string {
  if (rows.length === 0) return '';

  // Calculate column widths
  const colWidths: number[] = [];
  const allRows = options.headers ? [options.headers, ...rows] : rows;

  for (const row of allRows) {
    row.forEach((cell, i) => {
      colWidths[i] = Math.max(colWidths[i] || 0, cell.length);
    });
  }

  const formatRow = (
    row: string[],
    leftBorder: string,
    separator: string,
    rightBorder: string
  ): string => {
    const cells = row.map((cell, i) => {
      const width = colWidths[i] ?? cell.length;
      if (options.alignRight?.includes(i)) {
        return padLeft(cell, width);
      }
      return padRight(cell, width);
    });
    return `${leftBorder} ${cells.join(` ${separator} `)} ${rightBorder}`;
  };

  const result: string[] = [];

  // Top border
  const topBorder = `╭${colWidths.map((w) => repeat('─', w + 2)).join('┬')}╮`;
  result.push(topBorder);

  // Headers
  if (options.headers) {
    result.push(formatRow(options.headers, '│', '│', '│'));
    // Header separator
    const headerSep = `├${colWidths.map((w) => repeat('─', w + 2)).join('┼')}┤`;
    result.push(headerSep);
  }

  // Data rows
  for (const row of rows) {
    result.push(formatRow(row, '│', '│', '│'));
  }

  // Bottom border
  const bottomBorder = `╰${colWidths.map((w) => repeat('─', w + 2)).join('┴')}╯`;
  result.push(bottomBorder);

  return result.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical Context Formatter (Terminal Version)
// ─────────────────────────────────────────────────────────────────────────────

interface HierarchicalContext {
  summary: {
    totalEntries: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    lastUpdated: string;
  };
  critical: Array<{
    id: string;
    type: string;
    title: string;
    snippet: string;
    priority?: number;
    category?: string;
  }>;
  recent: Array<{
    id: string;
    type: string;
    title: string;
    snippet: string;
    accessedAt?: string;
    category?: string;
  }>;
  categories: string[];
  meta: {
    scopeType: string;
    scopeId: string | null;
    tokenSavings: string;
  };
  _context?: {
    project?: { name: string; rootPath: string };
    session?: { name: string; status: string };
  };
}

/**
 * Format hierarchical context response for terminal display
 */
export function formatHierarchicalContextTerminal(ctx: HierarchicalContext): string {
  const lines: string[] = [];

  // Status line
  const statusItems: Array<{ label: string; value: string; status?: 'active' | 'inactive' }> = [];
  if (ctx._context?.session) {
    statusItems.push({
      label: 'Session',
      value: ctx._context.session.name,
      status: ctx._context.session.status === 'active' ? 'active' : 'inactive',
    });
  }
  lines.push(formatStatusLine({ status: 'healthy', items: statusItems }));
  lines.push('');

  // Badges summary
  const badges = [
    { label: 'entries', value: ctx.summary.totalEntries },
    { label: 'guidelines', value: ctx.summary.byType.guideline || 0 },
    { label: 'knowledge', value: ctx.summary.byType.knowledge || 0 },
  ];
  if (ctx.summary.byType.tool) {
    badges.push({ label: 'tools', value: ctx.summary.byType.tool });
  }
  lines.push(formatBadges(badges));
  lines.push('');

  // Tree view of types with categories
  const typeChildren: TreeNode[] = [];
  if (ctx.summary.byType.guideline) {
    const guidelineCategories = Object.entries(ctx.summary.byCategory)
      .filter(
        ([cat]) =>
          ctx.critical.some((c) => c.category === cat) ||
          ctx.recent.some((r) => r.type === 'guideline' && r.category === cat)
      )
      .map(([cat, count]) => ({ label: cat, meta: `(${count})` }));
    typeChildren.push({
      label: 'Guidelines',
      icon: icons.guideline,
      meta: `(${ctx.summary.byType.guideline})`,
      children: guidelineCategories.length > 0 ? guidelineCategories : undefined,
    });
  }
  if (ctx.summary.byType.knowledge) {
    typeChildren.push({
      label: 'Knowledge',
      icon: icons.knowledge,
      meta: `(${ctx.summary.byType.knowledge})`,
    });
  }
  if (ctx.summary.byType.tool) {
    typeChildren.push({
      label: 'Tools',
      icon: icons.tool,
      meta: `(${ctx.summary.byType.tool})`,
    });
  }

  const tree: TreeNode = {
    label: 'Memory',
    children: typeChildren,
  };
  lines.push(formatTree(tree));
  lines.push('');

  // Critical guidelines (simple list, no boxes)
  if (ctx.critical.length > 0) {
    lines.push('**Critical Guidelines:**');
    for (const item of ctx.critical.slice(0, 3)) {
      const priority = item.priority ? ` [P: ${item.priority}]` : '';
      const category = item.category ? `(${item.category})` : '';
      lines.push(`- **${item.title}**${priority} ${category}`);
      lines.push(`  ${truncate(item.snippet, 60)}`);
    }
    lines.push('');
  }

  // Bar chart of categories
  if (Object.keys(ctx.summary.byCategory).length > 1) {
    lines.push('Categories:');
    const barItems = Object.entries(ctx.summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
    lines.push(formatBarChart(barItems, { maxWidth: 12, labelWidth: 12 }));
    lines.push('');
  }

  // Project info
  if (ctx._context?.project) {
    lines.push(`${icons.project} ${ctx._context.project.name}`);
    lines.push(`   ${ctx._context.project.rootPath}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Response Formatter
// ─────────────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  database: { connected: boolean; path?: string };
  memory?: { heapUsed?: number; heapTotal?: number };
  uptime?: number;
}

/**
 * Format health check response for terminal display
 */
export function formatHealthTerminal(health: HealthResponse): string {
  const lines: string[] = [];

  // Status line
  const status =
    health.status === 'healthy' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'error';
  lines.push(
    formatStatusLine({
      status,
      items: [
        {
          label: 'DB',
          value: health.database.connected ? 'connected' : 'disconnected',
          status: health.database.connected ? 'active' : 'inactive',
        },
      ],
    })
  );
  lines.push('');

  // Details table
  const rows: string[][] = [];
  rows.push(['Status', health.status]);
  rows.push(['Database', health.database.connected ? 'Connected' : 'Disconnected']);
  if (health.database.path) {
    rows.push(['DB Path', truncate(health.database.path, 40)]);
  }
  if (health.uptime !== undefined) {
    const uptimeStr =
      health.uptime > 3600
        ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
        : `${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s`;
    rows.push(['Uptime', uptimeStr]);
  }

  lines.push(formatTable(rows, { headers: ['Metric', 'Value'] }));

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// List Response Formatter
// ─────────────────────────────────────────────────────────────────────────────

interface ListItem {
  id: string;
  name?: string;
  title?: string;
  priority?: number;
  category?: string;
  status?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Dashboard Formatter
// ─────────────────────────────────────────────────────────────────────────────

interface StatusResponse {
  project: { id: string; name: string; rootPath?: string } | null;
  session: { id: string; name: string; status: string } | null;
  counts: { guidelines: number; knowledge: number; tools: number; sessions: number };
  topEntries?: {
    guidelines: Array<{ id: string; name: string; priority: number }>;
    knowledge: Array<{ id: string; title: string }>;
  };
  /** Optional health metrics */
  health?: {
    score: number;
    grade: 'excellent' | 'good' | 'fair' | 'poor';
  } | null;
  /** Optional graph stats */
  graph?: {
    nodes: number;
    edges: number;
  } | null;
  /** Optional librarian recommendations */
  librarian?: {
    pendingRecommendations: number;
    previews?: Array<{ id: string; title: string; type: string }>;
  } | null;
  /** Optional active episode */
  episode?: {
    id: string;
    name: string;
    status: string;
  } | null;
  /** Optional IDE status */
  ide?: {
    available: string[];
    primary: string | null;
    conversationImportEnabled: boolean;
  };
}

/**
 * Format status dashboard response for terminal display
 *
 * Uses plain text formatting that renders properly in terminals.
 */
export function formatStatusTerminal(status: StatusResponse): string {
  const lines: string[] = [];

  // Session line
  if (status.session) {
    const statusIcon = status.session.status === 'active' ? icons.active : icons.inactive;
    lines.push(`Session: ${status.session.name} ${statusIcon} ${status.session.status}`);
  } else {
    lines.push('Session: (none active)');
  }

  // Episode line (if present)
  if (status.episode) {
    const episodeIcon = status.episode.status === 'active' ? icons.active : icons.inactive;
    lines.push(`Episode: ${status.episode.name} ${episodeIcon}`);
  }

  // Memory counts as unicode table
  lines.push('');
  lines.push(
    formatTable(
      [
        ['Guidelines', String(status.counts.guidelines)],
        ['Knowledge', String(status.counts.knowledge)],
        ['Tools', String(status.counts.tools)],
      ],
      { headers: ['Type', 'Count'], alignRight: [1] }
    )
  );

  // Health (if present)
  if (status.health) {
    const emoji = getHealthEmojiForStatus(status.health.grade);
    lines.push('');
    lines.push(`${emoji} Health: ${status.health.score}/100 (${status.health.grade})`);
  }

  // Graph stats (if present)
  if (status.graph && (status.graph.nodes > 0 || status.graph.edges > 0)) {
    lines.push(`📊 Graph: ${status.graph.nodes} nodes, ${status.graph.edges} edges`);
  }

  // Librarian recommendations (if present)
  if (status.librarian && status.librarian.pendingRecommendations > 0) {
    if (status.librarian.previews && status.librarian.previews.length > 0) {
      const previewTitles = status.librarian.previews
        .slice(0, 2)
        .map((r) => truncate(r.title, 25))
        .join(', ');
      const moreCount = status.librarian.pendingRecommendations - 2;
      const moreText = moreCount > 0 ? ` (+${moreCount} more)` : '';
      lines.push(`🔔 Librarian: ${previewTitles}${moreText}`);
    } else {
      const word = status.librarian.pendingRecommendations > 1 ? 'patterns' : 'pattern';
      lines.push(`🔔 Librarian: ${status.librarian.pendingRecommendations} ${word} ready`);
    }
  }

  // IDE status (if available)
  if (status.ide) {
    if (status.ide.conversationImportEnabled && status.ide.primary) {
      lines.push(`💬 IDE: ${status.ide.primary} (conversation import enabled)`);
    } else if (status.ide.available.length === 0) {
      lines.push(`💬 IDE: none detected`);
    }
  }

  // Top entries (optional, shown as tree)
  if (status.topEntries) {
    if (status.topEntries.guidelines.length > 0) {
      lines.push('');
      lines.push(`${icons.guideline} Top Guidelines:`);
      for (const g of status.topEntries.guidelines.slice(0, 5)) {
        lines.push(`  ${icons.branch} ${g.name} [P: ${g.priority}]`);
      }
    }
    if (status.topEntries.knowledge.length > 0) {
      lines.push('');
      lines.push(`${icons.knowledge} Top Knowledge:`);
      for (const k of status.topEntries.knowledge.slice(0, 5)) {
        lines.push(`  ${icons.branch} ${k.title}`);
      }
    }
  }

  return lines.join('\n');
}

function getHealthEmojiForStatus(grade: 'excellent' | 'good' | 'fair' | 'poor'): string {
  switch (grade) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🔵';
    case 'fair':
      return '🟡';
    case 'poor':
      return '🔴';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List Response Formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format list response for terminal display
 */
export function formatListTerminal(items: ListItem[], type: string): string {
  if (items.length === 0) {
    return `No ${type} found.`;
  }

  const lines: string[] = [];
  lines.push(formatBadges([{ label: type, value: items.length }]));
  lines.push('');

  // Tree view of items
  const children: TreeNode[] = items.slice(0, 10).map((item) => {
    const label = item.name || item.title || item.id.slice(0, 8);
    const meta = item.priority ? `[P: ${item.priority}]` : item.status ? `[${item.status}]` : '';
    return { label, meta };
  });

  if (items.length > 10) {
    children.push({ label: `... and ${items.length - 10} more`, meta: '' });
  }

  const icon =
    type === 'guidelines'
      ? icons.guideline
      : type === 'knowledge'
        ? icons.knowledge
        : type === 'tools'
          ? icons.tool
          : '';

  lines.push(
    formatTree({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      icon,
      children,
    })
  );

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Quickstart Dashboard Formatter
// ─────────────────────────────────────────────────────────────────────────────

export type QuickstartDisplayMode = 'compact' | 'standard' | 'full';

export interface QuickstartDisplayData {
  projectName: string | null;
  session: {
    name: string | null;
    status: 'active' | 'resumed' | 'none' | 'error';
  };
  episode?: {
    name: string;
    status: string;
    autoCreated?: boolean;
  } | null;
  counts: {
    guidelines: number;
    knowledge: number;
    tools: number;
  };
  critical?: string[];
  workItems?: string[];
  health?: {
    score: number;
    grade: 'excellent' | 'good' | 'fair' | 'poor';
  } | null;
  graph?: {
    nodes: number;
    edges: number;
    hint?: string;
  } | null;
  librarian?: {
    pendingCount: number;
    previews?: Array<{ title: string; type: string }>;
  } | null;
  hints?: {
    experienceRecording?: string;
    tip?: string;
  };
  /** Server status for detecting stale code */
  serverStatus?: {
    isStale: boolean;
    message?: string;
    processStartedAt?: string;
    distModifiedAt?: string;
  } | null;
  /** Resume summary - shown when picking up an existing episode */
  resumeSummary?: {
    /** Episode name being resumed */
    episodeName: string;
    /** How long the episode has been running */
    duration?: string;
    /** Key events/findings from the episode */
    keyEvents: Array<{
      type: 'checkpoint' | 'decision' | 'error' | 'started' | 'completed';
      message: string;
      timestamp?: string;
    }>;
    /** Linked entities created during this episode */
    linkedEntities?: Array<{
      type: 'guideline' | 'knowledge' | 'tool' | 'experience';
      title: string;
    }>;
    /** Current status assessment */
    status?: {
      issue?: string;
      rootCause?: string;
      findings?: string[];
    };
  } | null;
}

/**
 * Format quickstart dashboard with configurable display mode
 *
 * Modes:
 * - compact: Single-line summary for minimal context usage
 * - standard: Clean markdown tables (default)
 * - full: Standard + tips, hints, and actionable commands
 */
export function formatQuickstartDashboard(
  data: QuickstartDisplayData,
  mode: QuickstartDisplayMode = 'standard'
): string {
  if (mode === 'compact') {
    return formatQuickstartCompact(data);
  }

  const lines: string[] = [];

  // Stale code warning (prominent, at the top)
  if (data.serverStatus?.isStale) {
    lines.push('');
    lines.push(
      `⚠️ **STALE CODE DETECTED** - ${data.serverStatus.message ?? 'Restart Claude Code to pick up new changes'}`
    );
    lines.push('');
  }

  // Session section (simple lines, no box)
  lines.push(formatSessionSection(data));

  // Resume summary (when picking up an existing episode)
  if (data.resumeSummary) {
    lines.push('');
    lines.push(formatResumeSummary(data.resumeSummary));
  }

  // Memory section (markdown table)
  lines.push('');
  lines.push(formatMemorySection(data));

  // Critical guidelines
  if (data.critical && data.critical.length > 0) {
    lines.push('');
    lines.push(`${icons.warning} Critical: ${data.critical.join(', ')}`);
  }

  // Work items
  if (data.workItems && data.workItems.length > 0) {
    lines.push(`📋 Work items: ${data.workItems.join(', ')}`);
  }

  // Librarian recommendations
  if (data.librarian && data.librarian.pendingCount > 0) {
    const patternWord = data.librarian.pendingCount > 1 ? 'patterns' : 'pattern';
    if (data.librarian.previews && data.librarian.previews.length > 0) {
      const previewTitles = data.librarian.previews
        .slice(0, 2)
        .map((r) => truncate(r.title, 25))
        .join(', ');
      const moreText =
        data.librarian.pendingCount > 2 ? ` (+${data.librarian.pendingCount - 2} more)` : '';
      lines.push(`🔔 Librarian: ${previewTitles}${moreText}`);
    } else {
      lines.push(`🔔 Librarian: ${data.librarian.pendingCount} ${patternWord} ready for review`);
    }
  }

  // Full mode: add hints and tips
  if (mode === 'full') {
    if (data.hints?.experienceRecording) {
      lines.push('');
      lines.push(`💡 Tip: ${data.hints.experienceRecording}`);
    }
    if (data.hints?.tip) {
      lines.push(`💡 ${data.hints.tip}`);
    }
    if (data.graph?.hint) {
      lines.push(`💡 ${data.graph.hint}`);
    }
  }

  return lines.join('\n');
}

/**
 * Compact single-line format
 * Example: ● agent-memory │ Session: active │ 40g/77k/7t │ Health: 67%
 */
function formatQuickstartCompact(data: QuickstartDisplayData): string {
  const parts: string[] = [];

  // Status dot + project name
  const statusDot =
    data.session.status === 'active' || data.session.status === 'resumed' ? '●' : '○';
  parts.push(`${statusDot} ${data.projectName ?? 'Project'}`);

  // Session status
  const sessionStatus =
    data.session.status === 'active'
      ? 'active'
      : data.session.status === 'resumed'
        ? 'resumed'
        : data.session.status === 'error'
          ? 'error'
          : 'none';
  parts.push(`Session: ${sessionStatus}`);

  // Counts (compact: 40g/77k/7t)
  const { guidelines: g, knowledge: k, tools: t } = data.counts;
  parts.push(`${g}g/${k}k/${t}t`);

  // Health (if available)
  if (data.health) {
    parts.push(`Health: ${data.health.score}%`);
  }

  return parts.join(' │ ');
}

/**
 * Format the session section (clean lines, no box)
 */
function formatSessionSection(data: QuickstartDisplayData): string {
  const lines: string[] = [];

  // Session line
  const sessionIcon =
    data.session.status === 'active' || data.session.status === 'resumed'
      ? icons.active
      : icons.inactive;
  const sessionStatusText =
    data.session.status === 'resumed'
      ? 'resumed'
      : data.session.status === 'active'
        ? 'active'
        : 'none';
  const sessionName = data.session.name ?? '(none)';
  lines.push(`**Session:** ${sessionName} ${sessionIcon} ${sessionStatusText}`);

  // Episode line (if present)
  if (data.episode) {
    const episodeIcon = data.episode.status === 'active' ? icons.active : icons.inactive;
    const autoTag = data.episode.autoCreated ? ' (auto)' : '';
    lines.push(`**Episode:** ${data.episode.name} ${episodeIcon}${autoTag}`);
  }

  return lines.join('\n');
}

/**
 * Format the resume summary - shown when picking up an existing episode
 */
function formatResumeSummary(summary: NonNullable<QuickstartDisplayData['resumeSummary']>): string {
  const lines: string[] = [];

  // Header with episode name and duration
  const durationText = summary.duration ? ` (${summary.duration})` : '';
  lines.push(`📋 **Resuming:** ${summary.episodeName}${durationText}`);
  lines.push('');

  // Status assessment (issue, root cause, findings) - like the user's example
  if (summary.status) {
    if (summary.status.issue) {
      lines.push(`**Issue:** ${summary.status.issue}`);
    }
    if (summary.status.rootCause) {
      lines.push(`**Root Cause:** ${summary.status.rootCause}`);
    }
    if (summary.status.findings && summary.status.findings.length > 0) {
      lines.push('**Findings:**');
      for (const finding of summary.status.findings) {
        lines.push(`- ${finding}`);
      }
    }
  }

  // Key events (condensed timeline)
  if (summary.keyEvents.length > 0) {
    if (summary.status) lines.push(''); // Add spacing if we had status
    lines.push('**Timeline:**');
    for (const event of summary.keyEvents.slice(0, 5)) {
      // Limit to 5 events
      const icon = getEventIcon(event.type);
      lines.push(`${icon} ${event.message}`);
    }
    if (summary.keyEvents.length > 5) {
      lines.push(`   ... and ${summary.keyEvents.length - 5} more events`);
    }
  }

  // Linked entities (knowledge created during this episode)
  if (summary.linkedEntities && summary.linkedEntities.length > 0) {
    lines.push('');
    lines.push('**Created:**');
    for (const entity of summary.linkedEntities.slice(0, 3)) {
      const icon = getEntityIcon(entity.type);
      lines.push(`${icon} ${truncate(entity.title, 50)}`);
    }
    if (summary.linkedEntities.length > 3) {
      lines.push(`   ... and ${summary.linkedEntities.length - 3} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Get icon for event type
 */
function getEventIcon(type: 'checkpoint' | 'decision' | 'error' | 'started' | 'completed'): string {
  switch (type) {
    case 'checkpoint':
      return '✓';
    case 'decision':
      return '→';
    case 'error':
      return '✗';
    case 'started':
      return '▶';
    case 'completed':
      return '●';
    default:
      return '·';
  }
}

/**
 * Get icon for entity type
 */
function getEntityIcon(type: 'guideline' | 'knowledge' | 'tool' | 'experience'): string {
  switch (type) {
    case 'guideline':
      return '📋';
    case 'knowledge':
      return '💡';
    case 'tool':
      return '🔧';
    case 'experience':
      return '🧠';
    default:
      return '·';
  }
}

/**
 * Format the memory section as a markdown table
 */
function formatMemorySection(data: QuickstartDisplayData): string {
  const lines: string[] = [];

  // Health info (shown above table if present)
  const healthDisplay = data.health
    ? `${getHealthEmoji(data.health.grade)} Health: ${data.health.score}/100 (${data.health.grade})`
    : '';

  // Markdown table header
  lines.push('| Type | Count |');
  lines.push('|------|------:|');

  // Data rows
  lines.push(`| Guidelines | ${data.counts.guidelines} |`);
  lines.push(`| Knowledge | ${data.counts.knowledge} |`);
  lines.push(`| Tools | ${data.counts.tools} |`);

  // Health and graph stats below table
  if (healthDisplay) {
    lines.push('');
    lines.push(healthDisplay);
  }

  if (data.graph && (data.graph.nodes > 0 || data.graph.edges > 0)) {
    lines.push(`📊 Graph: ${data.graph.nodes} nodes, ${data.graph.edges} edges`);
  }

  return lines.join('\n');
}

/**
 * Get emoji for health grade
 */
function getHealthEmoji(grade: 'excellent' | 'good' | 'fair' | 'poor'): string {
  switch (grade) {
    case 'excellent':
      return '🟢';
    case 'good':
      return '🔵';
    case 'fair':
      return '🟡';
    case 'poor':
      return '🔴';
  }
}

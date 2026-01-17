/**
 * CLI Output Formatting
 *
 * Provides JSON and table output formatting for CLI commands.
 */

export type OutputFormat = 'json' | 'table';

/**
 * Format result based on output mode
 */
export function formatOutput(result: unknown, format: OutputFormat = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  // Table format
  return formatAsTable(result);
}

function formatAsTable(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return String(result);
  }

  const obj = result as Record<string, unknown>;

  // Handle array results (e.g., list responses)
  if (Array.isArray(obj)) {
    return formatArrayAsTable(obj);
  }

  // Handle response objects with known list keys
  const listKeys = [
    'knowledge',
    'guidelines',
    'tools',
    'projects',
    'sessions',
    'organizations',
    'tags',
    'relations',
    'backups',
    'versions',
    'entries',
    'candidates',
    'conflicts',
    'locks',
    'votes',
    'conversations',
    'messages',
    'results',
  ];

  for (const key of listKeys) {
    if (Array.isArray(obj[key])) {
      const header = formatMeta(obj);
      return header + formatArrayAsTable(obj[key] as unknown[]);
    }
  }

  // Single object - format as key-value pairs
  return formatObjectAsKeyValue(obj);
}

function formatArrayAsTable(items: unknown[]): string {
  if (items.length === 0) return '(no results)';

  // Extract keys from first item
  const first = items[0];
  if (typeof first !== 'object' || !first) {
    return items.map(String).join('\n');
  }

  // Select important keys for display (limit columns)
  const allKeys = Object.keys(first);
  const priorityKeys = [
    'id',
    'name',
    'title',
    'status',
    'scopeType',
    'scopeId',
    'createdAt',
    'isActive',
  ];
  const keys = priorityKeys.filter((k) => allKeys.includes(k));

  // Add remaining keys up to max 8 columns
  for (const k of allKeys) {
    if (!keys.includes(k) && keys.length < 8) {
      keys.push(k);
    }
  }

  const maxWidths = calculateColumnWidths(items as Record<string, unknown>[], keys);

  // Header
  const header = keys.map((k, i) => k.padEnd(maxWidths[i] ?? k.length)).join(' | ');
  const separator = keys.map((k, i) => '-'.repeat(maxWidths[i] ?? k.length)).join('-+-');

  // Rows
  const rows = items.map((item) => {
    const row = item as Record<string, unknown>;
    return keys
      .map((k, i) => {
        const val = formatValue(row[k]);
        const width = maxWidths[i] ?? k.length;
        return val.slice(0, width).padEnd(width);
      })
      .join(' | ');
  });

  return [header, separator, ...rows].join('\n');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 40 ? str.slice(0, 37) + '...' : str;
  }
  return String(value);
}

function calculateColumnWidths(items: Record<string, unknown>[], keys: string[]): number[] {
  return keys.map((key) => {
    const maxValue = Math.max(...items.map((item) => formatValue(item[key]).length));
    return Math.max(key.length, Math.min(maxValue, 40)); // Cap at 40 chars
  });
}

function formatMeta(obj: Record<string, unknown>): string {
  if ('meta' in obj && typeof obj.meta === 'object' && obj.meta) {
    const meta = obj.meta as Record<string, unknown>;
    const parts: string[] = [];
    if ('returnedCount' in meta) parts.push(`Count: ${String(meta.returnedCount)}`);
    if ('count' in meta) parts.push(`Count: ${String(meta.count)}`);
    if ('hasMore' in meta) parts.push(`Has more: ${String(meta.hasMore)}`);
    if (parts.length > 0) return parts.join(' | ') + '\n\n';
  }
  if ('count' in obj) {
    return `Count: ${String(obj.count)}\n\n`;
  }
  return '';
}

function formatObjectAsKeyValue(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'meta') continue;
    if (value === undefined) continue; // Skip undefined values
    const formatted =
      typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value);
    lines.push(`${key}: ${formatted}`);
  }
  return lines.join('\n');
}

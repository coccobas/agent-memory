/**
 * Timestamp formatting utility for converting UTC timestamps to local timezone
 *
 * Timestamps are stored in UTC (best practice for databases), but this module
 * provides utilities to convert them to local timezone for display.
 */

import { config } from '../config/index.js';

/**
 * Get the configured timezone for display
 * Returns undefined for 'local' (uses system default) or 'utc' for UTC
 */
function getDisplayTimezone(): string | undefined {
  const tz = config.timestamps?.displayTimezone ?? 'local';
  if (tz === 'local') return undefined; // Use system default
  if (tz === 'utc') return 'UTC';
  return tz; // IANA timezone string like 'Europe/Rome'
}

/**
 * Format a single ISO timestamp string to the configured timezone
 *
 * @param isoString - ISO 8601 timestamp string (e.g., "2025-12-17T11:49:12.000Z")
 * @returns Formatted timestamp string in local timezone, or null if input is null/undefined
 */
export function formatTimestamp(isoString: string | null | undefined): string | null {
  if (!isoString) return null;

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString; // Return original if invalid

    const timezone = getDisplayTimezone();

    // Format as ISO-like string in local timezone: "YYYY-MM-DD HH:mm:ss"
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timezone,
    };

    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(date);

    const getPart = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  } catch {
    return isoString; // Return original on any error
  }
}

/**
 * Fields that contain timestamps and should be formatted
 */
const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'startedAt',
  'endedAt',
  'checkedOutAt',
  'expiresAt',
  'detectedAt',
  'resolvedAt',
  'exportedAt',
  'validUntil',
]);

/**
 * Recursively format all timestamp fields in an object
 *
 * @param obj - Object containing timestamp fields
 * @returns New object with formatted timestamps (original not mutated)
 */
export function formatTimestamps<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj.map((item: unknown) => formatTimestamps(item)) as T;
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (TIMESTAMP_FIELDS.has(key) && typeof value === 'string') {
      result[key] = formatTimestamp(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = formatTimestamps(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Export utilities for JSON and CSV formats
 */

export function exportToJSON<T>(data: T[], filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, `${filename}.json`);
}

export function exportToCSV<T extends Record<string, unknown>>(data: T[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const value = row[h];
        // Handle nested objects and arrays by converting to JSON string
        if (typeof value === 'object' && value !== null) {
          return JSON.stringify(JSON.stringify(value));
        }
        // Escape quotes and wrap in quotes
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
      })
      .join(',')
  );

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

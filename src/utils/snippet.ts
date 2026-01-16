/**
 * Snippet extraction utility
 *
 * Extracts concise, readable snippets from content for hierarchical context display.
 */

import type { QueryResultItem } from '../services/query/pipeline.js';

/**
 * Extract a snippet from content, preferring complete sentences.
 *
 * @param content - The full content to extract from
 * @param maxLength - Maximum length of the snippet (default: 150 characters)
 * @returns A truncated snippet that ends at a sentence or word boundary
 */
export function extractSnippet(content: string | null | undefined, maxLength = 150): string {
  if (!content) return '';

  // Normalize whitespace
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  // Try to break at sentence boundary
  const sentences = normalized.split(/(?<=[.!?])\s+/);
  let snippet = '';

  for (const sentence of sentences) {
    if (snippet.length + sentence.length > maxLength) break;
    snippet += (snippet ? ' ' : '') + sentence;
  }

  // If we got any complete sentences, use that (even if short)
  if (snippet) {
    return snippet;
  }

  // Fallback to word boundary truncation (only if no sentences fit)
  snippet = normalized.slice(0, maxLength);
  const lastSpace = snippet.lastIndexOf(' ');

  // Only break at space if it's reasonably far into the string
  if (lastSpace > maxLength * 0.7) {
    snippet = snippet.slice(0, lastSpace);
  }

  return snippet.trim() + '...';
}

/**
 * Get the title/name from a query result item
 *
 * @param item - A query result item
 * @returns The title, name, or 'Untitled' if none found
 */
export function getItemTitle(item: QueryResultItem): string {
  switch (item.type) {
    case 'tool':
      return item.tool.name ?? 'Untitled';
    case 'guideline':
      return item.guideline.name ?? 'Untitled';
    case 'knowledge':
      return item.knowledge.title ?? 'Untitled';
    case 'experience':
      // Experience has title in main table
      return item.experience.title?.slice(0, 50) ?? 'Untitled';
    default:
      return 'Untitled';
  }
}

/**
 * Get the content from a query result item for snippet extraction.
 * Content is typically stored in the version object.
 *
 * @param item - A query result item
 * @returns The content string or empty string if none found
 */
export function getItemContent(item: QueryResultItem): string {
  // Version contains the actual content (description, content, etc.)
  const version = item.version as Record<string, unknown> | undefined;

  switch (item.type) {
    case 'tool':
      // Tool version has description
      return (version?.description as string) ?? '';
    case 'guideline':
      // Guideline version has content
      return (version?.content as string) ?? '';
    case 'knowledge':
      // Knowledge version has content
      return (version?.content as string) ?? '';
    case 'experience':
      // Experience version has content, scenario, outcome
      return (
        (version?.content as string) ??
        (version?.scenario as string) ??
        (version?.outcome as string) ??
        ''
      );
    default:
      return '';
  }
}

/**
 * Get the category from a query result item
 *
 * @param item - A query result item
 * @returns The category string or undefined if none found
 */
export function getItemCategory(item: QueryResultItem): string | undefined {
  switch (item.type) {
    case 'tool':
      return item.tool.category ?? undefined;
    case 'guideline':
      return item.guideline.category ?? undefined;
    case 'knowledge':
      return item.knowledge.category ?? undefined;
    case 'experience':
      return item.experience.category ?? undefined;
    default:
      return undefined;
  }
}

/**
 * Get the createdAt timestamp from a query result item
 *
 * @param item - A query result item
 * @returns The createdAt timestamp string or undefined
 */
export function getItemCreatedAt(item: QueryResultItem): string | undefined {
  switch (item.type) {
    case 'tool':
      return item.tool.createdAt;
    case 'guideline':
      return item.guideline.createdAt;
    case 'knowledge':
      return item.knowledge.createdAt;
    case 'experience':
      return item.experience.createdAt;
    default:
      return undefined;
  }
}

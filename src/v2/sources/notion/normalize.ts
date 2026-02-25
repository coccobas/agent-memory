/**
 * Notion markdown normalizer.
 *
 * Strips Notion-specific XML-like tags from the markdown returned by
 * the notion-fetch MCP tool, preserving standard markdown content.
 *
 * Tags handled:
 * - <page url="...">Title</page>             → Title (preserve text)
 * - <database url="...">...</database>        → remove entirely
 * - <data-source url="...">...</data-source>  → remove entirely
 * - <page-discussions>...</page-discussions>   → remove entirely
 * - <templates>...</templates>                 → remove entirely
 */

/**
 * Clean Notion-flavored markdown by stripping Notion-specific tags.
 */
export function cleanNotionMarkdown(raw: string): string {
  if (!raw || !raw.trim()) {
    return '';
  }

  let result = raw;

  // Convert <page url="...">Title</page> to just the title text
  result = result.replace(/<page\s+url="[^"]*">([^<]*)<\/page>/gi, '$1');

  // Remove multiline block tags entirely
  const blockTags = ['database', 'data-source', 'page-discussions', 'templates'];
  for (const tag of blockTags) {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    result = result.replace(pattern, '');
  }

  // Collapse multiple consecutive blank lines into at most two
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  return result.trim();
}

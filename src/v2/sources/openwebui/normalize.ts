/**
 * Open WebUI content normalizer.
 *
 * Cleans content fetched via Open WebUI pipelines:
 *
 * Chat-style content:
 * - Strips system prompt blocks (### System / [system]: ...)
 * - Normalizes role prefixes into markdown headers (### User, ### Assistant)
 * - Removes pipeline metadata annotations (__pipeline__, __model__, etc.)
 *
 * Knowledge/RAG documents:
 * - Strips source attribution markers ([Source: ...])
 * - Removes chunk boundary markers (---chunk---)
 * - Preserves standard markdown content
 */

/**
 * Clean Open WebUI pipeline content into standard markdown.
 */
export function cleanOpenWebUIContent(raw: string): string {
  if (!raw || !raw.trim()) {
    return '';
  }

  let result = raw;

  // Remove system prompt blocks: lines starting with [system] or ### System followed by content
  result = result.replace(
    /(?:^|\n)(?:\[system\]|###\s*System\s*(?:Prompt)?)\s*\n[\s\S]*?(?=\n(?:###\s*(?:User|Assistant|Human)|$|\[(?:user|assistant|human)\]))/gi,
    ''
  );

  // Normalize role prefixes to markdown headers
  result = result.replace(/^\[user\]\s*:?\s*/gim, '### User\n');
  result = result.replace(/^\[assistant\]\s*:?\s*/gim, '### Assistant\n');
  result = result.replace(/^\[human\]\s*:?\s*/gim, '### User\n');

  // Remove pipeline metadata annotations: __pipeline__: ..., __model__: ..., etc.
  result = result.replace(/^__\w+__\s*:\s*.*$/gm, '');

  // Remove source attribution markers: [Source: filename.pdf] or [Source: http://...]
  result = result.replace(/\[Source:\s*[^\]]*\]/gi, '');

  // Remove chunk boundary markers
  result = result.replace(/^-{3,}chunk-{3,}$/gm, '');

  // Remove Open WebUI metadata blocks: <details> with pipeline info
  result = result.replace(
    /<details>\s*<summary>\s*(?:Pipeline|Model|Metadata)\s*<\/summary>[\s\S]*?<\/details>/gi,
    ''
  );

  // Collapse multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

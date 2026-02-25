/**
 * Slack mrkdwn normalizer.
 *
 * Converts Slack-specific formatting to standard markdown:
 * - <@U12345>          → @user (user mentions)
 * - <#C12345|general>  → #general (channel mentions)
 * - <https://...|text> → [text](https://...) (rich links)
 * - <https://...>      → https://... (bare links)
 * - *bold*             → **bold** (Slack uses single asterisks)
 * - ~strike~           → ~~strike~~ (Slack uses single tildes)
 * - Preserves: _italic_, `code`, ```code blocks```, > blockquotes
 */

/**
 * Clean Slack mrkdwn into standard markdown.
 */
export function cleanSlackMarkdown(raw: string): string {
  if (!raw || !raw.trim()) {
    return '';
  }

  let result = raw;

  // Convert user mentions: <@U12345> or <@U12345|username> → @username or @user
  result = result.replace(/<@([A-Z0-9]+)\|([^>]+)>/g, '@$2');
  result = result.replace(/<@([A-Z0-9]+)>/g, '@user');

  // Convert channel mentions: <#C12345|channel-name> → #channel-name
  result = result.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');
  result = result.replace(/<#([A-Z0-9]+)>/g, '#channel');

  // Convert rich links: <https://url|display text> → [display text](https://url)
  result = result.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');

  // Convert bare links: <https://url> → https://url
  result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // Convert Slack bold (*text*) to markdown bold (**text**)
  // Must not match inside code blocks or URLs. Match word-boundary-ish context.
  // Only convert standalone *word* patterns (not **already bold**)
  result = result.replace(/(?<!\*)\*(?!\*)(\S(?:[^*\n]*\S)?)\*(?!\*)/g, '**$1**');

  // Convert Slack strikethrough (~text~) to markdown strikethrough (~~text~~)
  result = result.replace(/(?<!~)~(?!~)(\S(?:[^~\n]*\S)?)~(?!~)/g, '~~$1~~');

  // Collapse multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

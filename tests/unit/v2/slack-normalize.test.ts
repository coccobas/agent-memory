import { describe, expect, it } from 'vitest';
import { cleanSlackMarkdown } from '../../../src/v2/sources/slack/normalize.js';

describe('cleanSlackMarkdown', () => {
  it('converts user mentions with display name: <@U123|alice> → @alice', () => {
    const input = 'Hey <@U12345|alice>, can you review this?';
    expect(cleanSlackMarkdown(input)).toBe('Hey @alice, can you review this?');
  });

  it('converts bare user mentions: <@U123> → @user', () => {
    const input = '<@U99999> started the thread';
    expect(cleanSlackMarkdown(input)).toBe('@user started the thread');
  });

  it('converts channel mentions: <#C123|general> → #general', () => {
    const input = 'Post this in <#C12345|engineering>';
    expect(cleanSlackMarkdown(input)).toBe('Post this in #engineering');
  });

  it('converts rich links: <https://url|text> → [text](url)', () => {
    const input = 'Check <https://example.com/docs|the docs> for more info';
    expect(cleanSlackMarkdown(input)).toBe(
      'Check [the docs](https://example.com/docs) for more info'
    );
  });

  it('converts bare links: <https://url> → url', () => {
    const input = 'See <https://github.com/org/repo>';
    expect(cleanSlackMarkdown(input)).toBe('See https://github.com/org/repo');
  });

  it('converts Slack bold (*text*) to markdown bold (**text**)', () => {
    const input = 'This is *important* information';
    expect(cleanSlackMarkdown(input)).toBe('This is **important** information');
  });

  it('converts Slack strikethrough (~text~) to markdown strikethrough (~~text~~)', () => {
    const input = 'This is ~deprecated~ and should not be used';
    expect(cleanSlackMarkdown(input)).toBe('This is ~~deprecated~~ and should not be used');
  });

  it('preserves code blocks and inline code', () => {
    const input = 'Use `npm install` to set up\n\n```\nconst x = 42;\n```';
    const result = cleanSlackMarkdown(input);
    expect(result).toContain('`npm install`');
    expect(result).toContain('```\nconst x = 42;\n```');
  });

  it('preserves blockquotes', () => {
    const input = '> This is a quote\n> from someone wise';
    const result = cleanSlackMarkdown(input);
    expect(result).toContain('> This is a quote');
    expect(result).toContain('> from someone wise');
  });

  it('handles empty/whitespace input', () => {
    expect(cleanSlackMarkdown('')).toBe('');
    expect(cleanSlackMarkdown('   ')).toBe('');
    expect(cleanSlackMarkdown('\n\n')).toBe('');
  });

  it('handles content with no Slack-specific formatting (passthrough)', () => {
    const input = '# Plain Markdown\n\nJust regular content.';
    expect(cleanSlackMarkdown(input)).toBe(input);
  });

  it('handles mixed Slack formatting in a single message', () => {
    const input =
      '<@U123|bob> mentioned in <#C456|general>: *Check* <https://example.com|this link> for the ~old~ new API';
    const result = cleanSlackMarkdown(input);
    expect(result).toContain('@bob');
    expect(result).toContain('#general');
    expect(result).toContain('**Check**');
    expect(result).toContain('[this link](https://example.com)');
    expect(result).toContain('~~old~~');
  });
});

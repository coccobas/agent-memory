import { describe, expect, it } from 'vitest';
import { cleanNotionMarkdown } from '../../../src/v2/sources/notion/normalize.js';

describe('cleanNotionMarkdown', () => {
  it('strips <page url="...">Title</page> tags, preserving title text', () => {
    const input = 'See also <page url="https://notion.so/abc123">My Other Page</page> for details.';
    const result = cleanNotionMarkdown(input);
    expect(result).toBe('See also My Other Page for details.');
  });

  it('strips <database url="...">...</database> blocks (multiline)', () => {
    const input = `Some intro text.

<database url="https://notion.so/db123">
## Tasks Database
| Name | Status |
|------|--------|
| Task 1 | Done |
</database>

More text after.`;

    const result = cleanNotionMarkdown(input);
    expect(result).toContain('Some intro text.');
    expect(result).toContain('More text after.');
    expect(result).not.toContain('Tasks Database');
    expect(result).not.toContain('<database');
  });

  it('strips <data-source url="...">...</data-source> blocks', () => {
    const input = `Content before.

<data-source url="collection://abc-123">
Schema definition here
</data-source>

Content after.`;

    const result = cleanNotionMarkdown(input);
    expect(result).toContain('Content before.');
    expect(result).toContain('Content after.');
    expect(result).not.toContain('Schema definition');
    expect(result).not.toContain('<data-source');
  });

  it('strips <page-discussions>...</page-discussions> blocks', () => {
    const input = `# My Page

Some content here.

<page-discussions>
3 discussions, 2 resolved
discussion://abc/def/ghi
</page-discussions>`;

    const result = cleanNotionMarkdown(input);
    expect(result).toContain('# My Page');
    expect(result).toContain('Some content here.');
    expect(result).not.toContain('discussions');
    expect(result).not.toContain('<page-discussions');
  });

  it('strips <templates>...</templates> blocks', () => {
    const input = `# Database Title

<templates>
- Template A (id: tmpl-001)
- Template B (id: tmpl-002)
</templates>

Regular content.`;

    const result = cleanNotionMarkdown(input);
    expect(result).toContain('# Database Title');
    expect(result).toContain('Regular content.');
    expect(result).not.toContain('Template A');
    expect(result).not.toContain('<templates');
  });

  it('preserves standard markdown (headers, lists, code blocks, bold, italic)', () => {
    const input = `# Header 1

## Header 2

- Item 1
- Item 2
  - Nested

**Bold text** and *italic text*

\`\`\`typescript
const x = 42;
\`\`\`

| Col A | Col B |
|-------|-------|
| 1     | 2     |`;

    const result = cleanNotionMarkdown(input);
    expect(result).toContain('# Header 1');
    expect(result).toContain('## Header 2');
    expect(result).toContain('- Item 1');
    expect(result).toContain('  - Nested');
    expect(result).toContain('**Bold text**');
    expect(result).toContain('*italic text*');
    expect(result).toContain('const x = 42;');
    expect(result).toContain('| Col A | Col B |');
  });

  it('handles empty/whitespace input', () => {
    expect(cleanNotionMarkdown('')).toBe('');
    expect(cleanNotionMarkdown('   ')).toBe('');
    expect(cleanNotionMarkdown('\n\n')).toBe('');
  });

  it('handles content with no Notion-specific tags (passthrough)', () => {
    const input = `# Plain Markdown

Just regular content with no special tags.

- Point A
- Point B`;

    const result = cleanNotionMarkdown(input);
    expect(result).toBe(input);
  });
});

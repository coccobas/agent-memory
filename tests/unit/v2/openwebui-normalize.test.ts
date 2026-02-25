import { describe, expect, it } from 'vitest';
import { cleanOpenWebUIContent } from '../../../src/v2/sources/openwebui/normalize.js';

describe('cleanOpenWebUIContent', () => {
  it('strips system prompt blocks prefixed with [system]', () => {
    const input = `[system]
You are a helpful assistant. Follow all instructions carefully.

### User
What is the architecture?`;

    const result = cleanOpenWebUIContent(input);
    expect(result).not.toContain('helpful assistant');
    expect(result).toContain('### User');
    expect(result).toContain('architecture');
  });

  it('normalizes [user] and [assistant] role prefixes to markdown headers', () => {
    const input = `[user] What frameworks do we use?
[assistant] We use React and Node.js for our stack.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('### User');
    expect(result).toContain('### Assistant');
    expect(result).toContain('React and Node.js');
  });

  it('normalizes [human] prefix to ### User', () => {
    const input = '[human] Tell me about the project';
    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('### User');
    expect(result).not.toContain('[human]');
  });

  it('removes pipeline metadata annotations (__pipeline__: ...)', () => {
    const input = `__pipeline__: memory-extraction
__model__: gpt-4
__timestamp__: 2024-01-15T10:00:00Z

The actual content here is useful.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).not.toContain('__pipeline__');
    expect(result).not.toContain('__model__');
    expect(result).not.toContain('__timestamp__');
    expect(result).toContain('actual content here is useful');
  });

  it('removes [Source: ...] attribution markers', () => {
    const input = `According to our docs, we use TypeScript strict mode.
[Source: coding-standards.pdf]
[Source: https://internal.docs/standards]`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('TypeScript strict mode');
    expect(result).not.toContain('[Source:');
    expect(result).not.toContain('coding-standards.pdf');
  });

  it('removes ---chunk--- boundary markers', () => {
    const input = `First chunk of content.
---chunk---
Second chunk of content.
---chunk---
Third chunk.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('First chunk');
    expect(result).toContain('Second chunk');
    expect(result).toContain('Third chunk');
    expect(result).not.toContain('---chunk---');
  });

  it('removes <details> blocks with pipeline/model metadata', () => {
    const input = `Some useful content.

<details>
<summary>Pipeline</summary>
Pipeline: memory-extraction
Model: gpt-4
Tokens: 1234
</details>

More content.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('Some useful content.');
    expect(result).toContain('More content.');
    expect(result).not.toContain('<details>');
    expect(result).not.toContain('Pipeline');
  });

  it('preserves standard markdown', () => {
    const input = `# Architecture

## Overview

- Point 1
- Point 2

\`\`\`typescript
const x = 42;
\`\`\`

**Bold** and *italic* text.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('# Architecture');
    expect(result).toContain('## Overview');
    expect(result).toContain('- Point 1');
    expect(result).toContain('const x = 42;');
    expect(result).toContain('**Bold**');
  });

  it('handles empty/whitespace input', () => {
    expect(cleanOpenWebUIContent('')).toBe('');
    expect(cleanOpenWebUIContent('   ')).toBe('');
    expect(cleanOpenWebUIContent('\n\n')).toBe('');
  });

  it('handles plain content with no Open WebUI markers (passthrough)', () => {
    const input = '# Simple doc\n\nJust regular markdown content.';
    expect(cleanOpenWebUIContent(input)).toBe(input);
  });

  it('handles mixed content types in a single document', () => {
    const input = `__pipeline__: extraction
__model__: claude-3

[user] What are our coding standards?
[assistant] We follow these guidelines:
- Always use TypeScript strict mode
- Prefer immutable data structures

[Source: standards.md]

---chunk---

Additional context from docs.`;

    const result = cleanOpenWebUIContent(input);
    expect(result).toContain('### User');
    expect(result).toContain('### Assistant');
    expect(result).toContain('TypeScript strict mode');
    expect(result).toContain('Additional context from docs');
    expect(result).not.toContain('__pipeline__');
    expect(result).not.toContain('[Source:');
    expect(result).not.toContain('---chunk---');
  });
});

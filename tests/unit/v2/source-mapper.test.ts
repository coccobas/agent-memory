import { describe, expect, it, vi } from 'vitest';
import type { SourceAdapter, SourcePageInput } from '../../../src/v2/sources/types.js';
import { mapSourcePageToEntry } from '../../../src/v2/sources/mapper.js';

const testAdapter: SourceAdapter = {
  sourceName: 'test-source',
  metadataIdField: 'testSourceId',
  normalizeContent: (raw: string) => raw.trim(),
};

function makePage(overrides: Partial<SourcePageInput> = {}): SourcePageInput {
  return {
    sourceId: 'src-001',
    title: 'Test Page',
    content: 'Some test content about the project.',
    ...overrides,
  };
}

describe('mapSourcePageToEntry', () => {
  it('maps page to guideline when content has rule/must keywords', () => {
    const page = makePage({
      content: 'You must always follow the coding standards and guidelines.',
    });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.type).toBe('guideline');
  });

  it('maps page to knowledge when content has architecture/decided keywords', () => {
    const page = makePage({
      content: 'We decided to use the hexagonal architecture pattern for the system.',
    });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.type).toBe('knowledge');
  });

  it('maps page to tool when content has npm/docker keywords', () => {
    const page = makePage({
      content: 'Run npm install to set up the project. Use docker compose up for services.',
    });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.type).toBe('tool');
  });

  it('respects explicit entryType override', () => {
    const page = makePage({
      content: 'Some generic content without keywords.',
      entryType: 'guideline',
    });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.type).toBe('guideline');
  });

  it('falls back to knowledge when no type detected', () => {
    const page = makePage({
      content: 'This is a simple note without any special markers.',
    });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.type).toBe('knowledge');
  });

  it('includes sourceId in metadata under adapter.metadataIdField', () => {
    const page = makePage({ sourceId: 'notion-page-uuid-123' });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.metadata).toBeDefined();
    expect(result.data.metadata!.testSourceId).toBe('notion-page-uuid-123');
    expect(result.data.metadata!.syncedAt).toBeDefined();
  });

  it('calls adapter.normalizeContent() on raw content', () => {
    const spyAdapter: SourceAdapter = {
      sourceName: 'spy',
      metadataIdField: 'spyId',
      normalizeContent: vi.fn((raw: string) => `cleaned: ${raw}`),
    };

    const page = makePage({ content: 'raw stuff' });
    const result = mapSourcePageToEntry(spyAdapter, page, 'proj');

    expect(spyAdapter.normalizeContent).toHaveBeenCalledWith('raw stuff');
    expect(result.data.content).toBe('cleaned: raw stuff');
  });

  it('sets source to import and scope to project', () => {
    const page = makePage();

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.source).toBe('import');
    expect(result.data.scope).toEqual({ type: 'project', id: 'my-project' });
  });

  it('includes sourceUrl in metadata when url is provided', () => {
    const page = makePage({ url: 'https://notion.so/my-page' });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.metadata!.sourceUrl).toBe('https://notion.so/my-page');
  });

  it('merges page.metadata into entry metadata', () => {
    const page = makePage({ metadata: { customField: 'value' } });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.metadata!.customField).toBe('value');
  });

  it('normalizes tags to lowercase', () => {
    const page = makePage({ tags: ['Frontend', 'REACT', 'ui-kit'] });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.tags).toEqual(['frontend', 'react', 'ui-kit']);
  });

  it('respects explicit category override', () => {
    const page = makePage({ category: 'custom-category' });

    const result = mapSourcePageToEntry(testAdapter, page, 'my-project');
    expect(result.data.category).toBe('custom-category');
  });
});

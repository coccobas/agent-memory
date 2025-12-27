/**
 * Unit tests for REST API query parameter parsing
 */

import { describe, it, expect } from 'vitest';
import { parseQueryBody } from '../../src/restapi/query-params.js';

describe('parseQueryBody', () => {
  describe('basic parameters', () => {
    it('should parse empty body', () => {
      const result = parseQueryBody({});

      expect(result.conversationId).toBeUndefined();
      expect(result.messageId).toBeUndefined();
      expect(result.autoLinkContext).toBeUndefined();
      expect(result.requestedTypes).toBeUndefined();
      expect(result.scope).toBeUndefined();
    });

    it('should parse conversationId', () => {
      const result = parseQueryBody({ conversationId: 'conv-123' });
      expect(result.conversationId).toBe('conv-123');
    });

    it('should parse messageId', () => {
      const result = parseQueryBody({ messageId: 'msg-456' });
      expect(result.messageId).toBe('msg-456');
    });

    it('should parse autoLinkContext', () => {
      const result = parseQueryBody({ autoLinkContext: true });
      expect(result.autoLinkContext).toBe(true);
    });

    it('should throw on invalid conversationId', () => {
      expect(() => parseQueryBody({ conversationId: 123 })).toThrow(/conversationId.*invalid type/i);
    });
  });

  describe('types parameter', () => {
    it('should parse valid types array', () => {
      const result = parseQueryBody({ types: ['tools', 'guidelines'] });
      expect(result.requestedTypes).toEqual(['tools', 'guidelines']);
      expect(result.queryParamsWithoutAgent.types).toEqual(['tools', 'guidelines']);
    });

    it('should parse all valid types', () => {
      const result = parseQueryBody({ types: ['tools', 'guidelines', 'knowledge'] });
      expect(result.requestedTypes).toEqual(['tools', 'guidelines', 'knowledge']);
    });

    it('should throw on invalid types', () => {
      expect(() => parseQueryBody({ types: ['invalid'] })).toThrow(/types.*invalid type/i);
    });

    it('should throw on non-array types', () => {
      expect(() => parseQueryBody({ types: 'tools' })).toThrow(/types.*invalid type/i);
    });

    it('should throw on mixed valid/invalid types', () => {
      expect(() => parseQueryBody({ types: ['tools', 'invalid'] })).toThrow(/types.*invalid type/i);
    });
  });

  describe('scope parameter', () => {
    it('should parse global scope', () => {
      const result = parseQueryBody({ scope: { type: 'global' } });
      expect(result.scope).toEqual({ type: 'global' });
    });

    it('should parse project scope with id', () => {
      const result = parseQueryBody({
        scope: { type: 'project', id: 'proj-123' },
      });
      expect(result.scope).toEqual({ type: 'project', id: 'proj-123' });
    });

    it('should parse scope with inherit flag', () => {
      const result = parseQueryBody({
        scope: { type: 'project', id: 'proj-123', inherit: true },
      });
      expect(result.scope).toEqual({ type: 'project', id: 'proj-123', inherit: true });
    });

    it('should parse all scope types', () => {
      for (const type of ['global', 'org', 'project', 'session']) {
        const result = parseQueryBody({ scope: { type } });
        expect(result.scope?.type).toBe(type);
      }
    });

    it('should throw on invalid scope type', () => {
      expect(() => parseQueryBody({ scope: { type: 'invalid' } })).toThrow(/scope.*invalid type/i);
    });

    it('should throw on non-object scope', () => {
      expect(() => parseQueryBody({ scope: 'global' })).toThrow(/scope.*invalid type/i);
    });

    it('should throw on scope with non-string id', () => {
      expect(() => parseQueryBody({ scope: { type: 'project', id: 123 } })).toThrow(/scope.*invalid type/i);
    });

    it('should throw on scope with non-boolean inherit', () => {
      expect(() => parseQueryBody({
        scope: { type: 'project', inherit: 'true' },
      })).toThrow(/scope.*invalid type/i);
    });
  });

  describe('search parameter', () => {
    it('should parse search string', () => {
      const result = parseQueryBody({ search: 'test query' });
      expect(result.queryParamsWithoutAgent.search).toBe('test query');
    });

    it('should throw on non-string search', () => {
      expect(() => parseQueryBody({ search: 123 })).toThrow(/search.*invalid type/i);
    });
  });

  describe('tags parameter', () => {
    it('should parse tags object', () => {
      const result = parseQueryBody({
        tags: { include: ['tag1', 'tag2'] },
      });
      expect(result.queryParamsWithoutAgent.tags).toEqual({ include: ['tag1', 'tag2'] });
    });

    it('should throw on non-object tags', () => {
      expect(() => parseQueryBody({ tags: ['tag1'] })).toThrow(/tags.*invalid type/i);
    });
  });

  describe('relatedTo parameter', () => {
    it('should parse relatedTo with required fields', () => {
      const result = parseQueryBody({
        relatedTo: { type: 'tool', id: 'tool-123' },
      });
      expect(result.queryParamsWithoutAgent.relatedTo).toEqual({
        type: 'tool',
        id: 'tool-123',
        relation: undefined,
        depth: undefined,
        direction: undefined,
        maxResults: undefined,
      });
    });

    it('should parse relatedTo with all optional fields', () => {
      const result = parseQueryBody({
        relatedTo: {
          type: 'guideline',
          id: 'g-123',
          relation: 'depends_on',
          depth: 3,
          direction: 'forward',
          maxResults: 10,
        },
      });
      expect(result.queryParamsWithoutAgent.relatedTo).toEqual({
        type: 'guideline',
        id: 'g-123',
        relation: 'depends_on',
        depth: 3,
        direction: 'forward',
        maxResults: 10,
      });
    });

    it('should parse all valid entry types', () => {
      for (const type of ['tool', 'guideline', 'knowledge']) {
        const result = parseQueryBody({
          relatedTo: { type, id: 'id-123' },
        });
        expect(result.queryParamsWithoutAgent.relatedTo?.type).toBe(type);
      }
    });

    it('should parse all traversal directions', () => {
      for (const direction of ['forward', 'backward', 'both']) {
        const result = parseQueryBody({
          relatedTo: { type: 'tool', id: 'tool-1', direction },
        });
        expect(result.queryParamsWithoutAgent.relatedTo?.direction).toBe(direction);
      }
    });

    it('should reject relatedTo without type', () => {
      const result = parseQueryBody({
        relatedTo: { id: 'tool-123' },
      });
      expect(result.queryParamsWithoutAgent.relatedTo).toBeUndefined();
    });

    it('should reject relatedTo without id', () => {
      const result = parseQueryBody({
        relatedTo: { type: 'tool' },
      });
      expect(result.queryParamsWithoutAgent.relatedTo).toBeUndefined();
    });

    it('should throw on non-object relatedTo', () => {
      expect(() => parseQueryBody({ relatedTo: 'tool-123' })).toThrow(/relatedTo.*invalid type/i);
    });

    it('should throw on invalid direction', () => {
      expect(() => parseQueryBody({
        relatedTo: { type: 'tool', id: 'tool-1', direction: 'invalid' },
      })).toThrow(/direction.*invalid type/i);
    });
  });

  describe('boolean parameters', () => {
    it('should parse followRelations', () => {
      const result = parseQueryBody({ followRelations: true });
      expect(result.queryParamsWithoutAgent.followRelations).toBe(true);
    });

    it('should parse compact', () => {
      const result = parseQueryBody({ compact: true });
      expect(result.queryParamsWithoutAgent.compact).toBe(true);
    });

    it('should parse semanticSearch', () => {
      const result = parseQueryBody({ semanticSearch: false });
      expect(result.queryParamsWithoutAgent.semanticSearch).toBe(false);
    });
  });

  describe('numeric parameters', () => {
    it('should parse limit', () => {
      const result = parseQueryBody({ limit: 50 });
      expect(result.queryParamsWithoutAgent.limit).toBe(50);
    });

    it('should parse semanticThreshold', () => {
      const result = parseQueryBody({ semanticThreshold: 0.85 });
      expect(result.queryParamsWithoutAgent.semanticThreshold).toBe(0.85);
    });

    it('should throw on non-numeric limit', () => {
      expect(() => parseQueryBody({ limit: '50' })).toThrow(/limit.*invalid type/i);
    });
  });

  describe('complex combinations', () => {
    it('should parse multiple parameters together', () => {
      const result = parseQueryBody({
        conversationId: 'conv-1',
        types: ['tools', 'knowledge'],
        scope: { type: 'project', id: 'proj-1', inherit: true },
        search: 'api',
        limit: 20,
        compact: true,
      });

      expect(result.conversationId).toBe('conv-1');
      expect(result.requestedTypes).toEqual(['tools', 'knowledge']);
      expect(result.scope).toEqual({ type: 'project', id: 'proj-1', inherit: true });
      expect(result.queryParamsWithoutAgent.search).toBe('api');
      expect(result.queryParamsWithoutAgent.limit).toBe(20);
      expect(result.queryParamsWithoutAgent.compact).toBe(true);
    });
  });
});

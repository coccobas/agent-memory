/**
 * Unit tests for query-types type guards and helpers
 */

import { describe, it, expect } from 'vitest';
import {
  isTextSearchQuery,
  isSemanticSearchQuery,
  isRelationQuery,
  isTagQuery,
  isDateRangeQuery,
  isPriorityQuery,
  isConversationContextQuery,
  isDefaultQuery,
  inferQueryStrategy,
  type TypedMemoryQuery,
  type TextSearchQuery,
  type SemanticSearchQuery,
  type RelationQuery,
  type TagQuery,
  type DateRangeQuery,
  type PriorityQuery,
  type ConversationContextQuery,
  type DefaultQuery,
} from '../../src/core/query-types.js';

describe('query-types', () => {
  describe('isTextSearchQuery', () => {
    it('should return true for text search query', () => {
      const query: TextSearchQuery = {
        strategy: 'text',
        search: 'test query',
      };
      expect(isTextSearchQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const semanticQuery: SemanticSearchQuery = {
        strategy: 'semantic',
        search: 'test',
      };
      expect(isTextSearchQuery(semanticQuery)).toBe(false);
    });

    it('should return false for default query', () => {
      const defaultQuery: DefaultQuery = {
        search: 'test',
      };
      expect(isTextSearchQuery(defaultQuery)).toBe(false);
    });
  });

  describe('isSemanticSearchQuery', () => {
    it('should return true for semantic search query', () => {
      const query: SemanticSearchQuery = {
        strategy: 'semantic',
        search: 'test query',
      };
      expect(isSemanticSearchQuery(query)).toBe(true);
    });

    it('should return false for text search query', () => {
      const textQuery: TextSearchQuery = {
        strategy: 'text',
        search: 'test',
      };
      expect(isSemanticSearchQuery(textQuery)).toBe(false);
    });

    it('should handle optional semanticThreshold', () => {
      const query: SemanticSearchQuery = {
        strategy: 'semantic',
        search: 'test',
        semanticThreshold: 0.8,
      };
      expect(isSemanticSearchQuery(query)).toBe(true);
    });
  });

  describe('isRelationQuery', () => {
    it('should return true for relation query', () => {
      const query: RelationQuery = {
        strategy: 'relation',
        relatedTo: {
          type: 'knowledge',
          id: 'k-123',
        },
      };
      expect(isRelationQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const tagQuery: TagQuery = {
        strategy: 'tag',
        tags: { include: ['test'] },
      };
      expect(isRelationQuery(tagQuery)).toBe(false);
    });

    it('should handle full relatedTo descriptor', () => {
      const query: RelationQuery = {
        strategy: 'relation',
        relatedTo: {
          type: 'guideline',
          id: 'g-123',
          relation: 'depends_on',
          depth: 2,
          direction: 'both',
          maxResults: 10,
        },
      };
      expect(isRelationQuery(query)).toBe(true);
    });
  });

  describe('isTagQuery', () => {
    it('should return true for tag query', () => {
      const query: TagQuery = {
        strategy: 'tag',
        tags: { include: ['important'] },
      };
      expect(isTagQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const dateQuery: DateRangeQuery = {
        strategy: 'date',
        createdAfter: '2024-01-01',
      };
      expect(isTagQuery(dateQuery)).toBe(false);
    });

    it('should handle tags with require and exclude', () => {
      const query: TagQuery = {
        strategy: 'tag',
        tags: {
          include: ['feature'],
          require: ['approved'],
          exclude: ['deprecated'],
        },
      };
      expect(isTagQuery(query)).toBe(true);
    });
  });

  describe('isDateRangeQuery', () => {
    it('should return true for date range query', () => {
      const query: DateRangeQuery = {
        strategy: 'date',
        createdAfter: '2024-01-01',
      };
      expect(isDateRangeQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const priorityQuery: PriorityQuery = {
        strategy: 'priority',
        priority: { min: 50 },
      };
      expect(isDateRangeQuery(priorityQuery)).toBe(false);
    });

    it('should handle all date range fields', () => {
      const query: DateRangeQuery = {
        strategy: 'date',
        createdAfter: '2024-01-01',
        createdBefore: '2024-12-31',
        updatedAfter: '2024-06-01',
        updatedBefore: '2024-06-30',
      };
      expect(isDateRangeQuery(query)).toBe(true);
    });
  });

  describe('isPriorityQuery', () => {
    it('should return true for priority query', () => {
      const query: PriorityQuery = {
        strategy: 'priority',
        priority: { min: 50, max: 100 },
      };
      expect(isPriorityQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const conversationQuery: ConversationContextQuery = {
        strategy: 'conversation',
        conversationId: 'conv-123',
      };
      expect(isPriorityQuery(conversationQuery)).toBe(false);
    });

    it('should handle priority with only min', () => {
      const query: PriorityQuery = {
        strategy: 'priority',
        priority: { min: 75 },
      };
      expect(isPriorityQuery(query)).toBe(true);
    });

    it('should handle priority with only max', () => {
      const query: PriorityQuery = {
        strategy: 'priority',
        priority: { max: 80 },
      };
      expect(isPriorityQuery(query)).toBe(true);
    });
  });

  describe('isConversationContextQuery', () => {
    it('should return true for conversation context query', () => {
      const query: ConversationContextQuery = {
        strategy: 'conversation',
        conversationId: 'conv-123',
      };
      expect(isConversationContextQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const textQuery: TextSearchQuery = {
        strategy: 'text',
        search: 'test',
      };
      expect(isConversationContextQuery(textQuery)).toBe(false);
    });

    it('should handle optional fields', () => {
      const query: ConversationContextQuery = {
        strategy: 'conversation',
        conversationId: 'conv-123',
        messageId: 'msg-456',
        autoLinkContext: true,
      };
      expect(isConversationContextQuery(query)).toBe(true);
    });
  });

  describe('isDefaultQuery', () => {
    it('should return true for query with undefined strategy', () => {
      const query: DefaultQuery = {
        search: 'test',
      };
      expect(isDefaultQuery(query)).toBe(true);
    });

    it('should return true for query with default strategy', () => {
      const query: DefaultQuery = {
        strategy: 'default',
        search: 'test',
      };
      expect(isDefaultQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const textQuery: TextSearchQuery = {
        strategy: 'text',
        search: 'test',
      };
      expect(isDefaultQuery(textQuery)).toBe(false);
    });

    it('should handle query with all optional fields', () => {
      const query: DefaultQuery = {
        types: ['tools', 'guidelines'],
        search: 'test',
        semanticSearch: true,
        tags: { include: ['important'] },
        limit: 10,
        hierarchical: true,
      };
      expect(isDefaultQuery(query)).toBe(true);
    });
  });

  describe('inferQueryStrategy', () => {
    it('should infer semantic strategy when semanticSearch is true', () => {
      const params = { semanticSearch: true, search: 'test' };
      expect(inferQueryStrategy(params)).toBe('semantic');
    });

    it('should infer relation strategy when relatedTo is present', () => {
      const params = { relatedTo: { type: 'knowledge', id: 'k-1' } };
      expect(inferQueryStrategy(params)).toBe('relation');
    });

    it('should infer tag strategy when tags is present', () => {
      const params = { tags: { include: ['test'] } };
      expect(inferQueryStrategy(params)).toBe('tag');
    });

    it('should infer date strategy when date filters are present', () => {
      expect(inferQueryStrategy({ createdAfter: '2024-01-01' })).toBe('date');
      expect(inferQueryStrategy({ createdBefore: '2024-12-31' })).toBe('date');
      expect(inferQueryStrategy({ updatedAfter: '2024-01-01' })).toBe('date');
      expect(inferQueryStrategy({ updatedBefore: '2024-12-31' })).toBe('date');
    });

    it('should infer priority strategy when priority is present', () => {
      const params = { priority: { min: 50 } };
      expect(inferQueryStrategy(params)).toBe('priority');
    });

    it('should infer conversation strategy when conversationId is present', () => {
      const params = { conversationId: 'conv-123' };
      expect(inferQueryStrategy(params)).toBe('conversation');
    });

    it('should infer text strategy when only search is present', () => {
      const params = { search: 'test query' };
      expect(inferQueryStrategy(params)).toBe('text');
    });

    it('should return default for empty params', () => {
      expect(inferQueryStrategy({})).toBe('default');
    });

    it('should return default when no matching strategy', () => {
      const params = { limit: 10, offset: 0 };
      expect(inferQueryStrategy(params)).toBe('default');
    });

    it('should not infer tag strategy for empty tags object', () => {
      const params = { tags: {} };
      expect(inferQueryStrategy(params)).toBe('default');
    });

    it('should not infer semantic when semanticSearch is false', () => {
      const params = { semanticSearch: false, search: 'test' };
      expect(inferQueryStrategy(params)).toBe('text');
    });

    it('should prioritize semantic over text when both applicable', () => {
      const params = { semanticSearch: true, search: 'test', tags: { include: ['x'] } };
      expect(inferQueryStrategy(params)).toBe('semantic');
    });

    it('should prioritize relation over tag', () => {
      const params = { relatedTo: { type: 'knowledge', id: 'k-1' }, tags: { include: ['x'] } };
      expect(inferQueryStrategy(params)).toBe('relation');
    });
  });
});

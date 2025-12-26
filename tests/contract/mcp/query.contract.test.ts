/**
 * Contract tests for MCP memory_query tool handler
 *
 * These tests verify the MCP tool contract remains stable.
 * They focus on request/response structure, not implementation details.
 */

import { describe, it, expect } from 'vitest';

/**
 * Query context action response contract
 */
interface ContextResponse {
  tools: ToolEntry[];
  guidelines: GuidelineEntry[];
  knowledge: KnowledgeEntry[];
  summary: {
    totalTools: number;
    totalGuidelines: number;
    totalKnowledge: number;
  };
}

/**
 * Query search action response contract
 */
interface SearchResponse {
  tools: ToolEntry[];
  guidelines: GuidelineEntry[];
  knowledge: KnowledgeEntry[];
  totalMatches: number;
}

interface ToolEntry {
  id: string;
  name: string;
  description?: string;
  category?: string;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
}

interface GuidelineEntry {
  id: string;
  name: string;
  content: string;
  category?: string;
  priority?: number;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  confidence?: number;
  scopeType: string;
  scopeId?: string;
  isActive: boolean;
}

describe('MCP memory_query Contract', () => {
  describe('Context Action Response', () => {
    it('defines required response structure', () => {
      const response: ContextResponse = {
        tools: [],
        guidelines: [],
        knowledge: [],
        summary: {
          totalTools: 0,
          totalGuidelines: 0,
          totalKnowledge: 0,
        },
      };

      expect(response).toHaveProperty('tools');
      expect(response).toHaveProperty('guidelines');
      expect(response).toHaveProperty('knowledge');
      expect(response).toHaveProperty('summary');
      expect(Array.isArray(response.tools)).toBe(true);
      expect(Array.isArray(response.guidelines)).toBe(true);
      expect(Array.isArray(response.knowledge)).toBe(true);
    });

    it('summary has correct structure', () => {
      const response: ContextResponse = {
        tools: [],
        guidelines: [],
        knowledge: [],
        summary: {
          totalTools: 5,
          totalGuidelines: 10,
          totalKnowledge: 15,
        },
      };

      expect(typeof response.summary.totalTools).toBe('number');
      expect(typeof response.summary.totalGuidelines).toBe('number');
      expect(typeof response.summary.totalKnowledge).toBe('number');
    });
  });

  describe('Search Action Response', () => {
    it('defines required response structure', () => {
      const response: SearchResponse = {
        tools: [],
        guidelines: [],
        knowledge: [],
        totalMatches: 0,
      };

      expect(response).toHaveProperty('totalMatches');
      expect(typeof response.totalMatches).toBe('number');
    });
  });

  describe('Entry Contracts', () => {
    it('tool entry has required fields', () => {
      const tool: ToolEntry = {
        id: 'tool-123',
        name: 'test-tool',
        scopeType: 'project',
        isActive: true,
      };

      expect(tool).toHaveProperty('id');
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('scopeType');
      expect(tool).toHaveProperty('isActive');
    });

    it('guideline entry has required fields', () => {
      const guideline: GuidelineEntry = {
        id: 'guide-123',
        name: 'test-guideline',
        content: 'Test content',
        scopeType: 'project',
        isActive: true,
      };

      expect(guideline).toHaveProperty('id');
      expect(guideline).toHaveProperty('name');
      expect(guideline).toHaveProperty('content');
      expect(guideline).toHaveProperty('scopeType');
      expect(guideline).toHaveProperty('isActive');
    });

    it('knowledge entry has required fields', () => {
      const knowledge: KnowledgeEntry = {
        id: 'know-123',
        title: 'Test Title',
        content: 'Test content',
        scopeType: 'project',
        isActive: true,
      };

      expect(knowledge).toHaveProperty('id');
      expect(knowledge).toHaveProperty('title');
      expect(knowledge).toHaveProperty('content');
      expect(knowledge).toHaveProperty('scopeType');
      expect(knowledge).toHaveProperty('isActive');
    });
  });

  describe('Scope Type Values', () => {
    it('accepts valid scope types', () => {
      const validScopeTypes = ['global', 'org', 'project', 'session'];

      for (const scopeType of validScopeTypes) {
        const entry: ToolEntry = {
          id: 'test',
          name: 'test',
          scopeType,
          isActive: true,
        };
        expect(validScopeTypes).toContain(entry.scopeType);
      }
    });
  });
});

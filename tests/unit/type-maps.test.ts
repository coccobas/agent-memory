import { describe, it, expect } from 'vitest';
import {
  QUERY_TYPE_TO_ENTRY_TYPE,
  ENTRY_TYPE_TO_QUERY_TYPE,
  QUERY_TYPE_TO_TABLE_NAME,
  ENTRY_TYPE_TO_TABLE_NAME,
  ENTRY_TYPE_KEY_FIELD,
  queryTypeToEntryType,
  entryTypeToQueryType,
  getEntryKeyValue,
  getEntrySearchableText,
} from '../../src/services/query/type-maps.js';

describe('Query Pipeline Type Mappings', () => {
  describe('QUERY_TYPE_TO_ENTRY_TYPE', () => {
    it('should map plural query types to singular entry types', () => {
      expect(QUERY_TYPE_TO_ENTRY_TYPE.tools).toBe('tool');
      expect(QUERY_TYPE_TO_ENTRY_TYPE.guidelines).toBe('guideline');
      expect(QUERY_TYPE_TO_ENTRY_TYPE.knowledge).toBe('knowledge');
      expect(QUERY_TYPE_TO_ENTRY_TYPE.experiences).toBe('experience');
    });
  });

  describe('ENTRY_TYPE_TO_QUERY_TYPE', () => {
    it('should map singular entry types to plural query types', () => {
      expect(ENTRY_TYPE_TO_QUERY_TYPE.tool).toBe('tools');
      expect(ENTRY_TYPE_TO_QUERY_TYPE.guideline).toBe('guidelines');
      expect(ENTRY_TYPE_TO_QUERY_TYPE.knowledge).toBe('knowledge');
      expect(ENTRY_TYPE_TO_QUERY_TYPE.experience).toBe('experiences');
    });
  });

  describe('QUERY_TYPE_TO_TABLE_NAME', () => {
    it('should map query types to table names', () => {
      expect(QUERY_TYPE_TO_TABLE_NAME.tools).toBe('tools');
      expect(QUERY_TYPE_TO_TABLE_NAME.guidelines).toBe('guidelines');
      expect(QUERY_TYPE_TO_TABLE_NAME.knowledge).toBe('knowledge');
      expect(QUERY_TYPE_TO_TABLE_NAME.experiences).toBe('experiences');
    });
  });

  describe('ENTRY_TYPE_TO_TABLE_NAME', () => {
    it('should map entry types to table names', () => {
      expect(ENTRY_TYPE_TO_TABLE_NAME.tool).toBe('tools');
      expect(ENTRY_TYPE_TO_TABLE_NAME.guideline).toBe('guidelines');
      expect(ENTRY_TYPE_TO_TABLE_NAME.knowledge).toBe('knowledge');
      expect(ENTRY_TYPE_TO_TABLE_NAME.experience).toBe('experiences');
    });
  });

  describe('ENTRY_TYPE_KEY_FIELD', () => {
    it('should map query types to correct key field', () => {
      expect(ENTRY_TYPE_KEY_FIELD.tools).toBe('name');
      expect(ENTRY_TYPE_KEY_FIELD.guidelines).toBe('name');
      expect(ENTRY_TYPE_KEY_FIELD.knowledge).toBe('title');
      expect(ENTRY_TYPE_KEY_FIELD.experiences).toBe('title');
    });
  });

  describe('queryTypeToEntryType', () => {
    it('should convert tools to tool', () => {
      expect(queryTypeToEntryType('tools')).toBe('tool');
    });

    it('should convert guidelines to guideline', () => {
      expect(queryTypeToEntryType('guidelines')).toBe('guideline');
    });

    it('should convert knowledge to knowledge', () => {
      expect(queryTypeToEntryType('knowledge')).toBe('knowledge');
    });

    it('should convert experiences to experience', () => {
      expect(queryTypeToEntryType('experiences')).toBe('experience');
    });
  });

  describe('entryTypeToQueryType', () => {
    it('should convert tool to tools', () => {
      expect(entryTypeToQueryType('tool')).toBe('tools');
    });

    it('should convert guideline to guidelines', () => {
      expect(entryTypeToQueryType('guideline')).toBe('guidelines');
    });

    it('should convert knowledge to knowledge', () => {
      expect(entryTypeToQueryType('knowledge')).toBe('knowledge');
    });

    it('should convert experience to experiences', () => {
      expect(entryTypeToQueryType('experience')).toBe('experiences');
    });
  });

  describe('getEntryKeyValue', () => {
    it('should return name for tool entries', () => {
      const entry = { name: 'My Tool', id: 'tool-1' };
      expect(getEntryKeyValue(entry as any, 'tools')).toBe('My Tool');
    });

    it('should return name for guideline entries', () => {
      const entry = { name: 'My Guideline', id: 'guide-1' };
      expect(getEntryKeyValue(entry as any, 'guidelines')).toBe('My Guideline');
    });

    it('should return title for knowledge entries', () => {
      const entry = { title: 'My Knowledge', id: 'know-1' };
      expect(getEntryKeyValue(entry as any, 'knowledge')).toBe('My Knowledge');
    });

    it('should return title for experience entries', () => {
      const entry = { title: 'My Experience', id: 'exp-1' };
      expect(getEntryKeyValue(entry as any, 'experiences')).toBe('My Experience');
    });

    it('should return empty string for missing name', () => {
      const entry = { id: 'tool-1' };
      expect(getEntryKeyValue(entry as any, 'tools')).toBe('');
    });

    it('should return empty string for missing title', () => {
      const entry = { id: 'know-1' };
      expect(getEntryKeyValue(entry as any, 'knowledge')).toBe('');
    });
  });

  describe('getEntrySearchableText', () => {
    describe('tools', () => {
      it('should return name and description combined', () => {
        const entry = { name: 'My Tool', description: 'Tool description' };
        expect(getEntrySearchableText(entry as any, 'tools')).toBe('My Tool Tool description');
      });

      it('should return only name when no description', () => {
        const entry = { name: 'My Tool' };
        expect(getEntrySearchableText(entry as any, 'tools')).toBe('My Tool');
      });

      it('should return only description when no name', () => {
        const entry = { description: 'Tool description' };
        expect(getEntrySearchableText(entry as any, 'tools')).toBe('Tool description');
      });

      it('should return empty string when no fields', () => {
        const entry = {};
        expect(getEntrySearchableText(entry as any, 'tools')).toBe('');
      });
    });

    describe('guidelines', () => {
      it('should return name and content combined', () => {
        const entry = { name: 'My Guideline', content: 'Guideline content' };
        expect(getEntrySearchableText(entry as any, 'guidelines')).toBe(
          'My Guideline Guideline content'
        );
      });

      it('should return only name when no content', () => {
        const entry = { name: 'My Guideline' };
        expect(getEntrySearchableText(entry as any, 'guidelines')).toBe('My Guideline');
      });

      it('should return only content when no name', () => {
        const entry = { content: 'Guideline content' };
        expect(getEntrySearchableText(entry as any, 'guidelines')).toBe('Guideline content');
      });
    });

    describe('knowledge', () => {
      it('should return title and content combined', () => {
        const entry = { title: 'My Knowledge', content: 'Knowledge content' };
        expect(getEntrySearchableText(entry as any, 'knowledge')).toBe(
          'My Knowledge Knowledge content'
        );
      });

      it('should return only title when no content', () => {
        const entry = { title: 'My Knowledge' };
        expect(getEntrySearchableText(entry as any, 'knowledge')).toBe('My Knowledge');
      });

      it('should return only content when no title', () => {
        const entry = { content: 'Knowledge content' };
        expect(getEntrySearchableText(entry as any, 'knowledge')).toBe('Knowledge content');
      });
    });

    describe('experiences', () => {
      it('should return title and content combined', () => {
        const entry = { title: 'My Experience', content: 'Experience content' };
        expect(getEntrySearchableText(entry as any, 'experiences')).toBe(
          'My Experience Experience content'
        );
      });

      it('should return only title when no content', () => {
        const entry = { title: 'My Experience' };
        expect(getEntrySearchableText(entry as any, 'experiences')).toBe('My Experience');
      });

      it('should return only content when no title', () => {
        const entry = { content: 'Experience content' };
        expect(getEntrySearchableText(entry as any, 'experiences')).toBe('Experience content');
      });
    });
  });
});

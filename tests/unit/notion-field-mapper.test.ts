import { describe, it, expect } from 'vitest';
import {
  mapNotionStatusToTaskStatus,
  detectPropertyType,
  extractPropertyValue,
  mapNotionPropertiesToTaskInput,
  extractDisplayValue,
} from '../../src/services/notion-sync/field-mapper.js';
import type { FieldMapping } from '../../src/services/notion-sync/config.js';

describe('Notion Field Mapper', () => {
  describe('mapNotionStatusToTaskStatus', () => {
    it('maps "Done" to done', () => {
      expect(mapNotionStatusToTaskStatus('Done')).toBe('done');
      expect(mapNotionStatusToTaskStatus('Completed')).toBe('done');
      expect(mapNotionStatusToTaskStatus('DONE')).toBe('done');
    });

    it('maps "In Progress" to in_progress', () => {
      expect(mapNotionStatusToTaskStatus('In Progress')).toBe('in_progress');
      expect(mapNotionStatusToTaskStatus('Doing')).toBe('in_progress');
      expect(mapNotionStatusToTaskStatus('IN PROGRESS')).toBe('in_progress');
    });

    it('maps "Blocked" to blocked', () => {
      expect(mapNotionStatusToTaskStatus('Blocked')).toBe('blocked');
      expect(mapNotionStatusToTaskStatus('BLOCKED')).toBe('blocked');
    });

    it('maps "Review" to review', () => {
      expect(mapNotionStatusToTaskStatus('In Review')).toBe('review');
      expect(mapNotionStatusToTaskStatus('Review')).toBe('review');
    });

    it('maps "Backlog" to backlog', () => {
      expect(mapNotionStatusToTaskStatus('Backlog')).toBe('backlog');
    });

    it('maps cancelled statuses to wont_do', () => {
      expect(mapNotionStatusToTaskStatus('Cancelled')).toBe('wont_do');
      expect(mapNotionStatusToTaskStatus('Wont Do')).toBe('wont_do');
    });

    it('defaults to open for unknown statuses', () => {
      expect(mapNotionStatusToTaskStatus('Unknown')).toBe('open');
      expect(mapNotionStatusToTaskStatus('New')).toBe('open');
      expect(mapNotionStatusToTaskStatus('')).toBe('open');
    });

    it('handles undefined', () => {
      expect(mapNotionStatusToTaskStatus(undefined)).toBe('open');
    });
  });

  describe('detectPropertyType', () => {
    it('detects title property', () => {
      expect(detectPropertyType({ title: [] })).toBe('title');
    });

    it('detects rich_text property', () => {
      expect(detectPropertyType({ rich_text: [] })).toBe('rich_text');
    });

    it('detects select property', () => {
      expect(detectPropertyType({ select: { name: 'Option' } })).toBe('select');
    });

    it('detects multi_select property', () => {
      expect(detectPropertyType({ multi_select: [] })).toBe('multi_select');
    });

    it('detects date property', () => {
      expect(detectPropertyType({ date: { start: '2024-01-01' } })).toBe('date');
    });

    it('detects checkbox property', () => {
      expect(detectPropertyType({ checkbox: true })).toBe('checkbox');
    });

    it('detects status property', () => {
      expect(detectPropertyType({ status: { name: 'Done' } })).toBe('status');
    });

    it('detects number property', () => {
      expect(detectPropertyType({ number: 42 })).toBe('number');
    });

    it('detects formula property', () => {
      expect(detectPropertyType({ formula: {} })).toBe('formula');
    });

    it('detects rollup property', () => {
      expect(detectPropertyType({ rollup: {} })).toBe('rollup');
    });

    it('detects relation property', () => {
      expect(detectPropertyType({ relation: [] })).toBe('relation');
    });

    it('returns unknown for unrecognized types', () => {
      expect(detectPropertyType({ custom: 'value' })).toBe('unknown');
      expect(detectPropertyType({})).toBe('unknown');
    });

    it('handles null and undefined', () => {
      expect(detectPropertyType(null)).toBe('unknown');
      expect(detectPropertyType(undefined)).toBe('unknown');
    });
  });

  describe('extractPropertyValue', () => {
    it('extracts title value', () => {
      const properties = {
        Name: { title: [{ plain_text: 'My Title' }] },
      };
      const mapping: FieldMapping = { notionProperty: 'Name', taskField: 'title' };

      expect(extractPropertyValue(properties, mapping)).toBe('My Title');
    });

    it('extracts rich_text value', () => {
      const properties = {
        Description: { rich_text: [{ plain_text: 'Part 1 ' }, { plain_text: 'Part 2' }] },
      };
      const mapping: FieldMapping = { notionProperty: 'Description', taskField: 'description' };

      expect(extractPropertyValue(properties, mapping)).toBe('Part 1 Part 2');
    });

    it('extracts select value', () => {
      const properties = {
        Category: { select: { name: 'Bug' } },
      };
      const mapping: FieldMapping = { notionProperty: 'Category', taskField: 'category' };

      expect(extractPropertyValue(properties, mapping)).toBe('Bug');
    });

    it('extracts multi_select values', () => {
      const properties = {
        Tags: { multi_select: [{ name: 'urgent' }, { name: 'frontend' }] },
      };
      const mapping: FieldMapping = { notionProperty: 'Tags', taskField: 'tags' };

      expect(extractPropertyValue(properties, mapping)).toEqual(['urgent', 'frontend']);
    });

    it('extracts date value', () => {
      const properties = {
        Due: { date: { start: '2024-12-31' } },
      };
      const mapping: FieldMapping = { notionProperty: 'Due', taskField: 'dueDate' };

      expect(extractPropertyValue(properties, mapping)).toBe('2024-12-31');
    });

    it('extracts checkbox value', () => {
      const properties = {
        Done: { checkbox: true },
      };
      const mapping: FieldMapping = { notionProperty: 'Done', taskField: 'status' };

      expect(extractPropertyValue(properties, mapping)).toBe(true);
    });

    it('extracts status value', () => {
      const properties = {
        Status: { status: { name: 'In Progress' } },
      };
      const mapping: FieldMapping = { notionProperty: 'Status', taskField: 'status' };

      expect(extractPropertyValue(properties, mapping)).toBe('In Progress');
    });

    it('extracts number value', () => {
      const properties = {
        Priority: { number: 5 },
      };
      const mapping: FieldMapping = {
        notionProperty: 'Priority',
        taskField: 'category',
        notionType: 'number',
      };

      expect(extractPropertyValue(properties, mapping)).toBe(5);
    });

    it('uses explicit notionType when provided', () => {
      const properties = {
        Field: { rich_text: [{ plain_text: 'Text' }] },
      };
      const mapping: FieldMapping = {
        notionProperty: 'Field',
        taskField: 'description',
        notionType: 'rich_text',
      };

      expect(extractPropertyValue(properties, mapping)).toBe('Text');
    });

    it('returns undefined for missing property', () => {
      const properties = {};
      const mapping: FieldMapping = { notionProperty: 'Missing', taskField: 'title' };

      expect(extractPropertyValue(properties, mapping)).toBeUndefined();
    });

    it('returns raw property for unsupported types', () => {
      const properties = {
        Formula: { formula: { type: 'string', string: 'calculated' } },
      };
      const mapping: FieldMapping = { notionProperty: 'Formula', taskField: 'category' };

      const result = extractPropertyValue(properties, mapping);
      expect(result).toEqual({ formula: { type: 'string', string: 'calculated' } });
    });

    it('handles null select value', () => {
      const properties = {
        Category: { select: null },
      };
      const mapping: FieldMapping = { notionProperty: 'Category', taskField: 'category' };

      expect(extractPropertyValue(properties, mapping)).toBeUndefined();
    });

    it('handles empty arrays', () => {
      const properties = {
        Name: { title: [] },
        Tags: { multi_select: [] },
      };

      expect(extractPropertyValue(properties, { notionProperty: 'Name', taskField: 'title' })).toBe(
        ''
      );
      expect(
        extractPropertyValue(properties, { notionProperty: 'Tags', taskField: 'tags' })
      ).toEqual([]);
    });
  });

  describe('mapNotionPropertiesToTaskInput', () => {
    const fieldMappings: FieldMapping[] = [
      { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
      { notionProperty: 'Description', taskField: 'description', notionType: 'rich_text' },
      { notionProperty: 'Status', taskField: 'status', notionType: 'status' },
    ];

    it('maps properties to task input', () => {
      const properties = {
        Name: { title: [{ plain_text: 'My Task' }] },
        Description: { rich_text: [{ plain_text: 'Task description' }] },
        Status: { status: { name: 'In Progress' } },
      };

      const result = mapNotionPropertiesToTaskInput(properties, fieldMappings, 'proj-123');

      expect(result.input.title).toBe('My Task');
      expect(result.input.description).toBe('Task description');
      expect(result.input.status).toBe('in_progress');
      expect(result.input.scopeType).toBe('project');
      expect(result.input.scopeId).toBe('proj-123');
      expect(result.input.taskType).toBe('other');
    });

    it('includes agentId when provided', () => {
      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
      };

      const result = mapNotionPropertiesToTaskInput(
        properties,
        fieldMappings,
        'proj-123',
        'test-agent'
      );

      expect(result.input.createdBy).toBe('test-agent');
    });

    it('defaults createdBy to notion-sync', () => {
      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
      };

      const result = mapNotionPropertiesToTaskInput(properties, fieldMappings, 'proj-123');

      expect(result.input.createdBy).toBe('notion-sync');
    });

    it('collects unmapped properties', () => {
      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
        CustomField: { rich_text: [{ plain_text: 'Custom value' }] },
        AnotherField: { number: 42 },
      };

      const result = mapNotionPropertiesToTaskInput(properties, fieldMappings, 'proj-123');

      expect(result.unmappedProperties).toHaveProperty('CustomField');
      expect(result.unmappedProperties).toHaveProperty('AnotherField');
      expect(result.unmappedProperties).not.toHaveProperty('Name');
    });

    it('maps tags from multi_select', () => {
      const mappings: FieldMapping[] = [
        { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
        { notionProperty: 'Tags', taskField: 'tags', notionType: 'multi_select' },
      ];

      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
        Tags: { multi_select: [{ name: 'urgent' }, { name: 'bug' }] },
      };

      const result = mapNotionPropertiesToTaskInput(properties, mappings, 'proj-123');

      expect(result.input.tags).toEqual(['urgent', 'bug']);
    });

    it('maps dueDate from date', () => {
      const mappings: FieldMapping[] = [
        { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
        { notionProperty: 'Due', taskField: 'dueDate', notionType: 'date' },
      ];

      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
        Due: { date: { start: '2024-12-31' } },
      };

      const result = mapNotionPropertiesToTaskInput(properties, mappings, 'proj-123');

      expect(result.input.dueDate).toBe('2024-12-31');
    });

    it('maps assignee from rich_text', () => {
      const mappings: FieldMapping[] = [
        { notionProperty: 'Name', taskField: 'title', notionType: 'title' },
        { notionProperty: 'Assignee', taskField: 'assignee', notionType: 'rich_text' },
      ];

      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
        Assignee: { rich_text: [{ plain_text: 'john@example.com' }] },
      };

      const result = mapNotionPropertiesToTaskInput(properties, mappings, 'proj-123');

      expect(result.input.assignee).toBe('john@example.com');
    });

    it('skips undefined values', () => {
      const properties = {
        Name: { title: [{ plain_text: 'Task' }] },
      };

      const result = mapNotionPropertiesToTaskInput(properties, fieldMappings, 'proj-123');

      expect(result.input.title).toBe('Task');
      expect(result.input.description).toBeUndefined();
      expect(result.input.status).toBeUndefined();
    });
  });

  describe('extractDisplayValue', () => {
    it('extracts title for display', () => {
      expect(extractDisplayValue({ title: [{ plain_text: 'My Title' }] })).toBe('My Title');
    });

    it('extracts rich_text for display', () => {
      expect(
        extractDisplayValue({ rich_text: [{ plain_text: 'Part 1 ' }, { plain_text: 'Part 2' }] })
      ).toBe('Part 1 Part 2');
    });

    it('extracts select for display', () => {
      expect(extractDisplayValue({ select: { name: 'Option A' } })).toBe('Option A');
    });

    it('extracts multi_select for display', () => {
      expect(extractDisplayValue({ multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }] })).toBe(
        'Tag1, Tag2'
      );
    });

    it('extracts date for display', () => {
      expect(extractDisplayValue({ date: { start: '2024-01-15' } })).toBe('2024-01-15');
    });

    it('extracts checkbox for display', () => {
      expect(extractDisplayValue({ checkbox: true })).toBe('Yes');
      expect(extractDisplayValue({ checkbox: false })).toBe('No');
    });

    it('extracts status for display', () => {
      expect(extractDisplayValue({ status: { name: 'Done' } })).toBe('Done');
    });

    it('extracts number for display', () => {
      expect(extractDisplayValue({ number: 42 })).toBe('42');
      expect(extractDisplayValue({ number: 3.14 })).toBe('3.14');
    });

    it('returns JSON for unknown types', () => {
      const result = extractDisplayValue({ formula: { string: 'calculated' } });
      expect(result).toContain('formula');
    });

    it('handles null and undefined', () => {
      expect(extractDisplayValue(null)).toBe('');
      expect(extractDisplayValue(undefined)).toBe('');
    });

    it('handles empty values', () => {
      expect(extractDisplayValue({ select: null })).toBe('');
      expect(extractDisplayValue({ date: null })).toBe('');
      expect(extractDisplayValue({ status: null })).toBe('');
      expect(extractDisplayValue({ number: null })).toBe('');
    });
  });
});

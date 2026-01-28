import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadNotionSyncConfig,
  validateDatabaseConfig,
  validateFieldMapping,
  isSupportedNotionType,
  SUPPORTED_NOTION_TYPES,
  TASK_FIELDS,
  type NotionSyncConfig,
  type DatabaseConfig,
  type FieldMapping,
} from '../../src/services/notion-sync/config.js';
import { AgentMemoryError } from '../../src/core/errors.js';

describe('Notion Sync Config', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-sync-test-'));
    configPath = path.join(tempDir, 'notion-sync.config.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  const validConfig: NotionSyncConfig = {
    databases: [
      {
        notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        projectScopeId: 'proj-123',
        syncEnabled: true,
        fieldMappings: [
          { notionProperty: 'Name', taskField: 'title' },
          { notionProperty: 'Status', taskField: 'status', notionType: 'select' },
        ],
      },
    ],
  };

  describe('loadNotionSyncConfig', () => {
    it('loads and validates a valid config file', () => {
      fs.writeFileSync(configPath, JSON.stringify(validConfig));

      const result = loadNotionSyncConfig(configPath);

      expect(result.databases).toHaveLength(1);
      expect(result.databases[0].notionDatabaseId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.databases[0].projectScopeId).toBe('proj-123');
      expect(result.databases[0].syncEnabled).toBe(true);
      expect(result.databases[0].fieldMappings).toHaveLength(2);
    });

    it('applies default syncEnabled=true when not specified', () => {
      const configWithoutSyncEnabled = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(configWithoutSyncEnabled));

      const result = loadNotionSyncConfig(configPath);

      expect(result.databases[0].syncEnabled).toBe(true);
    });

    it('throws error when config file not found', () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent.json');

      expect(() => loadNotionSyncConfig(nonExistentPath)).toThrow(AgentMemoryError);
      expect(() => loadNotionSyncConfig(nonExistentPath)).toThrow(/Config file not found/);
    });

    it('throws error for invalid JSON', () => {
      fs.writeFileSync(configPath, '{ invalid json }');

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
      expect(() => loadNotionSyncConfig(configPath)).toThrow(/Failed to parse config file/);
    });

    it('throws error when databases array is empty', () => {
      fs.writeFileSync(configPath, JSON.stringify({ databases: [] }));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
      expect(() => loadNotionSyncConfig(configPath)).toThrow(/At least one database configuration/);
    });

    it('throws error for invalid database ID format', () => {
      const invalidConfig = {
        databases: [
          {
            notionDatabaseId: 'invalid-id',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
      expect(() => loadNotionSyncConfig(configPath)).toThrow(/Invalid Notion database ID format/);
    });

    it('throws error when fieldMappings is empty', () => {
      const invalidConfig = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
      expect(() => loadNotionSyncConfig(configPath)).toThrow(/At least one field mapping/);
    });

    it('throws error for invalid taskField value', () => {
      const invalidConfig = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'invalidField' }],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
    });

    it('throws error for invalid notionType value', () => {
      const invalidConfig = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [
              { notionProperty: 'Name', taskField: 'title', notionType: 'unsupported_type' },
            ],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
    });

    it('accepts database ID without hyphens', () => {
      const configWithoutHyphens = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(configWithoutHyphens));

      const result = loadNotionSyncConfig(configPath);

      expect(result.databases[0].notionDatabaseId).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('accepts lastSyncTimestamp as ISO datetime', () => {
      const configWithTimestamp = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
            lastSyncTimestamp: '2024-01-15T10:30:00Z',
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(configWithTimestamp));

      const result = loadNotionSyncConfig(configPath);

      expect(result.databases[0].lastSyncTimestamp).toBe('2024-01-15T10:30:00Z');
    });

    it('throws error for invalid lastSyncTimestamp format', () => {
      const invalidConfig = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-123',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
            lastSyncTimestamp: 'not-a-date',
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadNotionSyncConfig(configPath)).toThrow(AgentMemoryError);
    });
  });

  describe('validateDatabaseConfig', () => {
    it('validates a valid database config', () => {
      const dbConfig: DatabaseConfig = {
        notionDatabaseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        projectScopeId: 'proj-123',
        syncEnabled: true,
        fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
      };

      const result = validateDatabaseConfig(dbConfig);

      expect(result.notionDatabaseId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.projectScopeId).toBe('proj-123');
    });

    it('throws error for missing required fields', () => {
      const invalidConfig = {
        notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
      };

      expect(() => validateDatabaseConfig(invalidConfig)).toThrow(AgentMemoryError);
      expect(() => validateDatabaseConfig(invalidConfig)).toThrow(/Invalid database config/);
    });

    it('throws error for empty projectScopeId', () => {
      const invalidConfig = {
        notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
        projectScopeId: '',
        fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
      };

      expect(() => validateDatabaseConfig(invalidConfig)).toThrow(AgentMemoryError);
      expect(() => validateDatabaseConfig(invalidConfig)).toThrow(/Project scope ID is required/);
    });
  });

  describe('validateFieldMapping', () => {
    it('validates a valid field mapping', () => {
      const mapping: FieldMapping = {
        notionProperty: 'Name',
        taskField: 'title',
      };

      const result = validateFieldMapping(mapping);

      expect(result.notionProperty).toBe('Name');
      expect(result.taskField).toBe('title');
    });

    it('validates field mapping with notionType', () => {
      const mapping: FieldMapping = {
        notionProperty: 'Status',
        taskField: 'status',
        notionType: 'select',
      };

      const result = validateFieldMapping(mapping);

      expect(result.notionType).toBe('select');
    });

    it('throws error for empty notionProperty', () => {
      const invalidMapping = {
        notionProperty: '',
        taskField: 'title',
      };

      expect(() => validateFieldMapping(invalidMapping)).toThrow(AgentMemoryError);
      expect(() => validateFieldMapping(invalidMapping)).toThrow(
        /Notion property name is required/
      );
    });

    it('throws error for invalid taskField', () => {
      const invalidMapping = {
        notionProperty: 'Name',
        taskField: 'invalid',
      };

      expect(() => validateFieldMapping(invalidMapping)).toThrow(AgentMemoryError);
    });
  });

  describe('isSupportedNotionType', () => {
    it('returns true for supported types', () => {
      for (const type of SUPPORTED_NOTION_TYPES) {
        expect(isSupportedNotionType(type)).toBe(true);
      }
    });

    it('returns false for unsupported types', () => {
      expect(isSupportedNotionType('formula')).toBe(false);
      expect(isSupportedNotionType('rollup')).toBe(false);
      expect(isSupportedNotionType('relation')).toBe(false);
      expect(isSupportedNotionType('unknown')).toBe(false);
    });
  });

  describe('Type exports', () => {
    it('exports SUPPORTED_NOTION_TYPES with expected values', () => {
      expect(SUPPORTED_NOTION_TYPES).toContain('title');
      expect(SUPPORTED_NOTION_TYPES).toContain('rich_text');
      expect(SUPPORTED_NOTION_TYPES).toContain('number');
      expect(SUPPORTED_NOTION_TYPES).toContain('select');
      expect(SUPPORTED_NOTION_TYPES).toContain('multi_select');
      expect(SUPPORTED_NOTION_TYPES).toContain('date');
      expect(SUPPORTED_NOTION_TYPES).toContain('checkbox');
      expect(SUPPORTED_NOTION_TYPES).toContain('status');
      expect(SUPPORTED_NOTION_TYPES).toHaveLength(8);
    });

    it('exports TASK_FIELDS with expected values', () => {
      expect(TASK_FIELDS).toContain('title');
      expect(TASK_FIELDS).toContain('description');
      expect(TASK_FIELDS).toContain('status');
      expect(TASK_FIELDS).toContain('resolution');
      expect(TASK_FIELDS).toContain('category');
      expect(TASK_FIELDS).toContain('dueDate');
      expect(TASK_FIELDS).toContain('assignee');
      expect(TASK_FIELDS).toContain('tags');
      expect(TASK_FIELDS).toHaveLength(8);
    });
  });

  describe('Multiple databases', () => {
    it('supports multiple database configurations', () => {
      const multiDbConfig = {
        databases: [
          {
            notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
            projectScopeId: 'proj-1',
            fieldMappings: [{ notionProperty: 'Name', taskField: 'title' }],
          },
          {
            notionDatabaseId: 'b2c3d4e5f67890abcdef1234567890a1',
            projectScopeId: 'proj-2',
            syncEnabled: false,
            fieldMappings: [
              { notionProperty: 'Title', taskField: 'title' },
              { notionProperty: 'Description', taskField: 'description', notionType: 'rich_text' },
            ],
          },
        ],
      };
      fs.writeFileSync(configPath, JSON.stringify(multiDbConfig));

      const result = loadNotionSyncConfig(configPath);

      expect(result.databases).toHaveLength(2);
      expect(result.databases[0].projectScopeId).toBe('proj-1');
      expect(result.databases[1].projectScopeId).toBe('proj-2');
      expect(result.databases[1].syncEnabled).toBe(false);
    });
  });
});

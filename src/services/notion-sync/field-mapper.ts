/**
 * Notion Field Mapper
 *
 * Maps Notion database property types to Agent Memory task fields.
 * Supports: title, rich_text, number, select, multi_select, date, checkbox, status
 * Unsupported types are stored in task metadata.
 */

import type { FieldMapping } from './config.js';
import type { TaskStatus } from '../../db/schema.js';
import type { CreateTaskInput } from '../../db/repositories/tasks.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('notion-field-mapper');

export interface NotionPageProperties {
  [key: string]: unknown;
}

export interface MappedTaskInput {
  input: Partial<CreateTaskInput>;
  unmappedProperties: Record<string, unknown>;
}

function extractRichText(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const prop = property as { rich_text?: Array<{ plain_text?: string }> };
  if (!Array.isArray(prop.rich_text)) return '';
  return prop.rich_text.map((t) => t.plain_text ?? '').join('');
}

function extractTitle(property: unknown): string {
  if (!property || typeof property !== 'object') return '';
  const prop = property as { title?: Array<{ plain_text?: string }> };
  if (!Array.isArray(prop.title)) return '';
  return prop.title.map((t) => t.plain_text ?? '').join('');
}

function extractSelect(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { select?: { name?: string } | null };
  return prop.select?.name;
}

function extractMultiSelect(property: unknown): string[] {
  if (!property || typeof property !== 'object') return [];
  const prop = property as { multi_select?: Array<{ name?: string }> };
  if (!Array.isArray(prop.multi_select)) return [];
  return prop.multi_select.map((s) => s.name ?? '').filter(Boolean);
}

function extractDate(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { date?: { start?: string } | null };
  return prop.date?.start;
}

function extractCheckbox(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const prop = property as { checkbox?: boolean };
  return prop.checkbox ?? false;
}

function extractStatus(property: unknown): string | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { status?: { name?: string } | null };
  return prop.status?.name;
}

function extractNumber(property: unknown): number | undefined {
  if (!property || typeof property !== 'object') return undefined;
  const prop = property as { number?: number | null };
  return prop.number ?? undefined;
}

/**
 * Map Notion status string to Agent Memory TaskStatus.
 * Uses fuzzy matching to handle common Notion status names.
 */
export function mapNotionStatusToTaskStatus(notionStatus: string | undefined): TaskStatus {
  if (!notionStatus) return 'open';

  const statusLower = notionStatus.toLowerCase();

  if (statusLower.includes('done') || statusLower.includes('complete')) return 'done';
  if (statusLower.includes('progress') || statusLower.includes('doing')) return 'in_progress';
  if (statusLower.includes('block')) return 'blocked';
  if (statusLower.includes('review')) return 'review';
  if (statusLower.includes('backlog')) return 'backlog';
  if (statusLower.includes('cancel') || statusLower.includes('wont')) return 'wont_do';

  return 'open';
}

/**
 * Detect Notion property type from its structure.
 */
export function detectPropertyType(property: unknown): string {
  if (!property || typeof property !== 'object') return 'unknown';
  const prop = property as Record<string, unknown>;

  if ('title' in prop) return 'title';
  if ('rich_text' in prop) return 'rich_text';
  if ('select' in prop) return 'select';
  if ('multi_select' in prop) return 'multi_select';
  if ('date' in prop) return 'date';
  if ('checkbox' in prop) return 'checkbox';
  if ('status' in prop) return 'status';
  if ('number' in prop) return 'number';
  if ('formula' in prop) return 'formula';
  if ('rollup' in prop) return 'rollup';
  if ('relation' in prop) return 'relation';
  if ('people' in prop) return 'people';
  if ('files' in prop) return 'files';
  if ('url' in prop) return 'url';
  if ('email' in prop) return 'email';
  if ('phone_number' in prop) return 'phone_number';
  if ('created_time' in prop) return 'created_time';
  if ('last_edited_time' in prop) return 'last_edited_time';
  if ('created_by' in prop) return 'created_by';
  if ('last_edited_by' in prop) return 'last_edited_by';

  return 'unknown';
}

/**
 * Extract property value based on field mapping configuration.
 */
export function extractPropertyValue(
  properties: NotionPageProperties,
  mapping: FieldMapping
): unknown {
  const property = properties[mapping.notionProperty];
  if (!property) return undefined;

  const propType = mapping.notionType ?? detectPropertyType(property);

  switch (propType) {
    case 'title':
      return extractTitle(property);
    case 'rich_text':
      return extractRichText(property);
    case 'select':
      return extractSelect(property);
    case 'multi_select':
      return extractMultiSelect(property);
    case 'date':
      return extractDate(property);
    case 'checkbox':
      return extractCheckbox(property);
    case 'status':
      return extractStatus(property);
    case 'number':
      return extractNumber(property);
    default:
      logger.debug(
        { property: mapping.notionProperty, type: propType },
        'Unsupported property type'
      );
      return property;
  }
}

/**
 * Map a Notion page's properties to task input fields.
 *
 * @param properties - Notion page properties object
 * @param fieldMappings - Array of field mapping configurations
 * @param projectScopeId - Target project scope ID
 * @param agentId - Optional agent ID for audit trail
 * @returns Mapped task input and unmapped properties for metadata
 */
export function mapNotionPropertiesToTaskInput(
  properties: NotionPageProperties,
  fieldMappings: FieldMapping[],
  projectScopeId: string,
  agentId?: string
): MappedTaskInput {
  const input: Partial<CreateTaskInput> = {
    scopeType: 'project',
    scopeId: projectScopeId,
    taskType: 'other',
    createdBy: agentId ?? 'notion-sync',
  };

  const unmappedProperties: Record<string, unknown> = {};

  for (const mapping of fieldMappings) {
    const value = extractPropertyValue(properties, mapping);

    if (value === undefined) continue;

    switch (mapping.taskField) {
      case 'title':
        input.title = String(value);
        break;
      case 'description':
        input.description = String(value);
        break;
      case 'status':
        input.status = mapNotionStatusToTaskStatus(String(value));
        break;
      case 'resolution':
        input.resolution = String(value);
        break;
      case 'category':
        input.category = String(value);
        break;
      case 'dueDate':
        input.dueDate = String(value);
        break;
      case 'assignee':
        input.assignee = String(value);
        break;
      case 'tags':
        input.tags = Array.isArray(value) ? value : [String(value)];
        break;
    }
  }

  const mappedPropertyNames = new Set(fieldMappings.map((m) => m.notionProperty));
  for (const [name, value] of Object.entries(properties)) {
    if (!mappedPropertyNames.has(name)) {
      unmappedProperties[name] = value;
    }
  }

  return { input, unmappedProperties };
}

/**
 * Extract a human-readable value from any Notion property for display.
 */
export function extractDisplayValue(property: unknown): string {
  if (!property || typeof property !== 'object') return '';

  const propType = detectPropertyType(property);

  switch (propType) {
    case 'title':
      return extractTitle(property);
    case 'rich_text':
      return extractRichText(property);
    case 'select':
      return extractSelect(property) ?? '';
    case 'multi_select':
      return extractMultiSelect(property).join(', ');
    case 'date':
      return extractDate(property) ?? '';
    case 'checkbox':
      return extractCheckbox(property) ? 'Yes' : 'No';
    case 'status':
      return extractStatus(property) ?? '';
    case 'number': {
      const num = extractNumber(property);
      return num !== undefined ? String(num) : '';
    }
    default:
      return JSON.stringify(property);
  }
}

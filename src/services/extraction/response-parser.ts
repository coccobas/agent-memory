/**
 * Response parser for extraction results
 */

import { createComponentLogger } from '../../utils/logger.js';
import type {
  ExtractedEntry,
  ExtractedEntity,
  ExtractedRelationship,
  EntityType,
  ExtractedRelationType,
} from './providers/types.js';

const logger = createComponentLogger('extraction-parser');

/**
 * Parse and normalize extraction response from LLM
 */
export function parseExtractionResponse(content: string): {
  entries: ExtractedEntry[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonContent = content.trim();

  // Remove markdown code blocks if present
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonContent = jsonMatch[1].trim();
  }

  // Parse JSON
  let parsed: {
    guidelines?: Array<{
      name?: string;
      content?: string;
      category?: string;
      priority?: number;
      rationale?: string;
      confidence?: number;
      suggestedTags?: string[];
    }>;
    knowledge?: Array<{
      title?: string;
      content?: string;
      category?: string;
      confidence?: number;
      source?: string;
      suggestedTags?: string[];
    }>;
    tools?: Array<{
      name?: string;
      description?: string;
      category?: string;
      confidence?: number;
      suggestedTags?: string[];
    }>;
    entities?: Array<{
      name?: string;
      entityType?: string;
      description?: string;
      confidence?: number;
    }>;
    relationships?: Array<{
      sourceRef?: string;
      sourceType?: string;
      targetRef?: string;
      targetType?: string;
      relationType?: string;
      confidence?: number;
    }>;
  };

  try {
    parsed = JSON.parse(jsonContent) as typeof parsed;
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    logger.warn(
      {
        parseError: parseError.message,
        parseErrorName: parseError.name,
        parseStack: parseError.stack?.split('\n').slice(0, 5).join('\n'),
        contentLength: jsonContent.length,
        contentPreview: jsonContent.slice(0, 200),
        hadMarkdownBlock: content.includes('```'),
        reason: 'JSON_PARSE_FAILURE',
      },
      'Extraction response parse failure - returning empty results'
    );
    return { entries: [], entities: [], relationships: [] };
  }

  // Validate parsed structure has expected shape
  if (typeof parsed !== 'object' || parsed === null) {
    logger.warn(
      { parsedType: typeof parsed, reason: 'INVALID_RESPONSE_STRUCTURE' },
      'Extraction response is not an object - returning empty results'
    );
    return { entries: [], entities: [], relationships: [] };
  }

  const entries: ExtractedEntry[] = [];
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];

  // Helper to normalize confidence with warning on invalid values
  const normalizeConfidence = (value: unknown, context: string): number => {
    if (typeof value !== 'number') return 0.5;
    if (value < 0 || value > 1) {
      logger.warn(
        { value, context, normalized: Math.min(1, Math.max(0, value)) },
        'Confidence score out of valid range [0,1], normalizing'
      );
    }
    return Math.min(1, Math.max(0, value));
  };

  // Normalize guidelines
  if (Array.isArray(parsed.guidelines)) {
    for (const g of parsed.guidelines) {
      if (g.name && g.content) {
        entries.push({
          type: 'guideline',
          name: toKebabCase(g.name),
          content: g.content,
          category: g.category,
          priority:
            typeof g.priority === 'number' ? Math.min(100, Math.max(0, g.priority)) : undefined,
          confidence: normalizeConfidence(g.confidence, `guideline:${g.name}`),
          rationale: g.rationale,
          suggestedTags: g.suggestedTags,
        });
      }
    }
  }

  // Normalize knowledge
  if (Array.isArray(parsed.knowledge)) {
    for (const k of parsed.knowledge) {
      if (k.title && k.content) {
        entries.push({
          type: 'knowledge',
          title: k.title,
          content: k.content,
          category: k.category,
          confidence: normalizeConfidence(k.confidence, `knowledge:${k.title}`),
          rationale: k.source, // Map source to rationale for consistency
          suggestedTags: k.suggestedTags,
        });
      }
    }
  }

  // Normalize tools
  if (Array.isArray(parsed.tools)) {
    for (const t of parsed.tools) {
      if (t.name && t.description) {
        entries.push({
          type: 'tool',
          name: toKebabCase(t.name),
          content: t.description,
          category: t.category,
          confidence: normalizeConfidence(t.confidence, `tool:${t.name}`),
          suggestedTags: t.suggestedTags,
        });
      }
    }
  }

  // Normalize entities
  if (Array.isArray(parsed.entities)) {
    const validEntityTypes: EntityType[] = [
      'person',
      'technology',
      'component',
      'concept',
      'organization',
    ];
    for (const e of parsed.entities) {
      if (e.name && e.entityType && validEntityTypes.includes(e.entityType as EntityType)) {
        entities.push({
          name: e.name,
          entityType: e.entityType as EntityType,
          description: e.description,
          confidence: normalizeConfidence(e.confidence, `entity:${e.name}`),
        });
      }
    }
  }

  // Normalize relationships
  if (Array.isArray(parsed.relationships)) {
    const validRelationTypes: ExtractedRelationType[] = [
      'depends_on',
      'related_to',
      'applies_to',
      'conflicts_with',
    ];
    const validSourceTypes = ['guideline', 'knowledge', 'tool', 'entity'];
    for (const r of parsed.relationships) {
      if (
        r.sourceRef &&
        r.sourceType &&
        r.targetRef &&
        r.targetType &&
        r.relationType &&
        validSourceTypes.includes(r.sourceType) &&
        validSourceTypes.includes(r.targetType) &&
        validRelationTypes.includes(r.relationType as ExtractedRelationType)
      ) {
        relationships.push({
          sourceRef: r.sourceRef,
          sourceType: r.sourceType as 'guideline' | 'knowledge' | 'tool' | 'entity',
          targetRef: r.targetRef,
          targetType: r.targetType as 'guideline' | 'knowledge' | 'tool' | 'entity',
          relationType: r.relationType as ExtractedRelationType,
          confidence: normalizeConfidence(
            r.confidence,
            `relationship:${r.sourceRef}->${r.targetRef}`
          ),
        });
      }
    }
  }

  // Deduplicate within single extraction to prevent identical entries
  const deduplicatedEntries = deduplicateEntries(entries);
  const deduplicatedEntities = deduplicateEntities(entities);
  const deduplicatedRelationships = deduplicateRelationships(relationships);

  // Log if duplicates were found
  const entriesRemoved = entries.length - deduplicatedEntries.length;
  const entitiesRemoved = entities.length - deduplicatedEntities.length;
  const relationsRemoved = relationships.length - deduplicatedRelationships.length;
  if (entriesRemoved > 0 || entitiesRemoved > 0 || relationsRemoved > 0) {
    logger.debug(
      {
        entriesRemoved,
        entitiesRemoved,
        relationsRemoved,
        originalCounts: {
          entries: entries.length,
          entities: entities.length,
          relationships: relationships.length,
        },
      },
      'Removed duplicate items from extraction'
    );
  }

  return {
    entries: deduplicatedEntries,
    entities: deduplicatedEntities,
    relationships: deduplicatedRelationships,
  };
}

/**
 * Deduplicate extracted entries by type + name/title key.
 * Keeps the entry with higher confidence when duplicates exist.
 */
function deduplicateEntries(entries: ExtractedEntry[]): ExtractedEntry[] {
  const seen = new Map<string, ExtractedEntry>();
  for (const entry of entries) {
    const key =
      entry.type === 'knowledge'
        ? `knowledge:${entry.title?.toLowerCase()}`
        : `${entry.type}:${entry.name?.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || (entry.confidence ?? 0) > (existing.confidence ?? 0)) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplicate extracted entities by name + entityType.
 * Keeps the entity with higher confidence when duplicates exist.
 */
function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    const key = `${entity.entityType}:${entity.name.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || (entity.confidence ?? 0) > (existing.confidence ?? 0)) {
      seen.set(key, entity);
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplicate extracted relationships by source + target + relationType.
 * Keeps the relationship with higher confidence when duplicates exist.
 */
function deduplicateRelationships(relationships: ExtractedRelationship[]): ExtractedRelationship[] {
  const seen = new Map<string, ExtractedRelationship>();
  for (const rel of relationships) {
    const key = `${rel.sourceRef}:${rel.sourceType}->${rel.targetRef}:${rel.targetType}:${rel.relationType}`;
    const existing = seen.get(key);
    if (!existing || (rel.confidence ?? 0) > (existing.confidence ?? 0)) {
      seen.set(key, rel);
    }
  }
  return Array.from(seen.values());
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

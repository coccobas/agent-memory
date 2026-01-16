/**
 * Entity Extractor
 *
 * Extracts entities from text using regex patterns with fuzzy matching support.
 * Used for entity-aware retrieval in the query pipeline.
 *
 * Entity types:
 * - FILE_PATH: File paths like /src/foo/bar.ts, ./config.json
 * - FUNCTION_NAME: camelCase/PascalCase identifiers like myFunction, MyClass
 * - PACKAGE_NAME: npm-style packages like @org/package, lodash
 * - URL: HTTP/HTTPS URLs
 * - ERROR_CODE: Error codes like E1234, TypeError, ENOENT
 * - COMMAND: CLI commands like npm run, git commit, docker build
 * - CUSTOM: User-defined entities (not auto-extracted)
 *
 * Semantic types (for richer entity understanding):
 * - person: Names of people (detected heuristically)
 * - organization: Company/org names
 * - location: Geographic locations
 * - concept: Abstract technical concepts
 * - unknown: Default when type cannot be determined
 */

import type { EntityType } from '../../db/schema/entity-index.js';

/**
 * Semantic entity type for richer understanding
 */
export type SemanticEntityType = 'person' | 'organization' | 'location' | 'concept' | 'unknown';

/**
 * Extracted entity with type and value
 */
export interface ExtractedEntity {
  /** The type of entity */
  type: EntityType;
  /** The raw extracted value */
  value: string;
  /** The normalized value (lowercase, trimmed) for matching */
  normalizedValue: string;
  /** Confidence score (0-1) for the extraction */
  confidence?: number;
  /** Semantic type for richer understanding */
  semanticType?: SemanticEntityType;
  /** Fuzzy matching variants for improved recall */
  variants?: string[];
}

/**
 * Regex patterns for entity extraction
 */
const ENTITY_PATTERNS: Record<Exclude<EntityType, 'CUSTOM'>, RegExp> = {
  // File paths: /path/to/file.ext, ./relative/path.ts, ../parent/file.js
  // Must have at least one slash and end with .extension
  FILE_PATH: /(?:^|[\s"'`({[])([.]{0,2}\/[\w\-./]+\.\w{1,10})(?:[\s"'`)\]}]|$)/g,

  // Function names: camelCase, PascalCase, snake_case (2+ chars, not all caps)
  // Must start with lowercase or uppercase letter, contain letters and possibly numbers
  // Exclude common words and keywords
  FUNCTION_NAME:
    /(?:^|[\s.`"'({[])([a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*(?:[A-Z][a-zA-Z0-9]*)*)(?:[\s()`"'\]}).,;:]|$)/g,

  // Package names: @org/package, lodash, react-dom
  // Scoped: @scope/package-name
  // Unscoped: package-name (must have hyphen or be known pattern)
  PACKAGE_NAME: /(?:^|[\s"'`])(@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+)(?:[\s"'`@]|$)/g,

  // URLs: http(s)://domain.tld/path
  URL: /https?:\/\/[^\s"'`<>)\]]+/gi,

  // Error codes: E1234, ENOENT, TypeError, SyntaxError, ERR_SOMETHING
  // Common patterns: uppercase letters followed by numbers, or CamelCase ending in Error/Exception
  ERROR_CODE:
    /(?:^|[\s"'`:([])([A-Z][a-zA-Z]*(?:Error|Exception)|E[A-Z0-9_]+|ERR_[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,})(?:[\s"'`:;,.\])]|$)/g,

  // Commands: npm run, git commit, yarn add, docker build, pnpm install
  // CLI tool followed by subcommand(s) - flexible word boundaries
  COMMAND:
    /(?:^|[\s`$])((npm|yarn|pnpm|npx|git|docker|kubectl|make|cargo|go|pip|python|node|deno|bun)\s+[a-z][\w-]*)(?:[\s`.,;]|$)/gi,
};

/**
 * Common words to exclude from function name extraction
 */
const EXCLUDED_FUNCTION_NAMES = new Set([
  // JavaScript keywords
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'return',
  'throw',
  'try',
  'catch',
  'finally',
  'new',
  'delete',
  'typeof',
  'instanceof',
  'void',
  'in',
  'of',
  'with',
  'debugger',
  // Common words
  'the',
  'and',
  'or',
  'not',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'to',
  'from',
  'by',
  'at',
  'on',
  'in',
  'out',
  'up',
  'down',
  'over',
  'under',
  'above',
  'below',
  'between',
  'through',
  'during',
  'before',
  'after',
  'when',
  'where',
  'why',
  'how',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  // Types and primitives
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'null',
  'undefined',
  'true',
  'false',
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'const',
  'let',
  'var',
  'async',
  'await',
  'import',
  'export',
  'default',
  'extends',
  'implements',
  'static',
  'public',
  'private',
  'protected',
  'readonly',
  // Short words
  'a',
  'an',
  'as',
  'so',
  'if',
  'or',
  'we',
  'us',
  'my',
  'me',
  'he',
  'she',
  'ok',
  // Common technical terms that are not function names
  'api',
  'url',
  'sql',
  'css',
  'html',
  'xml',
  'json',
  'yaml',
  'tsx',
  'jsx',
]);

/**
 * Minimum length for function names to be considered
 */
const MIN_FUNCTION_NAME_LENGTH = 3;

/**
 * Maximum length for function names (avoid matching long text)
 */
const MAX_FUNCTION_NAME_LENGTH = 50;

/**
 * Check if a string looks like a valid function name
 */
function isValidFunctionName(name: string): boolean {
  if (name.length < MIN_FUNCTION_NAME_LENGTH || name.length > MAX_FUNCTION_NAME_LENGTH) {
    return false;
  }

  // Exclude common words
  if (EXCLUDED_FUNCTION_NAMES.has(name.toLowerCase())) {
    return false;
  }

  // Must have camelCase or PascalCase pattern (mixed case) OR underscore
  const hasUpperCase = /[A-Z]/.test(name);
  const hasLowerCase = /[a-z]/.test(name);
  const hasUnderscore = /_/.test(name);

  // Reject all uppercase (likely constants or acronyms handled by ERROR_CODE)
  if (hasUpperCase && !hasLowerCase && !hasUnderscore) {
    return false;
  }

  // Must have mixed case or underscore
  return (hasUpperCase && hasLowerCase) || hasUnderscore;
}

/**
 * Normalize an entity value for matching
 */
function normalizeValue(type: EntityType, value: string): string {
  switch (type) {
    case 'FILE_PATH':
      // Normalize path separators and lowercase
      return value.toLowerCase().replace(/\\/g, '/');
    case 'FUNCTION_NAME':
      // Keep original case for function names (case-sensitive matching)
      return value;
    case 'PACKAGE_NAME':
      // Lowercase package names
      return value.toLowerCase();
    case 'URL':
      // Lowercase URLs (domain part)
      return value.toLowerCase();
    case 'ERROR_CODE':
      // Keep original case for error codes
      return value;
    case 'COMMAND':
      // Lowercase commands
      return value.toLowerCase().trim();
    case 'CUSTOM':
      // Keep original for custom
      return value.trim();
    default:
      return value;
  }
}

/**
 * Generate fuzzy matching variants for an entity value
 * Used to improve recall in entity-based retrieval
 */
function generateVariants(type: EntityType, value: string): string[] {
  const variants: Set<string> = new Set();

  // Always include the original and normalized
  variants.add(value);
  variants.add(value.toLowerCase());

  switch (type) {
    case 'FUNCTION_NAME': {
      // Split camelCase/PascalCase into words
      const words = value.split(/(?=[A-Z])|_/).filter((w) => w.length > 0);
      if (words.length > 1) {
        // Add individual words (lowercased)
        words.forEach((w) => variants.add(w.toLowerCase()));
        // Add joined versions
        variants.add(words.join('_').toLowerCase()); // snake_case
        variants.add(words.join('-').toLowerCase()); // kebab-case
        variants.add(words.join('').toLowerCase()); // concatenated
      }
      break;
    }

    case 'FILE_PATH': {
      // Extract filename without extension
      const filename = value.split('/').pop() || value;
      variants.add(filename.toLowerCase());
      // Extract base name without extension
      const baseName = filename.split('.')[0];
      if (baseName) {
        variants.add(baseName.toLowerCase());
      }
      break;
    }

    case 'PACKAGE_NAME': {
      // Handle scoped packages (@org/pkg)
      if (value.startsWith('@')) {
        const [scope, pkg] = value.slice(1).split('/');
        if (pkg && scope) {
          variants.add(pkg.toLowerCase());
          variants.add(scope.toLowerCase());
        }
      }
      // Handle hyphenated packages
      const parts = value.replace('@', '').split(/[-/]/);
      parts.forEach((p) => {
        if (p.length > 2) variants.add(p.toLowerCase());
      });
      break;
    }

    case 'ERROR_CODE': {
      // Add without prefix (E, ERR_, etc.)
      const stripped = value.replace(/^(E|ERR_|Error$|Exception$)/i, '');
      if (stripped && stripped !== value) {
        variants.add(stripped.toLowerCase());
      }
      break;
    }

    case 'COMMAND': {
      // Split command into tool and subcommand
      const cmdParts = value.split(/\s+/);
      if (cmdParts.length > 1 && cmdParts[0]) {
        variants.add(cmdParts[0].toLowerCase()); // Just the tool
        variants.add(cmdParts.slice(1).join(' ').toLowerCase()); // Just the subcommand
      }
      break;
    }
  }

  return Array.from(variants);
}

/**
 * Infer semantic entity type from the value and context
 */
function inferSemanticType(type: EntityType, value: string): SemanticEntityType {
  switch (type) {
    case 'FUNCTION_NAME':
    case 'ERROR_CODE':
    case 'COMMAND':
      return 'concept';

    case 'FILE_PATH':
    case 'PACKAGE_NAME':
      return 'concept';

    case 'URL':
      // URLs could reference organizations
      if (/\.(org|com|io|co|inc)\//.test(value)) {
        return 'organization';
      }
      return 'unknown';

    case 'CUSTOM':
      // Try to infer from value patterns
      // Names with common suffixes
      if (/Inc\.?$|LLC$|Corp\.?$|Ltd\.?$|Company$/i.test(value)) {
        return 'organization';
      }
      // Names that look like personal names (First Last pattern)
      if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(value)) {
        return 'person';
      }
      // Geographic patterns
      if (/City|State|Country|Region|Province/i.test(value)) {
        return 'location';
      }
      return 'unknown';

    default:
      return 'unknown';
  }
}

/**
 * Calculate confidence score for an extracted entity
 */
function calculateConfidence(type: EntityType, value: string): number {
  // Base confidence varies by entity type
  let confidence = 0.7; // Default base confidence

  switch (type) {
    case 'FILE_PATH':
      // Higher confidence if it has a valid extension
      if (/\.\w{1,5}$/.test(value)) confidence = 0.9;
      break;

    case 'FUNCTION_NAME':
      // Higher confidence for longer, well-formed names
      if (value.length >= 5 && /^[a-z].*[A-Z]/.test(value)) {
        confidence = 0.85; // camelCase
      } else if (/^[A-Z].*[a-z].*[A-Z]/.test(value)) {
        confidence = 0.85; // PascalCase
      } else if (/_/.test(value) && value.length >= 5) {
        confidence = 0.85; // snake_case
      }
      break;

    case 'PACKAGE_NAME':
      // Higher confidence for scoped packages
      if (value.startsWith('@')) confidence = 0.95;
      else if (value.includes('/')) confidence = 0.9;
      else confidence = 0.75; // Could be false positive
      break;

    case 'URL':
      // URLs are very reliable
      confidence = 0.95;
      break;

    case 'ERROR_CODE':
      // Higher confidence for known patterns
      if (/Error$|Exception$/i.test(value)) confidence = 0.9;
      else if (/^E[A-Z0-9]+$/.test(value)) confidence = 0.85;
      break;

    case 'COMMAND':
      // Commands with recognized tools are more reliable
      if (/^(npm|yarn|pnpm|git|docker)\s/.test(value)) {
        confidence = 0.9;
      }
      break;
  }

  return confidence;
}

/**
 * Extraction options for entity matching
 */
interface ExtractionOptions {
  includeFuzzy?: boolean;
  includeConfidence?: boolean;
  includeSemanticType?: boolean;
}

/**
 * Extract all matches for a pattern from text
 */
function extractMatches(
  text: string,
  pattern: RegExp,
  type: EntityType,
  options: ExtractionOptions = {}
): ExtractedEntity[] {
  const results: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Default options
  const includeFuzzy = options.includeFuzzy ?? false;
  const includeConfidence = options.includeConfidence ?? true;
  const includeSemanticType = options.includeSemanticType ?? false;

  // Reset regex state
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    // Get the captured group (index 1) or full match (index 0)
    const value = (match[1] ?? match[0]).trim();

    if (!value) continue;

    // Apply type-specific validation
    if (type === 'FUNCTION_NAME' && !isValidFunctionName(value)) {
      continue;
    }

    const normalizedValue = normalizeValue(type, value);

    // Deduplicate
    const key = `${type}:${normalizedValue}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entity: ExtractedEntity = {
      type,
      value,
      normalizedValue,
    };

    // Add optional fields
    if (includeConfidence) {
      entity.confidence = calculateConfidence(type, value);
    }

    if (includeSemanticType) {
      entity.semanticType = inferSemanticType(type, value);
    }

    if (includeFuzzy) {
      entity.variants = generateVariants(type, value);
    }

    results.push(entity);
  }

  return results;
}

/**
 * Entity extractor class
 */
export class EntityExtractor {
  private defaultOptions: ExtractionOptions;

  constructor(options?: ExtractionOptions) {
    this.defaultOptions = {
      includeFuzzy: options?.includeFuzzy ?? false,
      includeConfidence: options?.includeConfidence ?? true,
      includeSemanticType: options?.includeSemanticType ?? false,
    };
  }

  /**
   * Extract entities from text
   *
   * @param text - The text to extract entities from
   * @param options - Override default extraction options
   * @returns Array of extracted entities
   */
  extract(text: string, options?: ExtractionOptions): ExtractedEntity[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const opts = { ...this.defaultOptions, ...options };
    const entities: ExtractedEntity[] = [];

    // Extract each entity type
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = extractMatches(text, pattern, type as EntityType, opts);
      entities.push(...matches);
    }

    return entities;
  }

  /**
   * Extract entities with fuzzy matching variants for improved recall
   * This is a convenience method that enables fuzzy matching by default
   *
   * @param text - The text to extract entities from
   * @returns Array of extracted entities with variants
   */
  extractWithVariants(text: string): ExtractedEntity[] {
    return this.extract(text, { includeFuzzy: true, includeSemanticType: true });
  }

  /**
   * Extract entities of a specific type
   *
   * @param text - The text to extract entities from
   * @param type - The entity type to extract
   * @param options - Override default extraction options
   * @returns Array of extracted entities of the specified type
   */
  extractType(
    text: string,
    type: Exclude<EntityType, 'CUSTOM'>,
    options?: ExtractionOptions
  ): ExtractedEntity[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const pattern = ENTITY_PATTERNS[type];
    if (!pattern) {
      return [];
    }

    const opts = { ...this.defaultOptions, ...options };
    return extractMatches(text, pattern, type, opts);
  }

  /**
   * Check if text contains any entities
   *
   * @param text - The text to check
   * @returns True if text contains at least one entity
   */
  hasEntities(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    for (const pattern of Object.values(ENTITY_PATTERNS)) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filter entities by minimum confidence threshold
   *
   * @param entities - Entities to filter
   * @param minConfidence - Minimum confidence score (0-1)
   * @returns Filtered entities
   */
  filterByConfidence(entities: ExtractedEntity[], minConfidence: number): ExtractedEntity[] {
    return entities.filter((e) => (e.confidence ?? 0) >= minConfidence);
  }

  /**
   * Get all variants for an entity (for fuzzy matching in retrieval)
   *
   * @param entity - Entity to get variants for
   * @returns Array of all variant strings (including original)
   */
  getVariants(entity: ExtractedEntity): string[] {
    if (entity.variants && entity.variants.length > 0) {
      return entity.variants;
    }
    // Generate variants on demand if not already present
    return generateVariants(entity.type, entity.value);
  }
}

/**
 * Singleton instance for convenience
 */
let entityExtractorInstance: EntityExtractor | null = null;

/**
 * Get the singleton entity extractor instance
 * @deprecated Use context.services.entityExtractor instead via dependency injection
 */
export function getEntityExtractor(): EntityExtractor {
  if (!entityExtractorInstance) {
    entityExtractorInstance = new EntityExtractor();
  }
  return entityExtractorInstance;
}

/**
 * Entity Extractor
 *
 * Extracts entities from text using regex patterns.
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
 */

import type { EntityType } from '../../db/schema/entity-index.js';

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
}

/**
 * Regex patterns for entity extraction
 */
const ENTITY_PATTERNS: Record<Exclude<EntityType, 'CUSTOM'>, RegExp> = {
  // File paths: /path/to/file.ext, ./relative/path.ts, ../parent/file.js
  // Must have at least one slash and end with .extension
  FILE_PATH: /(?:^|[\s"'`({\[])([.]{0,2}\/[\w\-./]+\.\w{1,10})(?:[\s"'`)\]}]|$)/g,

  // Function names: camelCase, PascalCase, snake_case (2+ chars, not all caps)
  // Must start with lowercase or uppercase letter, contain letters and possibly numbers
  // Exclude common words and keywords
  FUNCTION_NAME:
    /(?:^|[\s.`"'({\[])([a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*(?:[A-Z][a-zA-Z0-9]*)*)(?:[\s()`"'\]}).,;:]|$)/g,

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
 * Extract all matches for a pattern from text
 */
function extractMatches(text: string, pattern: RegExp, type: EntityType): ExtractedEntity[] {
  const results: ExtractedEntity[] = [];
  const seen = new Set<string>();

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

    results.push({
      type,
      value,
      normalizedValue,
    });
  }

  return results;
}

/**
 * Entity extractor class
 */
export class EntityExtractor {
  /**
   * Extract entities from text
   *
   * @param text - The text to extract entities from
   * @returns Array of extracted entities
   */
  extract(text: string): ExtractedEntity[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const entities: ExtractedEntity[] = [];

    // Extract each entity type
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = extractMatches(text, pattern, type as EntityType);
      entities.push(...matches);
    }

    return entities;
  }

  /**
   * Extract entities of a specific type
   *
   * @param text - The text to extract entities from
   * @param type - The entity type to extract
   * @returns Array of extracted entities of the specified type
   */
  extractType(text: string, type: Exclude<EntityType, 'CUSTOM'>): ExtractedEntity[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const pattern = ENTITY_PATTERNS[type];
    if (!pattern) {
      return [];
    }

    return extractMatches(text, pattern, type);
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
}

/**
 * Singleton instance for convenience
 */
let entityExtractorInstance: EntityExtractor | null = null;

/**
 * Get the singleton entity extractor instance
 */
export function getEntityExtractor(): EntityExtractor {
  if (!entityExtractorInstance) {
    entityExtractorInstance = new EntityExtractor();
  }
  return entityExtractorInstance;
}

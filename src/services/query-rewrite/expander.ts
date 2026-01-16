/**
 * Query Expansion Service
 *
 * Expands queries using:
 * - Dictionary-based synonym expansion with programming terms
 * - Relation-based expansion via graph traversal
 * - Common programming abbreviations
 */

import type { ExpansionConfig, ExpandedQuery } from './types.js';

/**
 * Built-in programming synonym dictionary
 * Maps terms to their common synonyms and abbreviations
 */
const PROGRAMMING_SYNONYMS: Record<string, string[]> = {
  // Languages
  javascript: ['js', 'ecmascript', 'es6', 'node'],
  typescript: ['ts'],
  python: ['py'],

  // Common abbreviations
  database: ['db', 'datastore', 'data store'],
  authentication: ['auth', 'login', 'signin'],
  authorization: ['authz', 'permissions', 'access control'],
  configuration: ['config', 'settings', 'setup'],
  environment: ['env', 'environment variables'],
  application: ['app'],
  repository: ['repo'],
  directory: ['dir', 'folder'],

  // API terms
  endpoint: ['api', 'route', 'handler'],
  request: ['req', 'http request'],
  response: ['res', 'http response'],

  // Development terms
  development: ['dev', 'development mode'],
  production: ['prod', 'production mode'],
  testing: ['test', 'unit test', 'integration test'],
  debugging: ['debug', 'troubleshoot'],

  // Data structures
  array: ['list', 'collection'],
  object: ['dict', 'dictionary', 'map', 'hash'],
  function: ['fn', 'method', 'procedure'],
  class: ['type', 'interface'],

  // Operations
  create: ['add', 'insert', 'new'],
  read: ['get', 'fetch', 'retrieve', 'query'],
  update: ['modify', 'edit', 'change', 'set'],
  delete: ['remove', 'destroy', 'drop'],

  // Memory-specific
  knowledge: ['fact', 'information', 'data'],
  guideline: ['rule', 'standard', 'policy', 'convention'],
  tool: ['command', 'script', 'utility', 'function'],
  memory: ['cache', 'storage', 'store'],
  embedding: ['vector', 'dense vector'],
  search: ['query', 'find', 'lookup', 'retrieve'],

  // Architecture
  service: ['component', 'module', 'system'],
  client: ['consumer', 'caller'],
  server: ['backend', 'api server'],
  middleware: ['interceptor', 'handler'],

  // Version control
  commit: ['change', 'revision'],
  branch: ['feature branch', 'fork'],
  merge: ['combine', 'integrate'],

  // Error handling
  error: ['exception', 'failure', 'issue'],
  bug: ['defect', 'issue', 'problem'],

  // Performance
  optimize: ['improve', 'enhance', 'tune'],
  performance: ['speed', 'efficiency', 'throughput'],
  latency: ['delay', 'response time'],

  // Security
  secret: ['credential', 'token', 'key'],
  encrypt: ['cipher', 'encode'],
  decrypt: ['decipher', 'decode'],
};

/**
 * Reverse index for faster lookup
 * Maps abbreviations/synonyms back to canonical terms
 */
const REVERSE_SYNONYM_MAP = new Map<string, string[]>();

// Build reverse index
for (const [canonical, synonyms] of Object.entries(PROGRAMMING_SYNONYMS)) {
  for (const synonym of synonyms) {
    const existing = REVERSE_SYNONYM_MAP.get(synonym) || [];
    existing.push(canonical);
    REVERSE_SYNONYM_MAP.set(synonym, existing);
  }
}

/**
 * Tokenizes a query into individual words
 * Handles basic punctuation and whitespace
 */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Finds synonyms for a token in the dictionary
 */
function findSynonyms(token: string): string[] {
  const synonyms = new Set<string>();

  // Direct lookup (token is canonical)
  if (PROGRAMMING_SYNONYMS[token]) {
    PROGRAMMING_SYNONYMS[token].forEach((syn) => synonyms.add(syn));
  }

  // Reverse lookup (token is a synonym)
  const canonical = REVERSE_SYNONYM_MAP.get(token);
  if (canonical) {
    canonical.forEach((can) => {
      synonyms.add(can);
      PROGRAMMING_SYNONYMS[can]?.forEach((syn) => synonyms.add(syn));
    });
  }

  return Array.from(synonyms);
}

/**
 * Replaces a token at a specific index with a synonym
 */
function replaceToken(tokens: string[], index: number, replacement: string): string {
  const newTokens = [...tokens];
  newTokens[index] = replacement;
  return newTokens.join(' ');
}

/**
 * Type for relation graph traversal function
 */
export type RelationGraphTraverser = (
  term: string,
  maxDepth?: number
) => Promise<Array<{ term: string; distance: number }>>;

/**
 * Query Expander
 *
 * Expands queries using multiple strategies to improve recall in search.
 */
export class QueryExpander {
  private config: ExpansionConfig;
  private relationTraverser?: RelationGraphTraverser;

  /**
   * Creates a new QueryExpander
   *
   * @param config - Expansion configuration
   * @param relationTraverser - Optional function to traverse relation graph
   */
  constructor(config: ExpansionConfig, relationTraverser?: RelationGraphTraverser) {
    this.config = config;
    this.relationTraverser = relationTraverser;
  }

  /**
   * Expands a query using configured strategies
   *
   * @param query - Original query text
   * @returns Array of expanded queries with metadata
   *
   * @todo Implement LLM-based semantic expansion when useLLM is enabled.
   *       Use an LLM to generate semantically similar query variations.
   */
  async expand(query: string): Promise<ExpandedQuery[]> {
    const expansions: ExpandedQuery[] = [];

    // Dictionary-based expansion
    if (this.config.useDictionary) {
      const dictionaryExpansions = this.expandWithDictionary(query);
      expansions.push(...dictionaryExpansions);
    }

    // Relation-based expansion
    if (this.config.useRelations && this.relationTraverser) {
      const relationExpansions = await this.expandWithRelations(query);
      expansions.push(...relationExpansions);
    }

    // LLM-based expansion (not yet implemented)
    if (this.config.useLLM) {
      // LLM-based semantic expansion will be added here
    }

    // Limit to maxExpansions
    const limited = expansions.slice(0, this.config.maxExpansions);

    // Sort by confidence (descending)
    return limited.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Expands query using the synonym dictionary
   *
   * Generates expanded queries by replacing tokens with their synonyms.
   * Confidence is calculated based on synonym frequency and position.
   *
   * @param query - Original query text
   * @returns Array of dictionary-expanded queries
   */
  private expandWithDictionary(query: string): ExpandedQuery[] {
    const expansions: ExpandedQuery[] = [];
    const tokens = tokenize(query);

    // Find all tokens that have synonyms
    const expandablePositions: Array<{ index: number; synonyms: string[] }> = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;
      const synonyms = findSynonyms(token);
      if (synonyms.length > 0) {
        expandablePositions.push({ index: i, synonyms });
      }
    }

    // Generate expansions by replacing each expandable token
    for (const { index, synonyms } of expandablePositions) {
      for (const synonym of synonyms) {
        const expandedText = replaceToken(tokens, index, synonym);

        // Calculate confidence based on synonym commonality
        // More common synonyms (earlier in list) get higher confidence
        const synonymIndex = synonyms.indexOf(synonym);
        const baseConfidence = 0.8; // Dictionary is generally reliable
        const positionPenalty = (synonymIndex / synonyms.length) * 0.2;
        const confidence = baseConfidence - positionPenalty;

        expansions.push({
          text: expandedText,
          source: 'dictionary',
          confidence,
        });
      }
    }

    // Also try multi-token expansion (combining multiple synonyms)
    // But limit to avoid explosion
    if (expandablePositions.length >= 2 && expansions.length < this.config.maxExpansions / 2) {
      const firstPos = expandablePositions[0];
      const secondPos = expandablePositions[1];

      // Try combining first synonym of each position
      if (firstPos && secondPos && firstPos.synonyms.length > 0 && secondPos.synonyms.length > 0) {
        const firstSynonym = firstPos.synonyms[0];
        const secondSynonym = secondPos.synonyms[0];
        if (firstSynonym && secondSynonym) {
          const combined = [...tokens];
          combined[firstPos.index] = firstSynonym;
          combined[secondPos.index] = secondSynonym;

          expansions.push({
            text: combined.join(' '),
            source: 'dictionary',
            confidence: 0.7, // Lower confidence for multi-substitution
          });
        }
      }
    }

    return expansions;
  }

  /**
   * Expands query using the relation graph
   *
   * Uses the relation traverser to find related terms and generate
   * expanded queries. Confidence decreases with graph distance.
   *
   * @param query - Original query text
   * @returns Array of relation-expanded queries
   */
  private async expandWithRelations(query: string): Promise<ExpandedQuery[]> {
    if (!this.relationTraverser) {
      return [];
    }

    const expansions: ExpandedQuery[] = [];
    const tokens = tokenize(query);

    // Find related terms for each token
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      try {
        const relatedTerms = await this.relationTraverser(token, 2); // Max depth 2

        for (const { term, distance } of relatedTerms) {
          // Skip if term is same as original
          if (term.toLowerCase() === token) {
            continue;
          }

          const expandedText = replaceToken(tokens, i, term);

          // Confidence decreases with distance
          // Distance 1: 0.7, Distance 2: 0.5
          const confidence = Math.max(0.3, 0.9 - distance * 0.2);

          expansions.push({
            text: expandedText,
            source: 'relation',
            confidence,
          });
        }
      } catch (error) {
        // Silently skip if relation traversal fails for a token
        continue;
      }
    }

    return expansions;
  }

  /**
   * Gets the built-in synonym dictionary
   * Useful for debugging or extending the dictionary
   */
  static getSynonymDictionary(): Record<string, string[]> {
    return { ...PROGRAMMING_SYNONYMS };
  }

  /**
   * Adds custom synonyms to the dictionary
   * Note: This modifies the global dictionary
   *
   * @param canonical - Canonical term
   * @param synonyms - Array of synonyms
   */
  static addSynonyms(canonical: string, synonyms: string[]): void {
    const existing = PROGRAMMING_SYNONYMS[canonical] || [];
    PROGRAMMING_SYNONYMS[canonical] = [...existing, ...synonyms];

    // Update reverse index
    for (const synonym of synonyms) {
      const reverseExisting = REVERSE_SYNONYM_MAP.get(synonym) || [];
      reverseExisting.push(canonical);
      REVERSE_SYNONYM_MAP.set(synonym, reverseExisting);
    }
  }
}

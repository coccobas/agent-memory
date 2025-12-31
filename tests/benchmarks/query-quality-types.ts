/**
 * Query Quality Benchmark Types
 *
 * Types for evaluating query/retrieval quality with ground truth test cases.
 * Measures Precision@K, Recall@K, MRR, and nDCG.
 */

/**
 * Entry type for seeding the test database
 */
export type SeedEntryType = 'guideline' | 'knowledge' | 'tool';

/**
 * Base seed entry fields
 */
export interface SeedEntryBase {
  /** Unique identifier for this seed entry (used in expected results) */
  id: string;
  /** Entry type */
  type: SeedEntryType;
  /** Scope type */
  scopeType: 'global' | 'org' | 'project' | 'session';
  /** Scope ID (required for non-global) */
  scopeId?: string;
  /** Tags to attach */
  tags?: string[];
  /** Is this entry active? */
  isActive?: boolean;
}

/**
 * Seed guideline entry
 */
export interface SeedGuideline extends SeedEntryBase {
  type: 'guideline';
  name: string;
  content: string;
  category?: string;
  priority?: number;
}

/**
 * Seed knowledge entry
 */
export interface SeedKnowledge extends SeedEntryBase {
  type: 'knowledge';
  title: string;
  content: string;
  category?: string;
  confidence?: number;
  /** Valid from timestamp (for temporal queries) */
  validFrom?: string;
  /** Valid until timestamp (for temporal queries) */
  validUntil?: string;
}

/**
 * Seed tool entry
 */
export interface SeedTool extends SeedEntryBase {
  type: 'tool';
  name: string;
  description: string;
  category?: string;
}

/**
 * Union of all seed entry types
 */
export type SeedEntry = SeedGuideline | SeedKnowledge | SeedTool;

/**
 * Seed data for a test scenario
 */
export interface SeedData {
  /** Project to create (if needed) */
  project?: {
    id: string;
    name: string;
    rootPath?: string;
  };
  /** Organization (if needed) */
  org?: {
    id: string;
    name: string;
  };
  /** Entries to seed */
  entries: SeedEntry[];
  /** Relations between entries */
  relations?: Array<{
    sourceId: string;
    targetId: string;
    relationType: 'applies_to' | 'depends_on' | 'conflicts_with' | 'related_to';
  }>;
}

/**
 * Expected result entry
 */
export interface ExpectedResult {
  /** Reference to seed entry ID */
  seedEntryId: string;
  /** Expected relevance grade (0-3: 0=irrelevant, 1=marginal, 2=relevant, 3=highly relevant) */
  relevanceGrade: 0 | 1 | 2 | 3;
}

/**
 * Query parameters for a test case
 */
export interface QueryTestParams {
  /** Action type */
  action: 'context' | 'search';
  /** Free-text search query */
  search?: string;
  /** Scope type to query */
  scopeType?: 'global' | 'org' | 'project' | 'session';
  /** Scope ID */
  scopeId?: string;
  /** Whether to inherit from parent scopes */
  inherit?: boolean;
  /** Entry types to include */
  types?: Array<'tools' | 'guidelines' | 'knowledge'>;
  /** Tag filters */
  tags?: {
    include?: string[];
    require?: string[];
    exclude?: string[];
  };
  /** Enable semantic search */
  semanticSearch?: boolean;
  /** Enable FTS5 full-text search */
  useFts5?: boolean;
  /** Enable fuzzy matching */
  fuzzy?: boolean;
  /** Max results to return */
  limit?: number;
  /** Priority filter for guidelines */
  priority?: { min?: number; max?: number };
  /** Date filters */
  createdAfter?: string;
  createdBefore?: string;
  /** Temporal query for knowledge */
  atTime?: string;
  /** Related entries filter */
  relatedTo?: {
    id: string;
    type: 'tool' | 'guideline' | 'knowledge';
    relation?: 'applies_to' | 'depends_on' | 'conflicts_with' | 'related_to';
    direction?: 'forward' | 'backward' | 'both';
    depth?: number;
  };
}

/**
 * Query test category
 */
export type QueryTestCategory =
  | 'keyword-exact'        // Exact keyword matches
  | 'keyword-partial'      // Partial/substring matches
  | 'keyword-multi'        // Multiple keywords
  | 'fts5-ranking'         // FTS5 BM25 ranking quality
  | 'semantic-similarity'  // Semantic/vector search
  | 'scope-filtering'      // Scope-based filtering
  | 'scope-inheritance'    // Scope chain inheritance
  | 'type-filtering'       // Filter by entry type
  | 'tag-filtering'        // Tag-based queries
  | 'priority-filtering'   // Guideline priority filtering
  | 'temporal-filtering'   // Date-based queries
  | 'relation-traversal'   // Graph relation queries
  | 'combined-filters'     // Multiple filters combined
  | 'noise-rejection'      // Should return few/no results
  | 'edge-cases';          // Unusual queries

/**
 * Category display names
 */
export const QUERY_CATEGORY_NAMES: Record<QueryTestCategory, string> = {
  'keyword-exact': 'Exact Keywords',
  'keyword-partial': 'Partial Keywords',
  'keyword-multi': 'Multiple Keywords',
  'fts5-ranking': 'FTS5 Ranking',
  'semantic-similarity': 'Semantic Search',
  'scope-filtering': 'Scope Filtering',
  'scope-inheritance': 'Scope Inheritance',
  'type-filtering': 'Type Filtering',
  'tag-filtering': 'Tag Filtering',
  'priority-filtering': 'Priority Filtering',
  'temporal-filtering': 'Temporal Filtering',
  'relation-traversal': 'Relation Traversal',
  'combined-filters': 'Combined Filters',
  'noise-rejection': 'Noise Rejection',
  'edge-cases': 'Edge Cases',
};

/**
 * Single query test case
 */
export interface QueryTestCase {
  /** Unique test case ID */
  id: string;
  /** Test case name/description */
  name: string;
  /** Category for grouping results */
  category: QueryTestCategory;
  /** Query parameters */
  query: QueryTestParams;
  /** Expected results in order of relevance */
  expectedResults: ExpectedResult[];
  /** Results that should NOT be returned */
  shouldNotReturn?: string[];
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Notes about the test case */
  notes?: string;
  /** Whether this test requires semantic search (skip if not available) */
  requiresSemantic?: boolean;
  /** Whether this test requires FTS5 */
  requiresFts5?: boolean;
}

/**
 * Result metrics for a single test case
 */
export interface QueryTestCaseResult {
  /** Test case ID */
  testCaseId: string;
  /** Test case name */
  testCaseName: string;
  /** Category */
  category: QueryTestCategory;
  /** Difficulty */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Number of results returned */
  returnedCount: number;
  /** Number of relevant entries in expected results (grade >= 2) */
  relevantCount: number;
  /** Precision at K (relevant in top K / K) */
  precisionAtK: number;
  /** Recall at K (relevant in top K / total relevant) */
  recallAtK: number;
  /** Mean Reciprocal Rank (1 / rank of first relevant result) */
  mrr: number;
  /** Normalized Discounted Cumulative Gain */
  ndcg: number;
  /** K value used for metrics */
  k: number;
  /** IDs that were returned */
  returnedIds: string[];
  /** IDs that should have been returned but weren't */
  missedIds: string[];
  /** IDs that were returned but shouldn't have been */
  unexpectedIds: string[];
  /** Processing time in ms */
  processingTimeMs: number;
  /** Any error during query */
  error?: string;
  /** Was test skipped (e.g., semantic not available) */
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Aggregated metrics
 */
export interface AggregatedQueryMetrics {
  /** Total test cases run */
  totalTestCases: number;
  /** Skipped test cases */
  skippedCount: number;
  /** Error count */
  errorCount: number;
  /** Average Precision@K */
  avgPrecisionAtK: number;
  /** Average Recall@K */
  avgRecallAtK: number;
  /** Average MRR */
  avgMrr: number;
  /** Average nDCG */
  avgNdcg: number;
  /** Metrics by difficulty */
  byDifficulty: Record<'easy' | 'medium' | 'hard', {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgMrr: number;
    avgNdcg: number;
  }>;
  /** Metrics by category */
  byCategory: Record<string, {
    count: number;
    avgPrecision: number;
    avgRecall: number;
    avgMrr: number;
    avgNdcg: number;
  }>;
  /** Processing stats */
  processing: {
    totalTimeMs: number;
    avgTimePerQuery: number;
    minTimeMs: number;
    maxTimeMs: number;
  };
}

/**
 * Full benchmark results
 */
export interface QueryBenchmarkResults {
  /** Timestamp of benchmark run */
  timestamp: string;
  /** Configuration */
  config: {
    testCasesRun: number;
    semanticEnabled: boolean;
    fts5Enabled: boolean;
    defaultK: number;
  };
  /** Seed data used */
  seedDataStats: {
    totalEntries: number;
    byType: {
      guidelines: number;
      knowledge: number;
      tools: number;
    };
    scopes: string[];
  };
  /** Overall metrics */
  overall: AggregatedQueryMetrics;
  /** Individual test case results */
  testCaseResults: QueryTestCaseResult[];
  /** Comparison to baseline (if available) */
  comparison?: {
    baselineTimestamp: string;
    precisionDelta: number;
    recallDelta: number;
    mrrDelta: number;
    ndcgDelta: number;
  };
}

/**
 * Query Quality Benchmark Dataset
 *
 * Contains seed data and test cases for evaluating query/retrieval quality.
 */

import type {
  SeedData,
  SeedEntry,
  QueryTestCase,
  QueryTestCategory,
} from './query-quality-types.js';

// =============================================================================
// SEED DATA
// =============================================================================

/**
 * Seed data for query benchmark
 * Creates a realistic set of entries across different scopes
 */
export const QUERY_SEED_DATA: SeedData = {
  project: {
    id: 'proj-query-bench',
    name: 'Query Benchmark Project',
    rootPath: '/test/query-bench',
  },
  org: {
    id: 'org-query-bench',
    name: 'Query Benchmark Org',
  },
  entries: [
    // ==========================================================================
    // GUIDELINES - Code Style
    // ==========================================================================
    {
      id: 'g-typescript-strict',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'typescript-strict-mode',
      content: 'Always enable TypeScript strict mode in tsconfig.json for type safety',
      category: 'code_style',
      priority: 95,
      tags: ['typescript', 'config', 'best-practice'],
    },
    {
      id: 'g-no-any',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'avoid-any-type',
      content: 'Never use the any type in TypeScript code. Use unknown or proper types instead.',
      category: 'code_style',
      priority: 90,
      tags: ['typescript', 'types'],
    },
    {
      id: 'g-naming-convention',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'naming-conventions',
      content: 'Use camelCase for variables and functions, PascalCase for classes and interfaces',
      category: 'code_style',
      priority: 80,
      tags: ['naming', 'conventions'],
    },
    {
      id: 'g-max-line-length',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'max-line-length',
      content: 'Code formatting rule: keep lines under 100 characters for readability',
      category: 'code_style',
      priority: 60,
      tags: ['formatting'],
    },

    // ==========================================================================
    // GUIDELINES - Security
    // ==========================================================================
    {
      id: 'g-no-secrets',
      type: 'guideline',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      name: 'no-hardcoded-secrets',
      content: 'Security rule: Never commit secrets, API keys, or passwords to the repository',
      category: 'security',
      priority: 100,
      tags: ['security', 'secrets', 'critical'],
    },
    {
      id: 'g-input-validation',
      type: 'guideline',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      name: 'input-validation',
      content: 'Security best practice: Always validate and sanitize user input to prevent injection attacks',
      category: 'security',
      priority: 95,
      tags: ['security', 'validation', 'input'],
    },
    {
      id: 'g-auth-required',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'authentication-required',
      content: 'Security requirement: All API endpoints must require authentication except public health checks',
      category: 'security',
      priority: 90,
      tags: ['security', 'api', 'authentication'],
    },

    // ==========================================================================
    // GUIDELINES - Testing
    // ==========================================================================
    {
      id: 'g-test-coverage',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'test-coverage-minimum',
      content: 'Maintain minimum 80% test coverage for all new code',
      category: 'testing',
      priority: 85,
      tags: ['testing', 'coverage', 'quality'],
    },
    {
      id: 'g-unit-tests',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'unit-test-requirement',
      content: 'Every function must have at least one unit test covering the happy path',
      category: 'testing',
      priority: 80,
      tags: ['testing', 'unit-tests'],
    },

    // ==========================================================================
    // GUIDELINES - Architecture (Global)
    // ==========================================================================
    {
      id: 'g-solid-principles',
      type: 'guideline',
      scopeType: 'global',
      name: 'solid-principles',
      content: 'Follow SOLID principles for maintainable object-oriented design',
      category: 'architecture',
      priority: 85,
      tags: ['architecture', 'design-patterns', 'oop'],
    },
    {
      id: 'g-dependency-injection',
      type: 'guideline',
      scopeType: 'global',
      name: 'dependency-injection',
      content: 'Use dependency injection for loose coupling and testability',
      category: 'architecture',
      priority: 80,
      tags: ['architecture', 'di', 'testing'],
    },

    // ==========================================================================
    // KNOWLEDGE - Decisions
    // ==========================================================================
    {
      id: 'k-postgres-decision',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Database Selection Decision',
      content: 'We chose PostgreSQL for the primary database because of its reliability, ACID compliance, and excellent JSON support for flexible schemas',
      category: 'decision',
      confidence: 0.95,
      tags: ['database', 'postgresql', 'architecture'],
    },
    {
      id: 'k-redis-caching',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Caching Strategy Decision',
      content: 'Redis is used for caching frequently accessed data and session storage to reduce database load',
      category: 'decision',
      confidence: 0.9,
      tags: ['caching', 'redis', 'performance'],
    },
    {
      id: 'k-rest-api',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'API Design Decision',
      content: 'The API follows REST principles with JSON payloads. We chose REST over GraphQL for simplicity and caching benefits.',
      category: 'decision',
      confidence: 0.9,
      tags: ['api', 'rest', 'design'],
    },
    {
      id: 'k-jwt-auth',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Authentication Method Decision',
      content: 'JWT tokens are used for stateless authentication. Access tokens expire in 15 minutes, refresh tokens in 7 days.',
      category: 'decision',
      confidence: 0.95,
      tags: ['authentication', 'jwt', 'security'],
    },

    // ==========================================================================
    // KNOWLEDGE - Facts
    // ==========================================================================
    {
      id: 'k-node-version',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Node.js Version',
      content: 'The project requires Node.js version 20 LTS or higher',
      category: 'fact',
      confidence: 1.0,
      tags: ['nodejs', 'version', 'requirements'],
    },
    {
      id: 'k-deployment-env',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Deployment Environment',
      content: 'Production runs on AWS ECS with Fargate. Staging uses the same configuration with smaller instance sizes.',
      category: 'fact',
      confidence: 0.95,
      tags: ['deployment', 'aws', 'infrastructure'],
    },
    {
      id: 'k-team-structure',
      type: 'knowledge',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      title: 'Team Structure',
      content: 'The backend team consists of 5 engineers. Alice leads architecture, Bob handles DevOps.',
      category: 'fact',
      confidence: 0.8,
      tags: ['team', 'organization'],
    },
    {
      id: 'k-api-versioning',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'API Versioning Scheme',
      content: 'API versions are included in the URL path: /api/v1/, /api/v2/. Major versions are supported for 2 years.',
      category: 'fact',
      confidence: 0.9,
      tags: ['api', 'versioning'],
    },

    // ==========================================================================
    // KNOWLEDGE - Temporal (with validity periods)
    // ==========================================================================
    {
      id: 'k-maintenance-window',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Scheduled Maintenance',
      content: 'Database maintenance scheduled for January 15, 2025 from 2am-4am UTC',
      category: 'context',
      confidence: 1.0,
      validFrom: '2025-01-01T00:00:00Z',
      validUntil: '2025-01-16T00:00:00Z',
      tags: ['maintenance', 'scheduled'],
    },
    {
      id: 'k-feature-flag-beta',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Beta Feature Flag',
      content: 'The new dashboard feature is behind feature flag BETA_DASHBOARD. Available to 10% of users.',
      category: 'context',
      confidence: 0.9,
      validFrom: '2025-01-01T00:00:00Z',
      validUntil: '2025-03-01T00:00:00Z',
      tags: ['feature-flag', 'beta'],
    },

    // ==========================================================================
    // TOOLS - CLI Commands
    // ==========================================================================
    {
      id: 't-npm-build',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'npm-run-build',
      description: 'Compiles TypeScript and bundles the application for production',
      category: 'cli',
      tags: ['npm', 'build', 'typescript'],
    },
    {
      id: 't-npm-test',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'npm-test',
      description: 'Runs the test suite using Vitest with coverage reporting',
      category: 'cli',
      tags: ['npm', 'testing', 'vitest'],
    },
    {
      id: 't-npm-lint',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'npm-run-lint',
      description: 'Runs ESLint to check code style and potential errors',
      category: 'cli',
      tags: ['npm', 'linting', 'eslint'],
    },
    {
      id: 't-docker-compose-up',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'docker-compose-up',
      description: 'Starts all development services including database and cache',
      category: 'cli',
      tags: ['docker', 'development'],
    },
    {
      id: 't-docker-build',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'docker-build',
      description: 'Builds the Docker image for deployment',
      category: 'cli',
      tags: ['docker', 'deployment'],
    },

    // ==========================================================================
    // TOOLS - Database Commands
    // ==========================================================================
    {
      id: 't-db-migrate',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'db-migrate',
      description: 'Runs database migrations using Drizzle ORM: npx drizzle-kit migrate',
      category: 'cli',
      tags: ['database', 'migration', 'drizzle'],
    },
    {
      id: 't-db-seed',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'db-seed',
      description: 'Seeds the database with test data: npm run db:seed',
      category: 'cli',
      tags: ['database', 'seed', 'testing'],
    },

    // ==========================================================================
    // TOOLS - API Tools
    // ==========================================================================
    {
      id: 't-api-users',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'api-get-users',
      description: 'GET /api/v1/users - Returns paginated list of users',
      category: 'api',
      tags: ['api', 'users', 'rest'],
    },
    {
      id: 't-api-auth',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'api-auth-login',
      description: 'POST /api/v1/auth/login - Authenticates user and returns JWT tokens',
      category: 'api',
      tags: ['api', 'authentication', 'jwt'],
    },

    // ==========================================================================
    // INACTIVE ENTRIES (for filtering tests)
    // ==========================================================================
    {
      id: 'g-deprecated-rule',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'deprecated-formatting-rule',
      content: 'Code formatting: use tabs instead of spaces (DEPRECATED - we now use spaces)',
      category: 'code_style',
      priority: 50,
      isActive: true,
      tags: ['deprecated', 'formatting'],
    },
  ] as SeedEntry[],
  relations: [
    // TypeScript guidelines relate to each other
    { sourceId: 'g-typescript-strict', targetId: 'g-no-any', relationType: 'related_to' },
    // Testing coverage relates to unit tests
    { sourceId: 'g-test-coverage', targetId: 'g-unit-tests', relationType: 'related_to' },
    // JWT decision relates to auth guideline
    { sourceId: 'k-jwt-auth', targetId: 'g-auth-required', relationType: 'applies_to' },
    // Test tool relates to testing guideline
    { sourceId: 't-npm-test', targetId: 'g-unit-tests', relationType: 'applies_to' },
    // Build tool relates to TypeScript
    { sourceId: 't-npm-build', targetId: 'g-typescript-strict', relationType: 'depends_on' },
  ],
};

// =============================================================================
// TEST CASES
// =============================================================================

export const QUERY_TEST_CASES: QueryTestCase[] = [
  // ===========================================================================
  // KEYWORD - EXACT MATCH
  // ===========================================================================
  {
    id: 'ke-001',
    name: 'Exact keyword: TypeScript',
    category: 'keyword-exact',
    query: {
      action: 'search',
      search: 'TypeScript',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
      { seedEntryId: 't-npm-build', relevanceGrade: 2 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ke-002',
    name: 'Exact keyword: PostgreSQL',
    category: 'keyword-exact',
    query: {
      action: 'search',
      search: 'PostgreSQL',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ke-003',
    name: 'Exact keyword: authentication',
    category: 'keyword-exact',
    query: {
      action: 'search',
      search: 'authentication',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 3 },
      { seedEntryId: 't-api-auth', relevanceGrade: 2 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ke-004',
    name: 'Exact keyword: Docker',
    category: 'keyword-exact',
    query: {
      action: 'search',
      search: 'Docker',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-docker-compose-up', relevanceGrade: 3 },
      { seedEntryId: 't-docker-build', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // KEYWORD - PARTIAL MATCH
  // ===========================================================================
  {
    id: 'kp-001',
    name: 'Partial keyword: test (matches testing, test)',
    category: 'keyword-partial',
    query: {
      action: 'search',
      search: 'test',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-test-coverage', relevanceGrade: 3 },
      { seedEntryId: 'g-unit-tests', relevanceGrade: 3 },
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
      { seedEntryId: 't-db-seed', relevanceGrade: 1 }, // Contains "test data"
    ],
    difficulty: 'easy',
  },
  {
    id: 'kp-002',
    name: 'Partial keyword: secur (matches security, secrets)',
    category: 'keyword-partial',
    query: {
      action: 'search',
      search: 'secur',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
      { seedEntryId: 'g-input-validation', relevanceGrade: 2 },
      { seedEntryId: 'g-auth-required', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // KEYWORD - MULTI-WORD
  // ===========================================================================
  {
    id: 'km-001',
    name: 'Multi-word: strict mode',
    category: 'keyword-multi',
    query: {
      action: 'search',
      search: 'strict mode',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'km-002',
    name: 'Multi-word: database migration',
    category: 'keyword-multi',
    query: {
      action: 'search',
      search: 'database migration',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-db-migrate', relevanceGrade: 3 },
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 1 },
    ],
    difficulty: 'medium',
  },
  {
    id: 'km-003',
    name: 'Multi-word: API endpoint users',
    category: 'keyword-multi',
    query: {
      action: 'search',
      search: 'API endpoint users',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-api-users', relevanceGrade: 3 },
      { seedEntryId: 'g-auth-required', relevanceGrade: 1 },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // SCOPE FILTERING
  // ===========================================================================
  {
    id: 'sf-001',
    name: 'Project scope only (no inheritance)',
    category: 'scope-filtering',
    query: {
      action: 'search',
      search: 'security',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: false,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['g-no-secrets', 'g-input-validation'],
    difficulty: 'medium',
    notes: 'Org-level security guidelines should NOT be returned',
  },
  {
    id: 'sf-002',
    name: 'Org scope only',
    category: 'scope-filtering',
    query: {
      action: 'search',
      search: 'security',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      inherit: false,
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
      { seedEntryId: 'g-input-validation', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['g-auth-required'],
    difficulty: 'medium',
  },
  {
    id: 'sf-003',
    name: 'Global scope only',
    category: 'scope-filtering',
    query: {
      action: 'search',
      search: 'design',
      scopeType: 'global',
      inherit: false,
    },
    expectedResults: [
      { seedEntryId: 'g-solid-principles', relevanceGrade: 2 },
    ],
    shouldNotReturn: ['k-rest-api'],
    difficulty: 'medium',
  },

  // ===========================================================================
  // SCOPE INHERITANCE
  // ===========================================================================
  {
    id: 'si-001',
    name: 'Project with org inheritance',
    category: 'scope-inheritance',
    query: {
      action: 'search',
      search: 'secrets',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
    notes: 'Should find org-level guideline through inheritance',
  },
  {
    id: 'si-002',
    name: 'Project inherits global SOLID principles',
    category: 'scope-inheritance',
    query: {
      action: 'search',
      search: 'SOLID',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-solid-principles', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
    notes: 'Should find global guideline through full inheritance chain',
  },

  // ===========================================================================
  // TYPE FILTERING
  // ===========================================================================
  {
    id: 'tf-001',
    name: 'Guidelines only',
    category: 'type-filtering',
    query: {
      action: 'search',
      search: 'TypeScript',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['guidelines'],
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['t-npm-build'],
    difficulty: 'easy',
  },
  {
    id: 'tf-002',
    name: 'Tools only',
    category: 'type-filtering',
    query: {
      action: 'search',
      search: 'npm',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['tools'],
    },
    expectedResults: [
      { seedEntryId: 't-npm-build', relevanceGrade: 3 },
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
      { seedEntryId: 't-npm-lint', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'tf-003',
    name: 'Knowledge only',
    category: 'type-filtering',
    query: {
      action: 'search',
      search: 'decision',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['knowledge'],
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
      { seedEntryId: 'k-redis-caching', relevanceGrade: 2 },
      { seedEntryId: 'k-rest-api', relevanceGrade: 2 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 2 },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // TAG FILTERING
  // ===========================================================================
  {
    id: 'tg-001',
    name: 'Tag include: testing',
    category: 'tag-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      tags: { include: ['testing'] },
    },
    expectedResults: [
      { seedEntryId: 'g-test-coverage', relevanceGrade: 3 },
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'tg-002',
    name: 'Tag require: security AND api',
    category: 'tag-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      tags: { require: ['security', 'api'] },
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tg-003',
    name: 'Tag exclude: deprecated',
    category: 'tag-filtering',
    query: {
      action: 'search',
      search: 'formatting',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      tags: { exclude: ['deprecated'] },
    },
    expectedResults: [
      { seedEntryId: 'g-max-line-length', relevanceGrade: 2 },
    ],
    shouldNotReturn: ['g-deprecated-rule'],
    difficulty: 'medium',
  },

  // ===========================================================================
  // PRIORITY FILTERING
  // ===========================================================================
  {
    id: 'pf-001',
    name: 'High priority guidelines only (90+)',
    category: 'priority-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['guidelines'],
      priority: { min: 90 },
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
      { seedEntryId: 'g-input-validation', relevanceGrade: 3 },
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['g-max-line-length', 'g-naming-convention'],
    difficulty: 'medium',
  },
  {
    id: 'pf-002',
    name: 'Medium priority guidelines (60-85)',
    category: 'priority-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['guidelines'],
      priority: { min: 60, max: 85 },
    },
    expectedResults: [
      { seedEntryId: 'g-test-coverage', relevanceGrade: 3 },
      { seedEntryId: 'g-unit-tests', relevanceGrade: 3 },
      { seedEntryId: 'g-naming-convention', relevanceGrade: 3 },
      { seedEntryId: 'g-max-line-length', relevanceGrade: 3 },
      { seedEntryId: 'g-solid-principles', relevanceGrade: 3 },
      { seedEntryId: 'g-dependency-injection', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['g-typescript-strict', 'g-no-secrets'],
    difficulty: 'medium',
  },

  // ===========================================================================
  // COMBINED FILTERS
  // ===========================================================================
  {
    id: 'cf-001',
    name: 'Type + Tag + Search',
    category: 'combined-filters',
    query: {
      action: 'search',
      search: 'api',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['tools'],
      tags: { include: ['api'] },
    },
    expectedResults: [
      { seedEntryId: 't-api-users', relevanceGrade: 3 },
      { seedEntryId: 't-api-auth', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
  },
  {
    id: 'cf-002',
    name: 'Scope + Type + Priority',
    category: 'combined-filters',
    query: {
      action: 'search',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      inherit: false,
      types: ['guidelines'],
      priority: { min: 95 },
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
      { seedEntryId: 'g-input-validation', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
  },
  {
    id: 'cf-003',
    name: 'Search + Multiple Types + Inheritance',
    category: 'combined-filters',
    query: {
      action: 'search',
      search: 'database',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['knowledge', 'tools'],
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
      { seedEntryId: 't-db-migrate', relevanceGrade: 3 },
      { seedEntryId: 't-db-seed', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
  },

  // ===========================================================================
  // NOISE REJECTION
  // ===========================================================================
  {
    id: 'nr-001',
    name: 'Irrelevant search term',
    category: 'noise-rejection',
    query: {
      action: 'search',
      search: 'xyzabc123notfound',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [],
    difficulty: 'easy',
    notes: 'Should return empty results for nonsense query',
  },
  {
    id: 'nr-002',
    name: 'Empty search with wrong scope',
    category: 'noise-rejection',
    query: {
      action: 'search',
      search: 'TypeScript',
      scopeType: 'project',
      scopeId: 'nonexistent-project',
      inherit: false,
    },
    expectedResults: [],
    difficulty: 'easy',
    notes: 'Should return empty for wrong scope',
  },

  // ===========================================================================
  // CONTEXT ACTION
  // ===========================================================================
  {
    id: 'ctx-001',
    name: 'Context action returns all types',
    category: 'combined-filters',
    query: {
      action: 'context',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      limit: 5,
    },
    expectedResults: [
      // Should return top entries of each type
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 2 },
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 2 },
      { seedEntryId: 't-npm-build', relevanceGrade: 2 },
    ],
    difficulty: 'easy',
    notes: 'Context action should return mix of types',
  },

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  {
    id: 'ec-001',
    name: 'Special characters in search',
    category: 'edge-cases',
    query: {
      action: 'search',
      search: '/api/v1/',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-api-users', relevanceGrade: 3 },
      { seedEntryId: 't-api-auth', relevanceGrade: 3 },
      { seedEntryId: 'k-api-versioning', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
  },
  {
    id: 'ec-002',
    name: 'Case insensitive search',
    category: 'edge-cases',
    query: {
      action: 'search',
      search: 'TYPESCRIPT',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ec-003',
    name: 'Very short search term',
    category: 'edge-cases',
    query: {
      action: 'search',
      search: 'db',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-db-migrate', relevanceGrade: 3 },
      { seedEntryId: 't-db-seed', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // SEMANTIC SEARCH (requires embedding service)
  // ===========================================================================
  {
    id: 'ss-001',
    name: 'Semantic: code quality (no exact match)',
    category: 'semantic-similarity',
    query: {
      action: 'search',
      search: 'code quality best practices',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      semanticSearch: true,
    },
    expectedResults: [
      { seedEntryId: 'g-test-coverage', relevanceGrade: 2 },
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 2 },
      { seedEntryId: 'g-solid-principles', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    requiresSemantic: true,
    notes: 'Requires semantic search to find related concepts',
  },
  {
    id: 'ss-002',
    name: 'Semantic: how to run tests',
    category: 'semantic-similarity',
    query: {
      action: 'search',
      search: 'how do I run the tests',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      semanticSearch: true,
    },
    expectedResults: [
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
      { seedEntryId: 'g-unit-tests', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    requiresSemantic: true,
  },

  // ===========================================================================
  // RELATION TRAVERSAL
  // ===========================================================================
  {
    id: 'rt-001',
    name: 'Find entries related to TypeScript strict',
    category: 'relation-traversal',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      relatedTo: {
        id: 'g-typescript-strict',
        type: 'guideline',
        direction: 'both',
      },
    },
    expectedResults: [
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
      { seedEntryId: 't-npm-build', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
  },
  {
    id: 'rt-002',
    name: 'Find tools that apply to testing guidelines',
    category: 'relation-traversal',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      relatedTo: {
        id: 'g-unit-tests',
        type: 'guideline',
        relation: 'applies_to',
        direction: 'backward',
      },
    },
    expectedResults: [
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
  },
];

/**
 * Get dataset statistics
 */
export function getQueryDatasetStats(): {
  seedEntries: number;
  byType: { guidelines: number; knowledge: number; tools: number };
  testCases: number;
  byDifficulty: { easy: number; medium: number; hard: number };
  byCategory: Record<string, number>;
} {
  const entries = QUERY_SEED_DATA.entries;
  const byType = {
    guidelines: entries.filter(e => e.type === 'guideline').length,
    knowledge: entries.filter(e => e.type === 'knowledge').length,
    tools: entries.filter(e => e.type === 'tool').length,
  };

  const byDifficulty = {
    easy: QUERY_TEST_CASES.filter(tc => tc.difficulty === 'easy').length,
    medium: QUERY_TEST_CASES.filter(tc => tc.difficulty === 'medium').length,
    hard: QUERY_TEST_CASES.filter(tc => tc.difficulty === 'hard').length,
  };

  const byCategory: Record<string, number> = {};
  for (const tc of QUERY_TEST_CASES) {
    byCategory[tc.category] = (byCategory[tc.category] || 0) + 1;
  }

  return {
    seedEntries: entries.length,
    byType,
    testCases: QUERY_TEST_CASES.length,
    byDifficulty,
    byCategory,
  };
}

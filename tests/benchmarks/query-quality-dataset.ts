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

    // ==========================================================================
    // NEW ENTRIES FOR EXPANDED BENCHMARK
    // ==========================================================================

    // Low confidence knowledge (for confidence filtering tests)
    {
      id: 'k-uncertain-timeout',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Uncertain Timeout Value',
      content: 'The API timeout might be 30 seconds, but this needs verification with the infrastructure team',
      category: 'context',
      confidence: 0.5,
      tags: ['uncertain', 'timeout', 'config'],
    },

    // Entry with special characters (for special char search tests)
    {
      id: 'k-cpp-guidelines',
      type: 'knowledge',
      scopeType: 'global',
      title: 'C++ and C# Language Guidelines',
      content: 'When working with C++ or C#, use appropriate naming conventions: snake_case for C++, PascalCase for C#',
      category: 'fact',
      confidence: 0.9,
      tags: ['cpp', 'csharp', 'naming'],
    },

    // Multi-hop relation target (for deep relation traversal)
    {
      id: 'g-deep-relation-target',
      type: 'guideline',
      scopeType: 'global',
      name: 'deep-relation-guideline',
      content: 'This guideline is connected through a chain of relations for testing multi-hop traversal',
      category: 'architecture',
      priority: 70,
      tags: ['architecture', 'relations'],
    },

    // Inactive entry (for include inactive tests)
    {
      id: 'g-inactive-rule',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'old-deprecated-rule',
      content: 'This rule is no longer active and should not appear in normal searches',
      category: 'code_style',
      priority: 60,
      isActive: false,
      tags: ['inactive', 'old'],
    },

    // Entry for fuzzy search (authentication-related for typo tests)
    {
      id: 'k-auth-flow-details',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Authentication Flow Details',
      content: 'The authentication flow uses OAuth2 with PKCE for mobile apps and standard code flow for web',
      category: 'fact',
      confidence: 0.95,
      tags: ['authentication', 'oauth', 'flow'],
    },

    // Entry for regex/version tests
    {
      id: 'k-version-history',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'API Version History',
      content: 'v1 was released in 2023, v2 in 2024, and v3 is planned for 2025. Each version maintains backwards compatibility.',
      category: 'fact',
      confidence: 1.0,
      tags: ['versioning', 'api', 'history'],
    },

    // ==========================================================================
    // EXPANDED ENTRIES FOR ADVERSARIAL TESTING
    // ==========================================================================

    // OVERLAPPING CONTENT: Same topic, different words (for synonym-gaps tests)
    {
      id: 'k-db-choice',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Relational Database Choice',
      content: 'We use Postgres as our primary relational data store. It handles OLTP workloads well.',
      category: 'decision',
      confidence: 0.95,
      tags: ['database', 'postgres', 'rdbms', 'storage', 'oltp', 'relational', 'data-layer', 'backend', 'infrastructure', 'sql'],
    },
    {
      id: 'k-data-persistence',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Data Persistence Layer',
      content: 'Application state is persisted to a SQL database cluster with replication. We chose PostgreSQL.',
      category: 'decision',
      confidence: 0.9,
      tags: ['persistence', 'storage', 'state', 'replication', 'cluster', 'sql', 'data', 'backend', 'postgresql', 'infrastructure'],
    },
    {
      id: 'k-storage-architecture',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Storage Architecture',
      content: 'The storage tier uses a relational database management system. PG handles primary writes.',
      category: 'fact',
      confidence: 0.85,
      tags: ['storage', 'architecture', 'writes', 'tier', 'rdbms', 'pg', 'data', 'system', 'infrastructure', 'database'],
    },

    // OVERLAPPING CONTENT: Authentication/security variants
    {
      id: 'k-login-process',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Login Process',
      content: 'Users authenticate via username/password or SSO. After successful auth, a session token is issued.',
      category: 'fact',
      confidence: 0.9,
      tags: ['login', 'auth', 'session', 'sso', 'token', 'user', 'identity', 'access', 'credentials', 'security'],
    },
    {
      id: 'k-access-control',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Access Control System',
      content: 'RBAC is implemented for authorization. Permissions are checked after user identity is verified.',
      category: 'decision',
      confidence: 0.95,
      tags: ['rbac', 'authorization', 'permissions', 'access', 'security', 'identity', 'control', 'roles', 'auth', 'acl'],
    },
    {
      id: 'g-auth-tokens',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'token-security',
      content: 'Auth tokens must be stored securely. Never log tokens or include them in URLs.',
      category: 'security',
      priority: 95,
      tags: ['tokens', 'security', 'logging', 'auth', 'secrets', 'storage', 'urls', 'sensitive', 'credentials', 'protection'],
    },

    // OVERLAPPING CONTENT: Testing variants
    {
      id: 'k-testing-strategy',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Testing Strategy',
      content: 'We use a pyramid: many unit tests, fewer integration tests, minimal E2E. Vitest for unit, Playwright for E2E.',
      category: 'decision',
      confidence: 0.9,
      tags: ['testing', 'pyramid', 'unit', 'integration', 'e2e', 'vitest', 'playwright', 'quality', 'strategy', 'coverage'],
    },
    {
      id: 'g-test-isolation',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'test-isolation',
      content: 'Tests must be isolated and not depend on external state. Use mocks for external services.',
      category: 'testing',
      priority: 85,
      tags: ['testing', 'isolation', 'mocks', 'external', 'state', 'dependencies', 'unit', 'quality', 'ci', 'reliability'],
    },
    {
      id: 't-test-watch',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'vitest-watch',
      description: 'Runs Vitest in watch mode for TDD: npm run test:watch',
      category: 'cli',
      tags: ['testing', 'vitest', 'tdd', 'watch', 'development', 'npm', 'quality', 'unit', 'cli', 'automation'],
    },

    // OVERLAPPING CONTENT: Deployment/infrastructure variants
    {
      id: 'k-cloud-deployment',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Cloud Deployment Setup',
      content: 'Production is deployed to AWS. We use ECS Fargate for container orchestration without managing servers.',
      category: 'fact',
      confidence: 0.95,
      tags: ['cloud', 'aws', 'ecs', 'fargate', 'containers', 'deployment', 'production', 'serverless', 'infrastructure', 'devops'],
    },
    {
      id: 'k-container-strategy',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Container Strategy',
      content: 'All services are containerized using Docker. Multi-stage builds keep images small.',
      category: 'decision',
      confidence: 0.9,
      tags: ['containers', 'docker', 'images', 'builds', 'multi-stage', 'deployment', 'devops', 'ci', 'services', 'infrastructure'],
    },
    {
      id: 'g-deploy-process',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'deployment-process',
      content: 'All deployments go through CI/CD. No manual deployments to production are allowed.',
      category: 'workflow',
      priority: 100,
      tags: ['deployment', 'ci', 'cd', 'production', 'automation', 'workflow', 'release', 'devops', 'pipeline', 'process'],
    },

    // OVERLAPPING CONTENT: API design variants
    {
      id: 'k-api-patterns',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'API Design Patterns',
      content: 'REST endpoints follow resource-based naming. Use nouns for resources, HTTP verbs for actions.',
      category: 'decision',
      confidence: 0.95,
      tags: ['api', 'rest', 'design', 'patterns', 'resources', 'http', 'endpoints', 'naming', 'verbs', 'architecture'],
    },
    {
      id: 'g-api-responses',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'api-response-format',
      content: 'All API responses use JSON. Include status, data, and optional error fields in response body.',
      category: 'code_style',
      priority: 85,
      tags: ['api', 'json', 'responses', 'format', 'status', 'error', 'body', 'rest', 'standard', 'consistency'],
    },
    {
      id: 't-api-docs',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'openapi-generator',
      description: 'Generates OpenAPI spec from code annotations: npm run docs:openapi',
      category: 'cli',
      tags: ['api', 'openapi', 'swagger', 'documentation', 'generator', 'spec', 'npm', 'docs', 'cli', 'automation'],
    },

    // DEEP RELATION CHAIN: Error handling chain (5+ hops)
    {
      id: 'g-error-handling',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'error-handling-base',
      content: 'All errors must be handled explicitly. Never swallow exceptions silently.',
      category: 'code_style',
      priority: 90,
      tags: ['errors', 'exceptions', 'handling', 'code-style', 'reliability', 'debugging', 'quality', 'best-practice', 'explicit', 'logging'],
    },
    {
      id: 'g-error-logging',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'error-logging',
      content: 'Log all errors with context. Include stack traces and relevant request data.',
      category: 'code_style',
      priority: 85,
      tags: ['errors', 'logging', 'context', 'stack-trace', 'debugging', 'observability', 'monitoring', 'best-practice', 'request', 'data'],
    },
    {
      id: 'k-error-codes',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Error Code System',
      content: 'We use a hierarchical error code system: E1xxx for validation, E2xxx for auth, E3xxx for database.',
      category: 'fact',
      confidence: 0.95,
      tags: ['errors', 'codes', 'system', 'validation', 'auth', 'database', 'hierarchy', 'classification', 'api', 'responses'],
    },
    {
      id: 'g-error-responses',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'error-api-responses',
      content: 'API error responses must include error code, message, and optional details. Use appropriate HTTP status.',
      category: 'code_style',
      priority: 85,
      tags: ['errors', 'api', 'responses', 'http', 'status', 'message', 'details', 'rest', 'consistency', 'format'],
    },
    {
      id: 't-error-tracker',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'sentry-integration',
      description: 'Sentry captures and tracks production errors. Check dashboard at sentry.io/project/',
      category: 'cli',
      tags: ['errors', 'sentry', 'tracking', 'monitoring', 'production', 'dashboard', 'observability', 'debugging', 'alerting', 'integration'],
    },

    // MORE OVERLAPPING: Performance/caching variants
    {
      id: 'k-caching-layer',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Caching Layer Architecture',
      content: 'Redis serves as our distributed cache. TTL is 5 minutes for most entities, 1 hour for static config.',
      category: 'decision',
      confidence: 0.9,
      tags: ['caching', 'redis', 'distributed', 'ttl', 'performance', 'architecture', 'entities', 'config', 'layer', 'memory'],
    },
    {
      id: 'g-cache-invalidation',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'cache-invalidation',
      content: 'Always invalidate cache on writes. Use cache-aside pattern for read operations.',
      category: 'code_style',
      priority: 80,
      tags: ['cache', 'invalidation', 'writes', 'reads', 'pattern', 'performance', 'consistency', 'data', 'redis', 'strategy'],
    },
    {
      id: 'k-performance-targets',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Performance Targets',
      content: 'P95 latency must be under 200ms for API calls. Database queries should complete in under 50ms.',
      category: 'fact',
      confidence: 1.0,
      tags: ['performance', 'latency', 'p95', 'api', 'database', 'targets', 'sla', 'metrics', 'monitoring', 'quality'],
    },

    // MORE OVERLAPPING: Logging/monitoring variants
    {
      id: 'k-logging-system',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Logging System',
      content: 'Structured JSON logs are sent to CloudWatch. We use Pino for logging in Node.js services.',
      category: 'fact',
      confidence: 0.95,
      tags: ['logging', 'json', 'cloudwatch', 'pino', 'structured', 'observability', 'monitoring', 'aws', 'node', 'services'],
    },
    {
      id: 'g-log-levels',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'log-level-usage',
      content: 'Use DEBUG for development, INFO for operations, WARN for recoverable issues, ERROR for failures.',
      category: 'code_style',
      priority: 75,
      tags: ['logging', 'levels', 'debug', 'info', 'warn', 'error', 'observability', 'operations', 'development', 'standard'],
    },
    {
      id: 't-log-viewer',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'cloudwatch-logs',
      description: 'View logs in CloudWatch console or use: aws logs tail /ecs/service-name --follow',
      category: 'cli',
      tags: ['logging', 'cloudwatch', 'aws', 'cli', 'tail', 'debugging', 'observability', 'production', 'console', 'monitoring'],
    },

    // MORE OVERLAPPING: Code quality variants
    {
      id: 'g-code-review',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'code-review-required',
      content: 'All PRs require at least one approval. Reviews should check logic, tests, and security.',
      category: 'workflow',
      priority: 90,
      tags: ['code-review', 'pr', 'approval', 'workflow', 'quality', 'security', 'testing', 'github', 'process', 'collaboration'],
    },
    {
      id: 'g-linting-rules',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'linting-enforcement',
      content: 'ESLint and Prettier run on pre-commit. CI blocks merges if linting fails.',
      category: 'code_style',
      priority: 80,
      tags: ['linting', 'eslint', 'prettier', 'pre-commit', 'ci', 'formatting', 'code-style', 'automation', 'quality', 'enforcement'],
    },
    {
      id: 'k-code-standards',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Code Standards Documentation',
      content: 'Coding standards are documented in CONTRIBUTING.md. Style guide follows Airbnb conventions.',
      category: 'fact',
      confidence: 0.9,
      tags: ['standards', 'documentation', 'contributing', 'style-guide', 'airbnb', 'conventions', 'code-style', 'guidelines', 'quality', 'onboarding'],
    },

    // ADDITIONAL ENTRIES: Various topics for diversity
    {
      id: 'k-message-queue',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Message Queue Setup',
      content: 'SQS handles async job processing. Dead letter queues capture failed messages after 3 retries.',
      category: 'decision',
      confidence: 0.9,
      tags: ['queue', 'sqs', 'async', 'jobs', 'dlq', 'retries', 'messaging', 'aws', 'processing', 'infrastructure'],
    },
    {
      id: 'k-file-storage',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'File Storage Solution',
      content: 'User uploads go to S3. Pre-signed URLs are used for secure downloads. Max file size is 10MB.',
      category: 'fact',
      confidence: 0.95,
      tags: ['files', 's3', 'uploads', 'storage', 'presigned', 'downloads', 'aws', 'security', 'limits', 'blob'],
    },
    {
      id: 'g-env-variables',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'environment-variables',
      content: 'Use environment variables for all configuration. Never hardcode values that differ between environments.',
      category: 'code_style',
      priority: 95,
      tags: ['environment', 'variables', 'config', 'configuration', 'hardcode', 'deployment', 'settings', 'secrets', 'best-practice', 'security'],
    },
    {
      id: 'g-dependency-updates',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'dependency-management',
      content: 'Review Dependabot PRs weekly. Security updates should be merged within 48 hours.',
      category: 'workflow',
      priority: 85,
      tags: ['dependencies', 'dependabot', 'security', 'updates', 'npm', 'packages', 'workflow', 'maintenance', 'vulnerabilities', 'automation'],
    },
    {
      id: 't-deps-audit',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'npm-audit',
      description: 'Check for vulnerable dependencies: npm audit. Fix with npm audit fix when safe.',
      category: 'cli',
      tags: ['security', 'dependencies', 'audit', 'npm', 'vulnerabilities', 'packages', 'cli', 'maintenance', 'scanning', 'compliance'],
    },

    // MORE ENTRIES: Internationalization/localization
    {
      id: 'k-i18n-setup',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Internationalization Setup',
      content: 'We use i18next for translations. Locale files are in /locales/{lang}/. Default language is English.',
      category: 'fact',
      confidence: 0.9,
      tags: ['i18n', 'internationalization', 'translations', 'locales', 'i18next', 'language', 'english', 'frontend', 'localization', 'l10n'],
    },
    {
      id: 'g-i18n-strings',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'i18n-string-handling',
      content: 'Never hardcode user-facing strings. All text must go through the translation system.',
      category: 'code_style',
      priority: 80,
      tags: ['i18n', 'strings', 'hardcode', 'translation', 'localization', 'text', 'frontend', 'user-facing', 'internationalization', 'best-practice'],
    },

    // MORE ENTRIES: Accessibility
    {
      id: 'g-accessibility',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'accessibility-requirements',
      content: 'All UI must meet WCAG 2.1 AA standards. Use semantic HTML and proper ARIA attributes.',
      category: 'code_style',
      priority: 85,
      tags: ['accessibility', 'a11y', 'wcag', 'aria', 'semantic', 'html', 'ui', 'frontend', 'standards', 'compliance'],
    },
    {
      id: 'k-a11y-testing',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Accessibility Testing',
      content: 'We use axe-core for automated a11y testing. Manual testing with screen readers is done before major releases.',
      category: 'fact',
      confidence: 0.85,
      tags: ['accessibility', 'a11y', 'testing', 'axe-core', 'screen-reader', 'automation', 'qa', 'compliance', 'releases', 'quality'],
    },

    // MORE ENTRIES: Feature flags
    {
      id: 'k-feature-flags',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Feature Flag System',
      content: 'LaunchDarkly manages feature flags. Flags can target by user ID, org, or percentage rollout.',
      category: 'decision',
      confidence: 0.9,
      tags: ['feature-flags', 'launchdarkly', 'targeting', 'rollout', 'percentage', 'users', 'orgs', 'deployment', 'release', 'toggles'],
    },
    {
      id: 'g-feature-flag-cleanup',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'feature-flag-lifecycle',
      content: 'Remove feature flags within 30 days of 100% rollout. Track flags in a cleanup spreadsheet.',
      category: 'workflow',
      priority: 70,
      tags: ['feature-flags', 'cleanup', 'lifecycle', 'rollout', 'maintenance', 'tech-debt', 'workflow', 'tracking', 'process', 'hygiene'],
    },

    // MORE ENTRIES: Search functionality
    {
      id: 'k-search-engine',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Search Engine Choice',
      content: 'Elasticsearch powers full-text search. Index updates are near-real-time via change data capture.',
      category: 'decision',
      confidence: 0.95,
      tags: ['search', 'elasticsearch', 'full-text', 'indexing', 'cdc', 'real-time', 'infrastructure', 'query', 'backend', 'data'],
    },
    {
      id: 'g-search-indexing',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'search-index-management',
      content: 'Index schema changes require migration plan. Test reindexing on staging before production.',
      category: 'workflow',
      priority: 80,
      tags: ['search', 'indexing', 'schema', 'migration', 'staging', 'testing', 'elasticsearch', 'production', 'process', 'deployment'],
    },

    // MORE ENTRIES: Email/notifications
    {
      id: 'k-email-service',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Email Service',
      content: 'SendGrid handles transactional emails. Templates are stored in SendGrid and referenced by ID.',
      category: 'fact',
      confidence: 0.9,
      tags: ['email', 'sendgrid', 'transactional', 'templates', 'notifications', 'messaging', 'integration', 'service', 'communication', 'infrastructure'],
    },
    {
      id: 'g-email-testing',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'email-testing-requirements',
      content: 'Test emails in staging before production. Use Mailhog locally to capture outgoing mail.',
      category: 'testing',
      priority: 75,
      tags: ['email', 'testing', 'staging', 'mailhog', 'local', 'qa', 'sendgrid', 'verification', 'development', 'debugging'],
    },

    // MORE ENTRIES: Backup/recovery
    {
      id: 'k-backup-strategy',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Backup Strategy',
      content: 'Daily snapshots to S3 with 30-day retention. Point-in-time recovery enabled for PostgreSQL.',
      category: 'fact',
      confidence: 1.0,
      tags: ['backup', 'snapshots', 's3', 'retention', 'recovery', 'postgresql', 'disaster-recovery', 'data', 'aws', 'pitr'],
    },
    {
      id: 'g-backup-testing',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'backup-restore-testing',
      content: 'Test backup restoration quarterly. Document recovery time and verify data integrity.',
      category: 'workflow',
      priority: 85,
      tags: ['backup', 'restore', 'testing', 'quarterly', 'recovery', 'integrity', 'disaster-recovery', 'verification', 'compliance', 'process'],
    },
    {
      id: 't-backup-restore',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'pg-restore-tool',
      description: 'Restore PostgreSQL backup: pg_restore -d dbname backup.dump --clean --if-exists',
      category: 'cli',
      tags: ['backup', 'restore', 'postgresql', 'cli', 'database', 'recovery', 'pg_restore', 'ops', 'disaster-recovery', 'admin'],
    },

    // MORE ENTRIES: Monitoring/alerting
    {
      id: 'k-monitoring-stack',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Monitoring Stack',
      content: 'Prometheus collects metrics, Grafana for dashboards. AlertManager handles notifications.',
      category: 'fact',
      confidence: 0.95,
      tags: ['monitoring', 'prometheus', 'grafana', 'alertmanager', 'metrics', 'dashboards', 'notifications', 'observability', 'infrastructure', 'devops'],
    },
    {
      id: 'g-alerting-rules',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'alerting-best-practices',
      content: 'Alerts must be actionable. Include runbook links in alert descriptions. Avoid alert fatigue.',
      category: 'workflow',
      priority: 80,
      tags: ['alerting', 'alerts', 'runbooks', 'actionable', 'fatigue', 'monitoring', 'oncall', 'incidents', 'observability', 'best-practice'],
    },

    // MORE ENTRIES: API rate limiting
    {
      id: 'k-rate-limiting',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Rate Limiting Configuration',
      content: 'API rate limits: 100 req/min per user, 1000 req/min per org. Limits are enforced at the gateway.',
      category: 'fact',
      confidence: 1.0,
      tags: ['rate-limiting', 'api', 'limits', 'gateway', 'user', 'org', 'throttling', 'security', 'configuration', 'protection'],
    },
    {
      id: 'g-rate-limit-handling',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'rate-limit-response',
      content: 'Return 429 Too Many Requests with Retry-After header. Client should implement exponential backoff.',
      category: 'code_style',
      priority: 85,
      tags: ['rate-limiting', 'http', '429', 'retry-after', 'backoff', 'api', 'responses', 'client', 'handling', 'resilience'],
    },

    // MORE ENTRIES: GraphQL (alternative to REST)
    {
      id: 'k-graphql-usage',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'GraphQL for Mobile',
      content: 'Mobile apps use GraphQL for efficiency. REST remains primary for web and third-party integrations.',
      category: 'decision',
      confidence: 0.85,
      tags: ['graphql', 'mobile', 'rest', 'api', 'efficiency', 'web', 'integrations', 'architecture', 'client', 'backend'],
    },
    {
      id: 'g-graphql-security',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'graphql-query-limits',
      content: 'Limit query depth to 5 levels. Implement query cost analysis to prevent DoS attacks.',
      category: 'security',
      priority: 90,
      tags: ['graphql', 'security', 'depth', 'cost', 'dos', 'limits', 'queries', 'protection', 'api', 'validation'],
    },

    // MORE ENTRIES: Microservices
    {
      id: 'k-service-architecture',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Microservices Architecture',
      content: 'System is split into user-service, order-service, payment-service, and notification-service.',
      category: 'fact',
      confidence: 0.95,
      tags: ['microservices', 'architecture', 'services', 'user', 'order', 'payment', 'notification', 'distributed', 'backend', 'system'],
    },
    {
      id: 'g-service-communication',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'service-to-service-comm',
      content: 'Services communicate via HTTP/gRPC for sync calls, SQS for async. Never share databases.',
      category: 'architecture',
      priority: 95,
      tags: ['microservices', 'communication', 'http', 'grpc', 'sqs', 'async', 'sync', 'database', 'architecture', 'isolation'],
    },

    // MORE ENTRIES: Secrets management
    {
      id: 'k-secrets-management',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Secrets Management',
      content: 'AWS Secrets Manager stores all secrets. Applications fetch secrets at startup, not via env vars.',
      category: 'decision',
      confidence: 0.95,
      tags: ['secrets', 'aws', 'secrets-manager', 'security', 'configuration', 'startup', 'credentials', 'management', 'infrastructure', 'sensitive'],
    },
    {
      id: 'g-secret-rotation',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'secret-rotation-policy',
      content: 'Rotate secrets every 90 days. Database passwords rotate automatically via Secrets Manager.',
      category: 'security',
      priority: 95,
      tags: ['secrets', 'rotation', 'policy', 'database', 'passwords', 'security', 'automation', 'compliance', 'credentials', 'lifecycle'],
    },

    // MORE ENTRIES: Database migrations
    {
      id: 'k-migration-strategy',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Database Migration Strategy',
      content: 'Drizzle ORM generates migrations. Migrations run automatically on deployment. Backward compatible only.',
      category: 'decision',
      confidence: 0.9,
      tags: ['migrations', 'drizzle', 'orm', 'database', 'deployment', 'backward-compatible', 'schema', 'automation', 'postgresql', 'ci'],
    },
    {
      id: 'g-migration-testing',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'migration-verification',
      content: 'Test migrations on a copy of production data. Verify rollback works before deploying.',
      category: 'workflow',
      priority: 90,
      tags: ['migrations', 'testing', 'production', 'rollback', 'verification', 'database', 'deployment', 'staging', 'data', 'safety'],
    },

    // MORE ENTRIES: API documentation
    {
      id: 'k-api-docs-location',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'API Documentation',
      content: 'API docs are at /docs. Swagger UI is available in non-production environments.',
      category: 'fact',
      confidence: 0.9,
      tags: ['api', 'documentation', 'docs', 'swagger', 'ui', 'openapi', 'reference', 'developers', 'endpoints', 'specification'],
    },
    {
      id: 'g-api-docs-update',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'api-docs-maintenance',
      content: 'Update API docs when changing endpoints. PRs without doc updates will be rejected.',
      category: 'workflow',
      priority: 80,
      tags: ['api', 'documentation', 'updates', 'pr', 'review', 'endpoints', 'maintenance', 'workflow', 'quality', 'completeness'],
    },

    // MORE ENTRIES: Frontend architecture
    {
      id: 'k-frontend-stack',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Frontend Technology Stack',
      content: 'React 18 with TypeScript. Vite for bundling. TailwindCSS for styling. React Query for data fetching.',
      category: 'fact',
      confidence: 0.95,
      tags: ['frontend', 'react', 'typescript', 'vite', 'tailwind', 'react-query', 'stack', 'ui', 'bundling', 'styling'],
    },
    {
      id: 'g-frontend-state',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'frontend-state-management',
      content: 'Use React Query for server state. Zustand for client-only state. Avoid Redux complexity.',
      category: 'code_style',
      priority: 80,
      tags: ['frontend', 'state', 'react-query', 'zustand', 'redux', 'management', 'react', 'architecture', 'client', 'server'],
    },

    // MORE ENTRIES: Git workflow
    {
      id: 'k-git-branching',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'Git Branching Strategy',
      content: 'We use trunk-based development. Feature branches are short-lived. Main is always deployable.',
      category: 'decision',
      confidence: 0.95,
      tags: ['git', 'branching', 'trunk-based', 'feature', 'main', 'deployment', 'workflow', 'vcs', 'strategy', 'continuous'],
    },
    {
      id: 'g-git-commits',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'git-commit-messages',
      content: 'Use conventional commits: feat:, fix:, docs:, chore:. Include ticket number in commit.',
      category: 'workflow',
      priority: 75,
      tags: ['git', 'commits', 'conventional', 'messages', 'ticket', 'workflow', 'vcs', 'standard', 'format', 'changelog'],
    },
    {
      id: 't-git-hooks',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'husky-setup',
      description: 'Husky manages git hooks. Pre-commit runs lint, pre-push runs tests.',
      category: 'cli',
      tags: ['git', 'hooks', 'husky', 'pre-commit', 'pre-push', 'lint', 'tests', 'automation', 'workflow', 'ci'],
    },

    // MORE ENTRIES: CI/CD pipeline
    {
      id: 'k-ci-pipeline',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'CI Pipeline',
      content: 'GitHub Actions runs CI. Jobs: lint, typecheck, test, build. All must pass for merge.',
      category: 'fact',
      confidence: 1.0,
      tags: ['ci', 'github-actions', 'pipeline', 'lint', 'typecheck', 'test', 'build', 'merge', 'automation', 'workflow'],
    },
    {
      id: 'k-cd-pipeline',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'CD Pipeline',
      content: 'Merges to main trigger staging deploy. Production deploys require manual approval.',
      category: 'fact',
      confidence: 0.95,
      tags: ['cd', 'deployment', 'staging', 'production', 'approval', 'manual', 'main', 'trigger', 'automation', 'release'],
    },

    // MORE ENTRIES: On-call/incidents
    {
      id: 'k-oncall-rotation',
      type: 'knowledge',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      title: 'On-Call Rotation',
      content: 'Weekly rotation via PagerDuty. Primary and secondary on-call. Handoff is Monday 9am.',
      category: 'fact',
      confidence: 0.9,
      tags: ['oncall', 'pagerduty', 'rotation', 'primary', 'secondary', 'handoff', 'incidents', 'support', 'schedule', 'team'],
    },
    {
      id: 'g-incident-response',
      type: 'guideline',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'incident-response-process',
      content: 'Acknowledge alerts within 15 min. Create incident channel in Slack. Write postmortem within 48h.',
      category: 'workflow',
      priority: 95,
      tags: ['incidents', 'response', 'alerts', 'slack', 'postmortem', 'oncall', 'sla', 'process', 'communication', 'resolution'],
    },

    // ADDITIONAL TOOLS
    {
      id: 't-format-code',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'prettier-format',
      description: 'Format all code files: npm run format',
      category: 'cli',
      tags: ['prettier', 'formatting', 'code-style', 'npm', 'cli', 'automation', 'development', 'quality', 'consistency', 'tooling'],
    },
    {
      id: 't-type-check',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'typescript-check',
      description: 'Run TypeScript type checking: npm run typecheck',
      category: 'cli',
      tags: ['typescript', 'typecheck', 'types', 'npm', 'cli', 'verification', 'quality', 'ci', 'development', 'static-analysis'],
    },
    {
      id: 't-dev-server',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'development-server',
      description: 'Start development server with hot reload: npm run dev',
      category: 'cli',
      tags: ['development', 'server', 'hot-reload', 'npm', 'local', 'cli', 'frontend', 'vite', 'watch', 'debugging'],
    },
    {
      id: 't-db-studio',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'drizzle-studio',
      description: 'Visual database browser: npm run db:studio',
      category: 'cli',
      tags: ['database', 'drizzle', 'studio', 'browser', 'visual', 'npm', 'cli', 'development', 'debugging', 'admin'],
    },
    {
      id: 't-e2e-tests',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'playwright-e2e',
      description: 'Run end-to-end tests: npm run test:e2e. Use --headed for browser visibility.',
      category: 'cli',
      tags: ['testing', 'e2e', 'playwright', 'npm', 'browser', 'integration', 'cli', 'automation', 'qa', 'headed'],
    },
    {
      id: 't-coverage-report',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'coverage-report',
      description: 'Generate test coverage report: npm run test:coverage. Opens HTML report.',
      category: 'cli',
      tags: ['testing', 'coverage', 'report', 'html', 'npm', 'cli', 'metrics', 'quality', 'vitest', 'analysis'],
    },
    {
      id: 't-debug-prod',
      type: 'tool',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      name: 'production-debugging',
      description: 'SSH into production container: aws ecs execute-command --cluster prod --task $TASK_ID',
      category: 'cli',
      tags: ['debugging', 'production', 'ssh', 'ecs', 'aws', 'container', 'cli', 'ops', 'troubleshooting', 'access'],
    },

    // ADDITIONAL ORG-LEVEL ENTRIES
    {
      id: 'g-org-security-review',
      type: 'guideline',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      name: 'security-review-required',
      content: 'Security review required for all new integrations, auth changes, and data handling modifications.',
      category: 'security',
      priority: 100,
      tags: ['security', 'review', 'integrations', 'auth', 'data', 'compliance', 'org', 'policy', 'mandatory', 'approval'],
    },
    {
      id: 'g-org-data-privacy',
      type: 'guideline',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      name: 'data-privacy-compliance',
      content: 'All personal data must be encrypted at rest and in transit. GDPR compliance is mandatory.',
      category: 'security',
      priority: 100,
      tags: ['privacy', 'gdpr', 'encryption', 'personal-data', 'compliance', 'security', 'org', 'policy', 'pii', 'transit'],
    },
    {
      id: 'k-org-tech-radar',
      type: 'knowledge',
      scopeType: 'org',
      scopeId: 'org-query-bench',
      title: 'Technology Radar',
      content: 'Tech radar is updated quarterly. Check before adopting new libraries or frameworks.',
      category: 'decision',
      confidence: 0.9,
      tags: ['tech-radar', 'libraries', 'frameworks', 'adoption', 'org', 'governance', 'quarterly', 'standards', 'review', 'technology'],
    },

    // ADDITIONAL GLOBAL ENTRIES
    {
      id: 'g-global-code-ownership',
      type: 'guideline',
      scopeType: 'global',
      name: 'code-ownership',
      content: 'Every file should have clear ownership. Use CODEOWNERS file in repositories.',
      category: 'workflow',
      priority: 75,
      tags: ['ownership', 'codeowners', 'repository', 'workflow', 'governance', 'maintenance', 'responsibility', 'review', 'teams', 'global'],
    },
    {
      id: 'g-global-documentation',
      type: 'guideline',
      scopeType: 'global',
      name: 'documentation-standards',
      content: 'All public APIs must be documented. README required for every repository.',
      category: 'code_style',
      priority: 80,
      tags: ['documentation', 'readme', 'api', 'standards', 'global', 'public', 'repository', 'requirement', 'onboarding', 'clarity'],
    },
    {
      id: 'k-global-sla-targets',
      type: 'knowledge',
      scopeType: 'global',
      title: 'Global SLA Targets',
      content: 'Company-wide SLA: 99.9% uptime for production services. Measured monthly.',
      category: 'fact',
      confidence: 1.0,
      tags: ['sla', 'uptime', 'production', 'global', 'targets', 'metrics', 'monthly', 'availability', 'reliability', 'company'],
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
    // Multi-hop relation chain for traversal tests: no-any -> deep-relation-target
    { sourceId: 'g-no-any', targetId: 'g-deep-relation-target', relationType: 'related_to' },

    // ==========================================================================
    // DEEP RELATION CHAINS (5+ hops for adversarial testing)
    // ==========================================================================

    // Error handling chain: error-handling -> error-logging -> error-codes -> error-responses -> error-tracker
    { sourceId: 'g-error-handling', targetId: 'g-error-logging', relationType: 'related_to' },
    { sourceId: 'g-error-logging', targetId: 'k-error-codes', relationType: 'applies_to' },
    { sourceId: 'k-error-codes', targetId: 'g-error-responses', relationType: 'related_to' },
    { sourceId: 'g-error-responses', targetId: 't-error-tracker', relationType: 'applies_to' },
    { sourceId: 't-error-tracker', targetId: 'g-alerting-rules', relationType: 'depends_on' },

    // Database chain: postgres-decision -> db-choice -> data-persistence -> storage-architecture -> backup-strategy
    { sourceId: 'k-postgres-decision', targetId: 'k-db-choice', relationType: 'related_to' },
    { sourceId: 'k-db-choice', targetId: 'k-data-persistence', relationType: 'related_to' },
    { sourceId: 'k-data-persistence', targetId: 'k-storage-architecture', relationType: 'related_to' },
    { sourceId: 'k-storage-architecture', targetId: 'k-backup-strategy', relationType: 'depends_on' },
    { sourceId: 'k-backup-strategy', targetId: 't-backup-restore', relationType: 'applies_to' },

    // Auth chain: jwt-auth -> login-process -> access-control -> auth-tokens -> no-secrets
    { sourceId: 'k-jwt-auth', targetId: 'k-login-process', relationType: 'related_to' },
    { sourceId: 'k-login-process', targetId: 'k-access-control', relationType: 'related_to' },
    { sourceId: 'k-access-control', targetId: 'g-auth-tokens', relationType: 'applies_to' },
    { sourceId: 'g-auth-tokens', targetId: 'g-no-secrets', relationType: 'depends_on' },

    // Testing chain: testing-strategy -> test-isolation -> test-coverage -> unit-tests -> npm-test -> vitest-watch
    { sourceId: 'k-testing-strategy', targetId: 'g-test-isolation', relationType: 'related_to' },
    { sourceId: 'g-test-isolation', targetId: 'g-test-coverage', relationType: 'related_to' },
    { sourceId: 't-npm-test', targetId: 't-test-watch', relationType: 'related_to' },
    { sourceId: 't-test-watch', targetId: 't-e2e-tests', relationType: 'related_to' },
    { sourceId: 't-e2e-tests', targetId: 't-coverage-report', relationType: 'related_to' },

    // Deployment chain: cloud-deployment -> container-strategy -> deploy-process -> ci-pipeline -> cd-pipeline
    { sourceId: 'k-cloud-deployment', targetId: 'k-container-strategy', relationType: 'related_to' },
    { sourceId: 'k-container-strategy', targetId: 'g-deploy-process', relationType: 'applies_to' },
    { sourceId: 'g-deploy-process', targetId: 'k-ci-pipeline', relationType: 'depends_on' },
    { sourceId: 'k-ci-pipeline', targetId: 'k-cd-pipeline', relationType: 'related_to' },

    // API chain: api-patterns -> api-responses -> rest-api -> api-versioning -> api-docs
    { sourceId: 'k-api-patterns', targetId: 'g-api-responses', relationType: 'related_to' },
    { sourceId: 'g-api-responses', targetId: 'k-rest-api', relationType: 'related_to' },
    { sourceId: 'k-rest-api', targetId: 'k-api-versioning', relationType: 'related_to' },
    { sourceId: 'k-api-versioning', targetId: 't-api-docs', relationType: 'applies_to' },

    // Monitoring chain: monitoring-stack -> logging-system -> log-levels -> log-viewer -> alerting-rules
    { sourceId: 'k-monitoring-stack', targetId: 'k-logging-system', relationType: 'related_to' },
    { sourceId: 'k-logging-system', targetId: 'g-log-levels', relationType: 'applies_to' },
    { sourceId: 'g-log-levels', targetId: 't-log-viewer', relationType: 'applies_to' },

    // Quality chain: code-review -> linting-rules -> code-standards -> naming-convention
    { sourceId: 'g-code-review', targetId: 'g-linting-rules', relationType: 'related_to' },
    { sourceId: 'g-linting-rules', targetId: 'k-code-standards', relationType: 'applies_to' },
    { sourceId: 'k-code-standards', targetId: 'g-naming-convention', relationType: 'related_to' },

    // Security chain: secrets-management -> secret-rotation -> no-secrets -> input-validation -> org-security-review
    { sourceId: 'k-secrets-management', targetId: 'g-secret-rotation', relationType: 'related_to' },
    { sourceId: 'g-secret-rotation', targetId: 'g-no-secrets', relationType: 'related_to' },
    { sourceId: 'g-no-secrets', targetId: 'g-input-validation', relationType: 'related_to' },
    { sourceId: 'g-input-validation', targetId: 'g-org-security-review', relationType: 'depends_on' },

    // Infrastructure chain: docker tools -> docker-compose -> container-strategy -> cloud-deployment
    { sourceId: 't-docker-build', targetId: 't-docker-compose-up', relationType: 'related_to' },
    { sourceId: 't-docker-compose-up', targetId: 'k-container-strategy', relationType: 'applies_to' },

    // Cross-cutting concerns
    { sourceId: 'g-dependency-updates', targetId: 't-deps-audit', relationType: 'applies_to' },
    { sourceId: 'g-env-variables', targetId: 'k-secrets-management', relationType: 'related_to' },
    { sourceId: 'k-caching-layer', targetId: 'k-redis-caching', relationType: 'related_to' },
    { sourceId: 'k-performance-targets', targetId: 'k-caching-layer', relationType: 'related_to' },
    { sourceId: 'g-incident-response', targetId: 'k-oncall-rotation', relationType: 'depends_on' },
    { sourceId: 'k-feature-flags', targetId: 'g-feature-flag-cleanup', relationType: 'related_to' },
    { sourceId: 'k-search-engine', targetId: 'g-search-indexing', relationType: 'applies_to' },
    { sourceId: 'k-email-service', targetId: 'g-email-testing', relationType: 'applies_to' },
    { sourceId: 'k-migration-strategy', targetId: 'g-migration-testing', relationType: 'related_to' },
    { sourceId: 'k-migration-strategy', targetId: 't-db-migrate', relationType: 'applies_to' },
    { sourceId: 'k-git-branching', targetId: 'g-git-commits', relationType: 'related_to' },
    { sourceId: 'g-git-commits', targetId: 't-git-hooks', relationType: 'applies_to' },
    { sourceId: 'g-accessibility', targetId: 'k-a11y-testing', relationType: 'related_to' },
    { sourceId: 'g-i18n-strings', targetId: 'k-i18n-setup', relationType: 'depends_on' },
    { sourceId: 'k-graphql-usage', targetId: 'g-graphql-security', relationType: 'applies_to' },
    { sourceId: 'k-service-architecture', targetId: 'g-service-communication', relationType: 'applies_to' },
    { sourceId: 'k-rate-limiting', targetId: 'g-rate-limit-handling', relationType: 'applies_to' },
    { sourceId: 'g-global-documentation', targetId: 'k-api-docs-location', relationType: 'related_to' },
    { sourceId: 'g-global-code-ownership', targetId: 'g-code-review', relationType: 'related_to' },
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
      limit: 15,
    },
    expectedResults: [
      // Should return top entries of each type
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 2 },
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 2 },
      { seedEntryId: 't-npm-build', relevanceGrade: 2 },
    ],
    difficulty: 'easy',
    notes: 'Context action should return mix of types - limit increased to ensure all types included',
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

  // ===========================================================================
  // FUZZY SEARCH
  // ===========================================================================
  {
    id: 'fz-001',
    name: 'Fuzzy: single typo in authentication',
    category: 'fuzzy-search',
    query: {
      action: 'search',
      search: 'autentication',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 3 },
      { seedEntryId: 'k-auth-flow-details', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
    notes: 'Should find authentication entries despite missing "h"',
  },
  {
    id: 'fz-002',
    name: 'Fuzzy: postgres case variation',
    category: 'fuzzy-search',
    query: {
      action: 'search',
      search: 'postgres',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
    notes: 'Should find PostgreSQL with lowercase search',
  },
  {
    id: 'fz-003',
    name: 'Fuzzy: multiple typos',
    category: 'fuzzy-search',
    query: {
      action: 'search',
      search: 'typscript strct',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
    notes: 'Should find TypeScript strict despite multiple typos',
  },

  // ===========================================================================
  // REGEX SEARCH
  // ===========================================================================
  {
    id: 'rx-001',
    name: 'Regex: version pattern v[0-9]',
    category: 'regex-search',
    query: {
      action: 'search',
      search: 'v[0-9]',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      regex: true,
    },
    expectedResults: [
      { seedEntryId: 'k-version-history', relevanceGrade: 3 },
      { seedEntryId: 'k-api-versioning', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Should match entries containing v1, v2, v3',
  },
  {
    id: 'rx-002',
    name: 'Regex: HTTP methods in API',
    category: 'regex-search',
    query: {
      action: 'search',
      search: '(GET|POST)',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      regex: true,
    },
    expectedResults: [
      { seedEntryId: 't-api-users', relevanceGrade: 3 },
      { seedEntryId: 't-api-auth', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
    notes: 'Should find API tools with GET or POST',
  },

  // ===========================================================================
  // FIELD-SPECIFIC SEARCH
  // ===========================================================================
  {
    id: 'fs-001',
    name: 'Field search: name only',
    category: 'field-search',
    query: {
      action: 'search',
      search: 'strict',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fields: ['name'],
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['k-postgres-decision'],
    difficulty: 'medium',
    notes: 'Should only match name field, not content',
  },
  {
    id: 'fs-002',
    name: 'Field search: content only',
    category: 'field-search',
    query: {
      action: 'search',
      search: 'injection',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fields: ['content'],
    },
    expectedResults: [
      { seedEntryId: 'g-input-validation', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
    notes: 'Should find injection in content field',
  },
  {
    id: 'fs-003',
    name: 'Field search: description only',
    category: 'field-search',
    query: {
      action: 'search',
      search: 'migration',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fields: ['description'],
    },
    expectedResults: [
      { seedEntryId: 't-db-migrate', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
    notes: 'Should find migration in tool description',
  },

  // ===========================================================================
  // FTS5 OPERATORS
  // ===========================================================================
  {
    id: 'ft-001',
    name: 'FTS5: AND operator',
    category: 'fts5-operators',
    query: {
      action: 'search',
      search: 'TypeScript AND strict',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      useFts5: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ft-002',
    name: 'FTS5: OR operator',
    category: 'fts5-operators',
    query: {
      action: 'search',
      search: 'PostgreSQL OR MySQL',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      useFts5: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
    notes: 'Should find PostgreSQL entry (no MySQL in dataset)',
  },
  {
    id: 'ft-003',
    name: 'FTS5: NOT operator',
    category: 'fts5-operators',
    query: {
      action: 'search',
      search: 'database NOT migration',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      useFts5: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
      { seedEntryId: 't-docker-compose-up', relevanceGrade: 2 },
    ],
    shouldNotReturn: ['t-db-migrate'],
    difficulty: 'hard',
  },
  {
    id: 'ft-004',
    name: 'FTS5: phrase query',
    category: 'fts5-operators',
    query: {
      action: 'search',
      search: '"strict mode"',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      useFts5: true,
    },
    expectedResults: [
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 3 },
    ],
    difficulty: 'medium',
    notes: 'Exact phrase match',
  },

  // ===========================================================================
  // CONFIDENCE FILTERING
  // ===========================================================================
  {
    id: 'cnf-001',
    name: 'Confidence: high only (>0.9)',
    category: 'confidence-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['knowledge'],
      confidence: { min: 0.9 },
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 3 },
      { seedEntryId: 'k-node-version', relevanceGrade: 3 },
      { seedEntryId: 'k-auth-flow-details', relevanceGrade: 3 },
      { seedEntryId: 'k-version-history', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['k-uncertain-timeout', 'k-team-structure'],
    difficulty: 'medium',
  },
  {
    id: 'cnf-002',
    name: 'Confidence: low only (<0.6)',
    category: 'confidence-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['knowledge'],
      confidence: { max: 0.6 },
    },
    expectedResults: [
      { seedEntryId: 'k-uncertain-timeout', relevanceGrade: 3 },
    ],
    shouldNotReturn: ['k-postgres-decision'],
    difficulty: 'medium',
  },

  // ===========================================================================
  // DATE FILTERING
  // ===========================================================================
  {
    id: 'df-001',
    name: 'Date: created after 2025',
    category: 'date-filtering',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      createdAfter: '2025-01-01T00:00:00Z',
    },
    expectedResults: [],
    difficulty: 'easy',
    notes: 'All benchmark entries created at runtime, depends on test execution time',
  },

  // ===========================================================================
  // TEMPORAL VALIDITY
  // ===========================================================================
  {
    id: 'tv-001',
    name: 'Temporal: valid at specific time',
    category: 'temporal-validity',
    query: {
      action: 'search',
      search: 'maintenance',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      atTime: '2025-01-10T00:00:00Z',
    },
    expectedResults: [
      { seedEntryId: 'k-maintenance-window', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
    notes: 'Should find maintenance window valid during this date',
  },
  {
    id: 'tv-002',
    name: 'Temporal: valid during period',
    category: 'temporal-validity',
    query: {
      action: 'search',
      search: 'feature flag',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      validDuring: {
        start: '2025-01-15T00:00:00Z',
        end: '2025-02-15T00:00:00Z',
      },
    },
    expectedResults: [
      { seedEntryId: 'k-feature-flag-beta', relevanceGrade: 3 },
    ],
    difficulty: 'hard',
  },

  // ===========================================================================
  // INCLUDE INACTIVE
  // ===========================================================================
  {
    id: 'ia-001',
    name: 'Inactive: excluded by default',
    category: 'inactive-filtering',
    query: {
      action: 'search',
      search: 'old deprecated rule',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      includeInactive: false,
    },
    expectedResults: [],
    shouldNotReturn: ['g-inactive-rule'],
    difficulty: 'easy',
    notes: 'Inactive entries should not appear in normal search',
  },
  {
    id: 'ia-002',
    name: 'Inactive: included with flag',
    category: 'inactive-filtering',
    query: {
      action: 'search',
      search: 'old deprecated rule',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      includeInactive: true,
    },
    expectedResults: [
      { seedEntryId: 'g-inactive-rule', relevanceGrade: 3 },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // MULTI-HOP RELATION TRAVERSAL
  // ===========================================================================
  {
    id: 'rt-003',
    name: 'Multi-hop: depth 2 traversal',
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
        depth: 2,
      },
    },
    expectedResults: [
      { seedEntryId: 'g-no-any', relevanceGrade: 3 },
      { seedEntryId: 't-npm-build', relevanceGrade: 2 },
      { seedEntryId: 'g-deep-relation-target', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Should traverse: strict -> no-any -> deep-relation-target',
  },

  // ===========================================================================
  // PAGINATION
  // ===========================================================================
  {
    id: 'pg-001',
    name: 'Pagination: offset and limit',
    category: 'pagination',
    query: {
      action: 'search',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      types: ['guidelines'],
      limit: 3,
      offset: 2,
    },
    expectedResults: [],
    difficulty: 'easy',
    notes: 'Tests offset/limit pagination - expects subset of results',
  },

  // ===========================================================================
  // ADVERSARIAL: TYPO QUERIES
  // ===========================================================================
  {
    id: 'tq-001',
    name: 'Typo: posqtgress (PostgreSQL)',
    category: 'typo-queries',
    query: {
      action: 'search',
      search: 'posqtgress',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 3 },
      { seedEntryId: 'k-db-choice', relevanceGrade: 2 },
      { seedEntryId: 'k-data-persistence', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Severe typo in PostgreSQL - should still find postgres-related entries',
  },
  {
    id: 'tq-002',
    name: 'Typo: authentcation (missing i)',
    category: 'typo-queries',
    query: {
      action: 'search',
      search: 'authentcation',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 3 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 3 },
      { seedEntryId: 'k-auth-flow-details', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Common typo missing the "i" in authentication',
  },
  {
    id: 'tq-003',
    name: 'Typo: deploymnet (transposed letters)',
    category: 'typo-queries',
    query: {
      action: 'search',
      search: 'deploymnet',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'k-cloud-deployment', relevanceGrade: 3 },
      { seedEntryId: 'g-deploy-process', relevanceGrade: 3 },
      { seedEntryId: 'k-deployment-env', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Transposed letters - common typing error',
  },
  {
    id: 'tq-004',
    name: 'Typo: databse queries',
    category: 'typo-queries',
    query: {
      action: 'search',
      search: 'databse queries',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 2 },
      { seedEntryId: 'k-performance-targets', relevanceGrade: 2 },
      { seedEntryId: 't-db-migrate', relevanceGrade: 1 },
    ],
    difficulty: 'hard',
    notes: 'Missing "a" in database with related term',
  },
  {
    id: 'tq-005',
    name: 'Typo: securty best pratices',
    category: 'typo-queries',
    query: {
      action: 'search',
      search: 'securty best pratices',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
      fuzzy: true,
    },
    expectedResults: [
      { seedEntryId: 'g-no-secrets', relevanceGrade: 3 },
      { seedEntryId: 'g-input-validation', relevanceGrade: 2 },
      { seedEntryId: 'g-auth-required', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Multiple typos: "securty" and "pratices"',
  },

  // ===========================================================================
  // ADVERSARIAL: VAGUE QUERIES
  // ===========================================================================
  {
    id: 'vq-001',
    name: 'Vague: database stuff',
    category: 'vague-queries',
    query: {
      action: 'search',
      search: 'database stuff',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 2 },
      { seedEntryId: 't-db-migrate', relevanceGrade: 2 },
      { seedEntryId: 'k-db-choice', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Informal, vague query - should still find database-related entries',
  },
  {
    id: 'vq-002',
    name: 'Vague: how do test',
    category: 'vague-queries',
    query: {
      action: 'search',
      search: 'how do test',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-npm-test', relevanceGrade: 3 },
      { seedEntryId: 'g-test-coverage', relevanceGrade: 2 },
      { seedEntryId: 'g-unit-tests', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Incomplete, grammatically incorrect query',
  },
  {
    id: 'vq-003',
    name: 'Vague: something about auth',
    category: 'vague-queries',
    query: {
      action: 'search',
      search: 'something about auth',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 2 },
      { seedEntryId: 'k-jwt-auth', relevanceGrade: 2 },
      { seedEntryId: 'k-login-process', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Extremely vague with filler words',
  },
  {
    id: 'vq-004',
    name: 'Vague: config things',
    category: 'vague-queries',
    query: {
      action: 'search',
      search: 'config things',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-env-variables', relevanceGrade: 2 },
      { seedEntryId: 'g-typescript-strict', relevanceGrade: 1 },
      { seedEntryId: 'k-rate-limiting', relevanceGrade: 1 },
    ],
    difficulty: 'hard',
    notes: 'Vague query about configuration',
  },
  {
    id: 'vq-005',
    name: 'Vague: the deployment',
    category: 'vague-queries',
    query: {
      action: 'search',
      search: 'the deployment',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-cloud-deployment', relevanceGrade: 3 },
      { seedEntryId: 'g-deploy-process', relevanceGrade: 3 },
      { seedEntryId: 'k-cd-pipeline', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Article + keyword - should focus on the meaningful term',
  },

  // ===========================================================================
  // ADVERSARIAL: MULTI-INTENT QUERIES
  // ===========================================================================
  {
    id: 'mi-001',
    name: 'Multi-intent: deployment AND authentication',
    category: 'multi-intent',
    query: {
      action: 'search',
      search: 'deployment authentication',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-auth-required', relevanceGrade: 2 },
      { seedEntryId: 'k-cloud-deployment', relevanceGrade: 2 },
      { seedEntryId: 'g-deploy-process', relevanceGrade: 1 },
    ],
    difficulty: 'hard',
    notes: 'Two distinct topics in one query',
  },
  {
    id: 'mi-002',
    name: 'Multi-intent: testing and security and performance',
    category: 'multi-intent',
    query: {
      action: 'search',
      search: 'testing security performance',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-test-coverage', relevanceGrade: 2 },
      { seedEntryId: 'g-no-secrets', relevanceGrade: 2 },
      { seedEntryId: 'k-performance-targets', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Three distinct topics in one query',
  },
  {
    id: 'mi-003',
    name: 'Multi-intent: database backup and monitoring',
    category: 'multi-intent',
    query: {
      action: 'search',
      search: 'database backup monitoring alerts',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-backup-strategy', relevanceGrade: 3 },
      { seedEntryId: 'k-monitoring-stack', relevanceGrade: 2 },
      { seedEntryId: 'g-alerting-rules', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Related but distinct concerns',
  },
  {
    id: 'mi-004',
    name: 'Multi-intent: api documentation versioning',
    category: 'multi-intent',
    query: {
      action: 'search',
      search: 'api documentation versioning',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-api-versioning', relevanceGrade: 3 },
      { seedEntryId: 'k-api-docs-location', relevanceGrade: 3 },
      { seedEntryId: 't-api-docs', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Related topics that should find overlapping results',
  },
  {
    id: 'mi-005',
    name: 'Multi-intent: linting formatting commits',
    category: 'multi-intent',
    query: {
      action: 'search',
      search: 'linting formatting git commits',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'g-linting-rules', relevanceGrade: 3 },
      { seedEntryId: 'g-git-commits', relevanceGrade: 3 },
      { seedEntryId: 't-format-code', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Developer workflow topics combined',
  },

  // ===========================================================================
  // ADVERSARIAL: SYNONYM GAPS
  // ===========================================================================
  {
    id: 'sg-001',
    name: 'Synonym: data store (expect postgres/database)',
    category: 'synonym-gaps',
    query: {
      action: 'search',
      search: 'data store',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-db-choice', relevanceGrade: 3 },
      { seedEntryId: 'k-postgres-decision', relevanceGrade: 2 },
      { seedEntryId: 'k-data-persistence', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Synonym for database - entries use "database", "postgres", "persistence"',
  },
  {
    id: 'sg-002',
    name: 'Synonym: credentials (expect auth/secrets)',
    category: 'synonym-gaps',
    query: {
      action: 'search',
      search: 'credentials management',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-secrets-management', relevanceGrade: 3 },
      { seedEntryId: 'g-secret-rotation', relevanceGrade: 2 },
      { seedEntryId: 'g-auth-tokens', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Looking for secrets/auth using alternative term "credentials"',
  },
  {
    id: 'sg-003',
    name: 'Synonym: web service (expect API/REST)',
    category: 'synonym-gaps',
    query: {
      action: 'search',
      search: 'web service endpoints',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-rest-api', relevanceGrade: 2 },
      { seedEntryId: 'k-api-patterns', relevanceGrade: 2 },
      { seedEntryId: 't-api-users', relevanceGrade: 2 },
    ],
    difficulty: 'hard',
    notes: 'Looking for API endpoints using older terminology',
  },
  {
    id: 'sg-004',
    name: 'Synonym: build pipeline (expect CI/CD)',
    category: 'synonym-gaps',
    query: {
      action: 'search',
      search: 'build pipeline automation',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 'k-ci-pipeline', relevanceGrade: 3 },
      { seedEntryId: 'k-cd-pipeline', relevanceGrade: 2 },
      { seedEntryId: 'g-deploy-process', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Synonym for CI/CD pipeline',
  },
  {
    id: 'sg-005',
    name: 'Synonym: error tracking (expect logging/monitoring)',
    category: 'synonym-gaps',
    query: {
      action: 'search',
      search: 'error tracking observability',
      scopeType: 'project',
      scopeId: 'proj-query-bench',
      inherit: true,
    },
    expectedResults: [
      { seedEntryId: 't-error-tracker', relevanceGrade: 3 },
      { seedEntryId: 'g-error-logging', relevanceGrade: 2 },
      { seedEntryId: 'k-monitoring-stack', relevanceGrade: 2 },
    ],
    difficulty: 'medium',
    notes: 'Finding monitoring/logging entries via error tracking terminology',
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

/**
 * Extraction Quality Benchmark Dataset
 *
 * Ground truth test cases for evaluating extraction quality.
 * 75+ diverse cases covering all extraction scenarios.
 */

import type { ExtractionTestCase } from './extraction-quality-types.js';

/**
 * Complete test dataset
 */
export const EXTRACTION_TEST_CASES: ExtractionTestCase[] = [
  // ===========================================================================
  // GUIDELINES - EXPLICIT (10 cases)
  // ===========================================================================
  {
    id: 'ge-001',
    name: 'Simple always rule',
    category: 'guidelines-explicit',
    context: 'We always use TypeScript strict mode in this project.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['TypeScript', 'strict'],
        category: 'code_style',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ge-002',
    name: 'Simple never rule',
    category: 'guidelines-explicit',
    context: 'Never use any type in TypeScript code.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['any', 'type'],
        category: 'code_style',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ge-003',
    name: 'Must requirement',
    category: 'guidelines-explicit',
    context: 'All API endpoints must return proper HTTP status codes.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['API', 'HTTP status'],
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ge-004',
    name: 'Should preference',
    category: 'guidelines-explicit',
    context: 'Developers should prefer composition over inheritance.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['composition', 'inheritance'],
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ge-005',
    name: 'Avoid pattern',
    category: 'guidelines-explicit',
    context: 'Avoid using global variables in the codebase.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['global', 'variable'],
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ge-006',
    name: 'Multiple explicit rules',
    category: 'guidelines-explicit',
    context: `Our coding standards are:
    - Always write unit tests for new code
    - Never commit directly to main branch
    - Use meaningful variable names`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['unit test'],
      },
      {
        type: 'guideline',
        mustContain: ['main branch', 'commit'],
      },
      {
        type: 'guideline',
        mustContain: ['variable name'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ge-007',
    name: 'Security guideline',
    category: 'guidelines-explicit',
    context:
      'Always sanitize user input before processing. Never trust data from external sources.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['sanitize', 'input'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['trust', 'external'],
        category: 'security',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ge-008',
    name: 'Performance guideline',
    category: 'guidelines-explicit',
    context:
      'Always use lazy loading for images. Avoid blocking the main thread with heavy computations.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['lazy loading', 'image'],
      },
      {
        type: 'guideline',
        mustContain: ['main thread', 'blocking'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ge-009',
    name: 'Testing guideline',
    category: 'guidelines-explicit',
    context:
      'Tests must have at least 80% code coverage. Always mock external dependencies in unit tests.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['80%', 'coverage'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['mock', 'external', 'dependencies'],
        category: 'testing',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ge-010',
    name: 'Documentation guideline',
    category: 'guidelines-explicit',
    context:
      'Every public function must have JSDoc comments. README files should be updated when adding new features.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['JSDoc', 'public function'],
      },
      {
        type: 'guideline',
        mustContain: ['README', 'feature'],
      },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // GUIDELINES - IMPLICIT (8 cases)
  // ===========================================================================
  {
    id: 'gi-001',
    name: 'Implied standard from practice',
    category: 'guidelines-implicit',
    context:
      'In our team, we review every PR before merging. Code review is essential for quality.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['PR', 'review'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gi-002',
    name: 'Convention from description',
    category: 'guidelines-implicit',
    context:
      'Our API follows REST conventions. We use plural nouns for resource endpoints like /users and /orders.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['REST'],
      },
      {
        type: 'guideline',
        mustContain: ['plural', 'endpoint'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gi-003',
    name: 'Standard from context',
    category: 'guidelines-implicit',
    context:
      'We use ESLint with the Airbnb config. Prettier handles formatting with 2-space indentation.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['ESLint', 'Airbnb'],
      },
      {
        type: 'guideline',
        mustContain: ['Prettier', '2-space'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gi-004',
    name: 'Architecture pattern implied',
    category: 'guidelines-implicit',
    context:
      'Our services are organized in a hexagonal architecture. The domain layer has no external dependencies.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['hexagonal', 'architecture'],
      },
      {
        type: 'guideline',
        mustContain: ['domain', 'dependencies'],
      },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gi-005',
    name: 'Process standard implied',
    category: 'guidelines-implicit',
    context:
      'Deployments happen through our CI/CD pipeline. Direct server access is restricted to ops team only.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['CI/CD', 'deploy'],
      },
      {
        type: 'guideline',
        mustContain: ['server access', 'ops'],
      },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gi-006',
    name: 'Git workflow implied',
    category: 'guidelines-implicit',
    context:
      'We follow GitFlow. Feature branches are prefixed with feature/, and hotfixes go to the hotfix/ prefix.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['GitFlow'],
      },
      {
        type: 'guideline',
        mustContain: ['feature/', 'branch'],
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gi-007',
    name: 'Error handling standard',
    category: 'guidelines-implicit',
    context:
      'Our error responses follow RFC 7807 format. Every error includes a unique error code for debugging.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['RFC 7807', 'error'],
      },
      {
        type: 'guideline',
        mustContain: ['error code'],
      },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gi-008',
    name: 'Naming convention implied',
    category: 'guidelines-implicit',
    context:
      'Components are named with PascalCase like UserProfile. Utility functions use camelCase like formatDate.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['PascalCase', 'component'],
      },
      {
        type: 'guideline',
        mustContain: ['camelCase', 'function'],
      },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // GUIDELINES - COMPOUND (7 cases)
  // ===========================================================================
  {
    id: 'gc-001',
    name: 'Semicolon separated rules',
    category: 'guidelines-compound',
    context: 'Always use const; never use var; prefer arrow functions over regular functions.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['const'] },
      { type: 'guideline', mustContain: ['var'] },
      { type: 'guideline', mustContain: ['arrow function'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gc-002',
    name: 'And-joined rules',
    category: 'guidelines-compound',
    context: 'Always validate inputs and never trust user data and must sanitize all strings.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['validate', 'input'] },
      { type: 'guideline', mustContain: ['trust', 'user'] },
      { type: 'guideline', mustContain: ['sanitize', 'string'] },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gc-003',
    name: 'Additionally marker',
    category: 'guidelines-compound',
    context:
      'Use ESLint for linting. Additionally, configure Prettier for formatting. Furthermore, enable husky for pre-commit hooks.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['ESLint', 'linting'] },
      { type: 'guideline', mustContain: ['Prettier', 'formatting'] },
      { type: 'guideline', mustContain: ['husky', 'pre-commit'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gc-004',
    name: 'Enumerated list',
    category: 'guidelines-compound',
    context:
      '1) Use dependency injection 2) Avoid global state 3) Write pure functions when possible.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['dependency injection'] },
      { type: 'guideline', mustContain: ['global state'] },
      { type: 'guideline', mustContain: ['pure function'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'gc-005',
    name: 'Multiple imperative sentences',
    category: 'guidelines-compound',
    context:
      'Always write tests first. Never skip code review. Use meaningful commit messages. Avoid large PRs.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['test', 'first'] },
      { type: 'guideline', mustContain: ['code review'] },
      { type: 'guideline', mustContain: ['commit message'] },
      { type: 'guideline', mustContain: ['large PR'] },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gc-006',
    name: 'Bullet point rules',
    category: 'guidelines-compound',
    context: `Database rules:
    • Always use parameterized queries
    • Never store passwords in plain text
    • Use connection pooling
    • Index frequently queried columns`,
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['parameterized', 'query'] },
      { type: 'guideline', mustContain: ['password', 'plain text'] },
      { type: 'guideline', mustContain: ['connection pool'] },
      { type: 'guideline', mustContain: ['index', 'column'] },
    ],
    difficulty: 'hard',
  },
  {
    id: 'gc-007',
    name: 'Also pattern compound',
    category: 'guidelines-compound',
    context:
      'Functions should be small and focused. Also, each function should do one thing. Also, function names should be descriptive.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['small', 'focused'] },
      { type: 'guideline', mustContain: ['one thing'] },
      { type: 'guideline', mustContain: ['function name', 'descriptive'] },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // KNOWLEDGE - DECISIONS (10 cases)
  // ===========================================================================
  {
    id: 'kd-001',
    name: 'Simple decision',
    category: 'knowledge-decisions',
    context: 'We chose PostgreSQL for our database because of its reliability and JSON support.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['PostgreSQL', 'database'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kd-002',
    name: 'Multiple decisions',
    category: 'knowledge-decisions',
    context:
      'We chose React for the frontend. We also decided to use Node.js for the backend. We selected AWS for hosting.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['React', 'frontend'], category: 'decision' },
      { type: 'knowledge', mustContain: ['Node.js', 'backend'], category: 'decision' },
      { type: 'knowledge', mustContain: ['AWS', 'hosting'], category: 'decision' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kd-003',
    name: 'Decision with rationale',
    category: 'knowledge-decisions',
    context:
      'We decided to use TypeScript instead of JavaScript because type safety reduces runtime errors and improves IDE support.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['TypeScript', 'JavaScript'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kd-004',
    name: 'Architecture decision',
    category: 'knowledge-decisions',
    context:
      'The team decided to adopt microservices architecture. Each service will have its own database to ensure loose coupling.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['microservice', 'architecture'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['database', 'loose coupling'],
        category: 'decision',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kd-005',
    name: 'Tool selection decision',
    category: 'knowledge-decisions',
    context:
      'We picked Jest for testing because it has good TypeScript support. For E2E tests, we went with Playwright.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Jest', 'testing'], category: 'decision' },
      { type: 'knowledge', mustContain: ['Playwright', 'E2E'], category: 'decision' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kd-006',
    name: 'Infrastructure decision',
    category: 'knowledge-decisions',
    context:
      'We opted for Kubernetes over Docker Swarm for orchestration. The team selected Terraform for infrastructure as code.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Kubernetes', 'Docker Swarm'], category: 'decision' },
      { type: 'knowledge', mustContain: ['Terraform', 'infrastructure'], category: 'decision' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kd-007',
    name: 'API design decision',
    category: 'knowledge-decisions',
    context:
      'We chose GraphQL over REST for our API. This decision was made because the frontend needs flexible queries.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['GraphQL', 'REST', 'API'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kd-008',
    name: 'State management decision',
    category: 'knowledge-decisions',
    context:
      'For state management, we decided on Zustand instead of Redux. It is simpler and has less boilerplate.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Zustand', 'Redux', 'state management'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kd-009',
    name: 'Authentication decision',
    category: 'knowledge-decisions',
    context:
      'We selected Auth0 for authentication. JWTs will be used for session management with 1-hour expiry.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Auth0', 'authentication'], category: 'decision' },
      { type: 'knowledge', mustContain: ['JWT', 'session'], category: 'decision' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kd-010',
    name: 'Caching decision',
    category: 'knowledge-decisions',
    context: 'Redis was chosen for caching. We will use a 5-minute TTL for most cached data.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Redis', 'caching'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // KNOWLEDGE - FACTS (10 cases)
  // ===========================================================================
  {
    id: 'kf-001',
    name: 'Simple fact',
    category: 'knowledge-facts',
    context: 'The main database is hosted on AWS RDS in the us-east-1 region.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['AWS RDS', 'us-east-1'],
        category: 'fact',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kf-002',
    name: 'Configuration fact',
    category: 'knowledge-facts',
    context: 'The API rate limit is set to 100 requests per minute per user.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['rate limit', '100 requests'],
        category: 'fact',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kf-003',
    name: 'Team structure fact',
    category: 'knowledge-facts',
    context: 'The frontend team has 5 developers. The backend team consists of 3 senior engineers.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['frontend team', '5'], category: 'fact' },
      { type: 'knowledge', mustContain: ['backend team', '3'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-004',
    name: 'Version fact',
    category: 'knowledge-facts',
    context: 'We are using Node.js v20.10.0 and npm v10.2.3 across all environments.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Node.js', '20.10.0'],
        category: 'fact',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kf-005',
    name: 'Environment fact',
    category: 'knowledge-facts',
    context:
      'We have three environments: development, staging, and production. Staging mirrors production configuration.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['environment', 'development', 'staging', 'production'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-006',
    name: 'Integration fact',
    category: 'knowledge-facts',
    context:
      'The payment system integrates with Stripe. Webhook events are processed by the billing service.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Stripe', 'payment'], category: 'fact' },
      { type: 'knowledge', mustContain: ['webhook', 'billing service'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-007',
    name: 'Deployment fact',
    category: 'knowledge-facts',
    context:
      'Deployments happen every Tuesday at 2 PM UTC. Hotfixes can be deployed anytime with approval.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['deployment', 'Tuesday', '2 PM'], category: 'fact' },
      { type: 'knowledge', mustContain: ['hotfix', 'approval'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-008',
    name: 'Architecture fact',
    category: 'knowledge-facts',
    context:
      'The system uses an event-driven architecture. RabbitMQ handles message queuing between services.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['event-driven', 'architecture'], category: 'fact' },
      { type: 'knowledge', mustContain: ['RabbitMQ', 'message'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-009',
    name: 'Storage fact',
    category: 'knowledge-facts',
    context:
      'User uploads are stored in S3 bucket named prod-user-uploads. Maximum file size is 10MB.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['S3', 'prod-user-uploads'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['file size', '10MB'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kf-010',
    name: 'Monitoring fact',
    category: 'knowledge-facts',
    context: 'We use Datadog for monitoring. Alerts are sent to the #ops-alerts Slack channel.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Datadog', 'monitoring'], category: 'fact' },
      { type: 'knowledge', mustContain: ['Slack', 'ops-alerts'], category: 'fact' },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // KNOWLEDGE - TEMPORAL (5 cases)
  // ===========================================================================
  {
    id: 'kt-001',
    name: 'Version change',
    category: 'knowledge-temporal',
    context: 'Starting January 2025, we are migrating from PostgreSQL 14 to PostgreSQL 16.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['PostgreSQL', 'migration', '16'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kt-002',
    name: 'Deprecation notice',
    category: 'knowledge-temporal',
    context:
      'The v1 API will be deprecated in March 2025. All clients should migrate to v2 before then.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['v1 API', 'deprecated', 'March 2025'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kt-003',
    name: 'Scheduled maintenance',
    category: 'knowledge-temporal',
    context: 'Database maintenance windows are every Sunday from 2 AM to 4 AM UTC.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['maintenance', 'Sunday', '2 AM'],
        category: 'fact',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'kt-004',
    name: 'Feature timeline',
    category: 'knowledge-temporal',
    context:
      'The new authentication system launched in Q3 2024. OAuth2 support was added in Q4 2024.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['authentication', 'Q3 2024'], category: 'fact' },
      { type: 'knowledge', mustContain: ['OAuth2', 'Q4 2024'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'kt-005',
    name: 'Sprint timeline',
    category: 'knowledge-temporal',
    context: 'Sprint 42 ends on December 15th. Sprint retrospectives happen the following Monday.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Sprint 42', 'December 15'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // TOOLS - CLI (8 cases)
  // ===========================================================================
  {
    id: 'tc-001',
    name: 'Simple CLI command',
    category: 'tools-cli',
    context: 'Run npm run build to compile the TypeScript code.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['npm run build'],
        category: 'cli',
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'tc-002',
    name: 'Multiple CLI commands',
    category: 'tools-cli',
    context:
      'Use npm install to install dependencies. Run npm test for testing. Use npm run lint to check code style.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['npm install'], category: 'cli' },
      { type: 'tool', mustContain: ['npm test'], category: 'cli' },
      { type: 'tool', mustContain: ['npm run lint'], category: 'cli' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tc-003',
    name: 'Docker commands',
    category: 'tools-cli',
    context:
      'Start the dev environment with docker-compose up -d. To rebuild, use docker-compose build --no-cache.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['docker-compose up'], category: 'cli' },
      { type: 'tool', mustContain: ['docker-compose build'], category: 'cli' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tc-004',
    name: 'Git commands',
    category: 'tools-cli',
    context:
      'Create a new branch with git checkout -b feature/name. Push with git push -u origin feature/name.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['git checkout -b'], category: 'cli' },
      { type: 'tool', mustContain: ['git push -u'], category: 'cli' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tc-005',
    name: 'Database CLI',
    category: 'tools-cli',
    context: 'Run database migrations with npm run db:migrate. Seed data using npm run db:seed.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['db:migrate'], category: 'cli' },
      { type: 'tool', mustContain: ['db:seed'], category: 'cli' },
    ],
    difficulty: 'easy',
  },
  {
    id: 'tc-006',
    name: 'Kubernetes commands',
    category: 'tools-cli',
    context:
      'Deploy to staging with kubectl apply -f k8s/staging/. Check pod status using kubectl get pods -n staging.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['kubectl apply'], category: 'cli' },
      { type: 'tool', mustContain: ['kubectl get pods'], category: 'cli' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tc-007',
    name: 'AWS CLI commands',
    category: 'tools-cli',
    context:
      'Upload to S3 with aws s3 cp ./dist s3://bucket-name --recursive. List buckets using aws s3 ls.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['aws s3 cp'], category: 'cli' },
      { type: 'tool', mustContain: ['aws s3 ls'], category: 'cli' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tc-008',
    name: 'Development server',
    category: 'tools-cli',
    context:
      'Start the development server with npm run dev. It runs on http://localhost:3000 by default.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['npm run dev'],
        category: 'cli',
      },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // TOOLS - API (5 cases)
  // ===========================================================================
  {
    id: 'ta-001',
    name: 'API endpoint',
    category: 'tools-api',
    context: 'Get user data from GET /api/v1/users/:id. Create users with POST /api/v1/users.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['GET', '/api/v1/users'], category: 'api' },
      { type: 'tool', mustContain: ['POST', '/api/v1/users'], category: 'api' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ta-002',
    name: 'GraphQL operation',
    category: 'tools-api',
    context:
      'Use the getUsers query to fetch users. The createUser mutation handles user creation.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['getUsers', 'query'], category: 'api' },
      { type: 'tool', mustContain: ['createUser', 'mutation'], category: 'api' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ta-003',
    name: 'Webhook endpoint',
    category: 'tools-api',
    context:
      'Stripe webhooks are received at POST /webhooks/stripe. The endpoint requires signature validation.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['/webhooks/stripe', 'Stripe'],
        category: 'api',
      },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ta-004',
    name: 'Internal API',
    category: 'tools-api',
    context:
      'The health check endpoint is GET /health. Metrics are exposed at GET /metrics for Prometheus.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['/health'], category: 'api' },
      { type: 'tool', mustContain: ['/metrics', 'Prometheus'], category: 'api' },
    ],
    difficulty: 'easy',
  },
  {
    id: 'ta-005',
    name: 'Authentication API',
    category: 'tools-api',
    context:
      'Login via POST /auth/login. Refresh tokens with POST /auth/refresh. Logout at POST /auth/logout.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['/auth/login'], category: 'api' },
      { type: 'tool', mustContain: ['/auth/refresh'], category: 'api' },
      { type: 'tool', mustContain: ['/auth/logout'], category: 'api' },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // MIXED CONTENT (8 cases)
  // ===========================================================================
  {
    id: 'mx-001',
    name: 'Guidelines and decisions',
    category: 'mixed-content',
    context:
      'We chose React for the frontend. Always use functional components with hooks. Never use class components.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['React', 'frontend'], category: 'decision' },
      { type: 'guideline', mustContain: ['functional component', 'hook'] },
      { type: 'guideline', mustContain: ['class component'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'mx-002',
    name: 'Facts and tools',
    category: 'mixed-content',
    context:
      'The database runs on PostgreSQL 16. Use npm run db:migrate for migrations. The connection string is in DATABASE_URL.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['PostgreSQL 16'], category: 'fact' },
      { type: 'tool', mustContain: ['npm run db:migrate'], category: 'cli' },
      { type: 'knowledge', mustContain: ['DATABASE_URL'], category: 'fact' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'mx-003',
    name: 'Decision with guideline',
    category: 'mixed-content',
    context:
      'We decided to use ESLint with strict rules. Always fix all linting errors before committing.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['ESLint', 'strict'], category: 'decision' },
      { type: 'guideline', mustContain: ['linting error', 'commit'] },
    ],
    difficulty: 'easy',
  },
  {
    id: 'mx-004',
    name: 'Complex mixed content',
    category: 'mixed-content',
    context: `Our stack:
    - Backend: Node.js with Express (decision)
    - Database: PostgreSQL (fact: runs on port 5432)
    - Always use prepared statements (guideline)
    - Deploy with: docker-compose up -d (tool)`,
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Node.js', 'Express'], category: 'decision' },
      { type: 'knowledge', mustContain: ['PostgreSQL', '5432'], category: 'fact' },
      { type: 'guideline', mustContain: ['prepared statement'] },
      { type: 'tool', mustContain: ['docker-compose'], category: 'cli' },
    ],
    difficulty: 'hard',
  },
  {
    id: 'mx-005',
    name: 'Setup instructions',
    category: 'mixed-content',
    context:
      'Clone the repo and run npm install. Node 20 is required. Always use nvm to manage versions.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['npm install'], category: 'cli' },
      { type: 'knowledge', mustContain: ['Node 20'], category: 'fact' },
      { type: 'guideline', mustContain: ['nvm', 'version'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'mx-006',
    name: 'Testing setup',
    category: 'mixed-content',
    context:
      'We use Vitest for testing (decision). Run tests with npm test. Always mock external APIs. Test coverage is at 85%.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Vitest'], category: 'decision' },
      { type: 'tool', mustContain: ['npm test'], category: 'cli' },
      { type: 'guideline', mustContain: ['mock', 'external API'] },
      { type: 'knowledge', mustContain: ['coverage', '85%'], category: 'fact' },
    ],
    difficulty: 'hard',
  },
  {
    id: 'mx-007',
    name: 'Deployment context',
    category: 'mixed-content',
    context:
      'Deploy to AWS EKS (decision). Use kubectl apply -f manifests/. Never deploy on Fridays. Current version is 2.3.0.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['AWS EKS'], category: 'decision' },
      { type: 'tool', mustContain: ['kubectl apply'], category: 'cli' },
      { type: 'guideline', mustContain: ['deploy', 'Friday'] },
      { type: 'knowledge', mustContain: ['version', '2.3.0'], category: 'fact' },
    ],
    difficulty: 'hard',
  },
  {
    id: 'mx-008',
    name: 'API design context',
    category: 'mixed-content',
    context:
      'We chose REST over GraphQL. Use GET /api/users for listing. Always return 404 for missing resources.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['REST', 'GraphQL'], category: 'decision' },
      { type: 'tool', mustContain: ['GET /api/users'], category: 'api' },
      { type: 'guideline', mustContain: ['404', 'missing'] },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // NOISE RESISTANCE (8 cases)
  // ===========================================================================
  {
    id: 'nr-001',
    name: 'Casual conversation',
    category: 'noise-resistance',
    context: 'Hey, how are you? The weather is nice today. Did you see the game last night?',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['weather', 'game'],
    difficulty: 'easy',
  },
  {
    id: 'nr-002',
    name: 'Debugging discussion',
    category: 'noise-resistance',
    context:
      'I tried console.log but it did not help. Let me check the network tab. Oh, I see the error now.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['console.log', 'network tab'],
    difficulty: 'medium',
  },
  {
    id: 'nr-003',
    name: 'Meeting scheduling',
    category: 'noise-resistance',
    context:
      'Can we meet at 3pm? Actually, 4pm works better for me. Let me send a calendar invite.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['3pm', '4pm', 'calendar'],
    difficulty: 'easy',
  },
  {
    id: 'nr-004',
    name: 'Code review comments',
    category: 'noise-resistance',
    context:
      'Nice work! I left a few comments. Can you fix the typo on line 42? Also, the variable name could be better.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['typo', 'line 42'],
    difficulty: 'medium',
  },
  {
    id: 'nr-005',
    name: 'Status update',
    category: 'noise-resistance',
    context:
      'I finished the login page yesterday. Today I am working on the dashboard. Should be done by tomorrow.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['yesterday', 'tomorrow', 'login page'],
    difficulty: 'medium',
  },
  {
    id: 'nr-006',
    name: 'Mixed signal and noise',
    category: 'noise-resistance',
    context:
      'Hey, good morning! By the way, we always use semantic versioning for releases. Anyway, did you watch the new show?',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['semantic versioning', 'release'] }],
    shouldNotExtract: ['good morning', 'show'],
    difficulty: 'hard',
  },
  {
    id: 'nr-007',
    name: 'Off-topic technical',
    category: 'noise-resistance',
    context:
      'I read an article about Rust. It seems interesting but we do not use it here. Maybe someday.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['Rust', 'article'],
    difficulty: 'medium',
  },
  {
    id: 'nr-008',
    name: 'Personal preferences',
    category: 'noise-resistance',
    context: 'I prefer VS Code but some people use Vim. It does not matter which editor you use.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['VS Code', 'Vim'],
    difficulty: 'medium',
    notes: 'Personal preferences without team standards should not be extracted',
  },

  // ===========================================================================
  // EDGE CASES (6 cases)
  // ===========================================================================
  {
    id: 'ec-001',
    name: 'Empty context',
    category: 'edge-cases',
    context: '',
    contextType: 'conversation',
    expectedEntries: [],
    difficulty: 'easy',
  },
  {
    id: 'ec-002',
    name: 'Very short context',
    category: 'edge-cases',
    context: 'Use TypeScript.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['TypeScript'] }],
    difficulty: 'medium',
  },
  {
    id: 'ec-003',
    name: 'Code snippet only',
    category: 'edge-cases',
    context: `const config = {
      port: 3000,
      host: 'localhost',
      db: 'postgresql://localhost:5432/app'
    };`,
    contextType: 'code',
    expectedEntries: [],
    shouldNotExtract: ['port', 'host'],
    difficulty: 'medium',
    notes: 'Raw code without explanation should not produce extractions',
  },
  {
    id: 'ec-004',
    name: 'Contradictory statements',
    category: 'edge-cases',
    context: 'Always use semicolons. Actually, never use semicolons - let Prettier handle it.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['semicolon', 'Prettier'] }],
    difficulty: 'hard',
    notes: 'Should extract the final/corrected guideline',
  },
  {
    id: 'ec-005',
    name: 'Question not statement',
    category: 'edge-cases',
    context: 'Should we use TypeScript? What about testing with Jest? Is React the right choice?',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['TypeScript', 'Jest', 'React'],
    difficulty: 'medium',
    notes: 'Questions should not be extracted as facts or guidelines',
  },
  {
    id: 'ec-006',
    name: 'Negated guideline',
    category: 'edge-cases',
    context: 'We do not require 100% test coverage. We do not enforce strict linting rules.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['test coverage', 'not require'] },
      { type: 'knowledge', mustContain: ['linting', 'not enforce'] },
    ],
    difficulty: 'hard',
    notes: 'Negated statements can still be valuable knowledge',
  },

  // ===========================================================================
  // CODE CONTEXT (4 cases)
  // ===========================================================================
  {
    id: 'cc-001',
    name: 'Code with inline IMPORTANT comment',
    category: 'code-context',
    context: `// IMPORTANT: Always validate user input before processing
function processUserData(data: unknown) {
  // TODO: Add rate limiting
  return data;
}`,
    contextType: 'code',
    expectedEntries: [{ type: 'guideline', mustContain: ['validate', 'user input'] }],
    difficulty: 'medium',
    notes: 'Should extract guideline from IMPORTANT comment',
  },
  {
    id: 'cc-002',
    name: 'Code with JSDoc documentation',
    category: 'code-context',
    context: `/**
 * @description Authenticates user with JWT tokens
 * @security All tokens must be validated server-side
 * @param token - The JWT token to validate
 * @returns User object if valid
 */
function authenticateUser(token: string): User {
  return validateAndDecode(token);
}`,
    contextType: 'code',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['JWT', 'token'] },
      { type: 'guideline', mustContain: ['token', 'validated', 'server'] },
    ],
    difficulty: 'hard',
    notes: 'Should extract from JSDoc @security and @description',
  },
  {
    id: 'cc-003',
    name: 'Config file patterns',
    category: 'code-context',
    context: `// tsconfig.json configuration
{
  "compilerOptions": {
    "strict": true,        // REQUIRED: Always use strict mode
    "noImplicitAny": true, // REQUIRED: No implicit any types
    "target": "ES2022"
  }
}`,
    contextType: 'code',
    expectedEntries: [
      { type: 'guideline', mustContain: ['strict', 'mode'] },
      { type: 'guideline', mustContain: ['implicit', 'any'] },
    ],
    difficulty: 'hard',
    notes: 'Should extract from config file comments',
  },
  {
    id: 'cc-004',
    name: 'Code with TODO/FIXME comments',
    category: 'code-context',
    context: `class DatabaseConnection {
  // FIXME: Connection pool size hardcoded, should be configurable
  private poolSize = 10;

  // TODO: Add retry logic with exponential backoff
  async connect() {
    return this.pool.connect();
  }
}`,
    contextType: 'code',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['connection pool', 'configurable'] },
      { type: 'knowledge', mustContain: ['retry', 'exponential backoff'] },
    ],
    difficulty: 'medium',
    notes: 'Should extract actionable items from TODO/FIXME',
  },

  // ===========================================================================
  // CONSTRAINTS (3 cases)
  // ===========================================================================
  {
    id: 'cn-001',
    name: 'API performance constraint',
    category: 'constraints',
    context:
      'The API must respond within 200ms for 99th percentile latency. Any endpoint exceeding this SLA requires optimization.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['200ms', 'latency'] }],
    difficulty: 'medium',
  },
  {
    id: 'cn-002',
    name: 'Data format constraint',
    category: 'constraints',
    context:
      'User IDs must be UUIDs, never sequential integers. This prevents enumeration attacks and information disclosure.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['UUID', 'sequential'] }],
    difficulty: 'easy',
  },
  {
    id: 'cn-003',
    name: 'Security logging constraint',
    category: 'constraints',
    context:
      'PII must never be logged. This includes email addresses, phone numbers, and IP addresses. Mask sensitive data before logging.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['PII', 'never', 'log'], category: 'security' },
      { type: 'guideline', mustContain: ['mask', 'sensitive'] },
    ],
    difficulty: 'medium',
  },

  // ===========================================================================
  // EXAMPLES (3 cases)
  // ===========================================================================
  {
    id: 'ex-001',
    name: 'Good/bad code examples',
    category: 'examples',
    context: `Error handling pattern:
Good: throw new AppError('User not found', 404);
Bad: throw new Error('error');
Always include error code and descriptive message.`,
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['error', 'code', 'message'] }],
    difficulty: 'medium',
    notes: 'Should extract the pattern with examples',
  },
  {
    id: 'ex-002',
    name: 'Pattern with example',
    category: 'examples',
    context:
      'Use the repository pattern for data access. For example, UserRepository handles all user-related database operations, ProductRepository for products.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['repository pattern', 'data access'] },
      { type: 'knowledge', mustContain: ['UserRepository', 'user'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'ex-003',
    name: 'Anti-pattern example',
    category: 'examples',
    context:
      'Avoid the God object anti-pattern. Bad example: UserManager class with 50+ methods handling authentication, profile, billing, and notifications. Split into focused services.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['God object', 'avoid'] },
      { type: 'guideline', mustContain: ['focused', 'service'] },
    ],
    difficulty: 'hard',
  },

  // ===========================================================================
  // SOURCE ATTRIBUTION (3 cases)
  // ===========================================================================
  {
    id: 'sa-001',
    name: 'External RFC reference',
    category: 'source-attribution',
    context:
      'According to RFC 7807, all API error responses should include a type URI, title, status, and detail field. We follow this standard.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['RFC 7807', 'error response'] }],
    difficulty: 'medium',
    notes: 'Should capture the RFC reference as source',
  },
  {
    id: 'sa-002',
    name: 'Internal ADR reference',
    category: 'source-attribution',
    context:
      'Per ADR-003, we use event sourcing for the order management domain. This was decided in Q2 2024 to support audit requirements.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['ADR-003', 'event sourcing'], category: 'decision' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'sa-003',
    name: 'Link reference',
    category: 'source-attribution',
    context:
      'For deployment procedures, see https://docs.internal.com/deployment. All deployments must follow the runbook documented there.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'knowledge', mustContain: ['deployment', 'runbook'] }],
    difficulty: 'easy',
  },

  // ===========================================================================
  // MCP/FUNCTION TOOLS (4 cases)
  // ===========================================================================
  {
    id: 'tf-001',
    name: 'MCP tool definition',
    category: 'tools-mcp',
    context:
      'Use the memory_query MCP tool with action: context to load project context at conversation start. Always include inherit: true.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['memory_query', 'context'], category: 'mcp' },
      { type: 'guideline', mustContain: ['inherit: true'] },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tf-002',
    name: 'Function signature',
    category: 'tools-function',
    context:
      'Call validateInput(data: unknown): Result<T> to validate all incoming data. It returns either Ok<T> or Err<ValidationError>.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['validateInput', 'Result'], category: 'function' },
    ],
    difficulty: 'medium',
  },
  {
    id: 'tf-003',
    name: 'API with body params',
    category: 'tools-api',
    context:
      'POST /api/users with body {name: string, email: string, role: "admin" | "user"}. Returns 201 with the created user object.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'tool', mustContain: ['POST', '/api/users'], category: 'api' }],
    difficulty: 'easy',
  },
  {
    id: 'tf-004',
    name: 'CLI with flags',
    category: 'tools-cli',
    context:
      'Use `npm run build -- --watch --sourcemap` for development builds with live reload and debugging support.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['npm run build', '--watch', '--sourcemap'], category: 'cli' },
    ],
    difficulty: 'easy',
  },

  // ===========================================================================
  // CONFIDENCE LEVELS (3 cases)
  // ===========================================================================
  {
    id: 'cl-001',
    name: 'High confidence fact',
    category: 'confidence-levels',
    context: 'The production database is PostgreSQL 16.1 running on AWS RDS in us-east-1a.',
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['PostgreSQL 16.1', 'RDS'],
        category: 'fact',
        confidence: 0.9,
      },
    ],
    difficulty: 'easy',
  },
  {
    id: 'cl-002',
    name: 'Uncertain knowledge',
    category: 'confidence-levels',
    context:
      'I think the API timeout is set to 30 seconds, but I need to verify this with the infrastructure team.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['timeout', '30 seconds'], confidence: 0.5 },
    ],
    difficulty: 'medium',
    notes: 'Should extract with low confidence due to uncertainty markers',
  },
  {
    id: 'cl-003',
    name: 'Tentative decision',
    category: 'confidence-levels',
    context:
      'We are leaning towards using Redis for the cache layer, but this is not final. Need to evaluate Memcached as well.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Redis', 'cache'], category: 'context', confidence: 0.6 },
    ],
    difficulty: 'hard',
    notes: 'Tentative decisions should be extracted with medium confidence',
  },

  // ===========================================================================
  // ADVERSARIAL: INFORMAL SPEECH (5 cases)
  // ===========================================================================
  {
    id: 'adv-is-001',
    name: 'Informal speech - slang and abbreviations',
    category: 'informal-speech',
    context:
      'yo so basically we gotta use typescript strict mode, its like super important. also dont use any type lol',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['TypeScript', 'strict'] },
      { type: 'guideline', mustContain: ['any', 'type'] },
    ],
    difficulty: 'hard',
    notes: 'Should extract guidelines despite casual language',
  },
  {
    id: 'adv-is-002',
    name: 'Informal speech - casual tech chat',
    category: 'informal-speech',
    context:
      'btw the db is postgres running on rds, probs version 15 or smth. works pretty well tbh',
    contextType: 'conversation',
    expectedEntries: [{ type: 'knowledge', mustContain: ['PostgreSQL', 'RDS'] }],
    difficulty: 'hard',
    notes: 'Extract facts from abbreviations and casual language',
  },
  {
    id: 'adv-is-003',
    name: 'Informal speech - emoji and expressions',
    category: 'informal-speech',
    context:
      'omg yes!! always run tests before pushing :) its like rule #1 around here haha. srsly tho, CI will fail if u dont',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['test', 'push'] }],
    difficulty: 'hard',
    notes: 'Extract guideline despite emojis and expressions',
  },
  {
    id: 'adv-is-004',
    name: 'Informal speech - phonetic spelling',
    category: 'informal-speech',
    context:
      'u kno wat, we shud prolly use react hooks instead of class components. its way better 4 state mgmt',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['React', 'hooks'] }],
    difficulty: 'hard',
    notes: 'Handle phonetic/text-speak spelling',
  },
  {
    id: 'adv-is-005',
    name: 'Informal speech - mixed formality',
    category: 'informal-speech',
    context:
      'The authentication flow uses JWT tokens (pretty standard stuff). oh and make sure to validate on server side cuz client validation is kinda pointless lol',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['JWT', 'authentication'] },
      { type: 'guideline', mustContain: ['validate', 'server'] },
    ],
    difficulty: 'hard',
    notes: 'Mixed formal and informal language',
  },

  // ===========================================================================
  // ADVERSARIAL: TYPOS AND FRAGMENTS (5 cases)
  // ===========================================================================
  {
    id: 'adv-tf-001',
    name: 'Typos - common misspellings',
    category: 'typos-fragments',
    context: 'We use Typescirpt for all frotend code. The databse is Postgress on AWS.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['TypeScript', 'frontend'] },
      { type: 'knowledge', mustContain: ['PostgreSQL', 'AWS'] },
    ],
    difficulty: 'hard',
    notes: 'Should recognize misspelled technology names',
  },
  {
    id: 'adv-tf-002',
    name: 'Fragments - incomplete sentences',
    category: 'typos-fragments',
    context: 'For deployment... npm run deploy. Never on Fridays though. Also the staging env -',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['npm', 'deploy'] },
      { type: 'guideline', mustContain: ['Friday', 'deploy'] },
    ],
    difficulty: 'hard',
    notes: 'Extract from incomplete/truncated text',
  },
  {
    id: 'adv-tf-003',
    name: 'Typos - keyboard adjacent errors',
    category: 'typos-fragments',
    context: 'teh api runs on poirt 3000. authetication uses jwts. aslways validate inptu.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['API', 'port', '3000'] },
      { type: 'knowledge', mustContain: ['JWT', 'authentication'] },
      { type: 'guideline', mustContain: ['validate', 'input'] },
    ],
    difficulty: 'hard',
    notes: 'Handle keyboard-adjacent typos (teh, poirt, etc)',
  },
  {
    id: 'adv-tf-004',
    name: 'Fragments - bullet point style',
    category: 'typos-fragments',
    context: '- postgres\n- redis for cache\n- node 20\n- strict mode\n- tests required',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['PostgreSQL'] },
      { type: 'knowledge', mustContain: ['Redis', 'cache'] },
      { type: 'knowledge', mustContain: ['Node', '20'] },
    ],
    difficulty: 'medium',
    notes: 'Extract from minimal bullet points',
  },
  {
    id: 'adv-tf-005',
    name: 'Typos - autocorrect errors',
    category: 'typos-fragments',
    context:
      'We use Reactive instead of Angular. The Docs server runs on port 8080. Always commit with descriptive massages.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['React', 'Angular'] },
      { type: 'knowledge', mustContain: ['Docker', 'port', '8080'] },
      { type: 'guideline', mustContain: ['commit', 'message'] },
    ],
    difficulty: 'hard',
    notes: 'Autocorrect changed React->Reactive, Docker->Docs, messages->massages',
  },

  // ===========================================================================
  // ADVERSARIAL: ENTANGLED FACTS (5 cases)
  // ===========================================================================
  {
    id: 'adv-ef-001',
    name: 'Entangled facts - parenthetical info',
    category: 'entangled-facts',
    context:
      'Our API (which runs on port 3000 btw) uses REST (not GraphQL despite what some people think) and requires authentication (JWT with RS256).',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['API', 'port', '3000'] },
      { type: 'knowledge', mustContain: ['REST'] },
      { type: 'knowledge', mustContain: ['JWT', 'RS256'] },
    ],
    difficulty: 'hard',
    notes: 'Multiple facts embedded in parentheticals',
  },
  {
    id: 'adv-ef-002',
    name: 'Entangled facts - run-on sentence',
    category: 'entangled-facts',
    context:
      'So we use PostgreSQL for the main database but Redis handles caching and sessions while Elasticsearch powers search and the whole thing runs on Kubernetes in AWS with Terraform managing infrastructure.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['PostgreSQL', 'database'] },
      { type: 'knowledge', mustContain: ['Redis', 'caching'] },
      { type: 'knowledge', mustContain: ['Elasticsearch', 'search'] },
      { type: 'knowledge', mustContain: ['Kubernetes', 'AWS'] },
    ],
    difficulty: 'hard',
    notes: 'Multiple facts in one run-on sentence',
  },
  {
    id: 'adv-ef-003',
    name: 'Entangled facts - nested clauses',
    category: 'entangled-facts',
    context:
      'The service, which was written in Go because we needed performance, connects to the database (PostgreSQL, naturally) using connection pooling that the DevOps team configured.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Go', 'performance'] },
      { type: 'knowledge', mustContain: ['PostgreSQL'] },
      { type: 'knowledge', mustContain: ['connection', 'pooling'] },
    ],
    difficulty: 'hard',
    notes: 'Facts buried in nested clauses',
  },
  {
    id: 'adv-ef-004',
    name: 'Entangled facts - comparison context',
    category: 'entangled-facts',
    context:
      'Unlike the old system that used MongoDB and was deployed on Heroku, we now use PostgreSQL on AWS RDS with Docker containers orchestrated by ECS.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['PostgreSQL', 'RDS'] },
      { type: 'knowledge', mustContain: ['Docker', 'ECS'] },
    ],
    shouldNotExtract: ['MongoDB', 'Heroku'],
    difficulty: 'hard',
    notes: 'Current facts mixed with deprecated facts',
  },
  {
    id: 'adv-ef-005',
    name: 'Entangled facts - conditional context',
    category: 'entangled-facts',
    context:
      'When deploying to production (not staging which uses different settings) you need to use the npm run deploy:prod command and make sure the VPN is connected unless you are in the office network.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'tool', mustContain: ['npm', 'deploy:prod'] },
      { type: 'guideline', mustContain: ['VPN', 'production'] },
    ],
    difficulty: 'hard',
    notes: 'Facts with conditional qualifiers',
  },

  // ===========================================================================
  // ADVERSARIAL: SUGGESTIONS VS STANDARDS (5 cases)
  // ===========================================================================
  {
    id: 'adv-ss-001',
    name: 'Suggestions vs standards - personal preference',
    category: 'suggestions-vs-standards',
    context:
      'I personally think we should use Prettier for formatting. It makes the code look nicer.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['Prettier', 'formatting'],
    difficulty: 'hard',
    notes: 'Personal opinion should not become a guideline',
  },
  {
    id: 'adv-ss-002',
    name: 'Suggestions vs standards - team standard',
    category: 'suggestions-vs-standards',
    context: 'The team has decided that we use Prettier for formatting. This is now our standard.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['Prettier', 'formatting'] }],
    difficulty: 'medium',
    notes: 'Explicit team decision is a guideline',
  },
  {
    id: 'adv-ss-003',
    name: 'Suggestions vs standards - maybe/might',
    category: 'suggestions-vs-standards',
    context:
      'We might want to consider using TypeScript strict mode. It could help catch more bugs maybe.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['TypeScript', 'strict'],
    difficulty: 'hard',
    notes: 'Uncertain suggestions should not become guidelines',
  },
  {
    id: 'adv-ss-004',
    name: 'Suggestions vs standards - proposal',
    category: 'suggestions-vs-standards',
    context:
      'I propose that all new services use GraphQL instead of REST. This is still up for discussion in next weeks meeting.',
    contextType: 'conversation',
    expectedEntries: [],
    shouldNotExtract: ['GraphQL', 'REST'],
    difficulty: 'hard',
    notes: 'Proposals pending discussion are not standards',
  },
  {
    id: 'adv-ss-005',
    name: 'Suggestions vs standards - approved proposal',
    category: 'suggestions-vs-standards',
    context:
      'After discussion, the team approved using GraphQL for all new services. REST endpoints will be deprecated.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['GraphQL', 'services'] },
      { type: 'knowledge', mustContain: ['REST', 'deprecated'] },
    ],
    difficulty: 'medium',
    notes: 'Approved proposal becomes a guideline',
  },

  // ===========================================================================
  // ADVERSARIAL: IMPLICIT IN EXPLICIT (5 cases)
  // ===========================================================================
  {
    id: 'adv-ie-001',
    name: 'Implicit in explicit - reliability statement',
    category: 'implicit-in-explicit',
    context: 'We use PostgreSQL because it provides excellent reliability and ACID compliance.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['PostgreSQL'] },
      { type: 'guideline', mustContain: ['ACID', 'reliability'] },
    ],
    difficulty: 'hard',
    notes: 'Implicit guideline about ACID/reliability requirements hidden in fact',
  },
  {
    id: 'adv-ie-002',
    name: 'Implicit in explicit - security context',
    category: 'implicit-in-explicit',
    context:
      'The payment service handles credit card data, so it runs in an isolated VPC with encryption at rest.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['payment', 'VPC'] },
      { type: 'guideline', mustContain: ['credit card', 'encryption'] },
    ],
    difficulty: 'hard',
    notes: 'Implicit security guideline in architecture fact',
  },
  {
    id: 'adv-ie-003',
    name: 'Implicit in explicit - performance choice',
    category: 'implicit-in-explicit',
    context: 'The search feature uses Elasticsearch to ensure sub-second response times.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Elasticsearch', 'search'] },
      { type: 'guideline', mustContain: ['response time', 'sub-second'] },
    ],
    difficulty: 'hard',
    notes: 'Implicit performance requirement in technology choice',
  },
  {
    id: 'adv-ie-004',
    name: 'Implicit in explicit - compliance reason',
    category: 'implicit-in-explicit',
    context: 'User data is stored in the EU region due to GDPR requirements.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['EU', 'region'] },
      { type: 'guideline', mustContain: ['GDPR', 'data'] },
    ],
    difficulty: 'hard',
    notes: 'Implicit compliance guideline in storage fact',
  },
  {
    id: 'adv-ie-005',
    name: 'Implicit in explicit - scalability architecture',
    category: 'implicit-in-explicit',
    context: 'We chose microservices architecture to handle the expected growth to 10M users.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['microservices'] },
      { type: 'knowledge', mustContain: ['10M', 'users'] },
    ],
    difficulty: 'hard',
    notes: 'Implicit scalability requirement in architecture decision',
  },

  // ===========================================================================
  // ADVERSARIAL: TEMPORAL CONFLICTS (5 cases)
  // ===========================================================================
  {
    id: 'adv-tc-001',
    name: 'Temporal conflicts - framework change',
    category: 'temporal-conflicts',
    context:
      'We used to use Angular for everything. As of last month, all new development uses React. Angular code is being migrated.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['React', 'new'] },
      { type: 'knowledge', mustContain: ['Angular', 'migrat'] },
    ],
    difficulty: 'hard',
    notes: 'Should prioritize current state (React) over historical (Angular)',
  },
  {
    id: 'adv-tc-002',
    name: 'Temporal conflicts - policy update',
    category: 'temporal-conflicts',
    context:
      'The old policy required 3 reviewers for PRs. We changed this to 2 reviewers last sprint because it was slowing us down.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'guideline', mustContain: ['2', 'reviewer'] }],
    shouldNotExtract: ['3 reviewers'],
    difficulty: 'hard',
    notes: 'Should extract current policy, not old one',
  },
  {
    id: 'adv-tc-003',
    name: 'Temporal conflicts - deprecation',
    category: 'temporal-conflicts',
    context:
      'The v1 API is deprecated. Use v2 API for all new integrations. v1 will be removed in 6 months.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'guideline', mustContain: ['v2', 'API'] },
      { type: 'knowledge', mustContain: ['v1', 'deprecated'] },
    ],
    difficulty: 'medium',
    notes: 'Should capture both current recommendation and deprecation status',
  },
  {
    id: 'adv-tc-004',
    name: 'Temporal conflicts - reversed decision',
    category: 'temporal-conflicts',
    context:
      'Initially we decided to use MongoDB. After performance testing, we reversed this and went with PostgreSQL instead.',
    contextType: 'conversation',
    expectedEntries: [{ type: 'knowledge', mustContain: ['PostgreSQL'] }],
    shouldNotExtract: ['MongoDB'],
    difficulty: 'hard',
    notes: 'Should only extract final decision, not reversed one',
  },
  {
    id: 'adv-tc-005',
    name: 'Temporal conflicts - incremental updates',
    category: 'temporal-conflicts',
    context:
      'Node 16 is EOL. We upgraded to Node 18 last quarter. Planning to move to Node 20 next month.',
    contextType: 'conversation',
    expectedEntries: [
      { type: 'knowledge', mustContain: ['Node', '18'] },
      { type: 'knowledge', mustContain: ['Node', '20', 'planning'] },
    ],
    shouldNotExtract: ['Node 16'],
    difficulty: 'hard',
    notes: 'Should extract current (18) and planned (20), not EOL version',
  },
];

/**
 * Get test cases by category
 */
export function getTestCasesByCategory(category: string): ExtractionTestCase[] {
  return EXTRACTION_TEST_CASES.filter((tc) => tc.category === category);
}

/**
 * Get test cases by difficulty
 */
export function getTestCasesByDifficulty(
  difficulty: 'easy' | 'medium' | 'hard'
): ExtractionTestCase[] {
  return EXTRACTION_TEST_CASES.filter((tc) => tc.difficulty === difficulty);
}

/**
 * Get dataset statistics
 */
export function getDatasetStats() {
  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  let totalExpectedEntries = 0;

  for (const tc of EXTRACTION_TEST_CASES) {
    byCategory[tc.category] = (byCategory[tc.category] || 0) + 1;
    byDifficulty[tc.difficulty] = (byDifficulty[tc.difficulty] || 0) + 1;
    totalExpectedEntries += tc.expectedEntries.length;
  }

  return {
    totalTestCases: EXTRACTION_TEST_CASES.length,
    totalExpectedEntries,
    byCategory,
    byDifficulty,
  };
}

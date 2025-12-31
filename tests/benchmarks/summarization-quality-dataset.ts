/**
 * Summarization Quality Benchmark Dataset
 *
 * Test cases for evaluating summarization quality using ROUGE, BERTScore,
 * and Groundedness metrics.
 */

import type { SummarizationTestCase } from './summarization-quality-types.js';

/**
 * Full dataset of summarization test cases
 */
export const SUMMARIZATION_TEST_CASES: SummarizationTestCase[] = [
  // ==========================================================================
  // SIMPLE AGGREGATION (Easy)
  // ==========================================================================
  {
    id: 'sum-001',
    name: 'Simple fact aggregation - database config',
    category: 'simple-aggregation',
    sourceEntries: [
      { type: 'knowledge', content: 'PostgreSQL is our primary database.' },
      { type: 'knowledge', content: 'Database runs on port 5432.' },
      { type: 'knowledge', content: 'We use AWS RDS for hosting.' },
    ],
    expectedSummary: 'PostgreSQL database hosted on AWS RDS, running on port 5432.',
    mustContainKeywords: ['PostgreSQL', 'RDS', '5432'],
    difficulty: 'easy',
  },
  {
    id: 'sum-002',
    name: 'Simple fact aggregation - API config',
    category: 'simple-aggregation',
    sourceEntries: [
      { type: 'knowledge', content: 'The API uses REST architecture.' },
      { type: 'knowledge', content: 'All endpoints require authentication.' },
      { type: 'knowledge', content: 'Rate limiting is set to 100 requests per minute.' },
    ],
    expectedSummary: 'REST API with mandatory authentication and 100 req/min rate limit.',
    mustContainKeywords: ['REST', 'authentication', 'rate limit'],
    difficulty: 'easy',
  },
  {
    id: 'sum-003',
    name: 'Simple guideline aggregation',
    category: 'simple-aggregation',
    sourceEntries: [
      { type: 'guideline', content: 'Always use TypeScript strict mode.' },
      { type: 'guideline', content: 'Never use any type.' },
      { type: 'guideline', content: 'Prefer interfaces over type aliases.' },
    ],
    expectedSummary: 'Use TypeScript strict mode, avoid any type, prefer interfaces.',
    mustContainKeywords: ['strict', 'any', 'interface'],
    difficulty: 'easy',
  },

  // ==========================================================================
  // MIXED TYPES (Medium)
  // ==========================================================================
  {
    id: 'sum-010',
    name: 'Mixed types - authentication system',
    category: 'mixed-types',
    sourceEntries: [
      { type: 'knowledge', content: 'We use JWT tokens for authentication.' },
      { type: 'guideline', content: 'Always validate tokens on the server side.' },
      { type: 'tool', content: 'Use auth-cli validate-token command to test tokens.' },
      { type: 'knowledge', content: 'Tokens expire after 24 hours.' },
    ],
    mustContainKeywords: ['JWT', 'token', 'validate', '24 hours'],
    difficulty: 'medium',
  },
  {
    id: 'sum-011',
    name: 'Mixed types - deployment process',
    category: 'mixed-types',
    sourceEntries: [
      { type: 'guideline', content: 'Always run tests before deploying.' },
      { type: 'tool', content: 'npm run deploy -- --env production' },
      { type: 'knowledge', content: 'Deployments are automated via GitHub Actions.' },
      { type: 'guideline', content: 'Never deploy on Fridays.' },
      { type: 'knowledge', content: 'Staging environment is at staging.example.com.' },
    ],
    mustContainKeywords: ['tests', 'deploy', 'GitHub Actions', 'Friday'],
    difficulty: 'medium',
  },

  // ==========================================================================
  // HIERARCHICAL (Medium)
  // ==========================================================================
  {
    id: 'sum-020',
    name: 'Hierarchical - API layer structure',
    category: 'hierarchical',
    sourceEntries: [
      { type: 'knowledge', content: 'The API layer has three sub-layers: controllers, services, and repositories.', category: 'architecture' },
      { type: 'knowledge', content: 'Controllers handle HTTP requests and responses.', category: 'architecture' },
      { type: 'knowledge', content: 'Services contain business logic.', category: 'architecture' },
      { type: 'knowledge', content: 'Repositories manage database access.', category: 'architecture' },
      { type: 'guideline', content: 'Never access repositories directly from controllers.' },
    ],
    mustContainKeywords: ['controller', 'service', 'repository', 'layer'],
    difficulty: 'medium',
  },
  {
    id: 'sum-021',
    name: 'Hierarchical - error handling chain',
    category: 'hierarchical',
    sourceEntries: [
      { type: 'knowledge', content: 'Errors flow up from repositories to services to controllers.' },
      { type: 'guideline', content: 'Repositories throw DatabaseError.' },
      { type: 'guideline', content: 'Services catch DatabaseError and throw BusinessError.' },
      { type: 'guideline', content: 'Controllers catch BusinessError and return HTTP error responses.' },
      { type: 'knowledge', content: 'All errors are logged at the controller level.' },
    ],
    mustContainKeywords: ['error', 'catch', 'throw'],
    difficulty: 'medium',
  },

  // ==========================================================================
  // CONTRADICTION HANDLING (Hard)
  // ==========================================================================
  {
    id: 'sum-030',
    name: 'Contradiction - deprecated vs new approach',
    category: 'contradiction-handling',
    sourceEntries: [
      { type: 'knowledge', content: 'We previously used MongoDB for the user database.' },
      { type: 'knowledge', content: 'We now use PostgreSQL for the user database.' },
      { type: 'guideline', content: 'All new code should use PostgreSQL.' },
      { type: 'knowledge', content: 'MongoDB is deprecated and scheduled for removal.' },
    ],
    mustContainKeywords: ['PostgreSQL', 'MongoDB', 'deprecated'],
    difficulty: 'hard',
    notes: 'Should acknowledge the transition from MongoDB to PostgreSQL',
  },
  {
    id: 'sum-031',
    name: 'Contradiction - conflicting guidelines',
    category: 'contradiction-handling',
    sourceEntries: [
      { type: 'guideline', content: 'Use camelCase for all variable names.' },
      { type: 'guideline', content: 'Use snake_case for database column names.' },
      { type: 'guideline', content: 'API responses should match database column names.' },
      { type: 'knowledge', content: 'There is ongoing discussion about unifying naming conventions.' },
    ],
    mustContainKeywords: ['camelCase', 'snake_case'],
    difficulty: 'hard',
    notes: 'Should note the naming convention conflict',
  },

  // ==========================================================================
  // NOISE RESISTANCE (Hard)
  // ==========================================================================
  {
    id: 'sum-040',
    name: 'Noise resistance - relevant + irrelevant',
    category: 'noise-resistance',
    sourceEntries: [
      { type: 'knowledge', content: 'The authentication service uses OAuth 2.0.' },
      { type: 'knowledge', content: 'Today is a nice day for coding.' },
      { type: 'knowledge', content: 'JWT tokens are signed with RS256 algorithm.' },
      { type: 'knowledge', content: 'The office coffee machine was fixed yesterday.' },
      { type: 'guideline', content: 'Always verify token signatures.' },
    ],
    mustContainKeywords: ['OAuth', 'JWT', 'RS256', 'signature'],
    difficulty: 'hard',
    notes: 'Should filter out irrelevant entries about weather and coffee',
  },
  {
    id: 'sum-041',
    name: 'Noise resistance - meta comments',
    category: 'noise-resistance',
    sourceEntries: [
      { type: 'knowledge', content: 'TODO: Review this section later.' },
      { type: 'knowledge', content: 'The caching layer uses Redis.' },
      { type: 'knowledge', content: 'NOTE: This might change soon.' },
      { type: 'knowledge', content: 'Redis is configured with a 1-hour TTL.' },
      { type: 'knowledge', content: 'I need to remember to update this.' },
    ],
    mustContainKeywords: ['Redis', 'caching', 'TTL'],
    difficulty: 'hard',
    notes: 'Should filter out meta comments and focus on actual content',
  },

  // ==========================================================================
  // LARGE SCALE (Hard)
  // ==========================================================================
  {
    id: 'sum-050',
    name: 'Large scale - comprehensive API documentation',
    category: 'large-scale',
    sourceEntries: [
      { type: 'knowledge', content: 'The API supports GET, POST, PUT, DELETE methods.' },
      { type: 'knowledge', content: 'All endpoints are versioned with /v1 prefix.' },
      { type: 'knowledge', content: 'Authentication uses Bearer tokens.' },
      { type: 'knowledge', content: 'Rate limiting is 100 requests per minute.' },
      { type: 'knowledge', content: 'Responses are in JSON format.' },
      { type: 'knowledge', content: 'Errors follow RFC 7807 Problem Details format.' },
      { type: 'guideline', content: 'Always include Content-Type header.' },
      { type: 'guideline', content: 'Use pagination for list endpoints.' },
      { type: 'guideline', content: 'Include ETag headers for caching.' },
      { type: 'tool', content: 'Use curl for API testing: curl -H "Authorization: Bearer $TOKEN" https://api.example.com/v1/users' },
      { type: 'knowledge', content: 'The users endpoint returns paginated results.' },
      { type: 'knowledge', content: 'Maximum page size is 100 items.' },
    ],
    mustContainKeywords: ['API', 'Bearer', 'JSON', 'pagination'],
    difficulty: 'hard',
  },
  {
    id: 'sum-051',
    name: 'Large scale - project setup guide',
    category: 'large-scale',
    sourceEntries: [
      { type: 'tool', content: 'npm install' },
      { type: 'tool', content: 'npm run setup:env' },
      { type: 'tool', content: 'npm run db:migrate' },
      { type: 'tool', content: 'npm run db:seed' },
      { type: 'tool', content: 'npm run dev' },
      { type: 'knowledge', content: 'Node.js 18+ is required.' },
      { type: 'knowledge', content: 'PostgreSQL 14+ is required.' },
      { type: 'knowledge', content: 'Redis 6+ is required for caching.' },
      { type: 'guideline', content: 'Always run migrations before starting.' },
      { type: 'guideline', content: 'Use .env.local for local overrides.' },
      { type: 'knowledge', content: 'The dev server runs on port 3000.' },
      { type: 'knowledge', content: 'Hot reload is enabled by default.' },
    ],
    mustContainKeywords: ['npm', 'Node.js', 'PostgreSQL', 'migrate'],
    difficulty: 'hard',
  },

  // ==========================================================================
  // TEMPORAL (Medium)
  // ==========================================================================
  {
    id: 'sum-060',
    name: 'Temporal - version history',
    category: 'temporal',
    sourceEntries: [
      { type: 'knowledge', content: 'Version 1.0 was released in January 2024.' },
      { type: 'knowledge', content: 'Version 2.0 added GraphQL support in March 2024.' },
      { type: 'knowledge', content: 'Version 2.1 fixed security vulnerabilities in April 2024.' },
      { type: 'knowledge', content: 'Version 3.0 is planned for Q1 2025.' },
    ],
    mustContainKeywords: ['version', '2024', 'GraphQL'],
    difficulty: 'medium',
  },
  {
    id: 'sum-061',
    name: 'Temporal - deprecation timeline',
    category: 'temporal',
    sourceEntries: [
      { type: 'knowledge', content: 'The legacy API was deprecated on June 1, 2024.' },
      { type: 'guideline', content: 'Migrate to the new API before December 31, 2024.' },
      { type: 'knowledge', content: 'Legacy API will be removed on January 15, 2025.' },
      { type: 'tool', content: 'Use migration-helper tool to identify deprecated calls.' },
    ],
    mustContainKeywords: ['deprecated', 'migrate', '2024', '2025'],
    difficulty: 'medium',
  },

  // ==========================================================================
  // DOMAIN SPECIFIC (Medium)
  // ==========================================================================
  {
    id: 'sum-070',
    name: 'Domain specific - financial calculations',
    category: 'domain-specific',
    sourceEntries: [
      { type: 'knowledge', content: 'Interest is calculated using compound interest formula.' },
      { type: 'knowledge', content: 'APR must be converted to daily rate for calculations.' },
      { type: 'guideline', content: 'Always use Decimal type for monetary values.' },
      { type: 'guideline', content: 'Round to 2 decimal places for display.' },
      { type: 'knowledge', content: 'Tax calculations use 21% VAT rate.' },
    ],
    mustContainKeywords: ['interest', 'Decimal', 'VAT'],
    difficulty: 'medium',
  },
  {
    id: 'sum-071',
    name: 'Domain specific - healthcare data',
    category: 'domain-specific',
    sourceEntries: [
      { type: 'guideline', content: 'All PHI data must be encrypted at rest.' },
      { type: 'guideline', content: 'HIPAA compliance is mandatory.' },
      { type: 'knowledge', content: 'Patient records use HL7 FHIR format.' },
      { type: 'guideline', content: 'Access logs must be retained for 7 years.' },
      { type: 'knowledge', content: 'Data is stored in a HIPAA-compliant AWS region.' },
    ],
    mustContainKeywords: ['PHI', 'HIPAA', 'encrypted', 'FHIR'],
    difficulty: 'medium',
  },

  // ==========================================================================
  // HEAVY COMPRESSION (Hard) - 20-50 source entries
  // ==========================================================================
  {
    id: 'sum-100',
    name: 'Heavy compression - microservices architecture',
    category: 'heavy-compression',
    sourceEntries: [
      { type: 'knowledge', content: 'The system uses a microservices architecture.' },
      { type: 'knowledge', content: 'There are 12 core services.' },
      { type: 'knowledge', content: 'User service handles authentication and profiles.' },
      { type: 'knowledge', content: 'Order service manages shopping cart and checkout.' },
      { type: 'knowledge', content: 'Payment service integrates with Stripe and PayPal.' },
      { type: 'knowledge', content: 'Inventory service tracks stock levels.' },
      { type: 'knowledge', content: 'Shipping service calculates delivery options.' },
      { type: 'knowledge', content: 'Notification service sends emails and SMS.' },
      { type: 'knowledge', content: 'Analytics service collects usage metrics.' },
      { type: 'knowledge', content: 'Search service uses Elasticsearch.' },
      { type: 'knowledge', content: 'Media service handles image uploads.' },
      { type: 'knowledge', content: 'Review service manages product reviews.' },
      { type: 'knowledge', content: 'Recommendation service uses ML models.' },
      { type: 'guideline', content: 'Services communicate via gRPC.' },
      { type: 'guideline', content: 'Each service has its own database.' },
      { type: 'guideline', content: 'Use circuit breakers for resilience.' },
      { type: 'knowledge', content: 'Kubernetes orchestrates all services.' },
      { type: 'knowledge', content: 'Istio provides service mesh.' },
      { type: 'knowledge', content: 'Prometheus monitors all services.' },
      { type: 'knowledge', content: 'Jaeger provides distributed tracing.' },
      { type: 'tool', content: 'kubectl get pods -n production' },
      { type: 'tool', content: 'istioctl analyze' },
      { type: 'knowledge', content: 'Each service team has 3-5 engineers.' },
      { type: 'knowledge', content: 'Services are deployed independently.' },
      { type: 'guideline', content: 'All APIs must be versioned.' },
    ],
    mustContainKeywords: ['microservices', 'Kubernetes', 'gRPC'],
    difficulty: 'hard',
    notes: 'Must compress 25 entries into coherent summary',
  },
  {
    id: 'sum-101',
    name: 'Heavy compression - complete onboarding guide',
    category: 'heavy-compression',
    sourceEntries: [
      { type: 'knowledge', content: 'Welcome to the engineering team!' },
      { type: 'tool', content: 'Request access to GitHub org via IT portal.' },
      { type: 'tool', content: 'Install Slack and join #engineering channel.' },
      { type: 'tool', content: 'Set up 1Password for credentials.' },
      { type: 'tool', content: 'Clone the monorepo: git clone git@github.com:company/mono.git' },
      { type: 'tool', content: 'Install Node.js 20 via nvm.' },
      { type: 'tool', content: 'Install Docker Desktop.' },
      { type: 'tool', content: 'Run npm install in project root.' },
      { type: 'tool', content: 'Copy .env.example to .env.local' },
      { type: 'tool', content: 'Request AWS credentials from DevOps.' },
      { type: 'tool', content: 'Install AWS CLI and configure profile.' },
      { type: 'tool', content: 'Run docker-compose up -d for local services.' },
      { type: 'tool', content: 'Run npm run db:migrate to set up database.' },
      { type: 'tool', content: 'Run npm run dev to start development server.' },
      { type: 'knowledge', content: 'Development server runs on localhost:3000.' },
      { type: 'guideline', content: 'Create feature branches from main.' },
      { type: 'guideline', content: 'All PRs require 2 approvals.' },
      { type: 'guideline', content: 'Run tests before pushing: npm test' },
      { type: 'guideline', content: 'Follow conventional commits format.' },
      { type: 'knowledge', content: 'CI/CD runs on every push.' },
      { type: 'knowledge', content: 'Staging deploys automatically from main.' },
      { type: 'guideline', content: 'Production deploys require manual approval.' },
      { type: 'knowledge', content: 'On-call rotation starts after 3 months.' },
      { type: 'tool', content: 'Join PagerDuty and configure notifications.' },
      { type: 'knowledge', content: 'Sprint planning is every Monday.' },
      { type: 'knowledge', content: 'Standups are at 10am daily.' },
      { type: 'knowledge', content: 'Retrospectives are bi-weekly.' },
      { type: 'guideline', content: 'Document all decisions in Notion.' },
      { type: 'knowledge', content: 'Architecture diagrams are in Miro.' },
      { type: 'tool', content: 'Bookmark the runbook: notion.so/runbooks' },
    ],
    mustContainKeywords: ['GitHub', 'Docker', 'npm', 'PR'],
    difficulty: 'hard',
    notes: 'Must compress 30 onboarding steps into actionable summary',
  },
  {
    id: 'sum-102',
    name: 'Heavy compression - security policies',
    category: 'heavy-compression',
    sourceEntries: [
      { type: 'guideline', content: 'All passwords must be at least 16 characters.' },
      { type: 'guideline', content: 'Enable 2FA on all accounts.' },
      { type: 'guideline', content: 'Never share credentials via Slack.' },
      { type: 'guideline', content: 'Use 1Password for all secrets.' },
      { type: 'guideline', content: 'Rotate API keys every 90 days.' },
      { type: 'guideline', content: 'Never commit secrets to git.' },
      { type: 'tool', content: 'Use git-secrets to prevent leaks.' },
      { type: 'guideline', content: 'All data at rest must be encrypted.' },
      { type: 'guideline', content: 'Use TLS 1.3 for all connections.' },
      { type: 'guideline', content: 'Validate all user input.' },
      { type: 'guideline', content: 'Use parameterized queries for SQL.' },
      { type: 'guideline', content: 'Sanitize output to prevent XSS.' },
      { type: 'guideline', content: 'Implement rate limiting on all APIs.' },
      { type: 'guideline', content: 'Log all authentication attempts.' },
      { type: 'guideline', content: 'Review access logs weekly.' },
      { type: 'knowledge', content: 'Security audits are quarterly.' },
      { type: 'knowledge', content: 'Pen testing is done annually.' },
      { type: 'guideline', content: 'Report security issues to security@company.com.' },
      { type: 'knowledge', content: 'Bug bounty program pays up to $10k.' },
      { type: 'guideline', content: 'Patch critical vulnerabilities within 24h.' },
      { type: 'guideline', content: 'High severity within 7 days.' },
      { type: 'guideline', content: 'Medium severity within 30 days.' },
      { type: 'knowledge', content: 'SIEM monitors all production systems.' },
      { type: 'knowledge', content: 'WAF protects all public endpoints.' },
    ],
    mustContainKeywords: ['2FA', 'encrypt', 'TLS', 'security'],
    difficulty: 'hard',
    notes: 'Must compress 24 security policies coherently',
  },

  // ==========================================================================
  // LENGTH CONSTRAINED (Medium/Hard) - Specific output targets
  // ==========================================================================
  {
    id: 'sum-110',
    name: 'Length constrained - 50 word limit',
    category: 'length-constrained',
    sourceEntries: [
      { type: 'knowledge', content: 'Our e-commerce platform processes 10,000 orders daily.' },
      { type: 'knowledge', content: 'Peak traffic occurs during Black Friday sales.' },
      { type: 'knowledge', content: 'The platform supports 15 payment methods.' },
      { type: 'knowledge', content: 'International shipping covers 45 countries.' },
      { type: 'knowledge', content: 'Customer support is available 24/7.' },
      { type: 'knowledge', content: 'Average order value is $85.' },
      { type: 'knowledge', content: 'Return rate is approximately 8%.' },
      { type: 'knowledge', content: 'Mobile traffic accounts for 65% of visits.' },
    ],
    mustContainKeywords: ['orders', 'payment', 'shipping'],
    difficulty: 'medium',
    notes: 'Target: ~50 words maximum',
  },
  {
    id: 'sum-111',
    name: 'Length constrained - tweet-sized (280 chars)',
    category: 'length-constrained',
    sourceEntries: [
      { type: 'knowledge', content: 'We use React 18 with TypeScript.' },
      { type: 'knowledge', content: 'State management is handled by Zustand.' },
      { type: 'knowledge', content: 'Styling uses Tailwind CSS.' },
      { type: 'knowledge', content: 'Testing with Vitest and Playwright.' },
      { type: 'knowledge', content: 'Build tool is Vite.' },
      { type: 'guideline', content: 'All components must be accessible.' },
    ],
    mustContainKeywords: ['React', 'TypeScript'],
    difficulty: 'hard',
    notes: 'Target: 280 characters maximum (tweet-sized)',
  },
  {
    id: 'sum-112',
    name: 'Length constrained - one sentence',
    category: 'length-constrained',
    sourceEntries: [
      { type: 'knowledge', content: 'The backend uses Python FastAPI.' },
      { type: 'knowledge', content: 'PostgreSQL is the primary database.' },
      { type: 'knowledge', content: 'Redis handles caching.' },
      { type: 'knowledge', content: 'Celery manages background jobs.' },
      { type: 'knowledge', content: 'Docker containerizes everything.' },
    ],
    mustContainKeywords: ['FastAPI', 'PostgreSQL'],
    difficulty: 'hard',
    notes: 'Target: Single sentence summary',
  },

  // ==========================================================================
  // REDUNDANCY HANDLING (Hard) - 80%+ repeated information
  // ==========================================================================
  {
    id: 'sum-120',
    name: 'Redundancy handling - repeated database facts',
    category: 'redundancy-handling',
    sourceEntries: [
      { type: 'knowledge', content: 'We use PostgreSQL for data storage.' },
      { type: 'knowledge', content: 'PostgreSQL is our primary database.' },
      { type: 'knowledge', content: 'The database is PostgreSQL.' },
      { type: 'knowledge', content: 'Data is stored in PostgreSQL.' },
      { type: 'knowledge', content: 'PostgreSQL handles all persistent data.' },
      { type: 'knowledge', content: 'Our DB is Postgres (PostgreSQL).' },
      { type: 'knowledge', content: 'PostgreSQL version 15 is deployed.' },
      { type: 'knowledge', content: 'The PostgreSQL instance runs on RDS.' },
      { type: 'knowledge', content: 'AWS RDS hosts our PostgreSQL database.' },
      { type: 'knowledge', content: 'Database: PostgreSQL on Amazon RDS.' },
    ],
    mustContainKeywords: ['PostgreSQL', 'RDS'],
    difficulty: 'hard',
    notes: 'All entries say essentially the same thing - dedupe to single fact',
  },
  {
    id: 'sum-121',
    name: 'Redundancy handling - paraphrased guidelines',
    category: 'redundancy-handling',
    sourceEntries: [
      { type: 'guideline', content: 'Always write tests for your code.' },
      { type: 'guideline', content: 'Testing is mandatory for all features.' },
      { type: 'guideline', content: 'No code merges without tests.' },
      { type: 'guideline', content: 'Every PR must include test coverage.' },
      { type: 'guideline', content: 'Write unit tests for all functions.' },
      { type: 'guideline', content: 'Test your code before submitting.' },
      { type: 'guideline', content: 'Untested code will not be approved.' },
      { type: 'guideline', content: 'Tests are required, no exceptions.' },
    ],
    mustContainKeywords: ['test'],
    difficulty: 'hard',
    notes: 'Eight ways of saying "write tests" - should become one statement',
  },
  {
    id: 'sum-122',
    name: 'Redundancy handling - overlapping facts with unique details',
    category: 'redundancy-handling',
    sourceEntries: [
      { type: 'knowledge', content: 'The API runs on port 8080.' },
      { type: 'knowledge', content: 'Port 8080 is used for the API server.' },
      { type: 'knowledge', content: 'API listens on port 8080 by default.' },
      { type: 'knowledge', content: 'The API uses REST architecture.' },
      { type: 'knowledge', content: 'We have a REST API.' },
      { type: 'knowledge', content: 'The REST API serves JSON responses.' },
      { type: 'knowledge', content: 'API responses are in JSON format.' },
      { type: 'knowledge', content: 'All API responses use JSON.' },
      { type: 'knowledge', content: 'Rate limiting is 100 req/min.' },
    ],
    mustContainKeywords: ['API', '8080', 'REST', 'JSON'],
    difficulty: 'hard',
    notes: 'Merge redundant info while preserving unique details',
  },

  // ==========================================================================
  // SCATTERED INFORMATION (Hard) - Non-linear, chaotic inputs
  // ==========================================================================
  {
    id: 'sum-130',
    name: 'Scattered info - random order technical facts',
    category: 'scattered-info',
    sourceEntries: [
      { type: 'knowledge', content: 'Oh and we also use Redis.' },
      { type: 'knowledge', content: 'The frontend is deployed to Vercel.' },
      { type: 'knowledge', content: 'Actually, I forgot to mention Node.js is v20.' },
      { type: 'knowledge', content: 'Backend runs on AWS Lambda.' },
      { type: 'knowledge', content: 'Speaking of databases, its PostgreSQL.' },
      { type: 'knowledge', content: 'For the frontend we went with Next.js.' },
      { type: 'knowledge', content: 'Right, and Redis is for sessions.' },
      { type: 'knowledge', content: 'The API Gateway is AWS API Gateway.' },
      { type: 'knowledge', content: 'Going back to the database, we use Prisma ORM.' },
    ],
    mustContainKeywords: ['Next.js', 'PostgreSQL', 'Lambda', 'Redis'],
    difficulty: 'hard',
    notes: 'Information is scattered and non-linear - needs reorganization',
  },
  {
    id: 'sum-131',
    name: 'Scattered info - interleaved topics',
    category: 'scattered-info',
    sourceEntries: [
      { type: 'knowledge', content: 'Deploy using npm run deploy.' },
      { type: 'guideline', content: 'Use TypeScript strict mode.' },
      { type: 'knowledge', content: 'Staging URL is staging.app.com.' },
      { type: 'guideline', content: 'Always validate input.' },
      { type: 'knowledge', content: 'Deploy requires VPN access.' },
      { type: 'guideline', content: 'Use ESLint for linting.' },
      { type: 'knowledge', content: 'Production URL is app.com.' },
      { type: 'guideline', content: 'Format with Prettier.' },
      { type: 'knowledge', content: 'CI/CD runs on GitHub Actions.' },
    ],
    mustContainKeywords: ['deploy', 'TypeScript', 'staging'],
    difficulty: 'hard',
    notes: 'Deployment and coding standards are interleaved',
  },

  // ==========================================================================
  // TEMPORAL CONFLICTS (Hard) - Old vs new conflicting information
  // ==========================================================================
  {
    id: 'sum-140',
    name: 'Temporal conflicts - framework migration',
    category: 'temporal-conflicts',
    sourceEntries: [
      { type: 'knowledge', content: 'The frontend uses Angular.' },
      { type: 'knowledge', content: 'We migrated from Angular to React in 2023.' },
      { type: 'knowledge', content: 'All new features use React.' },
      { type: 'knowledge', content: 'Legacy Angular code is in /legacy folder.' },
      { type: 'guideline', content: 'Do not add new Angular components.' },
      { type: 'knowledge', content: 'Angular will be fully removed by Q2 2025.' },
      { type: 'knowledge', content: 'React version is 18.2.' },
      { type: 'guideline', content: 'Prefer React hooks over class components.' },
    ],
    mustContainKeywords: ['React', 'Angular', 'migration'],
    difficulty: 'hard',
    notes: 'Must clarify current state vs legacy while acknowledging transition',
  },
  {
    id: 'sum-141',
    name: 'Temporal conflicts - policy changes',
    category: 'temporal-conflicts',
    sourceEntries: [
      { type: 'guideline', content: 'Work from office 5 days a week.' },
      { type: 'knowledge', content: 'COVID policy: fully remote allowed.' },
      { type: 'guideline', content: 'Hybrid policy: 3 days in office.' },
      { type: 'knowledge', content: 'As of 2024, hybrid is mandatory.' },
      { type: 'guideline', content: 'Remote Fridays are allowed.' },
      { type: 'knowledge', content: 'Office hours are 9am-6pm.' },
      { type: 'guideline', content: 'Core hours are 10am-4pm.' },
    ],
    mustContainKeywords: ['hybrid', 'office', 'remote'],
    difficulty: 'hard',
    notes: 'Multiple conflicting policies from different eras',
  },
  {
    id: 'sum-142',
    name: 'Temporal conflicts - version deprecations',
    category: 'temporal-conflicts',
    sourceEntries: [
      { type: 'knowledge', content: 'API v1 is the current version.' },
      { type: 'knowledge', content: 'API v2 beta is available.' },
      { type: 'knowledge', content: 'API v1 deprecated as of Jan 2025.' },
      { type: 'guideline', content: 'New integrations must use v2.' },
      { type: 'knowledge', content: 'v1 will be removed June 2025.' },
      { type: 'tool', content: 'Migration guide: docs.app.com/v2-migration' },
      { type: 'guideline', content: 'v1 endpoints still work but log warnings.' },
    ],
    mustContainKeywords: ['v1', 'v2', 'deprecated'],
    difficulty: 'hard',
    notes: 'Must clearly communicate deprecation timeline',
  },

  // ==========================================================================
  // MULTI-TOPIC (Hard) - 3+ distinct concerns mixed
  // ==========================================================================
  {
    id: 'sum-150',
    name: 'Multi-topic - backend, frontend, and devops',
    category: 'multi-topic',
    sourceEntries: [
      { type: 'knowledge', content: 'Backend uses Go with Gin framework.' },
      { type: 'knowledge', content: 'Frontend uses Vue.js 3.' },
      { type: 'knowledge', content: 'Kubernetes hosts all services.' },
      { type: 'guideline', content: 'Go code must pass golint.' },
      { type: 'guideline', content: 'Vue components use Composition API.' },
      { type: 'tool', content: 'helm upgrade to deploy.' },
      { type: 'knowledge', content: 'Backend DB is MySQL.' },
      { type: 'knowledge', content: 'Frontend state uses Pinia.' },
      { type: 'knowledge', content: 'ArgoCD manages deployments.' },
    ],
    mustContainKeywords: ['Go', 'Vue', 'Kubernetes'],
    difficulty: 'hard',
    notes: 'Three distinct technical domains - should be organized by domain',
  },
  {
    id: 'sum-151',
    name: 'Multi-topic - product, engineering, and design',
    category: 'multi-topic',
    sourceEntries: [
      { type: 'knowledge', content: 'Product roadmap is in Jira.' },
      { type: 'knowledge', content: 'Code lives in GitHub.' },
      { type: 'knowledge', content: 'Designs are in Figma.' },
      { type: 'guideline', content: 'Product specs go in Notion.' },
      { type: 'guideline', content: 'Code reviews in GitHub PRs.' },
      { type: 'guideline', content: 'Design handoff uses Figma dev mode.' },
      { type: 'knowledge', content: 'Sprint planning every 2 weeks.' },
      { type: 'knowledge', content: 'Tech debt tracked in GitHub issues.' },
      { type: 'knowledge', content: 'Design system in Storybook.' },
    ],
    mustContainKeywords: ['Jira', 'GitHub', 'Figma'],
    difficulty: 'hard',
    notes: 'Product/engineering/design tools and processes mixed together',
  },

  // ==========================================================================
  // AUTHORITY WEIGHTED (Medium) - Some sources more authoritative
  // ==========================================================================
  {
    id: 'sum-160',
    name: 'Authority weighted - official vs opinions',
    category: 'authority-weighted',
    sourceEntries: [
      { type: 'knowledge', content: 'OFFICIAL: Node.js 20 LTS is required.' },
      { type: 'knowledge', content: 'I prefer using yarn over npm.' },
      { type: 'knowledge', content: 'OFFICIAL: PostgreSQL 15 is the database.' },
      { type: 'knowledge', content: 'Some people like SQLite for local dev.' },
      { type: 'guideline', content: 'POLICY: All PRs need 2 reviewers.' },
      { type: 'knowledge', content: 'John says 1 reviewer is enough.' },
      { type: 'guideline', content: 'SECURITY: Use parameterized queries.' },
      { type: 'knowledge', content: 'ORMs handle that automatically anyway.' },
    ],
    mustContainKeywords: ['Node.js', 'PostgreSQL', 'reviewer'],
    difficulty: 'medium',
    notes: 'Official/policy statements should take precedence over opinions',
  },
  {
    id: 'sum-161',
    name: 'Authority weighted - RFC vs discussion',
    category: 'authority-weighted',
    sourceEntries: [
      { type: 'knowledge', content: 'RFC-001: GraphQL is adopted for new APIs.' },
      { type: 'knowledge', content: 'Discussion: REST might be simpler.' },
      { type: 'knowledge', content: 'RFC-002: Monorepo structure approved.' },
      { type: 'knowledge', content: 'Some teams still prefer multi-repo.' },
      { type: 'knowledge', content: 'RFC-001 passed with 8-2 vote.' },
      { type: 'knowledge', content: 'Tom voted against GraphQL.' },
    ],
    mustContainKeywords: ['GraphQL', 'monorepo', 'RFC'],
    difficulty: 'medium',
    notes: 'RFCs represent decisions, discussions are context',
  },

  // ==========================================================================
  // PARTIAL/INCOMPLETE (Hard) - Truncated or incomplete entries
  // ==========================================================================
  {
    id: 'sum-170',
    name: 'Partial incomplete - truncated messages',
    category: 'partial-incomplete',
    sourceEntries: [
      { type: 'knowledge', content: 'The database connection string is...' },
      { type: 'knowledge', content: 'PostgreSQL runs on port 5432.' },
      { type: 'knowledge', content: 'For authentication, we use...' },
      { type: 'knowledge', content: 'JWT tokens with RS256 signing.' },
      { type: 'knowledge', content: 'The deployment process involves...' },
      { type: 'tool', content: 'npm run deploy:prod' },
      { type: 'knowledge', content: 'Remember to always...' },
      { type: 'guideline', content: 'Test before deploying.' },
    ],
    mustContainKeywords: ['PostgreSQL', 'JWT', 'deploy'],
    difficulty: 'hard',
    notes: 'Some entries are truncated mid-sentence',
  },
  {
    id: 'sum-171',
    name: 'Partial incomplete - placeholder content',
    category: 'partial-incomplete',
    sourceEntries: [
      { type: 'knowledge', content: 'API endpoint: https://api.example.com/v1' },
      { type: 'knowledge', content: 'Auth token: [INSERT TOKEN HERE]' },
      { type: 'knowledge', content: 'Database: PostgreSQL 15' },
      { type: 'knowledge', content: 'Redis host: [TBD]' },
      { type: 'tool', content: 'curl -H "Authorization: Bearer $TOKEN" [URL]' },
      { type: 'knowledge', content: 'Rate limit: TODO - check with team' },
    ],
    mustContainKeywords: ['API', 'PostgreSQL'],
    difficulty: 'hard',
    notes: 'Mix of real content and placeholders - extract only concrete facts',
  },

  // ==========================================================================
  // STYLE VARIATIONS (Medium) - Different output tone requirements
  // ==========================================================================
  {
    id: 'sum-180',
    name: 'Style variations - executive summary needed',
    category: 'style-variations',
    sourceEntries: [
      { type: 'knowledge', content: 'Q3 revenue increased 15% YoY.' },
      { type: 'knowledge', content: 'Customer acquisition cost dropped 8%.' },
      { type: 'knowledge', content: 'Monthly active users grew to 2.5M.' },
      { type: 'knowledge', content: 'Churn rate decreased to 3.2%.' },
      { type: 'knowledge', content: 'NPS score improved to 72.' },
      { type: 'knowledge', content: 'Enterprise deals closed: 45.' },
    ],
    mustContainKeywords: ['revenue', 'users', 'growth'],
    difficulty: 'medium',
    notes: 'Should read like an executive summary - high-level metrics',
  },
  {
    id: 'sum-181',
    name: 'Style variations - technical documentation needed',
    category: 'style-variations',
    sourceEntries: [
      { type: 'knowledge', content: 'Function accepts userId as string parameter.' },
      { type: 'knowledge', content: 'Returns Promise<User | null>.' },
      { type: 'knowledge', content: 'Throws AuthError if token invalid.' },
      { type: 'knowledge', content: 'Caches result for 5 minutes.' },
      { type: 'knowledge', content: 'Rate limited to 100 calls/minute.' },
    ],
    mustContainKeywords: ['userId', 'Promise', 'AuthError'],
    difficulty: 'medium',
    notes: 'Should read like API documentation - precise and technical',
  },
  {
    id: 'sum-182',
    name: 'Style variations - casual explanation needed',
    category: 'style-variations',
    sourceEntries: [
      { type: 'knowledge', content: 'Git is version control software.' },
      { type: 'knowledge', content: 'Branches let you work on features separately.' },
      { type: 'knowledge', content: 'Pull requests are for code review.' },
      { type: 'knowledge', content: 'Merge combines branches together.' },
      { type: 'knowledge', content: 'Conflicts happen when same lines change.' },
    ],
    mustContainKeywords: ['Git', 'branch', 'pull request'],
    difficulty: 'medium',
    notes: 'Should be accessible to non-technical readers',
  },

  // ==========================================================================
  // TRUE CONTRADICTIONS (Hard) - Genuine conflicts between sources
  // ==========================================================================
  {
    id: 'sum-190',
    name: 'True contradictions - team disagreements',
    category: 'true-contradictions',
    sourceEntries: [
      { type: 'guideline', content: 'Backend team: Always use async/await.' },
      { type: 'guideline', content: 'Frontend team: Callbacks are fine for simple cases.' },
      { type: 'guideline', content: 'Backend team: 100% test coverage required.' },
      { type: 'guideline', content: 'Frontend team: 80% coverage is sufficient.' },
      { type: 'guideline', content: 'Backend team: Use snake_case for JSON.' },
      { type: 'guideline', content: 'Frontend team: Use camelCase for JSON.' },
    ],
    mustContainKeywords: ['async', 'coverage', 'case'],
    difficulty: 'hard',
    notes: 'Genuine disagreements between teams - should acknowledge both',
  },
  {
    id: 'sum-191',
    name: 'True contradictions - conflicting requirements',
    category: 'true-contradictions',
    sourceEntries: [
      { type: 'guideline', content: 'Security: All endpoints must require authentication.' },
      { type: 'guideline', content: 'Product: Health check endpoint must be public.' },
      { type: 'guideline', content: 'Security: No data in URL parameters.' },
      { type: 'guideline', content: 'SEO: Product IDs must be in URL for crawling.' },
      { type: 'guideline', content: 'Performance: Cache aggressively.' },
      { type: 'guideline', content: 'Compliance: PII must never be cached.' },
    ],
    mustContainKeywords: ['security', 'endpoint', 'cache'],
    difficulty: 'hard',
    notes: 'Real-world requirement conflicts - need balanced summary',
  },

  // ==========================================================================
  // EXTREME NOISE (Hard) - 80%+ irrelevant content
  // ==========================================================================
  {
    id: 'sum-200',
    name: 'Extreme noise - chat log with few relevant facts',
    category: 'extreme-noise',
    sourceEntries: [
      { type: 'knowledge', content: 'Hey, anyone here?' },
      { type: 'knowledge', content: 'Yeah whats up' },
      { type: 'knowledge', content: 'Just checking in' },
      { type: 'knowledge', content: 'Cool cool' },
      { type: 'knowledge', content: 'Oh btw, the API uses port 3000' },
      { type: 'knowledge', content: 'Nice, thanks' },
      { type: 'knowledge', content: 'No problem' },
      { type: 'knowledge', content: 'Anyone want coffee?' },
      { type: 'knowledge', content: 'Sure!' },
      { type: 'knowledge', content: 'Also Redis is on port 6379' },
      { type: 'knowledge', content: 'K' },
      { type: 'knowledge', content: 'Lunch?' },
      { type: 'knowledge', content: 'In 30' },
    ],
    mustContainKeywords: ['API', '3000', 'Redis', '6379'],
    difficulty: 'hard',
    notes: 'Only 2 relevant facts buried in casual chat',
  },
  {
    id: 'sum-201',
    name: 'Extreme noise - meeting notes with tangents',
    category: 'extreme-noise',
    sourceEntries: [
      { type: 'knowledge', content: 'Meeting started at 2pm.' },
      { type: 'knowledge', content: 'Discussed weekend plans briefly.' },
      { type: 'knowledge', content: 'Sarah mentioned her cat is sick.' },
      { type: 'knowledge', content: 'Back to topic: API redesign needed.' },
      { type: 'knowledge', content: 'Someone asked about parking.' },
      { type: 'knowledge', content: 'DECISION: Move to GraphQL.' },
      { type: 'knowledge', content: 'Lunch order discussed.' },
      { type: 'knowledge', content: 'ACTION: John to draft RFC.' },
      { type: 'knowledge', content: 'Fire alarm interrupted meeting.' },
      { type: 'knowledge', content: 'Resumed after 10 minutes.' },
      { type: 'knowledge', content: 'DEADLINE: RFC due next Friday.' },
      { type: 'knowledge', content: 'Meeting ended at 3pm.' },
    ],
    mustContainKeywords: ['GraphQL', 'RFC', 'Friday'],
    difficulty: 'hard',
    notes: 'Only 3 actionable items in 12 entries',
  },

  // ==========================================================================
  // AMBIGUOUS IMPORTANCE (Hard) - Unclear what matters most
  // ==========================================================================
  {
    id: 'sum-210',
    name: 'Ambiguous importance - everything seems important',
    category: 'ambiguous-importance',
    sourceEntries: [
      { type: 'guideline', content: 'Security is our top priority.' },
      { type: 'guideline', content: 'Performance is critical for UX.' },
      { type: 'guideline', content: 'Code quality must not be compromised.' },
      { type: 'guideline', content: 'Ship features fast to stay competitive.' },
      { type: 'guideline', content: 'Technical debt must be addressed.' },
      { type: 'guideline', content: 'Customer satisfaction is paramount.' },
      { type: 'guideline', content: 'Innovation drives our success.' },
    ],
    mustContainKeywords: ['security', 'performance', 'quality'],
    difficulty: 'hard',
    notes: 'Everything is "top priority" - need to synthesize core values',
  },
  {
    id: 'sum-211',
    name: 'Ambiguous importance - conflicting priorities',
    category: 'ambiguous-importance',
    sourceEntries: [
      { type: 'knowledge', content: 'Q1 goal: Reduce infrastructure costs by 20%.' },
      { type: 'knowledge', content: 'Q1 goal: Improve page load time by 50%.' },
      { type: 'knowledge', content: 'Q1 goal: Launch mobile app.' },
      { type: 'knowledge', content: 'Q1 goal: Migrate to new auth provider.' },
      { type: 'knowledge', content: 'Q1 goal: Hire 5 engineers.' },
      { type: 'knowledge', content: 'Q1 goal: Reduce bug backlog by 30%.' },
    ],
    mustContainKeywords: ['Q1', 'goal'],
    difficulty: 'hard',
    notes: 'Six equally-weighted goals - which to emphasize?',
  },

  // ==========================================================================
  // ADDITIONAL TRUE CONTRADICTIONS (3 more to reach 5 total)
  // ==========================================================================
  {
    id: 'sum-192',
    name: 'True contradictions - technology choices',
    category: 'true-contradictions',
    sourceEntries: [
      { type: 'knowledge', content: 'Architecture review: PostgreSQL is our standard database.' },
      { type: 'knowledge', content: 'Data team: We use MongoDB for all new projects.' },
      { type: 'knowledge', content: 'Architecture review: REST APIs are preferred.' },
      { type: 'knowledge', content: 'Mobile team: GraphQL is required for mobile apps.' },
      { type: 'knowledge', content: 'Architecture review: Kubernetes for all deployments.' },
      { type: 'knowledge', content: 'Startup team: Docker Compose is simpler for small services.' },
    ],
    mustContainKeywords: ['database', 'API', 'deployment'],
    difficulty: 'hard',
    notes: 'Architecture vs team-specific preferences conflict',
  },
  {
    id: 'sum-193',
    name: 'True contradictions - documentation standards',
    category: 'true-contradictions',
    sourceEntries: [
      { type: 'guideline', content: 'Tech writing: All functions must have JSDoc comments.' },
      { type: 'guideline', content: 'Code review: Self-documenting code needs no comments.' },
      { type: 'guideline', content: 'Tech writing: README required for every module.' },
      { type: 'guideline', content: 'Senior dev: Good tests are the best documentation.' },
      { type: 'guideline', content: 'Tech writing: Maintain separate API docs.' },
      { type: 'guideline', content: 'Lead architect: Types serve as documentation.' },
    ],
    mustContainKeywords: ['documentation', 'comment', 'code'],
    difficulty: 'hard',
    notes: 'Multiple conflicting philosophies about documentation',
  },
  {
    id: 'sum-194',
    name: 'True contradictions - process disagreements',
    category: 'true-contradictions',
    sourceEntries: [
      { type: 'guideline', content: 'PM: Features go straight to staging for testing.' },
      { type: 'guideline', content: 'QA lead: All changes must pass local QA first.' },
      { type: 'guideline', content: 'PM: Ship fast, fix in production.' },
      { type: 'guideline', content: 'SRE: Zero-defect releases only.' },
      { type: 'guideline', content: 'PM: Two-week sprint cycles.' },
      { type: 'guideline', content: 'Dev lead: Continuous deployment, no sprints.' },
    ],
    mustContainKeywords: ['test', 'release', 'deploy'],
    difficulty: 'hard',
    notes: 'Velocity vs stability trade-offs with no clear winner',
  },

  // ==========================================================================
  // ADDITIONAL EXTREME NOISE (3 more to reach 5 total)
  // ==========================================================================
  {
    id: 'sum-202',
    name: 'Extreme noise - long email thread',
    category: 'extreme-noise',
    sourceEntries: [
      { type: 'knowledge', content: 'RE: RE: RE: FW: Question' },
      { type: 'knowledge', content: 'Thanks!' },
      { type: 'knowledge', content: 'No problem.' },
      { type: 'knowledge', content: 'Can someone loop in Sarah?' },
      { type: 'knowledge', content: 'Done.' },
      { type: 'knowledge', content: 'Actually, the deployment requires AWS credentials from DevOps.' },
      { type: 'knowledge', content: 'Got it.' },
      { type: 'knowledge', content: 'Also CC marketing?' },
      { type: 'knowledge', content: 'Sure.' },
      { type: 'knowledge', content: 'Wait, which region?' },
      { type: 'knowledge', content: 'us-east-1 for production, eu-west-1 for GDPR compliance.' },
      { type: 'knowledge', content: 'Perfect.' },
      { type: 'knowledge', content: 'Thanks all!' },
      { type: 'knowledge', content: 'Have a great weekend!' },
    ],
    mustContainKeywords: ['AWS', 'us-east-1', 'eu-west-1', 'GDPR'],
    difficulty: 'hard',
    notes: 'Email thread with 2 key facts in 14 messages',
  },
  {
    id: 'sum-203',
    name: 'Extreme noise - debug session log',
    category: 'extreme-noise',
    sourceEntries: [
      { type: 'knowledge', content: 'Trying again...' },
      { type: 'knowledge', content: 'Still broken.' },
      { type: 'knowledge', content: 'Cleared cache.' },
      { type: 'knowledge', content: 'Nope.' },
      { type: 'knowledge', content: 'Checking logs...' },
      { type: 'knowledge', content: 'Nothing useful.' },
      { type: 'knowledge', content: 'Wait, found it!' },
      { type: 'knowledge', content: 'ROOT CAUSE: Connection pool exhausted at 100 connections.' },
      { type: 'knowledge', content: 'Testing fix...' },
      { type: 'knowledge', content: 'Still testing...' },
      { type: 'knowledge', content: 'FIX: Increase pool to 500 and add connection timeout of 30s.' },
      { type: 'knowledge', content: 'Deploying...' },
      { type: 'knowledge', content: 'Done!' },
      { type: 'knowledge', content: 'Works now.' },
    ],
    mustContainKeywords: ['connection pool', '500', 'timeout', '30s'],
    difficulty: 'hard',
    notes: 'Debug session with 2 key findings in 14 entries',
  },
  {
    id: 'sum-204',
    name: 'Extreme noise - code review comments',
    category: 'extreme-noise',
    sourceEntries: [
      { type: 'knowledge', content: 'LGTM' },
      { type: 'knowledge', content: 'Nice!' },
      { type: 'knowledge', content: 'nit: extra whitespace on line 42' },
      { type: 'knowledge', content: 'Fixed.' },
      { type: 'knowledge', content: 'LGTM' },
      { type: 'knowledge', content: 'CRITICAL: This query has no index and will cause full table scan on 10M rows.' },
      { type: 'knowledge', content: 'Good catch!' },
      { type: 'knowledge', content: 'nit: typo in comment' },
      { type: 'knowledge', content: 'Fixed.' },
      { type: 'knowledge', content: 'REQUIRED: Add composite index on (user_id, created_at) for this query.' },
      { type: 'knowledge', content: 'Done, added migration.' },
      { type: 'knowledge', content: 'LGTM' },
      { type: 'knowledge', content: 'Ship it!' },
    ],
    mustContainKeywords: ['index', 'user_id', 'created_at', 'table scan'],
    difficulty: 'hard',
    notes: 'Code review with 2 critical findings in 13 comments',
  },

  // ==========================================================================
  // ADDITIONAL AMBIGUOUS IMPORTANCE (3 more to reach 5 total)
  // ==========================================================================
  {
    id: 'sum-212',
    name: 'Ambiguous importance - incident postmortem',
    category: 'ambiguous-importance',
    sourceEntries: [
      { type: 'knowledge', content: 'Incident started at 3:47 AM UTC.' },
      { type: 'knowledge', content: 'First alert was CPU spike to 98%.' },
      { type: 'knowledge', content: 'Memory usage was also elevated at 87%.' },
      { type: 'knowledge', content: 'Database connections peaked at 450.' },
      { type: 'knowledge', content: 'Error rate increased to 15%.' },
      { type: 'knowledge', content: 'Latency p99 reached 12 seconds.' },
      { type: 'knowledge', content: 'Rollback was initiated at 4:15 AM.' },
      { type: 'knowledge', content: 'Service restored at 4:23 AM.' },
      { type: 'knowledge', content: 'Root cause was memory leak in v2.3.1.' },
      { type: 'knowledge', content: 'Total downtime: 36 minutes.' },
    ],
    mustContainKeywords: ['incident', 'memory leak', 'v2.3.1'],
    difficulty: 'hard',
    notes: 'Many metrics but unclear which are most important for summary',
  },
  {
    id: 'sum-213',
    name: 'Ambiguous importance - feature requirements',
    category: 'ambiguous-importance',
    sourceEntries: [
      { type: 'knowledge', content: 'User story: As a user, I want to export data.' },
      { type: 'knowledge', content: 'Acceptance: CSV format supported.' },
      { type: 'knowledge', content: 'Acceptance: JSON format supported.' },
      { type: 'knowledge', content: 'Acceptance: PDF format supported.' },
      { type: 'knowledge', content: 'Acceptance: Export up to 10,000 rows.' },
      { type: 'knowledge', content: 'Acceptance: Include date range filter.' },
      { type: 'knowledge', content: 'Acceptance: Email notification when complete.' },
      { type: 'knowledge', content: 'Acceptance: Download link valid for 24 hours.' },
      { type: 'knowledge', content: 'Nice-to-have: Excel format.' },
      { type: 'knowledge', content: 'Nice-to-have: Scheduled exports.' },
    ],
    mustContainKeywords: ['export', 'CSV', 'JSON', 'PDF'],
    difficulty: 'hard',
    notes: 'Many acceptance criteria of similar weight',
  },
  {
    id: 'sum-214',
    name: 'Ambiguous importance - architecture proposal',
    category: 'ambiguous-importance',
    sourceEntries: [
      { type: 'knowledge', content: 'Proposal: Migrate from monolith to microservices.' },
      { type: 'knowledge', content: 'Benefit: Better scalability for high-traffic services.' },
      { type: 'knowledge', content: 'Benefit: Independent deployments per team.' },
      { type: 'knowledge', content: 'Benefit: Technology flexibility per service.' },
      { type: 'knowledge', content: 'Risk: Increased operational complexity.' },
      { type: 'knowledge', content: 'Risk: Network latency between services.' },
      { type: 'knowledge', content: 'Risk: Data consistency challenges.' },
      { type: 'knowledge', content: 'Cost: 6-month migration timeline.' },
      { type: 'knowledge', content: 'Cost: Need 2 additional SREs.' },
      { type: 'knowledge', content: 'Alternative: Stay monolith, optimize hot paths.' },
    ],
    mustContainKeywords: ['microservices', 'scalability', 'complexity'],
    difficulty: 'hard',
    notes: 'Benefits vs risks vs costs - no clear hierarchy',
  },
];

/**
 * Get dataset statistics
 */
export function getDatasetStats(): {
  totalTestCases: number;
  totalSourceEntries: number;
  byDifficulty: Record<'easy' | 'medium' | 'hard', number>;
  byCategory: Record<string, number>;
  casesWithExpectedSummary: number;
} {
  const stats = {
    totalTestCases: SUMMARIZATION_TEST_CASES.length,
    totalSourceEntries: 0,
    byDifficulty: { easy: 0, medium: 0, hard: 0 } as Record<'easy' | 'medium' | 'hard', number>,
    byCategory: {} as Record<string, number>,
    casesWithExpectedSummary: 0,
  };

  for (const tc of SUMMARIZATION_TEST_CASES) {
    stats.totalSourceEntries += tc.sourceEntries.length;
    stats.byDifficulty[tc.difficulty]++;
    stats.byCategory[tc.category] = (stats.byCategory[tc.category] || 0) + 1;
    if (tc.expectedSummary) {
      stats.casesWithExpectedSummary++;
    }
  }

  return stats;
}

/**
 * Realistic Documentation Excerpts Test Cases
 *
 * README fragments, wiki pages, and internal docs with
 * guidelines, facts, and tool usage embedded.
 */

import type { ExtractionTestCase } from '../extraction-quality-types.js';

export const DOCUMENTATION_CASES: ExtractionTestCase[] = [
  {
    id: 'doc-001',
    name: 'README - Getting started section',
    category: 'tools-cli',
    context: `# MyApp

## Getting Started

### Prerequisites

- Node.js 20+ (use nvm: \`nvm use\`)
- Docker Desktop with 8GB+ RAM
- PostgreSQL 15+ (or use Docker)

### Installation

\`\`\`bash
# Clone and install
git clone https://github.com/company/myapp.git
cd myapp
npm install

# Setup environment
cp .env.example .env
# Edit .env with your settings

# Start dependencies
docker-compose up -d

# Run migrations
npm run db:migrate

# Seed development data
npm run db:seed

# Start the app
npm run dev
\`\`\`

The app will be available at http://localhost:3000.

### Common Issues

**Port 3000 in use?**
\`\`\`bash
PORT=3001 npm run dev
\`\`\`

**Database connection failed?**
Check that PostgreSQL is running: \`docker ps | grep postgres\``,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Node.js', '20+', 'nvm'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['Docker', '8GB', 'RAM'],
        category: 'fact',
      },
      {
        type: 'tool',
        mustContain: ['npm run db:migrate'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['npm run db:seed'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['docker-compose up', '-d'],
        category: 'cli',
      },
    ],
    difficulty: 'easy',
    notes: 'Standard README setup instructions',
  },
  {
    id: 'doc-002',
    name: 'Wiki - API authentication',
    category: 'knowledge-facts',
    context: `# API Authentication Guide

## Overview

Our API uses JWT tokens with the following flow:

1. Client sends credentials to \`POST /auth/login\`
2. Server returns access token (15min) and refresh token (7 days)
3. Client includes access token in \`Authorization: Bearer <token>\`
4. When access token expires, use refresh token at \`POST /auth/refresh\`

## Token Structure

Access tokens contain:
- \`sub\`: User ID
- \`exp\`: Expiration timestamp
- \`roles\`: Array of user roles

## Rate Limits

| Endpoint | Authenticated | Anonymous |
|----------|--------------|-----------|
| /api/* | 1000/min | 100/min |
| /auth/* | 20/min | 10/min |
| /uploads | 50/hour | N/A |

Exceeding limits returns \`429 Too Many Requests\` with \`Retry-After\` header.

## Security Notes

- Never log tokens in production
- Tokens are signed with RS256 (public key in /api/auth/jwks)
- Refresh tokens are single-use (rotated on each refresh)
- All tokens invalidated on password change`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['access token', '15min', 'refresh token', '7 days'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['rate limit', '/api/*', '1000/min', '100/min'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['RS256', 'jwks'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['Never log', 'tokens', 'production'],
        category: 'security',
      },
      {
        type: 'knowledge',
        mustContain: ['Refresh tokens', 'single-use', 'rotated'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'API docs with facts and guidelines mixed',
  },
  {
    id: 'doc-003',
    name: 'Contributing guide - code standards',
    category: 'guidelines-explicit',
    context: `# Contributing Guide

## Code Style

We use ESLint and Prettier. Run before committing:
\`\`\`bash
npm run lint:fix
npm run format
\`\`\`

### Naming Conventions

- **Files**: kebab-case (\`user-service.ts\`)
- **Classes**: PascalCase (\`UserService\`)
- **Functions**: camelCase (\`getUserById\`)
- **Constants**: UPPER_SNAKE_CASE (\`MAX_RETRIES\`)
- **Database tables**: snake_case (\`user_profiles\`)

### Git Commit Messages

Follow Conventional Commits:
\`\`\`
<type>(<scope>): <description>

[optional body]

[optional footer]
\`\`\`

Types: feat, fix, docs, style, refactor, test, chore

Example:
\`\`\`
feat(auth): add OAuth2 support

Implements Google and GitHub providers.

Closes #123
\`\`\`

### Pull Requests

- Keep PRs small (<400 lines when possible)
- Include tests for new features
- Update documentation if API changes
- Get at least 2 approvals before merge
- Squash commits on merge`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['Files', 'kebab-case'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['Classes', 'PascalCase'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['Database tables', 'snake_case'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['Conventional Commits', 'feat', 'fix', 'docs'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['PRs', 'small', '400 lines'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['2 approvals', 'before merge'],
        category: 'workflow',
      },
    ],
    difficulty: 'easy',
    notes: 'Explicit coding standards from contributing guide',
  },
  {
    id: 'doc-004',
    name: 'Architecture decision record',
    category: 'knowledge-decisions',
    context: `# ADR-005: Use PostgreSQL for Primary Database

## Status
Accepted (2024-01-10)

## Context
We need to choose a primary database for the application. Options considered:
- PostgreSQL
- MySQL
- MongoDB

## Decision
We will use PostgreSQL 15+ as our primary database.

## Rationale

1. **ACID compliance**: Critical for financial transactions
2. **JSON support**: JSONB columns for flexible schemas
3. **Full-text search**: Built-in, no need for Elasticsearch for basic search
4. **Team expertise**: 3 of 4 backend devs have PG experience
5. **Extensions**: PostGIS for future geo features, pg_vector for embeddings

## Consequences

### Positive
- Strong consistency guarantees
- Mature ecosystem and tooling
- Easy hiring (common skill)

### Negative
- Horizontal scaling requires manual sharding or Citus
- Write-heavy workloads may need read replicas

## Alternatives Rejected

**MongoDB**: NoSQL flexibility not needed; consistency more important.
**MySQL**: Fewer features, weaker JSON support.

## Related ADRs
- ADR-006: Use Prisma as ORM
- ADR-012: Database connection pooling with PgBouncer`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['PostgreSQL', '15+', 'primary database'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['MongoDB', 'rejected', 'consistency more important'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Prisma', 'ORM', 'ADR-006'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['PgBouncer', 'connection pooling', 'ADR-012'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'ADR with decision and context',
  },
  {
    id: 'doc-005',
    name: 'Deployment runbook',
    category: 'tools-scripts',
    context: `# Production Deployment Runbook

## Pre-deployment Checklist

- [ ] All tests passing in CI
- [ ] No P1/P2 incidents in last 24 hours
- [ ] At least 2 approvals on release PR
- [ ] Database migrations reviewed by DBA

## Deployment Steps

### 1. Create Release

\`\`\`bash
# On main branch
npm run release -- --version X.Y.Z
# This creates release/vX.Y.Z branch and opens PR
\`\`\`

### 2. Deploy to Staging

\`\`\`bash
./scripts/deploy.sh staging
# Wait for health check (automatic)
\`\`\`

### 3. Verify Staging

- Check https://staging.example.com/health
- Run smoke tests: \`npm run test:smoke -- --env staging\`
- Verify metrics in Grafana dashboard

### 4. Deploy to Production

\`\`\`bash
# Requires VPN connection
./scripts/deploy.sh production

# Monitor deployment
kubectl get pods -n production -w
\`\`\`

### 5. Post-deployment

- Verify https://example.com/health
- Check error rates in Grafana (should be <0.1%)
- Announce in #releases Slack channel

## Rollback

If issues detected:
\`\`\`bash
./scripts/rollback.sh production
# Restores previous deployment
\`\`\`

Rollback takes ~2 minutes.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['npm run release', '--version'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['./scripts/deploy.sh', 'staging'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['./scripts/deploy.sh', 'production'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['./scripts/rollback.sh'],
        category: 'cli',
      },
      {
        type: 'guideline',
        mustContain: ['P1', 'P2', 'incidents', '24 hours'],
        category: 'workflow',
      },
      {
        type: 'knowledge',
        mustContain: ['Rollback', '2 minutes'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Deployment tools and procedures',
  },
  {
    id: 'doc-006',
    name: 'Security policy document',
    category: 'guidelines-compound',
    context: `# Security Policy

## Data Classification

| Level | Examples | Requirements |
|-------|----------|--------------|
| Public | Marketing content | None |
| Internal | Business metrics | Auth required |
| Confidential | User PII | Encryption + audit |
| Restricted | Passwords, keys | Encryption + HSM |

## Password Policy

- Minimum 12 characters
- Must include: uppercase, lowercase, number, special character
- Cannot contain username or common patterns
- Expires every 90 days for admin accounts
- 5 failed attempts = 15 minute lockout

## Access Control

- Principle of least privilege
- All access logged and auditable
- Admin access requires MFA
- Service accounts must use API keys (not passwords)
- Review access quarterly

## Secrets Management

- Never commit secrets to git (use pre-commit hook)
- Store in AWS Secrets Manager or Vault
- Rotate all secrets every 90 days
- Different secrets per environment

## Incident Reporting

Security issues should be reported to security@company.com, NOT in public channels.

For vulnerabilities, use our HackerOne program.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['Password', '12 characters'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['Principle of least privilege'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['Admin access', 'MFA'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['Never commit', 'secrets', 'git', 'pre-commit'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['Rotate', 'secrets', '90 days'],
        category: 'security',
      },
      {
        type: 'knowledge',
        mustContain: ['AWS Secrets Manager', 'Vault'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Security guidelines from policy doc',
  },
  {
    id: 'doc-007',
    name: 'API design guidelines',
    category: 'guidelines-explicit',
    context: `# API Design Guidelines

## REST Principles

### Endpoints

- Use nouns, not verbs: \`/users\` not \`/getUsers\`
- Use plural: \`/users\` not \`/user\`
- Nest for relationships: \`/users/123/orders\`
- Max nesting depth: 2 levels

### HTTP Methods

- GET: Read (idempotent)
- POST: Create
- PUT: Full update
- PATCH: Partial update
- DELETE: Remove (idempotent)

### Status Codes

- 200: Success (GET, PUT, PATCH)
- 201: Created (POST)
- 204: No Content (DELETE)
- 400: Bad Request (validation)
- 401: Unauthorized (no auth)
- 403: Forbidden (no permission)
- 404: Not Found
- 429: Rate Limited
- 500: Server Error (never expose stack traces)

## Response Format

Always wrap responses:
\`\`\`json
{
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}
\`\`\`

## Pagination

Use cursor-based pagination:
\`\`\`
GET /users?cursor=abc123&limit=20
\`\`\`

NOT offset-based (performs poorly at scale).`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['nouns', 'not verbs', '/users', 'not /getUsers'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['plural', '/users', 'not /user'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['nesting', '2 levels'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['500', 'never expose', 'stack traces'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['cursor-based', 'pagination', 'NOT offset'],
        category: 'code_style',
      },
    ],
    difficulty: 'easy',
    notes: 'API design guidelines document',
  },
  {
    id: 'doc-008',
    name: 'Monitoring and alerting guide',
    category: 'knowledge-facts',
    context: `# Monitoring Guide

## Dashboards

All dashboards in Grafana at https://grafana.internal.company.com

| Dashboard | Purpose |
|-----------|---------|
| Overview | High-level health |
| API Performance | Request latency, throughput |
| Database | Query performance, connections |
| Infrastructure | CPU, memory, disk |

## Key Metrics

### Application

- \`http_request_duration_seconds\` - p50: <100ms, p99: <500ms
- \`http_requests_total\` - by status code
- \`active_connections\` - should be <80% of pool

### Database

- \`pg_stat_activity\` - active queries <100
- \`pg_stat_user_tables\` - seq scans should be rare
- \`replication_lag\` - should be <1s

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Error rate | >1% | >5% |
| p99 latency | >500ms | >2s |
| CPU | >70% | >90% |
| Memory | >80% | >95% |
| Disk | >70% | >85% |

## On-Call

- Rotation: Weekly, Monday 9am handoff
- Primary + secondary on each shift
- Escalation: Primary (15min) -> Secondary (15min) -> Manager
- PagerDuty for critical alerts`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Grafana', 'grafana.internal.company.com'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['p50', '<100ms', 'p99', '<500ms'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['Error rate', 'Warning', '>1%', 'Critical', '>5%'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['On-Call', 'Weekly', 'Monday 9am'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['replication_lag', '<1s'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Operational facts from monitoring docs',
  },
  {
    id: 'doc-009',
    name: 'Database migrations guide',
    category: 'guidelines-compound',
    context: `# Database Migration Guide

## Migration Rules

1. **Always reversible**: Every migration must have a rollback
2. **Backward compatible**: Old code must work with new schema
3. **Small changes**: One logical change per migration
4. **Tested**: Run on staging with production-like data first

## Dangerous Operations

These require DBA review:

- Adding NOT NULL column without default
- Dropping columns or tables
- Changing column types
- Adding indexes on large tables (use CONCURRENTLY)

## Migration Workflow

\`\`\`bash
# Create migration
npm run db:migrate:create -- --name add_user_email_index

# Apply to local
npm run db:migrate

# Apply to staging
npm run db:migrate -- --env staging

# Apply to production (requires approval)
npm run db:migrate -- --env production
\`\`\`

## Large Table Migrations

For tables >1M rows:
1. Create new column as nullable
2. Backfill in batches (1000 rows at a time)
3. Add NOT NULL constraint after backfill
4. Add index CONCURRENTLY

Never do in one transaction - will lock table.

## Rollback

\`\`\`bash
npm run db:migrate:rollback -- --env production
\`\`\`

Only rollback if migration caused issues within 24 hours.
After 24 hours, create new forward migration instead.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['reversible', 'rollback'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['Backward compatible', 'old code', 'new schema'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['DBA review', 'NOT NULL', 'dropping'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['indexes', 'large tables', 'CONCURRENTLY'],
        category: 'workflow',
      },
      {
        type: 'tool',
        mustContain: ['npm run db:migrate:create', '--name'],
        category: 'cli',
      },
      {
        type: 'guideline',
        mustContain: ['1M rows', 'batches', '1000 rows'],
        category: 'workflow',
      },
    ],
    difficulty: 'hard',
    notes: 'Migration guidelines with dangerous operations',
  },
  {
    id: 'doc-010',
    name: 'Onboarding wiki page',
    category: 'mixed-content',
    context: `# New Developer Onboarding

Welcome to the team! Here's everything you need to get started.

## Day 1

### Accounts to Request
- GitHub (ask your manager)
- Slack (auto-provisioned via Okta)
- AWS Console (request in #devops, read-only initially)
- Jira (link in your welcome email)

### Setup Your Machine
1. Install Homebrew: \`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\`
2. Install tools: \`brew install git nvm docker\`
3. Configure Git:
   \`\`\`bash
   git config --global user.name "Your Name"
   git config --global user.email "you@company.com"
   \`\`\`

## Week 1

### Codebase Tour
- Start with the README in each repo
- Main backend: \`company/api\`
- Frontend: \`company/web\`
- Shared libs: \`company/common\`

### Key Contacts
- Tech questions: Ask in #engineering
- Access issues: #it-help
- Product questions: Your PM (see team page)

## Expectations

- First PR within 2 weeks (can be small!)
- Shadow on-call by week 4
- Solo on-call by month 2
- Complete security training within 30 days

## Resources

- Engineering blog: blog.company.com/engineering
- Tech radar: radar.company.com
- Internal docs: docs.internal.company.com`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['GitHub', 'ask your manager'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['AWS Console', '#devops', 'read-only'],
        category: 'fact',
      },
      {
        type: 'tool',
        mustContain: ['brew install', 'git nvm docker'],
        category: 'cli',
      },
      {
        type: 'knowledge',
        mustContain: ['Main backend', 'company/api'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['First PR', '2 weeks'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['security training', '30 days'],
        category: 'workflow',
      },
    ],
    difficulty: 'medium',
    notes: 'Mixed content from onboarding page',
  },
];

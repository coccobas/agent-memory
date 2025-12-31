/**
 * Realistic Meeting Notes Test Cases
 *
 * Bullet points, action items, and decisions from team meetings
 * with varying formats and levels of organization.
 */

import type { ExtractionTestCase } from '../extraction-quality-types.js';

export const MEETING_NOTES_CASES: ExtractionTestCase[] = [
  {
    id: 'meet-001',
    name: 'Sprint planning - tech decisions',
    category: 'knowledge-decisions',
    context: `Sprint 23 Planning - Backend Team
Date: 2024-01-15
Attendees: Alice, Bob, Charlie, Diana

DECISIONS:
- Will use Redis for session storage instead of in-memory
- API rate limiting: 100 req/min for free tier, 1000 for paid
- Deprecating v1 endpoints by end of Q2

ACTION ITEMS:
[ ] Alice: Draft Redis migration plan by Thursday
[ ] Bob: Implement rate limiting middleware
[ ] Charlie: Update API docs with deprecation notice

NOTES:
- Bob raised concerns about Redis failover - need to discuss with SRE
- Diana will be OOO next week`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Redis', 'session storage'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['rate limiting', '100', 'free tier', '1000', 'paid'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['v1 endpoints', 'deprecating', 'Q2'],
        category: 'decision',
      },
    ],
    difficulty: 'easy',
    notes: 'Well-structured meeting notes with clear decision section',
  },
  {
    id: 'meet-002',
    name: 'Architecture review - messy notes',
    category: 'knowledge-decisions',
    context: `arch review 1/20

talked about monolith vs microservices again
- alice wants to split user service first
- bob thinks auth should be separate
- ended up deciding: start with user + auth as one service, split later if needed

also:
- need better logging. everyone agreed on structured JSON logs
- charlie suggested OpenTelemetry for tracing
- decision: adopt otel with jaeger backend

random:
- pizza for lunch was good
- meeting room projector is broken again`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['user', 'auth', 'one service', 'split later'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['structured JSON logs'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['OpenTelemetry', 'otel', 'jaeger'],
        category: 'decision',
      },
    ],
    shouldNotExtract: ['pizza', 'projector'],
    difficulty: 'medium',
    notes: 'Unstructured notes with noise mixed in',
  },
  {
    id: 'meet-003',
    name: 'Security review - guidelines established',
    category: 'guidelines-explicit',
    context: `Security Review Meeting
2024-01-22

## New Security Guidelines (APPROVED)

1. All API endpoints must require authentication except:
   - /health
   - /metrics (internal network only)
   - /api/public/*

2. Password requirements:
   - Minimum 12 characters
   - Must include uppercase, lowercase, number
   - No common passwords (check against HaveIBeenPwned)

3. Token expiration:
   - Access tokens: 15 minutes
   - Refresh tokens: 7 days
   - Session cookies: 24 hours

4. PII handling:
   - Never log PII fields (email, phone, SSN)
   - Mask in error messages
   - Encrypt at rest with AES-256

## Action Items
- Dev team to audit existing endpoints by Feb 1
- Security team to set up automated PII scanning`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['authentication', '/health', '/metrics', '/api/public'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['password', '12 characters', 'uppercase', 'lowercase'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['token', 'Access', '15 minutes'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['PII', 'never log', 'encrypt', 'AES-256'],
        category: 'security',
      },
    ],
    difficulty: 'medium',
    notes: 'Well-organized security guidelines from formal review',
  },
  {
    id: 'meet-004',
    name: 'Standup notes - blockers and solutions',
    category: 'knowledge-facts',
    context: `Daily Standup - Jan 23

Alice:
- Yesterday: finished user migration script
- Today: testing on staging
- Blocker: need DB credentials for staging (John has them)

Bob:
- Y: debugging payment webhook
- T: continue debugging
- Blocker: Stripe sandbox is down, using mock for now

Charlie:
- Wrapped up PR #234
- Starting on feature flags today
- Note: feature flags repo is at github.com/company/feature-flags

Diana:
- OOO yesterday
- Catching up on Slack
- Will pair with Alice on migration

Quick Notes:
- Staging DB password is in 1password under "staging-postgres"
- Stripe sandbox expected back by EOD per their status page`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['staging DB', '1password', 'staging-postgres'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['feature flags', 'github.com/company/feature-flags'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Useful facts buried in routine standup updates',
  },
  {
    id: 'meet-005',
    name: 'Retrospective - process improvements',
    category: 'guidelines-implicit',
    context: `Sprint 22 Retro

What went well:
- Shipped checkout redesign on time
- Good collaboration between FE and BE teams
- New monitoring caught the OOM issue before it hit prod

What could improve:
- Too many meetings, need more focus time
- PRs sitting too long in review

Action items / New processes:
- Implement "no meeting Wednesday" - approved by all
- PR SLA: 24 hours for first review, 48 hours for approval
- If PR has no review after 24h, ping in #code-review
- Add "size:small" label for quick PRs that need fast turnaround
- Rotate on-call weekly instead of monthly (more sustainable)

Kudos:
- Thanks to Charlie for the monitoring setup!
- Bob's debugging on the payment issue was clutch`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['no meeting Wednesday'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['PR', 'SLA', '24 hours', 'review'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['size:small', 'label', 'fast turnaround'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['on-call', 'weekly', 'monthly'],
        category: 'workflow',
      },
    ],
    shouldNotExtract: ['kudos', 'thanks', 'clutch'],
    difficulty: 'medium',
    notes: 'Process guidelines from retrospective action items',
  },
  {
    id: 'meet-006',
    name: 'Tech spec review - API design',
    category: 'tools-api',
    context: `API Design Review - User Service v2

Attendees: API team, Mobile team, Web team

## Reviewed Endpoints

POST /api/v2/users
- Body: { email, password, name }
- Returns: 201 with user object
- Rate limit: 10 per minute per IP

GET /api/v2/users/:id
- Requires: Bearer token
- Returns: user object without password
- Cache: 5 minutes

PATCH /api/v2/users/:id
- Partial update
- Supports: name, email, avatar_url
- Cannot update: password (use separate endpoint)

DELETE /api/v2/users/:id
- Soft delete only
- Adds deleted_at timestamp
- Data retained for 30 days per GDPR

## Decisions
- All v2 endpoints use snake_case for JSON
- Errors follow RFC 7807 Problem Details format
- Pagination: cursor-based, not offset`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['POST', '/api/v2/users', 'email', 'password'],
        namePattern: '.*user.*create.*',
        category: 'api',
      },
      {
        type: 'guideline',
        mustContain: ['snake_case', 'JSON'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['RFC 7807', 'Problem Details'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['pagination', 'cursor-based', 'not offset'],
        category: 'code_style',
      },
    ],
    difficulty: 'hard',
    notes: 'API specs with embedded design guidelines',
  },
  {
    id: 'meet-007',
    name: 'Incident postmortem - findings',
    category: 'knowledge-facts',
    context: `Incident Postmortem: 2024-01-20 Outage

Duration: 2 hours 15 minutes
Severity: P1
Impact: 100% of users affected

Timeline:
- 14:32 - Alerts fire for high error rate
- 14:35 - On-call acknowledges
- 14:45 - Identified: database connection pool exhausted
- 15:20 - Root cause: new feature caused connection leak
- 15:45 - Rolled back deployment
- 16:47 - Confirmed stable

Root Cause:
The new batch export feature opened DB connections but didn't release them when requests timed out. Each failed request leaked one connection. Pool size was 50, exhausted in ~30 minutes under load.

Key Findings:
- Connection pool was set to only 50, should be 200 for our load
- No alerting on pool usage until it hit 100%
- Timeout handling in ExportService didn't close connections

Fixes Applied:
- Increased pool size to 200
- Added connection pool monitoring at 70% threshold
- Fixed ExportService.cleanup() to always release connections

Follow-up:
- Add integration test for connection cleanup
- Document connection management best practices`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['connection pool', '50', '200', 'load'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['ExportService', 'connection leak', 'timeout'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['pool monitoring', '70%', 'threshold'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Technical facts from incident investigation',
  },
  {
    id: 'meet-008',
    name: 'Onboarding checklist discussion',
    category: 'tools-scripts',
    context: `New Dev Onboarding Meeting

Discussed improvements to onboarding process.

Current Setup Steps:
1. Clone repo: git clone git@github.com:company/monorepo.git
2. Install deps: npm install (uses node 20, check .nvmrc)
3. Copy env: cp .env.example .env.local
4. Start services: docker-compose up -d
5. Seed DB: npm run db:seed
6. Run app: npm run dev

Common Issues:
- Docker needs 8GB+ RAM allocated
- M1 Macs need: export DOCKER_DEFAULT_PLATFORM=linux/amd64
- If db:seed fails, run: npm run db:reset first

New Shortcuts Approved:
- npm run setup - will do steps 3-5 automatically
- npm run doctor - checks all prerequisites and suggests fixes

Action: DevX team to implement setup and doctor commands by Friday`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['npm run db:seed'],
        namePattern: '.*seed.*',
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['npm run db:reset'],
        namePattern: '.*reset.*',
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['docker-compose up', '-d'],
        category: 'cli',
      },
      {
        type: 'knowledge',
        mustContain: ['Docker', '8GB', 'RAM'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['M1 Mac', 'DOCKER_DEFAULT_PLATFORM', 'linux/amd64'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Development tools and environment facts from onboarding',
  },
  {
    id: 'meet-009',
    name: 'Data team sync - pipeline decisions',
    category: 'knowledge-decisions',
    context: `Data Team Weekly Sync
Jan 24, 2024

## Pipeline Decisions

After last week's discussion, we're finalizing:

1. ETL Tool: Going with Airflow over Prefect
   - Better community support
   - Team already knows Python
   - Decision owner: Sarah

2. Data Warehouse: Snowflake
   - Considered BigQuery but Snowflake has better dbt integration
   - Budget approved for Team tier

3. Transformation: dbt Cloud
   - Not self-hosted - maintenance overhead not worth it
   - Using dbt Cloud Team plan ($100/seat/month)

4. Orchestration Schedule:
   - Raw -> Staging: hourly
   - Staging -> Marts: every 6 hours
   - Full refresh: daily at 2 AM UTC

## Dependencies
- Need Snowflake credentials from IT
- Airflow cluster needs 4 workers minimum`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Airflow', 'Prefect'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Snowflake', 'BigQuery', 'dbt integration'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['dbt Cloud', 'not self-hosted'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Raw', 'Staging', 'hourly', 'Marts', '6 hours'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Data engineering decisions with alternatives considered',
  },
  {
    id: 'meet-010',
    name: 'Release planning - constraints',
    category: 'guidelines-compound',
    context: `Q1 Release Planning

Release Constraints (non-negotiable):
- Code freeze: 2 weeks before release date
- No breaking changes in minor versions
- All public APIs must have OpenAPI spec before release
- Performance regression > 10% blocks release
- Security scan must pass with no HIGH or CRITICAL findings

Release Cadence:
- Major releases: quarterly
- Minor releases: monthly (2nd Tuesday)
- Patches: as needed, same day if security-related

Documentation Requirements:
- CHANGELOG.md updated for every release
- Migration guide required for major versions
- API changelog for any endpoint changes

Rollback Plan:
- Must have tested rollback before release
- Rollback window: 24 hours
- After 24 hours, fix forward only`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['code freeze', '2 weeks', 'before release'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['breaking changes', 'minor versions'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['performance regression', '10%', 'blocks release'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['security scan', 'HIGH', 'CRITICAL'],
        category: 'security',
      },
      {
        type: 'knowledge',
        mustContain: ['Minor releases', 'monthly', '2nd Tuesday'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Multiple compound guidelines from release planning',
  },
];

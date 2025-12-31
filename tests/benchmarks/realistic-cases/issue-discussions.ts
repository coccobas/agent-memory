/**
 * Realistic Issue Discussions Test Cases
 *
 * GitHub/GitLab issue threads with bug reports, feature requests,
 * and technical discussions containing knowledge and decisions.
 */

import type { ExtractionTestCase } from '../extraction-quality-types.js';

export const ISSUE_DISCUSSION_CASES: ExtractionTestCase[] = [
  {
    id: 'issue-001',
    name: 'Bug report - memory leak investigation',
    category: 'knowledge-facts',
    context: `Issue #1234: Memory leak in production

**Description:**
Production pods are running out of memory after ~24 hours. Memory usage grows linearly until OOMKilled.

**Investigation comments:**

@alice (2 days ago):
Attached heap dumps from two pods. Looks like EventEmitter listeners aren't being cleaned up.

@bob (2 days ago):
Confirmed. The WebSocket handler adds listeners on every connection but doesn't remove them on disconnect. Found in src/websocket/handler.ts line 45.

@charlie (1 day ago):
Root cause identified. The \`on('message')\` listener uses a closure that holds reference to the connection object. Even after disconnect, the closure prevents GC.

Fix: Use \`once()\` instead of \`on()\` for one-time handlers, and explicitly call \`removeAllListeners()\` in the disconnect handler.

@alice (1 day ago):
Confirmed fix works. Memory stable at 512MB after 48 hours of testing.

**Resolution:**
Fixed in PR #1256. Key learnings:
- Always clean up EventEmitter listeners in disconnect/destroy handlers
- Use weak references for long-lived connection maps
- Add memory monitoring alert at 80% threshold`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['EventEmitter', 'listeners', 'cleaned up', 'disconnect'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['once()', 'instead of', 'on()', 'one-time'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['clean up', 'EventEmitter', 'disconnect', 'destroy'],
      },
    ],
    difficulty: 'hard',
    notes: 'Technical investigation with root cause and fix',
  },
  {
    id: 'issue-002',
    name: 'Feature request - decision thread',
    category: 'knowledge-decisions',
    context: `Issue #567: Add support for SSO authentication

**Request:**
We need SAML/OIDC support for enterprise customers.

---

**Discussion:**

@product-lead:
Priority: High. Three enterprise prospects are blocked on this.

@security-lead:
Recommend OIDC over SAML. Reasons:
- Simpler implementation
- Better mobile support
- Modern spec with active development

@backend-lead:
Agree on OIDC. For implementation, two options:
1. Build in-house with passport.js
2. Use Auth0 or Okta

My recommendation: Auth0. We don't have the security expertise to build it right.

@cto:
Approved Auth0. Budget allocated.
- Use Auth0 Organizations for multi-tenant
- Enable MFA by default for enterprise plans
- Fallback to email/password for non-SSO users

**Decision (2024-01-15):**
Using Auth0 with OIDC. Implementation starts Sprint 24. Target: 6 weeks.`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['OIDC', 'over SAML', 'mobile support'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Auth0', 'approved', 'not', 'in-house'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Auth0 Organizations', 'multi-tenant'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['MFA', 'by default', 'enterprise'],
        category: 'security',
      },
    ],
    difficulty: 'medium',
    notes: 'Feature discussion with final decision',
  },
  {
    id: 'issue-003',
    name: 'API design discussion',
    category: 'guidelines-explicit',
    context: `Issue #890: Standardize API error responses

**Problem:**
Our API returns errors inconsistently. Some endpoints return:
\`{ "error": "message" }\`
Others return:
\`{ "message": "error", "code": 123 }\`

---

**Proposal by @api-lead:**

Adopt RFC 7807 Problem Details:
\`\`\`json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "Email format is invalid",
  "instance": "/api/users/123"
}
\`\`\`

**Discussion:**

@frontend:
+1 This is way better. Can we also include field-level errors?

@api-lead:
Yes, we'll extend with an \`errors\` array for validation:
\`\`\`json
{
  "type": "...",
  "errors": [
    { "field": "email", "message": "Invalid format" }
  ]
}
\`\`\`

@mobile:
Please include a machine-readable error code too. We need it for i18n.

@api-lead:
Good point. Adding \`code\` field: \`"code": "VALIDATION_EMAIL_FORMAT"\`

**Accepted Standards:**
1. All errors follow RFC 7807 structure
2. Add \`errors\` array for field-level validation
3. Add \`code\` for machine-readable error types
4. HTTP status must match \`status\` field
5. \`type\` URL must be documented in API docs`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['RFC 7807', 'Problem Details'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['errors', 'array', 'field-level', 'validation'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['code', 'machine-readable'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['HTTP status', 'match', 'status field'],
        category: 'code_style',
      },
    ],
    difficulty: 'medium',
    notes: 'API standard established through discussion',
  },
  {
    id: 'issue-004',
    name: 'Performance issue - database findings',
    category: 'knowledge-facts',
    context: `Issue #1456: Slow dashboard loading (>5s)

**Reported by:** @pm-sarah
Dashboard takes 5-8 seconds to load for users with many projects.

---

**Investigation:**

@backend-dev (Day 1):
Initial profiling shows 3 slow queries. Total DB time: 4.2s

@dba (Day 1):
Analyzed the queries:

1. \`SELECT * FROM projects WHERE user_id = ?\` - 1.8s
   Missing index on user_id. Table has 2M rows.
   FIX: \`CREATE INDEX idx_projects_user_id ON projects(user_id);\`
   After: 12ms

2. \`SELECT COUNT(*) FROM tasks WHERE project_id IN (...)\` - 1.5s
   100 project IDs causing IN clause explosion.
   FIX: Batch into groups of 10, or use temp table.
   After: 80ms

3. \`SELECT * FROM activity_log WHERE ...\` - 0.9s
   Fetching 10K rows, only need 50.
   FIX: Add LIMIT 50
   After: 5ms

@backend-dev (Day 2):
Applied all fixes. Dashboard now loads in 320ms.

**Key learnings stored for future:**
- projects table: 2M rows, ~50K new/month
- tasks table: 15M rows, ~200K new/month
- Always use LIMIT on activity queries
- IN clause: max 10 items, use temp table for more`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['projects', 'index', 'user_id', '2M rows'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['IN clause', '10 items', 'temp table'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['LIMIT', 'activity queries'],
      },
      {
        type: 'knowledge',
        mustContain: ['tasks table', '15M rows', '200K new/month'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Database performance facts from investigation',
  },
  {
    id: 'issue-005',
    name: 'Security vulnerability - handling',
    category: 'guidelines-explicit',
    context: `Issue #1789 [SECURITY]: XSS vulnerability in comment rendering

**Reporter:** External security researcher via HackerOne
**Severity:** High
**CVSS:** 7.5

---

**Timeline:**

Day 0 - @security:
Confirmed vulnerability. User-submitted markdown is rendered without sanitization in src/components/Comment.tsx.

Day 0 - @security:
Temporary mitigation deployed: disabled HTML in markdown parser.

Day 1 - @frontend-lead:
Proper fix PR #1802:
- Use DOMPurify for all user-generated HTML
- Configure allowlist: only <p>, <a>, <code>, <pre>, <ul>, <li>
- Strip all event handlers (onclick, onerror, etc.)

Day 2 - @security:
Fix verified. Deploying to production.

**Post-mortem action items:**
1. All user content MUST go through sanitize() before render
2. Add ESLint rule to flag dangerouslySetInnerHTML usage
3. Security review required for any markdown/HTML rendering changes
4. Add XSS test cases to security test suite

**Disclosure:**
90-day disclosure agreed with researcher. Public disclosure: 2024-04-15.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['user content', 'sanitize()', 'before render'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['ESLint', 'dangerouslySetInnerHTML'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['Security review', 'markdown', 'HTML rendering'],
        category: 'security',
      },
      {
        type: 'knowledge',
        mustContain: ['DOMPurify', 'allowlist', '<p>', '<a>'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Security guidelines from vulnerability response',
  },
  {
    id: 'issue-006',
    name: 'Migration planning discussion',
    category: 'knowledge-decisions',
    context: `Issue #2001: Migrate from Heroku to AWS

**Context:**
Heroku costs increasing. Need to migrate to AWS by Q2.

---

**Options evaluated:**

@devops-lead:
1. ECS Fargate - Serverless containers
   - Pro: No server management
   - Con: Cold starts, limited customization

2. EKS - Managed Kubernetes
   - Pro: Full control, industry standard
   - Con: Complexity, learning curve

3. EC2 + Docker Compose
   - Pro: Simple, familiar
   - Con: Manual scaling, single point of failure

**Team input:**

@backend: Prefer EKS for long-term, but learning curve is steep.

@cto: We don't have k8s expertise. Let's start simple.

**Decision:**
Phase 1: ECS Fargate for stateless services (API, workers)
Phase 2: RDS for database (not self-managed)
Phase 3: Evaluate EKS in 12 months when team is larger

**Infrastructure specs decided:**
- Region: us-east-1 (primary), us-west-2 (DR)
- ECS cluster: 2-10 tasks auto-scaling
- RDS: db.r5.large, Multi-AZ
- Redis: ElastiCache r5.large
- S3 for file storage, CloudFront for CDN`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['ECS Fargate', 'stateless', 'API', 'workers'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['RDS', 'not self-managed'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['EKS', '12 months', 'team is larger'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['us-east-1', 'primary', 'us-west-2', 'DR'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Infrastructure decisions with rationale',
  },
  {
    id: 'issue-007',
    name: 'Testing strategy discussion',
    category: 'guidelines-explicit',
    context: `Issue #2234: Establish testing standards

**Problem:**
Inconsistent testing across teams. Some have 90% coverage, others 20%.

---

**Proposal by @qa-lead:**

**Coverage targets by code type:**

| Type | Target | Required |
|------|--------|----------|
| Business logic | 90% | Yes |
| API handlers | 80% | Yes |
| UI components | 60% | No |
| Utils/helpers | 80% | Yes |
| Config/setup | 0% | No |

**Test types required:**

1. Unit tests - All PRs
2. Integration tests - API changes only
3. E2E tests - Critical paths only (login, checkout, payment)

**Discussion:**

@frontend: 60% for UI seems low?

@qa-lead: UI changes fast, tests become maintenance burden. Focus on interaction tests not snapshot tests.

@backend: Should we require tests for bug fixes?

@qa-lead: Yes! Every bug fix must include a regression test that fails before the fix and passes after.

**Approved by @cto:**
Implementing in Sprint 25. CI will enforce via coverage gates.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['Business logic', '90%'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['API handlers', '80%'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['E2E', 'critical paths', 'login', 'checkout', 'payment'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['bug fix', 'regression test'],
        category: 'testing',
      },
    ],
    difficulty: 'medium',
    notes: 'Testing standards established through discussion',
  },
  {
    id: 'issue-008',
    name: 'Deprecation planning',
    category: 'knowledge-facts',
    context: `Issue #2456: Deprecate legacy authentication endpoints

**Scope:**
Deprecating v1 auth endpoints in favor of v2.

---

**Endpoints to deprecate:**

| Endpoint | v1 (deprecated) | v2 (new) |
|----------|-----------------|----------|
| Login | POST /auth/login | POST /v2/auth/token |
| Refresh | POST /auth/refresh | POST /v2/auth/token/refresh |
| Logout | POST /auth/logout | DELETE /v2/auth/token |

**Timeline:**

@api-lead:
- Phase 1 (Now): Add deprecation headers to v1 responses
  \`Deprecation: true\`
  \`Sunset: 2024-06-01\`

- Phase 2 (March): Send email to all API consumers

- Phase 3 (May): Return 410 Gone with migration info

- Phase 4 (June 1): Remove endpoints entirely

**Consumer stats:**
- 156 active API keys using v1
- 89% of traffic is from 10 consumers
- Top consumer: Mobile app (will migrate in April)

**Migration guide:**
Created at docs/migration/auth-v1-to-v2.md

@pm:
Do we have a way to contact these consumers?

@api-lead:
Yes, all API keys have associated email. Will use for Phase 2.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['v1', 'deprecated', 'v2', '/v2/auth/token'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['Deprecation header', 'Sunset', '2024-06-01'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['156', 'API keys', 'v1'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['migration', 'auth-v1-to-v2.md'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Deprecation facts and timeline',
  },
  {
    id: 'issue-009',
    name: 'Incident response process',
    category: 'guidelines-compound',
    context: `Issue #2678: Define incident response process

**Background:**
Last outage took 3 hours because no one knew who to contact.

---

**Proposed process by @sre-lead:**

**Severity levels:**

- P1 (Critical): Complete outage, all users affected
  - Response: 15 min, Resolution: 1 hour target
  - Notify: CTO, all on-call

- P2 (Major): Partial outage, >10% users affected
  - Response: 30 min, Resolution: 4 hours target
  - Notify: Engineering lead, on-call

- P3 (Minor): Degraded performance, <10% affected
  - Response: 2 hours, Resolution: 24 hours target
  - Notify: On-call only

**Roles:**

1. Incident Commander (IC): Makes decisions, coordinates
2. Technical Lead: Investigates and implements fix
3. Communications: Updates status page and stakeholders

**Runbook requirements:**
- Every service MUST have a runbook in docs/runbooks/
- Runbook must include: common issues, restart procedures, escalation contacts
- Review runbooks quarterly

**Post-incident:**
- Blameless postmortem within 48 hours for P1/P2
- Action items tracked in this repo with [INCIDENT] label

**Approved:** Effective immediately.`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['P1', 'Critical', 'outage', '15 min', 'response'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['P2', 'Major', '10%', '30 min'],
        category: 'fact',
      },
      {
        type: 'guideline',
        mustContain: ['service', 'MUST', 'runbook', 'docs/runbooks'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['postmortem', '48 hours', 'P1', 'P2', 'blameless'],
        category: 'workflow',
      },
      {
        type: 'guideline',
        mustContain: ['Incident Commander', 'makes decisions', 'coordinates'],
        category: 'workflow',
      },
    ],
    difficulty: 'hard',
    notes: 'Incident response guidelines and process',
  },
  {
    id: 'issue-010',
    name: 'Tool selection discussion',
    category: 'knowledge-decisions',
    context: `Issue #2890: Select monitoring stack

**Need:**
Current monitoring (Datadog) is too expensive. Need alternatives.

---

**Options evaluated by @sre-team:**

1. **Grafana Cloud**
   - Cost: $49/user/month
   - Pro: Familiar UI, good alerting
   - Con: Logs separate cost

2. **New Relic**
   - Cost: Per-GB pricing
   - Pro: All-in-one
   - Con: Gets expensive at scale

3. **Self-hosted (Prometheus + Grafana + Loki)**
   - Cost: Infrastructure only
   - Pro: No per-seat costs
   - Con: Maintenance overhead

**Discussion:**

@cto: What's our current Datadog bill?

@sre-lead: $8K/month and growing. Mostly log ingestion.

@cto: That's too high. What about self-hosted?

@sre-lead: We'd need 0.5 FTE to maintain. But saves $6K/month after infra costs.

@cto: Let's try it. Start with non-critical services.

**Decision:**
Self-hosted Prometheus + Grafana + Loki stack.
- Timeline: 3 months to full migration
- Keep Datadog for critical services during transition
- One SRE allocated 50% to this project

**Specs:**
- Prometheus: 2-week retention
- Loki: 30-day retention (S3 backend)
- Grafana: Hosted on internal k8s cluster`,
    contextType: 'mixed',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Prometheus', 'Grafana', 'Loki', 'self-hosted'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['Datadog', '$8K/month', 'log ingestion'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['Prometheus', '2-week', 'retention'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['Loki', '30-day', 'S3 backend'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Tool selection with cost analysis',
  },
];

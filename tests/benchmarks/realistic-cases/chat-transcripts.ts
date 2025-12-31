/**
 * Realistic Chat Transcript Test Cases
 *
 * Slack/Discord-style back-and-forth conversations with technical decisions,
 * guidelines, and knowledge embedded in natural conversation flow.
 */

import type { ExtractionTestCase } from '../extraction-quality-types.js';

export const CHAT_TRANSCRIPT_CASES: ExtractionTestCase[] = [
  {
    id: 'chat-001',
    name: 'Slack - database migration discussion',
    category: 'knowledge-decisions',
    context: `[#backend]
alice: hey team, we need to decide on the db migration strategy for the user table
bob: what are the options?
alice: 1) big bang - migrate everything at once, 2) shadow writes - dual write during transition
charlie: shadow writes is safer but more complex
bob: how long would big bang take?
alice: maybe 2 hours downtime
charlie: thats too long for us
bob: agreed, lets go with shadow writes
alice: ok ill draft the RFC. we'll use shadow writes with a 2 week dual-write period
charlie: sounds good :thumbsup:`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['shadow writes', 'dual-write', '2 week'],
        category: 'decision',
      },
    ],
    difficulty: 'medium',
    notes: 'Decision embedded in casual conversation with emoji',
  },
  {
    id: 'chat-002',
    name: 'Slack - debugging session with discovery',
    category: 'knowledge-facts',
    context: `[#incidents]
sarah: the checkout flow is broken again
mike: whats the error?
sarah: 500 on /api/checkout/confirm
mike: checking logs...
mike: found it - redis connection timeout
sarah: same as last week?
mike: no different. this time its the session store, port 6380 not the cache on 6379
sarah: oh we have two redis instances?
mike: yeah session store is separate for security. it uses TLS on 6380
sarah: good to know, ill update the runbook
mike: :+1:`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['Redis', 'session store', '6380', 'TLS'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['cache', '6379'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Infrastructure facts discovered during debugging',
  },
  {
    id: 'chat-003',
    name: 'Slack - coding standards debate',
    category: 'guidelines-explicit',
    context: `[#frontend]
dev1: should we use optional chaining everywhere or null checks?
dev2: optional chaining is cleaner
dev1: but its harder to debug when things are undefined
lead: lets establish a guideline
lead: use optional chaining for data access like user?.profile?.name
lead: but use explicit null checks with early returns for function params
dev1: makes sense
dev2: agreed, ill add it to our style guide
lead: also always use nullish coalescing ?? not || for defaults
dev2: why?
lead: || treats 0 and '' as falsy which causes bugs
dev1: good point`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['optional chaining', 'data access'],
      },
      {
        type: 'guideline',
        mustContain: ['null check', 'early return', 'function param'],
      },
      {
        type: 'guideline',
        mustContain: ['nullish coalescing', '??', 'not ||'],
      },
    ],
    difficulty: 'hard',
    notes: 'Multiple guidelines established in natural conversation',
  },
  {
    id: 'chat-004',
    name: 'Discord - tool recommendation',
    category: 'tools-cli',
    context: `[#devops]
newbie: whats the best way to check pod logs in k8s?
senior: kubectl logs -f <pod-name> for streaming
senior: or use stern for multiple pods: stern "api-*" --tail 100
newbie: stern?
senior: yeah its a multi-pod log tailer. install with brew install stern
newbie: nice! what about searching logs?
senior: pipe to grep or use -c flag for containers: kubectl logs <pod> -c <container>
admin: we also have loki if you need historical. grafana > explore > loki
newbie: thanks all :pray:`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['kubectl logs', '-f'],
        namePattern: '.*kubectl.*',
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['stern', 'multi-pod', 'tail'],
        namePattern: '.*stern.*',
        category: 'cli',
      },
    ],
    difficulty: 'medium',
    notes: 'CLI tools explained in helpful exchange',
  },
  {
    id: 'chat-005',
    name: 'Slack - API versioning decision',
    category: 'knowledge-decisions',
    context: `[#api-design]
pm: we need to ship breaking changes to the user API
arch: we have to version it properly this time
dev: URL versioning like /v2/users?
arch: no, lets use header versioning. Accept: application/vnd.api+json;version=2
pm: why not URL?
arch: cleaner URLs, easier to sunset, follows REST best practices
dev: but our clients already use /v1
arch: we'll support both for 6 months then deprecate URL versioning
pm: ok decision made: header versioning going forward, 6 month grace period for v1 URLs
arch: ill document in the ADR`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['header versioning', 'Accept', 'version'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['6 month', 'deprecate', 'URL versioning'],
        category: 'decision',
      },
    ],
    difficulty: 'medium',
    notes: 'Architectural decision with rationale',
  },
  {
    id: 'chat-006',
    name: 'Slack - security incident response',
    category: 'guidelines-explicit',
    context: `[#security]
sec: reminder: if you find a security vuln, do NOT post details in public channels
dev: what should we do instead?
sec: 1. DM me or @security-team immediately
sec: 2. do not commit fixes to public branches yet
sec: 3. create private draft PR with [SECURITY] prefix
dev: what about dependencies with CVEs?
sec: use dependabot alerts, dont announce in chat
sec: we have a 48h SLA for critical CVEs, 7 days for high
pm: should PMs know about vulns?
sec: only after patch is ready. no exceptions.
dev: got it`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['security', 'DM', 'security-team'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['private', 'draft PR', '[SECURITY]'],
        category: 'security',
      },
      {
        type: 'knowledge',
        mustContain: ['48h', 'SLA', 'critical CVE'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Security guidelines in conversational format',
  },
  {
    id: 'chat-007',
    name: 'Discord - testing philosophy',
    category: 'guidelines-implicit',
    context: `[#testing]
junior: how much test coverage should i aim for?
senior: depends on the code
junior: like what?
senior: business logic - 90%+. UI components - 60% is fine. Config files - dont bother
junior: why not test config?
senior: waste of time, integration tests catch those issues
mid: i disagree, i test config loading
senior: fair, but not the structure. test that it loads, not that PORT is 3000
junior: makes sense
senior: also: no mocking unless absolutely necessary. use real DBs in tests
mid: we use testcontainers for that
junior: ok ill follow that`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['business logic', '90%'],
      },
      {
        type: 'guideline',
        mustContain: ['UI component', '60%'],
      },
      {
        type: 'guideline',
        mustContain: ['no mocking', 'real DB'],
      },
    ],
    difficulty: 'hard',
    notes: 'Implicit guidelines in advice-giving conversation',
  },
  {
    id: 'chat-008',
    name: 'Slack - feature flag usage',
    category: 'tools-function',
    context: `[#platform]
dev: how do i use feature flags in the app?
platform: import { isEnabled } from '@company/flags'
platform: then: if (isEnabled('new-checkout')) { ... }
dev: wheres the flag defined?
platform: launchdarkly dashboard. ask PM for access
dev: can i create my own?
platform: yes but follow naming: <team>-<feature>-<variant>
platform: like payments-checkout-v2
dev: what about backend?
platform: same SDK works server-side. just init with server key not client key
dev: whats the difference?
platform: client key is public, server key has full access including targeting rules`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['isEnabled', '@company/flags'],
        category: 'function',
      },
      {
        type: 'guideline',
        mustContain: ['naming', 'team', 'feature', 'variant'],
      },
    ],
    difficulty: 'medium',
    notes: 'API usage pattern explained conversationally',
  },
  {
    id: 'chat-009',
    name: 'Slack - performance incident learnings',
    category: 'knowledge-facts',
    context: `[#post-mortems]
sre: quick summary of yesterday's slowdown
sre: root cause: unbounded query in /api/reports
sre: the query had no LIMIT and returned 500k rows
dev: oops that was my PR
sre: no blame, but lesson learned
sre: FACT: our postgres can handle ~10k rows per query before timeouts
sre: FACT: reports table has 2M rows and growing 50k/day
dev: should i add pagination?
sre: yes, and add this index: CREATE INDEX idx_reports_user_date ON reports(user_id, created_at DESC)
dev: will do
sre: also please add query timeout to all report endpoints: SET statement_timeout = '5s'`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['postgres', '10k rows', 'timeout'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['reports', '2M rows', '50k/day'],
        category: 'fact',
      },
      {
        type: 'tool',
        mustContain: ['CREATE INDEX', 'idx_reports', 'user_id', 'created_at'],
        category: 'cli',
      },
    ],
    difficulty: 'hard',
    notes: 'Performance facts and fix discovered in post-mortem',
  },
  {
    id: 'chat-010',
    name: 'Slack - deployment workflow',
    category: 'tools-scripts',
    context: `[#deployments]
newdev: how do i deploy to staging?
ops: run: npm run deploy:staging
newdev: just that?
ops: yep it handles everything. build, push to ecr, update ecs
newdev: what about prod?
ops: same but npm run deploy:prod - requires 2 approvals in github
lead: also make sure youre on the release branch
ops: right. checkout release/v*, then deploy
newdev: how do i create a release?
ops: npm run release:create -- --version 1.2.3
ops: it creates the branch, bumps version, opens PR
newdev: cool thanks
lead: and NEVER deploy on fridays after 3pm
ops: :skull: learned that one the hard way`,
    contextType: 'conversation',
    expectedEntries: [
      {
        type: 'tool',
        mustContain: ['npm run deploy:staging'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['npm run deploy:prod', '2 approvals'],
        category: 'cli',
      },
      {
        type: 'tool',
        mustContain: ['npm run release:create', '--version'],
        category: 'cli',
      },
      {
        type: 'guideline',
        mustContain: ['NEVER deploy', 'friday', '3pm'],
        category: 'workflow',
      },
    ],
    difficulty: 'hard',
    notes: 'Multiple tools and one guideline in deployment onboarding',
  },
];

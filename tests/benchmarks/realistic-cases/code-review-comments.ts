/**
 * Realistic Code Review Comments Test Cases
 *
 * PR comments, suggestions, and review feedback with technical
 * guidelines and knowledge embedded in review discussions.
 */

import type { ExtractionTestCase } from '../extraction-quality-types.js';

export const CODE_REVIEW_CASES: ExtractionTestCase[] = [
  {
    id: 'review-001',
    name: 'PR review - error handling pattern',
    category: 'guidelines-explicit',
    context: `Pull Request #1234: Add user validation
File: src/services/UserService.ts

Reviewer (senior-dev):
> Line 45: The try-catch here is too broad. We have a standard pattern for this.

SUGGESTION: Use our Result type pattern instead of try-catch:
\`\`\`typescript
// Instead of:
try {
  const user = await this.findUser(id);
} catch (e) {
  throw new Error('Failed');
}

// Use:
const result = await this.findUser(id);
if (result.isErr()) {
  return Result.err(new UserNotFoundError(id));
}
\`\`\`

Author:
> Oh I didn't know we had a Result type. Where is it?

Reviewer:
> src/lib/result.ts - we use neverthrow library. All service methods should return Result<T, E> instead of throwing. Makes error handling explicit.

Author:
> Got it, updating now.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['Result type', 'instead of try-catch'],
      },
      {
        type: 'guideline',
        mustContain: ['service methods', 'return Result', 'instead of throwing'],
      },
      {
        type: 'knowledge',
        mustContain: ['neverthrow', 'src/lib/result.ts'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Error handling pattern explained in review',
  },
  {
    id: 'review-002',
    name: 'PR review - SQL query optimization',
    category: 'guidelines-implicit',
    context: `Pull Request #1567: Add report generation
File: src/queries/reports.sql

Reviewer (dba):
> This query will be slow on large tables. A few issues:

1. Line 12: SELECT * - never use SELECT * in production code. List explicit columns.

2. Line 15: The WHERE clause uses OR with different columns. This prevents index usage. Split into UNION ALL:
\`\`\`sql
SELECT id, name FROM reports WHERE status = 'pending'
UNION ALL
SELECT id, name FROM reports WHERE created_at > NOW() - INTERVAL '7 days'
\`\`\`

3. Line 20: Missing index hint. For this table size (5M+ rows), add:
\`\`\`sql
CREATE INDEX CONCURRENTLY idx_reports_status ON reports(status) WHERE status = 'pending';
\`\`\`

The CONCURRENTLY keyword is important - it doesn't lock the table during creation.

Author:
> Thanks for the detailed review! I'll apply all suggestions.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['SELECT *', 'never use', 'production', 'explicit columns'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['OR', 'UNION ALL', 'index usage'],
        category: 'code_style',
      },
      {
        type: 'knowledge',
        mustContain: ['CONCURRENTLY', "doesn't lock", 'table'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'SQL best practices from DBA review',
  },
  {
    id: 'review-003',
    name: 'PR review - API design feedback',
    category: 'guidelines-explicit',
    context: `Pull Request #1892: Add payment webhook endpoint
File: src/routes/webhooks.ts

Reviewer (api-lead):
> Good start but needs some changes for our webhook standards:

1. Rename endpoint from POST /webhook/stripe to POST /webhooks/payments/stripe
   - We namespace all webhooks under /webhooks/{domain}/{provider}

2. Missing idempotency check. All webhooks MUST:
   - Store event ID in redis with 24h TTL
   - Return 200 immediately if already processed
   - This prevents duplicate processing

3. Signature verification looks good but should be middleware:
\`\`\`typescript
app.post('/webhooks/payments/stripe',
  verifyStripeSignature,  // middleware
  handleStripeWebhook     // handler
);
\`\`\`

4. Response should always be 200, even on internal errors. Log the error but return 200 - Stripe will retry on non-2xx which causes duplicate processing.

Author:
> Makes sense, implementing all of these. Is there a shared verifyStripeSignature middleware?

Reviewer:
> Yes, src/middleware/webhooks.ts exports all provider verifiers.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['/webhooks/', 'domain', 'provider'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['idempotency', 'event ID', 'redis', '24h'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['webhook', '200', 'internal errors', 'retry'],
        category: 'code_style',
      },
      {
        type: 'knowledge',
        mustContain: ['middleware/webhooks.ts', 'provider verifiers'],
        category: 'fact',
      },
    ],
    difficulty: 'hard',
    notes: 'Webhook design standards in PR feedback',
  },
  {
    id: 'review-004',
    name: 'PR review - testing requirements',
    category: 'guidelines-explicit',
    context: `Pull Request #2001: Add email service
File: src/services/EmailService.ts

Reviewer (qa-lead):
> Nice implementation but missing required tests. Our testing policy for services:

1. Unit tests for all public methods - I see none in tests/
2. At least one integration test with real SMTP (use Mailhog in CI)
3. Error scenarios MUST be tested:
   - Network timeout
   - Invalid recipient
   - Rate limiting

Also noticed you're mocking fetch directly. We don't do that anymore.

Instead use msw (Mock Service Worker):
\`\`\`typescript
import { setupServer } from 'msw/node';
// NOT: jest.mock('node-fetch')
\`\`\`

MSW gives more realistic testing and works in both unit and integration tests.

Author:
> I'll add the tests. Is there a template I can follow?

Reviewer:
> Check tests/services/PaymentService.test.ts - it follows all our patterns.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['unit tests', 'public methods'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['integration test', 'SMTP', 'Mailhog'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['Error scenarios', 'MUST', 'tested'],
        category: 'testing',
      },
      {
        type: 'guideline',
        mustContain: ['msw', 'Mock Service Worker', 'not', 'mock', 'fetch'],
        category: 'testing',
      },
    ],
    difficulty: 'medium',
    notes: 'Testing standards from QA lead review',
  },
  {
    id: 'review-005',
    name: 'PR review - security concerns',
    category: 'guidelines-explicit',
    context: `Pull Request #2134: Add admin user lookup
File: src/routes/admin.ts

Reviewer (security):
> BLOCKING: Several security issues here:

1. Line 23: SQL injection vulnerability
\`\`\`typescript
// VULNERABLE:
const query = \`SELECT * FROM users WHERE email = '\${email}'\`;

// SAFE:
const query = 'SELECT * FROM users WHERE email = $1';
await db.query(query, [email]);
\`\`\`

2. Line 45: Missing authorization check. All admin routes must call:
\`\`\`typescript
requireRole('admin')  // middleware from src/middleware/auth
\`\`\`

3. Line 52: Logging PII (email). Our policy: NEVER log PII fields. Log user ID instead.

4. Response includes password hash. Filter sensitive fields:
\`\`\`typescript
const { password, ...safeUser } = user;
return res.json(safeUser);
\`\`\`

Please fix and request re-review. Do not merge until security approval.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['SQL injection', 'parameterized', '$1'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['admin routes', 'requireRole'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['NEVER log', 'PII', 'user ID instead'],
        category: 'security',
      },
      {
        type: 'guideline',
        mustContain: ['password hash', 'filter sensitive fields'],
        category: 'security',
      },
    ],
    difficulty: 'medium',
    notes: 'Security review blocking issues',
  },
  {
    id: 'review-006',
    name: 'PR review - performance suggestions',
    category: 'knowledge-facts',
    context: `Pull Request #2256: Optimize dashboard queries
File: src/services/DashboardService.ts

Reviewer (performance):
> Good optimizations! A few more things I learned from profiling:

1. Line 34: This N+1 query pattern is killing us. Use a single JOIN or batch fetch:
   - Currently: 500ms with 100 items
   - With batch: ~50ms

2. The cache TTL of 60 seconds is too short for dashboard data. Our benchmarks show:
   - 300s (5 min) reduces DB load by 80%
   - Dashboard data only changes hourly anyway

3. Found in profiling: JSON.parse is called 3 times on same data. Cache the parsed result:
\`\`\`typescript
// In our codebase, use memoize from src/utils/cache
import { memoize } from '@/utils/cache';
const parseConfig = memoize(JSON.parse);
\`\`\`

4. FYI: We have a @Cacheable decorator in src/decorators that handles most caching patterns. Check the README in that folder.

Author:
> These are great tips, thanks! Didn't know about the decorator.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['N+1', 'batch', '500ms', '50ms'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['cache TTL', '300s', '5 min', '80%'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['@Cacheable', 'decorator', 'src/decorators'],
        category: 'fact',
      },
      {
        type: 'tool',
        mustContain: ['memoize', '@/utils/cache'],
        category: 'function',
      },
    ],
    difficulty: 'hard',
    notes: 'Performance insights with specific numbers',
  },
  {
    id: 'review-007',
    name: 'PR review - code style',
    category: 'guidelines-explicit',
    context: `Pull Request #2301: Add utility functions
File: src/utils/string.ts

Reviewer (tech-lead):
> Small PR but a few style things we enforce:

1. Function naming: use verb prefixes
   - Not: \`stringLength()\` -> \`getStringLength()\`
   - Not: \`emails(arr)\` -> \`filterEmails(arr)\`

2. Export style: named exports only, no default exports
\`\`\`typescript
// NO:
export default function foo() {}

// YES:
export function foo() {}
\`\`\`
This makes imports more consistent and tree-shaking better.

3. JSDoc required for all exported functions. At minimum:
\`\`\`typescript
/**
 * Brief description
 * @param x - param description
 * @returns what it returns
 */
\`\`\`

4. Prefer const arrow functions for utilities:
\`\`\`typescript
export const capitalize = (s: string): string => ...
\`\`\`

These are all in our .eslintrc but I see ESLint was disabled on this file?`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['verb prefixes', 'get', 'filter'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['named exports', 'no default exports'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['JSDoc', 'required', 'exported functions'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['const arrow functions', 'utilities'],
        category: 'code_style',
      },
    ],
    difficulty: 'easy',
    notes: 'Code style guidelines in review',
  },
  {
    id: 'review-008',
    name: 'PR review - dependency decisions',
    category: 'knowledge-decisions',
    context: `Pull Request #2445: Add date formatting utilities
File: package.json

Reviewer (arch):
> Hold on - why adding moment.js? We decided against it last quarter.

Issues with moment:
- Huge bundle size (300kb+)
- Mutable by default (causes bugs)
- No longer actively developed

Our approved alternatives:
- date-fns for formatting (tree-shakeable)
- dayjs if you need moment-like API (2kb)
- Temporal API when it's stable

For this use case (simple formatting), use date-fns:
\`\`\`typescript
import { format } from 'date-fns';
format(new Date(), 'yyyy-MM-dd');
\`\`\`

Already in our package.json, just import what you need.

Author:
> Ah sorry, I'll switch to date-fns. Where's the decision documented?

Reviewer:
> docs/adr/ADR-015-date-libraries.md`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'knowledge',
        mustContain: ['moment.js', 'decided against', 'bundle size'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['date-fns', 'approved', 'tree-shakeable'],
        category: 'decision',
      },
      {
        type: 'knowledge',
        mustContain: ['dayjs', 'moment-like API', '2kb'],
        category: 'fact',
      },
      {
        type: 'knowledge',
        mustContain: ['ADR-015', 'date-libraries'],
        category: 'fact',
      },
    ],
    difficulty: 'medium',
    notes: 'Dependency decision with alternatives',
  },
  {
    id: 'review-009',
    name: 'PR review - React patterns',
    category: 'guidelines-explicit',
    context: `Pull Request #2567: Add user settings component
File: src/components/UserSettings.tsx

Reviewer (frontend-lead):
> Few things about our React patterns:

1. State management: Don't use useState for form state. We have react-hook-form:
\`\`\`tsx
import { useForm } from 'react-hook-form';
// NOT: const [name, setName] = useState('');
\`\`\`

2. API calls: Use our useQuery hook, not useEffect + fetch:
\`\`\`tsx
import { useQuery } from '@/hooks/useQuery';
const { data, isLoading } = useQuery('/api/user');
\`\`\`
This handles caching, deduplication, and loading states.

3. Components over 100 lines should be split. This one is 250 lines.
   Extract: SettingsForm, SettingsHeader, SettingsActions

4. Tailwind classes: use cn() helper for conditional classes:
\`\`\`tsx
import { cn } from '@/lib/utils';
<div className={cn('base', isActive && 'active')} />
\`\`\`
Not string concatenation.`,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['react-hook-form', 'form state'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['useQuery', 'not useEffect', 'fetch'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['100 lines', 'split'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['cn()', 'conditional classes'],
        category: 'code_style',
      },
    ],
    difficulty: 'medium',
    notes: 'React/frontend patterns from lead',
  },
  {
    id: 'review-010',
    name: 'PR review - logging standards',
    category: 'guidelines-explicit',
    context: `Pull Request #2689: Add order processing service
File: src/services/OrderService.ts

Reviewer (observability):
> The logging here needs to follow our standards:

1. Use structured logging, not string concatenation:
\`\`\`typescript
// BAD:
logger.info('Processing order ' + orderId);

// GOOD:
logger.info('Processing order', { orderId, userId, amount });
\`\`\`

2. Log levels matter:
   - error: Something broke, needs attention
   - warn: Unusual but handled (retries, fallbacks)
   - info: Business events (order created, payment received)
   - debug: Technical details (query timing, cache hits)

3. Always include correlation ID for traceability:
\`\`\`typescript
logger.info('Order created', {
  correlationId: req.headers['x-correlation-id'],
  orderId,
  ...
});
\`\`\`

4. Sensitive data: Use our maskPII utility:
\`\`\`typescript
import { maskPII } from '@/utils/logging';
logger.info('User details', maskPII({ email, name, ssn }));
// Logs: { email: 'j***@example.com', name: 'John', ssn: '***-**-1234' }
\`\`\``,
    contextType: 'code',
    expectedEntries: [
      {
        type: 'guideline',
        mustContain: ['structured logging', 'not string concatenation'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['log levels', 'error', 'warn', 'info', 'debug'],
        category: 'code_style',
      },
      {
        type: 'guideline',
        mustContain: ['correlation ID', 'x-correlation-id'],
        category: 'code_style',
      },
      {
        type: 'tool',
        mustContain: ['maskPII', '@/utils/logging'],
        category: 'function',
      },
    ],
    difficulty: 'medium',
    notes: 'Logging standards with code examples',
  },
];

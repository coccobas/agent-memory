/**
 * Classification Quality Dataset
 *
 * ~50 labeled test cases for evaluating classification accuracy.
 * Covers various patterns, difficulty levels, and edge cases.
 */

import type { ClassificationTestCase } from './classification-quality-types.js';

export const CLASSIFICATION_TEST_CASES: ClassificationTestCase[] = [
  // =============================================================================
  // GUIDELINE - Imperative Rules (easy)
  // =============================================================================
  {
    id: 'g-imp-001',
    text: 'Rule: always use TypeScript strict mode',
    expectedType: 'guideline',
    category: 'imperative-rule',
    difficulty: 'easy',
    notes: 'Explicit "Rule:" prefix',
  },
  {
    id: 'g-imp-002',
    text: 'Must use async/await for all asynchronous operations',
    expectedType: 'guideline',
    category: 'imperative-rule',
    difficulty: 'easy',
    notes: '"Must" prefix',
  },
  {
    id: 'g-imp-003',
    text: 'Always write unit tests for new features',
    expectedType: 'guideline',
    category: 'imperative-rule',
    difficulty: 'easy',
    notes: '"Always" prefix',
  },
  {
    id: 'g-imp-004',
    text: 'Never commit directly to main branch',
    expectedType: 'guideline',
    category: 'imperative-rule',
    difficulty: 'easy',
    notes: '"Never" prefix',
  },

  // =============================================================================
  // GUIDELINE - Prohibitions
  // =============================================================================
  {
    id: 'g-proh-001',
    text: "Don't use var in TypeScript code",
    expectedType: 'guideline',
    category: 'prohibition',
    difficulty: 'easy',
    notes: '"Don\'t" prefix',
  },
  {
    id: 'g-proh-002',
    text: 'Avoid using any type whenever possible',
    expectedType: 'guideline',
    category: 'prohibition',
    difficulty: 'easy',
    notes: '"Avoid" prefix',
  },
  {
    id: 'g-proh-003',
    text: 'Do not store secrets in code',
    expectedType: 'guideline',
    category: 'prohibition',
    difficulty: 'easy',
    notes: '"Do not" prefix',
  },
  {
    id: 'g-proh-004',
    text: "We should never skip code review",
    expectedType: 'guideline',
    category: 'prohibition',
    difficulty: 'medium',
    notes: '"should never" pattern',
  },

  // =============================================================================
  // GUIDELINE - Team Standards
  // =============================================================================
  {
    id: 'g-team-001',
    text: 'We always use dependency injection',
    expectedType: 'guideline',
    category: 'team-standard',
    difficulty: 'easy',
    notes: '"We always" pattern',
  },
  {
    id: 'g-team-002',
    text: 'We must run linting before commits',
    expectedType: 'guideline',
    category: 'team-standard',
    difficulty: 'easy',
    notes: '"We must" pattern',
  },
  {
    id: 'g-team-003',
    text: 'Our standard is to use ESLint with strict rules',
    expectedType: 'guideline',
    category: 'team-standard',
    difficulty: 'medium',
    notes: '"Our standard" phrasing',
  },

  // =============================================================================
  // GUIDELINE - Preferences
  // =============================================================================
  {
    id: 'g-pref-001',
    text: 'Prefer const over let for variable declarations',
    expectedType: 'guideline',
    category: 'preference',
    difficulty: 'easy',
    notes: '"Prefer X over Y" pattern',
  },
  {
    id: 'g-pref-002',
    text: 'Use named exports instead of default exports',
    expectedType: 'guideline',
    category: 'preference',
    difficulty: 'medium',
    notes: '"Use X instead of Y" pattern',
  },
  {
    id: 'g-pref-003',
    text: 'Prefer functional components over class components',
    expectedType: 'guideline',
    category: 'preference',
    difficulty: 'easy',
    notes: '"Prefer X over Y" pattern',
  },

  // =============================================================================
  // KNOWLEDGE - Decisions
  // =============================================================================
  {
    id: 'k-dec-001',
    text: 'We decided to use PostgreSQL for production',
    expectedType: 'knowledge',
    category: 'decision',
    difficulty: 'easy',
    notes: '"We decided" pattern',
  },
  {
    id: 'k-dec-002',
    text: 'Decision: use React for the frontend framework',
    expectedType: 'knowledge',
    category: 'decision',
    difficulty: 'easy',
    notes: 'Explicit "Decision:" prefix',
  },
  {
    id: 'k-dec-003',
    text: 'We chose TypeScript over JavaScript because of type safety',
    expectedType: 'knowledge',
    category: 'decision',
    difficulty: 'easy',
    notes: '"We chose" with rationale',
  },
  {
    id: 'k-dec-004',
    text: 'After evaluating Redis and Memcached, we picked Redis',
    expectedType: 'knowledge',
    category: 'decision',
    difficulty: 'medium',
    notes: 'Decision with evaluation context',
  },

  // =============================================================================
  // KNOWLEDGE - Facts
  // =============================================================================
  {
    id: 'k-fact-001',
    text: 'The API rate limit is 1000 requests per minute',
    expectedType: 'knowledge',
    category: 'fact',
    difficulty: 'easy',
    notes: 'Technical fact',
  },
  {
    id: 'k-fact-002',
    text: 'Fact: the database schema was last updated in Q4 2024',
    expectedType: 'knowledge',
    category: 'fact',
    difficulty: 'easy',
    notes: 'Explicit "Fact:" prefix',
  },
  {
    id: 'k-fact-003',
    text: 'Note: authentication tokens expire after 24 hours',
    expectedType: 'knowledge',
    category: 'fact',
    difficulty: 'easy',
    notes: 'Explicit "Note:" prefix',
  },
  {
    id: 'k-fact-004',
    text: 'The production server is located in AWS us-east-1',
    expectedType: 'knowledge',
    category: 'fact',
    difficulty: 'medium',
    notes: 'Infrastructure fact',
  },

  // =============================================================================
  // KNOWLEDGE - System Descriptions
  // =============================================================================
  {
    id: 'k-sys-001',
    text: 'Our API uses REST, not GraphQL',
    expectedType: 'knowledge',
    category: 'system-description',
    difficulty: 'easy',
    notes: '"Our X uses Y" pattern',
  },
  {
    id: 'k-sys-002',
    text: 'The backend is built with Node.js and Express',
    expectedType: 'knowledge',
    category: 'system-description',
    difficulty: 'medium',
    notes: 'Technical stack description',
  },
  {
    id: 'k-sys-003',
    text: 'Our system handles approximately 10,000 requests per second',
    expectedType: 'knowledge',
    category: 'system-description',
    difficulty: 'medium',
    notes: 'Performance characteristic',
  },
  {
    id: 'k-sys-004',
    text: 'We use Redis for caching and session storage',
    expectedType: 'knowledge',
    category: 'system-description',
    difficulty: 'medium',
    notes: '"We use X for Y" pattern',
  },
  {
    id: 'k-sys-005',
    text: 'Remember that the database is sharded across 4 nodes',
    expectedType: 'knowledge',
    category: 'system-description',
    difficulty: 'easy',
    notes: '"Remember that" pattern',
  },

  // =============================================================================
  // TOOL - CLI Commands
  // =============================================================================
  {
    id: 't-cli-001',
    text: 'Command: npm run build',
    expectedType: 'tool',
    category: 'cli-command',
    difficulty: 'easy',
    notes: 'Explicit "Command:" prefix',
  },
  {
    id: 't-cli-002',
    text: 'npm run test to execute all tests',
    expectedType: 'tool',
    category: 'cli-command',
    difficulty: 'easy',
    notes: 'npm command pattern',
  },
  {
    id: 't-cli-003',
    text: 'yarn install to setup dependencies',
    expectedType: 'tool',
    category: 'cli-command',
    difficulty: 'easy',
    notes: 'yarn command',
  },
  {
    id: 't-cli-004',
    text: 'Run `npm start` to start the development server',
    expectedType: 'tool',
    category: 'cli-command',
    difficulty: 'easy',
    notes: 'Backtick command',
  },
  {
    id: 't-cli-005',
    text: 'docker-compose up -d to start all services',
    expectedType: 'tool',
    category: 'cli-command',
    difficulty: 'easy',
    notes: 'Docker command',
  },

  // =============================================================================
  // TOOL - Git Commands
  // =============================================================================
  {
    id: 't-git-001',
    text: 'git checkout -b feature/new-feature to create a new branch',
    expectedType: 'tool',
    category: 'git-command',
    difficulty: 'easy',
    notes: 'git checkout command',
  },
  {
    id: 't-git-002',
    text: 'git push origin main --force to force push (be careful!)',
    expectedType: 'tool',
    category: 'git-command',
    difficulty: 'easy',
    notes: 'git push command',
  },
  {
    id: 't-git-003',
    text: 'git rebase -i HEAD~5 for interactive rebase',
    expectedType: 'tool',
    category: 'git-command',
    difficulty: 'medium',
    notes: 'git rebase command',
  },

  // =============================================================================
  // TOOL - Scripts
  // =============================================================================
  {
    id: 't-scr-001',
    text: 'Script: ./deploy.sh production',
    expectedType: 'tool',
    category: 'script',
    difficulty: 'easy',
    notes: 'Explicit "Script:" prefix',
  },
  {
    id: 't-scr-002',
    text: 'Execute make build to compile the project',
    expectedType: 'tool',
    category: 'script',
    difficulty: 'easy',
    notes: '"Execute" prefix with make',
  },

  // =============================================================================
  // AMBIGUOUS CASES (harder)
  // =============================================================================
  {
    id: 'a-001',
    text: 'Testing is important for code quality',
    expectedType: 'knowledge',
    category: 'ambiguous',
    difficulty: 'hard',
    notes: 'General statement, could be fact',
    acceptableAlternatives: ['guideline'],
  },
  {
    id: 'a-002',
    text: 'Use proper error handling throughout the application',
    expectedType: 'guideline',
    category: 'ambiguous',
    difficulty: 'medium',
    notes: '"Use" prefix - is it instruction or description?',
    acceptableAlternatives: ['knowledge'],
  },
  {
    id: 'a-003',
    text: 'The team has good code review practices',
    expectedType: 'knowledge',
    category: 'ambiguous',
    difficulty: 'hard',
    notes: 'Descriptive statement',
  },
  {
    id: 'a-004',
    text: 'We use TypeScript for type safety',
    expectedType: 'knowledge',
    category: 'ambiguous',
    difficulty: 'medium',
    notes: '"We use" could be guideline or knowledge',
    acceptableAlternatives: ['guideline'],
  },
  {
    id: 'a-005',
    text: 'Good documentation makes onboarding easier',
    expectedType: 'knowledge',
    category: 'ambiguous',
    difficulty: 'hard',
    notes: 'General observation',
  },

  // =============================================================================
  // EDGE CASES
  // =============================================================================
  {
    id: 'e-001',
    text: '',
    expectedType: 'knowledge',
    category: 'edge-case',
    difficulty: 'hard',
    notes: 'Empty string should default to knowledge',
  },
  {
    id: 'e-002',
    text: 'PostgreSQL',
    expectedType: 'knowledge',
    category: 'edge-case',
    difficulty: 'hard',
    notes: 'Single word, no context',
  },
  {
    id: 'e-003',
    text: 'npm',
    expectedType: 'tool',
    category: 'edge-case',
    difficulty: 'hard',
    notes: 'Single word tool reference',
    acceptableAlternatives: ['knowledge'],
  },
  {
    id: 'e-004',
    text: 'ALWAYS USE CAPS FOR IMPORTANT RULES',
    expectedType: 'guideline',
    category: 'edge-case',
    difficulty: 'medium',
    notes: 'All caps text',
  },
  {
    id: 'e-005',
    text: 'rule always must never require prefer',
    expectedType: 'guideline',
    category: 'edge-case',
    difficulty: 'hard',
    notes: 'Multiple keywords, no sentence structure',
  },
  {
    id: 'e-006',
    text: 'We decided to always use npm run test before merging',
    expectedType: 'knowledge',
    category: 'edge-case',
    difficulty: 'hard',
    notes: 'Mixed signals: decision + guideline + tool',
    acceptableAlternatives: ['guideline', 'tool'],
  },
];

/**
 * Get test cases by category
 */
export function getTestCasesByCategory(category: string): ClassificationTestCase[] {
  return CLASSIFICATION_TEST_CASES.filter(tc => tc.category === category);
}

/**
 * Get test cases by difficulty
 */
export function getTestCasesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): ClassificationTestCase[] {
  return CLASSIFICATION_TEST_CASES.filter(tc => tc.difficulty === difficulty);
}

/**
 * Get test cases by expected type
 */
export function getTestCasesByType(type: 'guideline' | 'knowledge' | 'tool'): ClassificationTestCase[] {
  return CLASSIFICATION_TEST_CASES.filter(tc => tc.expectedType === type);
}

/**
 * Dataset statistics
 */
export function getDatasetStats(): {
  total: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byDifficulty: Record<string, number>;
} {
  const stats = {
    total: CLASSIFICATION_TEST_CASES.length,
    byType: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    byDifficulty: {} as Record<string, number>,
  };

  for (const tc of CLASSIFICATION_TEST_CASES) {
    stats.byType[tc.expectedType] = (stats.byType[tc.expectedType] ?? 0) + 1;
    stats.byCategory[tc.category] = (stats.byCategory[tc.category] ?? 0) + 1;
    stats.byDifficulty[tc.difficulty] = (stats.byDifficulty[tc.difficulty] ?? 0) + 1;
  }

  return stats;
}

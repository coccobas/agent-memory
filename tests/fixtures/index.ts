/**
 * Test Fixtures Index
 *
 * Consolidated exports for test utilities.
 * Import from this file for cleaner test imports.
 *
 * @example
 * import { setupTestDb, createTestProject, createTestGuideline } from '../fixtures';
 */

// Database setup and cleanup
export {
  setupTestDb,
  cleanupTestDb,
  createTestContext,
  type TestDb,
} from './test-helpers.js';

// Database utilities
export {
  cleanupDbFiles,
  ensureDirectory,
  ensureDataDirectory,
} from './db-utils.js';

// Schema re-export (for test assertions)
export { schema } from './test-helpers.js';

// Scope factories
export {
  createTestOrg,
  createTestProject,
  createTestSession,
} from './test-helpers.js';

// Entry factories
export {
  createTestTool,
  createTestGuideline,
  createTestKnowledge,
} from './test-helpers.js';

// Conversation factories
export {
  createTestConversation,
  createTestMessage,
  createTestContextLink,
} from './test-helpers.js';

// Tag seeding
export { seedPredefinedTags } from './test-helpers.js';

// Migration utilities
export { applyMigrations } from './migration-loader.js';

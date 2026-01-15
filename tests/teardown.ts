/**
 * Global test teardown
 *
 * Runs after all tests complete to clean up artifacts.
 * Called by vitest via globalTeardown configuration.
 */

import { cleanupTestDatabases } from './fixtures/test-helpers.js';

export default function globalTeardown() {
  console.log('\n🧹 Running global test teardown...');
  cleanupTestDatabases();
  console.log('✅ Teardown complete\n');
}

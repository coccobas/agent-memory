/**
 * CLI Context Utilities
 *
 * Provides lazy initialization of AppContext for CLI commands.
 * Context is cached for reuse within a single CLI invocation.
 */

import type { AppContext } from '../../core/context.js';
import type { Runtime } from '../../core/runtime.js';

let cachedContext: AppContext | null = null;

/**
 * Initialize AppContext for CLI usage (lazy, cached)
 */
export async function getCliContext(): Promise<AppContext> {
  if (cachedContext) return cachedContext;

  // Load environment
  const { loadEnv } = await import('../../config/env.js');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(__filename), '../../..');
  loadEnv(projectRoot);

  // Build config
  const { config } = await import('../../config/index.js');

  // Create runtime
  const { createRuntime, extractRuntimeConfig } = await import('../../core/runtime.js');
  const { registerRuntime, isRuntimeRegistered, getRuntime, registerContext } =
    await import('../../core/container.js');

  // Only create runtime if not already registered
  // Ensure runtime exists and is registered
  let runtime: Runtime;
  if (isRuntimeRegistered()) {
    runtime = getRuntime();
  } else {
    runtime = createRuntime(extractRuntimeConfig(config));
    registerRuntime(runtime);
  }

  // Create context with runtime
  const { createAppContext } = await import('../../core/factory.js');
  cachedContext = await createAppContext(config, runtime);

  // Register context with container so global getDb() works
  registerContext(cachedContext);

  return cachedContext;
}

/**
 * Shutdown CLI context cleanly
 */
export async function shutdownCliContext(): Promise<void> {
  if (cachedContext) {
    const { shutdownAppContext } = await import('../../core/factory.js');
    await shutdownAppContext(cachedContext);
    cachedContext = null;
  }
}

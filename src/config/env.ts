import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Load environment variables from .env file
 *
 * This function should be called as early as possible in the application lifecycle,
 * before any configuration is read.
 */
export function loadEnv(projectRoot: string): void {
  // Guard: only load once
  if (process.env.__AGENT_MEMORY_ENV_LOADED) return;
  
  // CRITICAL: Suppress dotenv output to stdout (MCP uses stdout for JSON-RPC)
  // We set this env var to ensure even if dotenv is verbose it doesn't print
  process.env.DOTENV_CONFIG_QUIET = 'true';

  const envPath = resolve(projectRoot, '.env');
  if (existsSync(envPath)) {
    // dotenv supports `quiet` but types may lag; force it to avoid stdout noise in MCP mode.
    dotenvConfig({ path: envPath, debug: false, quiet: true } as unknown as Parameters<
      typeof dotenvConfig
    >[0]);
  }
  
  process.env.__AGENT_MEMORY_ENV_LOADED = '1';
}

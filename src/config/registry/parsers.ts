/**
 * Config Parser Functions
 *
 * Type-safe parsers for environment variable values.
 * These handle string-to-type conversion with defaults and validation.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// =============================================================================
// PROJECT ROOT
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const projectRoot = resolve(__dirname, '../../..');

// =============================================================================
// PRIMITIVE PARSERS
// =============================================================================

/**
 * Parse a string env var as boolean.
 * Accepts '1', 'true' (case-insensitive) as true.
 */
export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === '1' || value.toLowerCase() === 'true';
}

/**
 * Parse a string env var as floating point number.
 */
export function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a string env var as integer.
 */
export function parseInt_(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a string env var as a valid port number (1-65535).
 */
export function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65536) {
    return fallback;
  }
  return parsed;
}

/**
 * Parse a string env var with validation against allowed values.
 */
export function parseString<T extends string>(
  value: string | undefined,
  defaultValue: T,
  allowedValues?: readonly T[]
): T {
  if (value === undefined || value === '') return defaultValue;
  const lower = value.toLowerCase() as T;
  if (allowedValues && !allowedValues.includes(lower)) {
    return defaultValue;
  }
  return lower;
}

// =============================================================================
// PATH HELPERS
// =============================================================================

/**
 * Expand tilde (~) to home directory in file paths.
 * Supports both Unix-style HOME and Windows-style USERPROFILE.
 */
export function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return filePath.replace(/^~/, home);
  }
  return filePath;
}

/**
 * Get the base data directory.
 * Priority:
 * 1. AGENT_MEMORY_DATA_DIR environment variable (highest)
 * 2. ~/.agent-memory/data (when installed as package via node_modules)
 * 3. projectRoot/data (development mode)
 */
export function getDataDir(): string {
  const dataDir = process.env.AGENT_MEMORY_DATA_DIR;
  if (dataDir) {
    return expandTilde(dataDir);
  }
  // Check if running from node_modules (installed as package)
  if (__dirname.includes('node_modules')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home) {
      return resolve(home, '.agent-memory', 'data');
    }
  }
  return resolve(projectRoot, 'data');
}

/**
 * Resolve a data path with priority:
 * 1. Specific env var override (highest priority)
 * 2. AGENT_MEMORY_DATA_DIR + relative path
 * 3. projectRoot/data + relative path (default)
 */
export function resolveDataPath(envVar: string | undefined, relativePath: string): string {
  // If specific env var is set, use it (highest priority)
  if (envVar) {
    return expandTilde(envVar);
  }
  // Otherwise use data dir + relative path
  return resolve(getDataDir(), relativePath);
}

// =============================================================================
// PROVIDER DETECTION
// =============================================================================

/**
 * Determine embedding provider with fallback logic.
 * Returns 'openai' if API key is set, 'lmstudio' if configured, otherwise 'local'.
 */
export function getEmbeddingProvider(): 'openai' | 'lmstudio' | 'local' | 'disabled' {
  const providerEnv = process.env.AGENT_MEMORY_EMBEDDING_PROVIDER?.toLowerCase();
  if (providerEnv === 'disabled') return 'disabled';
  if (providerEnv === 'lmstudio') return 'lmstudio';
  if (providerEnv === 'local') return 'local';
  if (providerEnv === 'openai') return 'openai';
  // Default: openai if API key provided, otherwise local
  return process.env.AGENT_MEMORY_OPENAI_API_KEY ? 'openai' : 'local';
}

/**
 * Determine extraction provider with fallback logic.
 * Checks for API keys in order: OpenAI > Anthropic > disabled.
 */
export function getExtractionProvider(): 'openai' | 'anthropic' | 'ollama' | 'disabled' {
  const providerEnv = process.env.AGENT_MEMORY_EXTRACTION_PROVIDER?.toLowerCase();
  if (providerEnv === 'disabled') return 'disabled';
  if (providerEnv === 'ollama') return 'ollama';
  if (providerEnv === 'anthropic') return 'anthropic';
  if (providerEnv === 'openai') return 'openai';
  // Default: check for API keys in order of preference
  if (process.env.AGENT_MEMORY_OPENAI_API_KEY) return 'openai';
  if (process.env.AGENT_MEMORY_ANTHROPIC_API_KEY) return 'anthropic';
  return 'disabled';
}

/**
 * Unified Authentication Configuration
 *
 * This module provides a simplified auth model:
 * - AGENT_MEMORY_API_KEY: Single key for all authentication (MCP, REST, admin ops)
 * - AGENT_MEMORY_DEV_MODE: Single flag to enable development mode (no permission checks)
 *
 * This replaces the complex multi-variable configuration:
 * - AGENT_MEMORY_PERMISSIONS_MODE + AGENT_MEMORY_ALLOW_PERMISSIVE + NODE_ENV
 * - AGENT_MEMORY_ADMIN_KEY (separate from REST_API_KEY)
 * - AGENT_MEMORY_REST_API_KEY + AGENT_MEMORY_REST_API_KEYS
 */

import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('auth');

export type AuthMode = 'development' | 'production';

export interface UnifiedAuthConfig {
  /** The unified API key for all authentication */
  apiKey: string | null;
  /** Current auth mode */
  mode: AuthMode;
  /** Whether dev mode is explicitly enabled */
  devModeEnabled: boolean;
}

// Track if we've warned about deprecated vars
let hasWarnedDeprecation = false;
let hasWarnedDevMode = false;

/**
 * Check if any legacy environment variables are set and log deprecation warnings.
 */
function checkDeprecatedVars(): void {
  if (hasWarnedDeprecation) return;

  const deprecatedVars: Array<{ name: string; replacement: string }> = [];

  if (process.env.AGENT_MEMORY_PERMISSIONS_MODE) {
    deprecatedVars.push({
      name: 'AGENT_MEMORY_PERMISSIONS_MODE',
      replacement: 'AGENT_MEMORY_DEV_MODE=true',
    });
  }

  if (process.env.AGENT_MEMORY_ALLOW_PERMISSIVE) {
    deprecatedVars.push({
      name: 'AGENT_MEMORY_ALLOW_PERMISSIVE',
      replacement: 'AGENT_MEMORY_DEV_MODE=true',
    });
  }

  if (process.env.AGENT_MEMORY_ADMIN_KEY && !process.env.AGENT_MEMORY_API_KEY) {
    deprecatedVars.push({
      name: 'AGENT_MEMORY_ADMIN_KEY',
      replacement: 'AGENT_MEMORY_API_KEY',
    });
  }

  if (process.env.AGENT_MEMORY_REST_API_KEY && !process.env.AGENT_MEMORY_API_KEY) {
    deprecatedVars.push({
      name: 'AGENT_MEMORY_REST_API_KEY',
      replacement: 'AGENT_MEMORY_API_KEY',
    });
  }

  if (deprecatedVars.length > 0) {
    hasWarnedDeprecation = true;
    logger.warn(
      {
        deprecatedVars: deprecatedVars.map((v) => v.name),
        message:
          'Deprecated environment variables detected. These will be removed in a future version.',
      },
      'Deprecated auth configuration'
    );

    for (const v of deprecatedVars) {
      logger.info(`  ${v.name} → Use ${v.replacement} instead`);
    }
  }
}

/**
 * Check if development mode is enabled.
 *
 * Dev mode can be enabled via:
 * - AGENT_MEMORY_DEV_MODE=true (new, preferred)
 *
 * In dev mode:
 * - All permission checks are bypassed
 * - REST API auth is bypassed (all requests authorized)
 * - Full access is granted to all agents
 *
 * Note: For permission-only bypass, use isPermissiveModeEnabled()
 */
export function isDevMode(): boolean {
  const devModeFlag = process.env.AGENT_MEMORY_DEV_MODE;
  if (devModeFlag !== undefined) {
    return devModeFlag === 'true' || devModeFlag === '1';
  }
  return false;
}

/**
 * Check if permissive mode is enabled for permission checks.
 *
 * Permissive mode can be enabled via:
 * 1. AGENT_MEMORY_DEV_MODE=true (new, bypasses everything)
 * 2. AGENT_MEMORY_PERMISSIONS_MODE=permissive (legacy, permissions only)
 *
 * In permissive mode:
 * - All permission checks are bypassed
 * - REST API auth is NOT bypassed (still requires valid API key)
 *
 * Use this function for permission checks to maintain backward compatibility.
 */
export function isPermissiveModeEnabled(): boolean {
  // DEV_MODE enables permissive mode
  if (isDevMode()) {
    return true;
  }

  // Legacy: PERMISSIONS_MODE=permissive enables permissive mode
  const legacyPermissive = process.env.AGENT_MEMORY_PERMISSIONS_MODE === 'permissive';
  if (legacyPermissive) {
    checkDeprecatedVars();
    return true;
  }

  return false;
}

/**
 * Check if dev mode should be blocked (e.g., in production).
 *
 * Unlike the old system, we don't throw errors - we just log warnings
 * and let the developer decide. The API key still provides security.
 */
export function shouldWarnDevMode(): boolean {
  if (!isDevMode()) return false;

  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  const productionLike = ['production', 'prod', 'staging', 'stage', 'preprod', 'uat', 'qa'];

  return productionLike.includes(env);
}

/**
 * Get the unified API key.
 *
 * Checks in order:
 * 1. AGENT_MEMORY_API_KEY (new, preferred)
 * 2. AGENT_MEMORY_ADMIN_KEY (legacy, for admin ops)
 * 3. AGENT_MEMORY_REST_API_KEY (legacy, for REST API)
 */
export function getUnifiedApiKey(): string | null {
  // New unified key (preferred)
  const unifiedKey = process.env.AGENT_MEMORY_API_KEY;
  if (unifiedKey && unifiedKey.length > 0) {
    return unifiedKey;
  }

  // Legacy fallbacks
  checkDeprecatedVars();

  const adminKey = process.env.AGENT_MEMORY_ADMIN_KEY;
  if (adminKey && adminKey.length > 0) {
    return adminKey;
  }

  const restKey = process.env.AGENT_MEMORY_REST_API_KEY;
  if (restKey && restKey.length > 0) {
    return restKey;
  }

  return null;
}

/**
 * Get the full unified auth configuration.
 */
export function getUnifiedAuthConfig(): UnifiedAuthConfig {
  const apiKey = getUnifiedApiKey();
  const devModeEnabled = isDevMode();

  // Log dev mode warning once
  if (devModeEnabled && !hasWarnedDevMode) {
    hasWarnedDevMode = true;

    if (shouldWarnDevMode()) {
      logger.warn(
        '⚠️  DEV MODE ENABLED IN PRODUCTION-LIKE ENVIRONMENT. ' +
          'All permission checks are bypassed. This is a security risk!'
      );
    } else {
      logger.info(
        '🔓 Dev mode enabled - permission checks bypassed. ' +
          'Set AGENT_MEMORY_DEV_MODE=false for production.'
      );
    }
  }

  return {
    apiKey,
    mode: devModeEnabled ? 'development' : 'production',
    devModeEnabled,
  };
}

/**
 * Check if the unified API key is configured.
 */
export function isApiKeyConfigured(): boolean {
  return getUnifiedApiKey() !== null;
}

/**
 * Validate that required auth is configured for production mode.
 *
 * In production mode (DEV_MODE not enabled):
 * - API key should be configured for security
 * - Returns validation result with warnings
 */
export function validateAuthConfig(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const config = getUnifiedAuthConfig();

  if (!config.devModeEnabled && !config.apiKey) {
    warnings.push(
      'No API key configured. Set AGENT_MEMORY_API_KEY for secure operation, ' +
        'or AGENT_MEMORY_DEV_MODE=true for development.'
    );
  }

  if (config.devModeEnabled && shouldWarnDevMode()) {
    warnings.push(
      'Dev mode enabled in production-like environment. ' +
        'Remove AGENT_MEMORY_DEV_MODE or set to false for production.'
    );
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Reset warning flags (for testing).
 */
export function resetWarningFlags(): void {
  hasWarnedDeprecation = false;
  hasWarnedDevMode = false;
}

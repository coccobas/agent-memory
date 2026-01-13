/**
 * Configuration Hot Reload Utility
 *
 * Provides mechanism to reload configuration at runtime without restart.
 * Supports watching for file changes and manual reload triggers.
 *
 * Features:
 * - File watching for .env changes
 * - Manual reload trigger
 * - Reload event notifications
 * - Selective reload (only reloadable options)
 *
 * Note: Some configuration (like database connections) requires restart.
 * This module handles "safe" options that can be changed at runtime.
 *
 * Usage:
 *   import { configReloader } from './config-reload.js';
 *
 *   // Watch for changes
 *   configReloader.watchEnvFile();
 *
 *   // Register reload handler
 *   configReloader.onReload((changes) => {
 *     console.log('Config changed:', changes);
 *   });
 *
 *   // Manual reload
 *   await configReloader.reload();
 */

import { watch, existsSync } from 'node:fs';
import { createComponentLogger } from './logger.js';
import { config, reloadConfig, type Config } from '../config/index.js';

const logger = createComponentLogger('config-reload');

// =============================================================================
// TYPES
// =============================================================================

export interface ConfigChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ReloadResult {
  success: boolean;
  changes: ConfigChange[];
  errors: string[];
  timestamp: number;
}

export type ReloadCallback = (result: ReloadResult) => void;

// =============================================================================
// RELOADABLE OPTIONS
// =============================================================================

/**
 * Options that can be safely reloaded at runtime.
 * Excludes database connections, paths, and other startup-only settings.
 */
const RELOADABLE_PATHS = [
  // Logging options
  'logging.level',
  'logging.debug',
  'logging.performance',

  // Cache settings
  'cache.queryCacheTTLMs',
  'cache.scopeCacheTTLMs',
  'cache.pressureThreshold',
  'cache.evictionTarget',

  // Memory settings
  'memory.heapPressureThreshold',
  'memory.checkIntervalMs',

  // Rate limiting (can adjust limits at runtime)
  'rateLimit.enabled',
  'rateLimit.perAgent.maxRequests',
  'rateLimit.perAgent.windowMs',
  'rateLimit.global.maxRequests',
  'rateLimit.global.windowMs',

  // Semantic search thresholds
  'semanticSearch.defaultThreshold',
  'semanticSearch.scoreWeight',
  'semanticSearch.duplicateThreshold',

  // Recency scoring
  'recency.defaultDecayHalfLifeDays',
  'recency.defaultRecencyWeight',
  'recency.maxRecencyBoost',

  // Scoring weights
  'scoring.weights.explicitRelation',
  'scoring.weights.tagMatch',
  'scoring.weights.scopeProximity',
  'scoring.weights.textMatch',

  // Validation limits
  'validation.bulkOperationMax',
  'validation.regexPatternMaxLength',

  // Pagination
  'pagination.defaultLimit',
  'pagination.maxLimit',

  // Health check intervals
  'health.checkIntervalMs',

  // Retry settings
  'retry.maxAttempts',
  'retry.initialDelayMs',
  'retry.maxDelayMs',
  'retry.backoffMultiplier',

  // Transaction settings
  'transaction.maxRetries',
  'transaction.initialDelayMs',
  'transaction.maxDelayMs',

  // Output format
  'output.format',

  // Embedding settings (can adjust without restart if provider supports)
  'embedding.maxConcurrency',
  'embedding.maxRetries',
  'embedding.retryDelayMs',

  // Extraction settings
  'extraction.maxTokens',
  'extraction.temperature',
  'extraction.confidenceThreshold',
];

// =============================================================================
// CONFIG RELOADER CLASS
// =============================================================================

/**
 * Configuration reloader
 */
class ConfigReloader {
  private callbacks: ReloadCallback[] = [];
  private watcher: ReturnType<typeof watch> | null = null;
  private lastReload: number = 0;
  private debounceMs: number = 1000;
  private pendingReload: NodeJS.Timeout | null = null;

  /**
   * Reload configuration from environment
   */
  async reload(): Promise<ReloadResult> {
    const timestamp = Date.now();
    const changes: ConfigChange[] = [];
    const errors: string[] = [];

    try {
      // Capture old values
      const oldConfig = this.captureReloadableValues(config);

      // Reload config
      reloadConfig();

      // Compare and find changes
      const newConfig = this.captureReloadableValues(config);

      for (const path of RELOADABLE_PATHS) {
        const oldValue = oldConfig.get(path);
        const newValue = newConfig.get(path);

        if (!this.deepEqual(oldValue, newValue)) {
          changes.push({ path, oldValue, newValue });
        }
      }

      if (changes.length > 0) {
        logger.info({ changes: changes.map((c) => c.path) }, 'Configuration reloaded');
      } else {
        logger.debug('Configuration reload: no changes detected');
      }

      this.lastReload = timestamp;

      const result: ReloadResult = {
        success: true,
        changes,
        errors,
        timestamp,
      };

      // Notify callbacks
      this.notifyCallbacks(result);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg }, 'Configuration reload failed');
      errors.push(errorMsg);

      const result: ReloadResult = {
        success: false,
        changes: [],
        errors,
        timestamp,
      };

      this.notifyCallbacks(result);

      return result;
    }
  }

  /**
   * Watch .env file for changes
   */
  watchEnvFile(envPath?: string): void {
    const path = envPath ?? '.env';

    if (!existsSync(path)) {
      logger.warn({ path }, 'Env file not found, skipping watch');
      return;
    }

    if (this.watcher) {
      this.stopWatching();
    }

    this.watcher = watch(path, (eventType) => {
      if (eventType === 'change') {
        this.debouncedReload();
      }
    });

    logger.info({ path }, 'Watching env file for changes');
  }

  /**
   * Stop watching for changes
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.debug('Stopped watching env file');
    }

    if (this.pendingReload) {
      clearTimeout(this.pendingReload);
      this.pendingReload = null;
    }
  }

  /**
   * Register a reload callback
   */
  onReload(callback: ReloadCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index >= 0) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get last reload timestamp
   */
  getLastReloadTime(): number {
    return this.lastReload;
  }

  /**
   * Get list of reloadable config paths
   */
  getReloadablePaths(): string[] {
    return [...RELOADABLE_PATHS];
  }

  /**
   * Check if a config path is reloadable
   */
  isReloadable(path: string): boolean {
    return RELOADABLE_PATHS.includes(path);
  }

  /**
   * Set debounce time for file watching
   */
  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  /**
   * Debounced reload for file watching
   */
  private debouncedReload(): void {
    if (this.pendingReload) {
      clearTimeout(this.pendingReload);
    }

    this.pendingReload = setTimeout(() => {
      this.pendingReload = null;
      this.reload().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Debounced reload failed'
        );
      });
    }, this.debounceMs);
  }

  /**
   * Capture current values of reloadable config options
   */
  private captureReloadableValues(cfg: Config): Map<string, unknown> {
    const values = new Map<string, unknown>();

    for (const path of RELOADABLE_PATHS) {
      values.set(path, this.getValueByPath(cfg, path));
    }

    return values;
  }

  /**
   * Get a nested value by dot-separated path
   */
  private getValueByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Deep equality check for values
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!bKeys.includes(key)) return false;
      if (!this.deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  /**
   * Notify all registered callbacks
   * Bug #356 fix: Track callback failures and add to result errors
   */
  private notifyCallbacks(result: ReloadResult): void {
    for (const callback of this.callbacks) {
      try {
        callback(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          { error: errorMsg },
          'Reload callback failed'
        );
        // Bug #356 fix: Track callback failures in result for visibility
        result.errors.push(`Callback failed: ${errorMsg}`);
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const configReloader = new ConfigReloader();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Reload configuration
 */
export async function reloadConfiguration(): Promise<ReloadResult> {
  return configReloader.reload();
}

/**
 * Start watching for config changes
 */
export function watchConfigChanges(envPath?: string): void {
  configReloader.watchEnvFile(envPath);
}

/**
 * Register config reload handler
 */
export function onConfigReload(callback: ReloadCallback): () => void {
  return configReloader.onReload(callback);
}

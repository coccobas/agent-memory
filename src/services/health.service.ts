/**
 * Health Monitoring Service
 *
 * Provides comprehensive health monitoring for all system components:
 * - Database connection (SQLite/PostgreSQL)
 * - Connection pool stats (PostgreSQL)
 * - Cache health
 * - Redis connectivity (if enabled)
 * - Circuit breaker states
 *
 * Supports automatic reconnection for PostgreSQL.
 */

import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { getAllCircuitBreakerStats } from '../utils/circuit-breaker.js';
import type { IStorageAdapter } from '../core/adapters/interfaces.js';
import {
  getHealthMonitor as containerGetHealthMonitor,
  resetHealthMonitor as containerResetHealthMonitor,
} from '../core/container.js';

const logger = createComponentLogger('health');

// =============================================================================
// TYPES
// =============================================================================

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  utilizationPercent: number;
}

export interface DatabaseHealth extends ComponentHealth {
  type: 'sqlite' | 'postgresql';
  pool?: PoolStats;
}

export interface CacheHealth extends ComponentHealth {
  size: number;
  memoryMB: number;
  hitRate?: number;
}

export interface RedisHealth extends ComponentHealth {
  connected: boolean;
}

export interface CircuitBreakerHealth {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  totalCalls: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  database: DatabaseHealth;
  cache: CacheHealth;
  redis?: RedisHealth;
  circuitBreakers: CircuitBreakerHealth[];
}

// =============================================================================
// HEALTH MONITOR CLASS
// =============================================================================

/**
 * Thresholds for determining health status
 */
const THRESHOLDS = {
  latencyWarning: 100, // ms
  latencyCritical: 500, // ms
  poolUtilizationWarning: 70, // %
  poolUtilizationCritical: 90, // %
  cacheMemoryWarning: 50, // MB
  cacheMemoryCritical: 100, // MB
};

/**
 * Health monitoring service
 */
export class HealthMonitor {
  private startTime: number;
  private storageAdapter: IStorageAdapter | null = null;
  private cacheStatsProvider: (() => { size: number; memoryMB: number }) | null = null;
  private redisHealthProvider: (() => Promise<{ ok: boolean; latencyMs: number }>) | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastCheckResult: SystemHealth | null = null;
  private reconnectAttempts = 0;
  // Bug #351 fix: Use promise-based mutex to prevent concurrent reconnection attempts
  private reconnectPromise: Promise<void> | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Initialize the health monitor with dependencies
   */
  initialize(options: {
    storageAdapter: IStorageAdapter;
    cacheStatsProvider?: () => { size: number; memoryMB: number };
    redisHealthProvider?: () => Promise<{ ok: boolean; latencyMs: number }>;
  }): void {
    this.storageAdapter = options.storageAdapter;
    this.cacheStatsProvider = options.cacheStatsProvider ?? null;
    this.redisHealthProvider = options.redisHealthProvider ?? null;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.checkInterval) {
      return; // Already running
    }

    const intervalMs = config.health.checkIntervalMs;
    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Health check failed'
        );
      });
    }, intervalMs);

    logger.info({ intervalMs }, 'Started periodic health checks');
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Perform a full health check
   */
  async performHealthCheck(): Promise<SystemHealth> {
    const [databaseHealth, cacheHealth, redisHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
      this.checkRedis(),
    ]);

    const circuitBreakers = this.getCircuitBreakerHealth();

    // Determine overall status
    const components = [databaseHealth, cacheHealth, redisHealth].filter(
      Boolean
    ) as ComponentHealth[];
    const overallStatus = this.determineOverallStatus(components, circuitBreakers);

    const result: SystemHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: await this.getVersion(),
      database: databaseHealth,
      cache: cacheHealth,
      circuitBreakers,
    };

    if (redisHealth) {
      result.redis = redisHealth;
    }

    this.lastCheckResult = result;

    // Log if status changed or is not healthy
    if (overallStatus !== 'healthy') {
      logger.warn(
        { status: overallStatus, database: databaseHealth.status },
        'System health degraded'
      );
    }

    // Trigger reconnection if database is unhealthy
    if (databaseHealth.status === 'unhealthy' && config.dbType === 'postgresql') {
      this.attemptReconnection();
    }

    return result;
  }

  /**
   * Get the last health check result (cached)
   */
  getLastCheckResult(): SystemHealth | null {
    return this.lastCheckResult;
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<DatabaseHealth> {
    if (!this.storageAdapter) {
      return {
        status: 'unhealthy',
        type: config.dbType,
        message: 'Storage adapter not initialized',
      };
    }

    try {
      const result = await this.storageAdapter.healthCheck();

      let poolStats: PoolStats | undefined;
      if (config.dbType === 'postgresql') {
        const rawPool = this.storageAdapter.getRawConnection() as {
          totalCount?: number;
          idleCount?: number;
          waitingCount?: number;
        };
        if (rawPool && typeof rawPool.totalCount === 'number') {
          const total = rawPool.totalCount || 1;
          poolStats = {
            totalConnections: rawPool.totalCount,
            idleConnections: rawPool.idleCount ?? 0,
            waitingClients: rawPool.waitingCount ?? 0,
            utilizationPercent: Math.round(((total - (rawPool.idleCount ?? 0)) / total) * 100),
          };
        }
      }

      const health: DatabaseHealth = {
        status: this.determineDatabaseStatus(result, poolStats),
        type: config.dbType,
        latencyMs: result.latencyMs,
        pool: poolStats,
      };

      if (!result.ok) {
        health.message = 'Database connection failed';
      } else if (result.latencyMs > THRESHOLDS.latencyWarning) {
        health.message = 'High query latency detected';
      } else if (poolStats && poolStats.utilizationPercent > THRESHOLDS.poolUtilizationWarning) {
        health.message = 'High connection pool utilization';
      }

      return health;
    } catch (error) {
      return {
        status: 'unhealthy',
        type: config.dbType,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check cache health
   */
  private async checkCache(): Promise<CacheHealth> {
    const stats = this.cacheStatsProvider?.() ?? { size: 0, memoryMB: 0 };

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message: string | undefined;

    if (stats.memoryMB > THRESHOLDS.cacheMemoryCritical) {
      status = 'degraded';
      message = 'Cache memory usage high';
    } else if (stats.memoryMB > THRESHOLDS.cacheMemoryWarning) {
      message = 'Cache memory usage elevated';
    }

    return {
      status,
      size: stats.size,
      memoryMB: stats.memoryMB,
      message,
    };
  }

  /**
   * Check Redis health (if enabled)
   */
  private async checkRedis(): Promise<RedisHealth | undefined> {
    if (!config.redis.enabled || !this.redisHealthProvider) {
      return undefined;
    }

    try {
      const result = await this.redisHealthProvider();
      return {
        status: result.ok ? 'healthy' : 'unhealthy',
        connected: result.ok,
        latencyMs: result.latencyMs,
        message: result.ok ? undefined : 'Redis connection failed',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get circuit breaker health status
   */
  private getCircuitBreakerHealth(): CircuitBreakerHealth[] {
    const stats = getAllCircuitBreakerStats();
    return Object.entries(stats).map(([name, stat]) => ({
      name,
      state: stat.state,
      failures: stat.failures,
      totalCalls: stat.totalCalls,
    }));
  }

  /**
   * Determine database health status
   */
  private determineDatabaseStatus(
    result: { ok: boolean; latencyMs: number },
    poolStats?: PoolStats
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (!result.ok) {
      return 'unhealthy';
    }

    // Check latency
    if (result.latencyMs > THRESHOLDS.latencyCritical) {
      return 'degraded';
    }

    // Check pool utilization (PostgreSQL)
    if (poolStats) {
      if (poolStats.utilizationPercent > THRESHOLDS.poolUtilizationCritical) {
        return 'degraded';
      }
      if (poolStats.waitingClients > 0) {
        return 'degraded';
      }
    }

    return 'healthy';
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(
    components: ComponentHealth[],
    circuitBreakers: CircuitBreakerHealth[]
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // Check if any component is unhealthy
    if (components.some((c) => c.status === 'unhealthy')) {
      return 'unhealthy';
    }

    // Check if any circuit breaker is open
    if (circuitBreakers.some((cb) => cb.state === 'OPEN')) {
      return 'degraded';
    }

    // Check if any component is degraded
    if (components.some((c) => c.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Attempt to reconnect to the database
   * Bug #351 fix: Use promise-based mutex to prevent concurrent reconnection
   */
  private attemptReconnection(): Promise<void> {
    // Return existing promise if reconnection is in progress
    if (this.reconnectPromise) {
      return this.reconnectPromise;
    }

    if (!this.storageAdapter) {
      return Promise.resolve();
    }

    if (this.reconnectAttempts >= config.health.maxReconnectAttempts) {
      logger.error(
        { attempts: this.reconnectAttempts },
        'Max reconnection attempts reached, giving up'
      );
      return Promise.resolve();
    }

    this.reconnectAttempts++;
    this.reconnectPromise = this.doReconnection();
    return this.reconnectPromise;
  }

  /**
   * Internal reconnection logic
   */
  private async doReconnection(): Promise<void> {
    try {
      // Calculate backoff delay
      const delay = Math.min(
        config.health.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
        config.health.reconnectMaxDelayMs
      );

      logger.info(
        { attempt: this.reconnectAttempts, delayMs: delay },
        'Attempting database reconnection'
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      if (!this.storageAdapter) {
        return;
      }

      await this.storageAdapter.connect();
      const healthCheck = await this.storageAdapter.healthCheck();

      if (healthCheck.ok) {
        logger.info({ attempt: this.reconnectAttempts }, 'Database reconnection successful');
        this.reconnectAttempts = 0;
      }
    } catch (error) {
      logger.warn(
        {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
        },
        'Database reconnection failed'
      );
    } finally {
      // Bug #351 fix: Clear the promise to allow future reconnection attempts
      this.reconnectPromise = null;
    }
  }

  /**
   * Get the application version
   */
  private async getVersion(): Promise<string> {
    try {
      const { VERSION } = await import('../version.js');
      return VERSION;
    } catch {
      return 'unknown';
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE (delegated to Container for test isolation)
// =============================================================================

/**
 * Get or create the health monitor singleton
 * Uses Container for storage to enable test isolation
 */
export function getHealthMonitor(): HealthMonitor {
  const existing = containerGetHealthMonitor() as HealthMonitor | null;
  if (existing) {
    return existing;
  }
  // Create new health monitor and register with container
  const monitor = new HealthMonitor();
  containerGetHealthMonitor(() => monitor);
  return monitor;
}

/**
 * Reset the health monitor (for testing)
 */
export function resetHealthMonitor(): void {
  containerResetHealthMonitor();
}

/**
 * Redis Embedding Queue Adapter
 *
 * Implements IEmbeddingQueueAdapter using Redis for distributed embedding job processing.
 * Enables cross-instance coordination for horizontal scaling.
 *
 * Features:
 * - Job queue via Redis Lists (LPUSH/BRPOP)
 * - Deduplication via Redis Hash (only latest version per entry)
 * - In-flight tracking via Redis Set with TTL
 * - Dead-letter queue via Redis List
 * - Cross-instance events via Redis Pub/Sub
 *
 * @see ADR-0022 for embedding queue mechanics
 */

import type {
  IEmbeddingQueueAdapter,
  EmbeddingJob,
  EmbeddingQueueStats,
  EnqueueOptions,
  DequeueResult,
  EmbeddingQueueEvent,
} from './embedding-queue.interface.js';
import { createComponentLogger } from '../../utils/logger.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- inline import() needed for dynamic type
type Redis = import('ioredis').default;

const logger = createComponentLogger('redis-embedding-queue');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for Redis embedding queue adapter
 */
export interface RedisEmbeddingQueueConfig {
  /** Redis connection URL */
  url?: string;
  /** Redis host (default: localhost) */
  host?: string;
  /** Redis port (default: 6379) */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number (default: 0) */
  db?: number;
  /** Key prefix for queue keys (default: 'agentmem:embq:') */
  keyPrefix?: string;
  /** Default max attempts before DLQ (default: 3) */
  maxAttempts?: number;
  /** In-flight job TTL in seconds (default: 300 = 5 minutes) */
  inFlightTTLSec?: number;
  /** Enable TLS/SSL */
  tls?: boolean;
  /** Pub/sub channel name (default: 'agentmem:embq:events') */
  pubsubChannel?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: Required<Omit<RedisEmbeddingQueueConfig, 'url' | 'password' | 'tls'>> = {
  host: 'localhost',
  port: 6379,
  db: 0,
  keyPrefix: 'agentmem:embq:',
  maxAttempts: 3,
  inFlightTTLSec: 300,
  pubsubChannel: 'agentmem:embq:events',
};

// Redis key suffixes
const KEYS = {
  /** Main job queue (List) */
  QUEUE: 'queue',
  /** Job data storage (Hash: jobId -> job JSON) */
  JOBS: 'jobs',
  /** Deduplication tracking (Hash: entryKey -> seq) */
  SEQUENCES: 'sequences',
  /** In-flight jobs (Set with TTL tracking) */
  IN_FLIGHT: 'inflight',
  /** Dead-letter queue (List) */
  DLQ: 'dlq',
  /** Sequence counter (String) */
  SEQ_COUNTER: 'seq',
} as const;

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Redis embedding queue adapter implementation.
 * Uses Redis data structures for distributed job processing.
 */
export class RedisEmbeddingQueueAdapter implements IEmbeddingQueueAdapter {
  private client: Redis | null = null;
  private subClient: Redis | null = null;
  private config: Required<Omit<RedisEmbeddingQueueConfig, 'url' | 'password' | 'tls'>> &
    Pick<RedisEmbeddingQueueConfig, 'url' | 'password' | 'tls'>;
  private connected = false;
  private connectionGuard = new ConnectionGuard();
  private subscribers: Set<(event: EmbeddingQueueEvent) => void> = new Set();

  constructor(config: RedisEmbeddingQueueConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async connect(): Promise<void> {
    return this.connectionGuard.connect(async () => {
      const { Redis: IORedis } = await import('ioredis');

      const options = {
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        lazyConnect: true,
        ...(this.config.tls ? { tls: {} } : {}),
      };

      // Main client for queue operations
      if (this.config.url) {
        this.client = new IORedis(this.config.url, options);
      } else {
        this.client = new IORedis(options);
      }

      // Subscriber client for pub/sub (needs separate connection)
      if (this.config.url) {
        this.subClient = new IORedis(this.config.url, options);
      } else {
        this.subClient = new IORedis(options);
      }

      const client = this.client;
      const subClient = this.subClient;

      client.on('connect', () => {
        this.connected = true;
        logger.info('Redis embedding queue adapter connected');
      });

      client.on('error', (error: Error) => {
        logger.error({ error }, 'Redis embedding queue adapter error');
      });

      client.on('close', () => {
        this.connected = false;
        this.connectionGuard.setDisconnected();
      });

      await client.connect();
      await subClient.connect();
      this.connected = true;

      // Set up pub/sub listener
      await this.setupPubSub();

      // Define Lua scripts
      await this.defineScripts();
    });
  }

  async close(): Promise<void> {
    if (this.subClient) {
      await this.subClient.quit();
      this.subClient = null;
    }
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
    this.subscribers.clear();
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  // ===========================================================================
  // QUEUE OPERATIONS
  // ===========================================================================

  async enqueue(
    jobData: Omit<EmbeddingJob, 'id' | 'enqueuedAt' | 'attempts'>,
    options?: EnqueueOptions
  ): Promise<boolean> {
    if (!this.client || !this.connected) {
      logger.warn('Cannot enqueue: not connected');
      return false;
    }

    const entryKey = `${jobData.entryType}:${jobData.entryId}`;
    const seqKey = this.key(KEYS.SEQUENCES);

    // Check if newer version already queued
    const existingSeq = await this.client.hget(seqKey, entryKey);
    if (existingSeq && parseInt(existingSeq, 10) >= jobData.seq) {
      logger.debug({ entryKey, existingSeq, newSeq: jobData.seq }, 'Stale job, skipping');
      return false;
    }

    // Generate job ID
    const jobId = await this.generateJobId();

    const job: EmbeddingJob = {
      ...jobData,
      id: jobId,
      attempts: 0,
      enqueuedAt: new Date().toISOString(),
    };

    // Atomically: update sequence, store job, add to queue
    const multi = this.client.multi();

    // Update sequence tracking
    multi.hset(seqKey, entryKey, jobData.seq.toString());

    // Store job data
    multi.hset(this.key(KEYS.JOBS), jobId, JSON.stringify(job));

    // Add to queue (LPUSH for FIFO with RPOP)
    // Use priority if specified (higher priority = added to front)
    if (options?.priority && options.priority > 0) {
      multi.lpush(this.key(KEYS.QUEUE), jobId);
    } else {
      multi.rpush(this.key(KEYS.QUEUE), jobId);
    }

    await multi.exec();

    logger.debug({ jobId, entryKey, seq: jobData.seq }, 'Job enqueued');

    // Publish event
    await this.publishEvent({
      type: 'job_enqueued',
      jobId,
      entryType: jobData.entryType,
      entryId: jobData.entryId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  async dequeue(): Promise<DequeueResult> {
    if (!this.client || !this.connected) {
      return { job: null };
    }

    // Pop from queue (LPOP for FIFO)
    const jobId = await this.client.lpop(this.key(KEYS.QUEUE));
    if (!jobId) {
      return { job: null };
    }

    // Get job data
    const jobData = await this.client.hget(this.key(KEYS.JOBS), jobId);
    if (!jobData) {
      logger.warn({ jobId }, 'Job not found in storage after dequeue');
      return { job: null };
    }

    const job = JSON.parse(jobData) as EmbeddingJob;

    // Check if still latest version
    const entryKey = `${job.entryType}:${job.entryId}`;
    const currentSeq = await this.client.hget(this.key(KEYS.SEQUENCES), entryKey);

    if (currentSeq && parseInt(currentSeq, 10) > job.seq) {
      // Stale job, skip it and clean up
      await this.client.hdel(this.key(KEYS.JOBS), jobId);
      logger.debug({ jobId, entryKey }, 'Skipping stale job');
      return this.dequeue(); // Recursively get next job
    }

    // Add to in-flight set with TTL
    await this.client.sadd(this.key(KEYS.IN_FLIGHT), jobId);
    // Set expiry on individual job for timeout handling
    await this.client.setex(
      `${this.config.keyPrefix}inflight:${jobId}`,
      this.config.inFlightTTLSec,
      '1'
    );

    logger.debug({ jobId, entryKey }, 'Job dequeued');

    return {
      job,
      ackToken: jobId,
    };
  }

  async acknowledge(jobId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    // Get job data for event
    const jobData = await this.client.hget(this.key(KEYS.JOBS), jobId);
    if (!jobData) {
      return false;
    }

    const job = JSON.parse(jobData) as EmbeddingJob;

    // Remove from in-flight and storage
    const multi = this.client.multi();
    multi.srem(this.key(KEYS.IN_FLIGHT), jobId);
    multi.hdel(this.key(KEYS.JOBS), jobId);
    multi.del(`${this.config.keyPrefix}inflight:${jobId}`);

    // Clean up sequence tracking
    const entryKey = `${job.entryType}:${job.entryId}`;
    const currentSeq = await this.client.hget(this.key(KEYS.SEQUENCES), entryKey);
    if (currentSeq && parseInt(currentSeq, 10) === job.seq) {
      multi.hdel(this.key(KEYS.SEQUENCES), entryKey);
    }

    await multi.exec();

    logger.debug({ jobId }, 'Job acknowledged');

    // Publish event
    await this.publishEvent({
      type: 'job_completed',
      jobId,
      entryType: job.entryType,
      entryId: job.entryId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  async requeue(jobId: string, error?: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    // Get job data
    const jobData = await this.client.hget(this.key(KEYS.JOBS), jobId);
    if (!jobData) {
      return false;
    }

    const job = JSON.parse(jobData) as EmbeddingJob;
    job.attempts++;
    job.lastError = error;

    // Remove from in-flight
    await this.client.srem(this.key(KEYS.IN_FLIGHT), jobId);
    await this.client.del(`${this.config.keyPrefix}inflight:${jobId}`);

    // Check if max attempts exceeded
    if (job.attempts >= this.config.maxAttempts) {
      // Move to DLQ
      const multi = this.client.multi();
      multi.hdel(this.key(KEYS.JOBS), jobId);
      multi.rpush(this.key(KEYS.DLQ), JSON.stringify(job));
      await multi.exec();

      logger.warn({ jobId, attempts: job.attempts, error }, 'Job moved to DLQ after max attempts');

      // Publish event
      await this.publishEvent({
        type: 'job_dlq',
        jobId,
        entryType: job.entryType,
        entryId: job.entryId,
        timestamp: new Date().toISOString(),
        error,
      });

      return false;
    }

    // Requeue with exponential backoff
    const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 30000);

    // Update job data and requeue
    await this.client.hset(this.key(KEYS.JOBS), jobId, JSON.stringify(job));

    // Delayed requeue using sorted set or just immediate for simplicity
    // For production, consider using Redis Streams or a delayed queue
    setTimeout(() => {
      if (this.client && this.connected) {
        this.client.rpush(this.key(KEYS.QUEUE), jobId).catch((err: Error) => {
          logger.warn({ jobId, error: err.message }, 'Failed to requeue job after backoff');
        });
      }
    }, backoffMs);

    logger.debug({ jobId, attempts: job.attempts, backoffMs }, 'Job requeued for retry');

    // Publish event
    await this.publishEvent({
      type: 'job_failed',
      jobId,
      entryType: job.entryType,
      entryId: job.entryId,
      timestamp: new Date().toISOString(),
      error,
    });

    return true;
  }

  // ===========================================================================
  // DEAD-LETTER QUEUE
  // ===========================================================================

  async getDLQ(limit = 100): Promise<EmbeddingJob[]> {
    if (!this.client || !this.connected) {
      return [];
    }

    const items = await this.client.lrange(this.key(KEYS.DLQ), 0, limit - 1);
    return items.map((item) => JSON.parse(item) as EmbeddingJob);
  }

  async retryFromDLQ(jobId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    // Get all DLQ items to find the job
    const items = await this.client.lrange(this.key(KEYS.DLQ), 0, -1);
    const index = items.findIndex((item) => {
      const job = JSON.parse(item) as EmbeddingJob;
      return job.id === jobId;
    });

    if (index === -1) {
      return false;
    }

    const itemJson = items[index];
    if (!itemJson) {
      return false;
    }

    const job = JSON.parse(itemJson) as EmbeddingJob;

    // Reset attempts and requeue
    job.attempts = 0;
    job.lastError = undefined;

    // Remove from DLQ (use LSET + LREM pattern)
    const multi = this.client.multi();
    // Mark for removal
    multi.lset(this.key(KEYS.DLQ), index, '__REMOVED__');
    multi.lrem(this.key(KEYS.DLQ), 1, '__REMOVED__');
    // Add back to main queue
    multi.hset(this.key(KEYS.JOBS), jobId, JSON.stringify(job));
    multi.rpush(this.key(KEYS.QUEUE), jobId);
    await multi.exec();

    logger.info({ jobId }, 'Job moved from DLQ back to queue');
    return true;
  }

  async removeFromDLQ(jobId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      return false;
    }

    const items = await this.client.lrange(this.key(KEYS.DLQ), 0, -1);
    const index = items.findIndex((item) => {
      const job = JSON.parse(item) as EmbeddingJob;
      return job.id === jobId;
    });

    if (index === -1) {
      return false;
    }

    const multi = this.client.multi();
    multi.lset(this.key(KEYS.DLQ), index, '__REMOVED__');
    multi.lrem(this.key(KEYS.DLQ), 1, '__REMOVED__');
    await multi.exec();

    logger.debug({ jobId }, 'Job removed from DLQ');
    return true;
  }

  async clearDLQ(): Promise<number> {
    if (!this.client || !this.connected) {
      return 0;
    }

    const count = await this.client.llen(this.key(KEYS.DLQ));
    await this.client.del(this.key(KEYS.DLQ));

    logger.info({ count }, 'DLQ cleared');
    return count;
  }

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  async getStats(): Promise<EmbeddingQueueStats> {
    if (!this.client || !this.connected) {
      return {
        pending: 0,
        inFlight: 0,
        uniqueEntries: 0,
        dlqSize: 0,
        isAccepting: false,
      };
    }

    const multi = this.client.multi();
    multi.llen(this.key(KEYS.QUEUE));
    multi.scard(this.key(KEYS.IN_FLIGHT));
    multi.hlen(this.key(KEYS.SEQUENCES));
    multi.llen(this.key(KEYS.DLQ));

    const results = await multi.exec();

    return {
      pending: (results?.[0]?.[1] as number) ?? 0,
      inFlight: (results?.[1]?.[1] as number) ?? 0,
      uniqueEntries: (results?.[2]?.[1] as number) ?? 0,
      dlqSize: (results?.[3]?.[1] as number) ?? 0,
      isAccepting: this.connected,
    };
  }

  subscribe(handler: (event: EmbeddingQueueEvent) => void): () => void {
    this.subscribers.add(handler);

    return () => {
      this.subscribers.delete(handler);
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Generate Redis key with prefix
   */
  private key(suffix: string): string {
    return `${this.config.keyPrefix}${suffix}`;
  }

  /**
   * Generate unique job ID
   */
  private async generateJobId(): Promise<string> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    const seq = await this.client.incr(this.key(KEYS.SEQ_COUNTER));
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);

    return `emb_${timestamp}_${seq}_${random}`;
  }

  /**
   * Set up pub/sub for cross-instance coordination
   */
  private async setupPubSub(): Promise<void> {
    if (!this.subClient) return;

    await this.subClient.subscribe(this.config.pubsubChannel);

    this.subClient.on('message', (_channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as EmbeddingQueueEvent;
        for (const handler of this.subscribers) {
          try {
            handler(event);
          } catch (error) {
            logger.warn({ error }, 'Subscriber handler error');
          }
        }
      } catch (error) {
        logger.warn({ error, message }, 'Failed to parse pub/sub message');
      }
    });
  }

  /**
   * Publish event to all instances
   */
  private async publishEvent(event: EmbeddingQueueEvent): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      await this.client.publish(this.config.pubsubChannel, JSON.stringify(event));
    } catch (error) {
      logger.debug({ error }, 'Failed to publish event');
    }
  }

  /**
   * Define Lua scripts for atomic operations
   */
  private async defineScripts(): Promise<void> {
    // Future: Add Lua scripts for complex atomic operations
    // For now, we use multi/exec which is sufficient
  }

  /**
   * Get Redis client for direct access (testing/debugging)
   */
  getClient(): Redis | null {
    return this.client;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a Redis embedding queue adapter
 */
export function createRedisEmbeddingQueueAdapter(
  config: RedisEmbeddingQueueConfig = {}
): RedisEmbeddingQueueAdapter {
  return new RedisEmbeddingQueueAdapter(config);
}

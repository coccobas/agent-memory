/**
 * Redis Event Adapter
 *
 * Implements IEventAdapter using Redis pub/sub for cross-instance
 * event propagation in horizontally scaled deployments.
 *
 * Uses separate connections for publishing and subscribing
 * (Redis requirement for pub/sub).
 */

import { z } from 'zod';
import type { IEventAdapterExtended, EntryChangedEvent } from '../interfaces/event-adapter.js';
import { createComponentLogger } from '../../utils/logger.js';
import { ConnectionGuard } from '../../utils/connection-guard.js';

// Type imports for ioredis (actual import is dynamic to avoid loading when not used)
type Redis = import('ioredis').default;

const logger = createComponentLogger('redis-event');

/**
 * Zod schema for EntryChangedEvent validation.
 */
const EntryChangedEventSchema: z.ZodType<EntryChangedEvent> = z.object({
  entryType: z.enum(['tool', 'guideline', 'knowledge']),
  entryId: z.string().min(1),
  scopeType: z.enum(['global', 'org', 'project', 'session']),
  scopeId: z.union([z.string(), z.null()]),
  action: z.enum(['create', 'update', 'delete', 'deactivate']),
});

/**
 * Zod schema for Redis event message validation.
 */
const RedisEventMessageSchema = z.object({
  instanceId: z.string().min(1),
  event: EntryChangedEventSchema,
  timestamp: z.string().optional(),
});

/**
 * Configuration options for Redis event adapter.
 */
export interface RedisEventConfig {
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
  /** Channel name for events (default: 'agentmem:events') */
  channel?: string;
  /** Enable TLS/SSL */
  tls?: boolean;
  /** Instance ID for filtering own messages (optional) */
  instanceId?: string;
}

/**
 * Event message format for Redis pub/sub.
 */
interface RedisEventMessage {
  instanceId: string;
  event: EntryChangedEvent;
  timestamp: string;
}

/**
 * Generate a random instance ID.
 */
function generateInstanceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Redis event adapter implementation.
 * Uses Redis pub/sub for cross-instance event propagation.
 *
 * Note: Requires two Redis connections - one for publishing
 * and one for subscribing (Redis pub/sub limitation).
 */
export class RedisEventAdapter implements IEventAdapterExtended {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private channel: string;
  private config: RedisEventConfig;
  private connected = false;
  private instanceId: string;
  private connectionGuard = new ConnectionGuard();

  // Local handlers for this instance
  private handlers = new Set<(event: EntryChangedEvent) => void>();

  constructor(config: RedisEventConfig) {
    this.config = config;
    this.channel = config.channel ?? 'agentmem:events';
    this.instanceId = config.instanceId ?? generateInstanceId();
  }

  /**
   * Initialize Redis connections for pub/sub.
   * Must be called before using the adapter.
   */
  async connect(): Promise<void> {
    return this.connectionGuard.connect(async () => {
      const { Redis: IORedis } = await import('ioredis');

      const options = {
        host: this.config.host ?? 'localhost',
        port: this.config.port ?? 6379,
        password: this.config.password,
        db: this.config.db ?? 0,
        lazyConnect: true,
        ...(this.config.tls ? { tls: {} } : {}),
      };

      // Create publisher connection
      if (this.config.url) {
        this.pubClient = new IORedis(this.config.url, options);
      } else {
        this.pubClient = new IORedis(options);
      }

      // Create subscriber connection (separate connection required for pub/sub)
      if (this.config.url) {
        this.subClient = new IORedis(this.config.url, options);
      } else {
        this.subClient = new IORedis(options);
      }

      const pubClient = this.pubClient!;
      const subClient = this.subClient!;

      // Set up event handlers for publisher
      pubClient.on('connect', () => {
        logger.debug('Redis event publisher connected');
      });

      pubClient.on('error', (error: Error) => {
        logger.error({ error }, 'Redis event publisher error');
      });

      pubClient.on('close', () => {
        this.connected = false;
        this.connectionGuard.setDisconnected();
      });

      // Set up event handlers for subscriber
      subClient.on('connect', () => {
        logger.debug('Redis event subscriber connected');
      });

      subClient.on('error', (error: Error) => {
        logger.error({ error }, 'Redis event subscriber error');
      });

      subClient.on('close', () => {
        this.connected = false;
        this.connectionGuard.setDisconnected();
      });

      // Connect both clients BEFORE setting up message handlers
      await Promise.all([pubClient.connect(), subClient.connect()]);

      // Subscribe to channel BEFORE registering message handlers
      await subClient.subscribe(this.channel);

      // Handle incoming messages - registered AFTER subscription is complete
      subClient.on('message', (channel: string, message: string) => {
        if (channel !== this.channel) return;

        try {
          const parsed = JSON.parse(message);

          // Validate message structure with Zod
          const validationResult = RedisEventMessageSchema.safeParse(parsed);
          if (!validationResult.success) {
            logger.warn(
              { error: validationResult.error, message },
              'Received malformed event message from Redis'
            );
            return;
          }

          const validated = validationResult.data;

          // Skip messages from this instance (we already handled locally)
          if (validated.instanceId === this.instanceId) {
            return;
          }

          // Dispatch to local handlers
          this.dispatchToHandlers(validated.event);
        } catch (error) {
          logger.warn({ error, message }, 'Failed to parse event message');
        }
      });

      this.connected = true;
      logger.info(
        { channel: this.channel, instanceId: this.instanceId },
        'Redis event adapter connected'
      );
    });
  }

  /**
   * Close Redis connections.
   */
  async close(): Promise<void> {
    if (this.subClient) {
      await this.subClient.unsubscribe(this.channel);
      await this.subClient.quit();
      this.subClient = null;
    }

    if (this.pubClient) {
      await this.pubClient.quit();
      this.pubClient = null;
    }

    this.connected = false;
    logger.info('Redis event adapter closed');
  }

  /**
   * Check if connected to Redis.
   */
  isConnected(): boolean {
    return this.connected && this.pubClient !== null && this.subClient !== null;
  }

  /**
   * Subscribe to entry change events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: (event: EntryChangedEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Emit an entry changed event.
   * Dispatches locally and publishes to Redis for other instances.
   */
  emit(event: EntryChangedEvent): void {
    // Always dispatch locally first
    this.dispatchToHandlers(event);

    // Publish to Redis if connected
    if (this.pubClient && this.connected) {
      this.publishAsync(event).catch((error) => {
        logger.warn({ error, event }, 'Failed to publish event to Redis');
      });
    }
  }

  /**
   * Clear all local handlers.
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get the number of local subscribers.
   */
  subscriberCount(): number {
    return this.handlers.size;
  }

  /**
   * Dispatch event to local handlers.
   */
  private dispatchToHandlers(event: EntryChangedEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.debug(
          {
            event,
            error: error instanceof Error ? error.message : String(error),
          },
          'Event handler failed'
        );
      }
    }
  }

  /**
   * Async publish to Redis.
   */
  private async publishAsync(event: EntryChangedEvent): Promise<void> {
    if (!this.pubClient || !this.connected) {
      return;
    }

    const message: RedisEventMessage = {
      instanceId: this.instanceId,
      event,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.pubClient.publish(this.channel, JSON.stringify(message));
    } catch (error) {
      logger.warn({ error, event }, 'Redis publish failed');
    }
  }

  /**
   * Get instance ID for debugging.
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Get Redis pub client for direct access.
   */
  getPubClient(): Redis | null {
    return this.pubClient;
  }

  /**
   * Get Redis sub client for direct access.
   */
  getSubClient(): Redis | null {
    return this.subClient;
  }
}

/**
 * Create a Redis event adapter.
 */
export function createRedisEventAdapter(config: RedisEventConfig): RedisEventAdapter {
  return new RedisEventAdapter(config);
}

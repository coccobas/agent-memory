/**
 * Application Context — V2 Minimal
 *
 * Holds the lifecycle-bound dependencies for the application.
 * V2 handlers only need sqlite + optional embedding service.
 */

import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import type { Config } from '../config/index.js';
import type { AppDb } from './types.js';

// ============================================================================
// EMBEDDING SERVICE INTERFACE (used by v2 projector embed action)
// ============================================================================

export type EmbeddingProvider = 'openai' | 'lmstudio' | 'local' | 'disabled';

export interface IEmbeddingService {
  isAvailable(): boolean;
  getProvider(): EmbeddingProvider;
  getEmbeddingDimension(): number;
  embed(text: string): Promise<{ embedding: number[]; model: string; provider: EmbeddingProvider }>;
  embedBatch(
    texts: string[]
  ): Promise<{ embeddings: number[][]; model: string; provider: EmbeddingProvider }>;
  clearCache(): void;
  cleanup(): void;
}

// ============================================================================
// APPLICATION CONTEXT
// ============================================================================

/**
 * V2 Application Context
 *
 * Minimal context for v2 tool handlers:
 * - config: Application configuration
 * - db: Drizzle ORM instance (for Container compatibility)
 * - sqlite: Raw better-sqlite3 handle (used by v2 runtime)
 * - logger: Structured logger
 * - services.embedding: Optional embedding service for semantic search
 */
export interface AppContext {
  config: Config;
  /** Drizzle ORM database (kept for Container compatibility) */
  db: AppDb;
  /** Raw SQLite handle — the primary dependency for v2 handlers */
  sqlite?: Database.Database;
  logger: Logger;
  /** Optional services */
  services?: {
    /** Embedding service for v2 projector embed action */
    embedding?: IEmbeddingService;
  };
}

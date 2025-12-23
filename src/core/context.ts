import type { Logger } from 'pino';
import type Database from 'better-sqlite3';
import type { Config } from '../config/index.js';
import type { SecurityService } from '../services/security.service.js';
import type { PermissionService } from '../services/permission.service.js';
import type { VerificationService } from '../services/verification.service.js';
import type { PipelineDependencies } from '../services/query/pipeline.js';
import type { Runtime } from './runtime.js';
import type { Repositories } from './interfaces/repositories.js';
import type { AppDb } from './types.js';
import type { Adapters } from './adapters/index.js';

/**
 * Service interfaces for AppContext
 * Using interfaces to allow flexible implementations and testing
 */
export interface IEmbeddingService {
  isAvailable(): boolean;
  getProvider(): 'openai' | 'local' | 'disabled';
  getEmbeddingDimension(): number;
  embed(text: string): Promise<{ embedding: number[]; model: string; provider: string }>;
  embedBatch(texts: string[]): Promise<{ embeddings: number[][]; model: string; provider: string }>;
  clearCache(): void;
  cleanup(): void;
}

export interface IVectorService {
  isAvailable(): boolean;
  initialize(): Promise<void>;
  storeEmbedding(
    entryType: string,
    entryId: string,
    versionId: string,
    text: string,
    embedding: number[],
    model: string
  ): Promise<void>;
  searchSimilar(embedding: number[], entryTypes: string[], limit?: number): Promise<Array<{
    entryType: string;
    entryId: string;
    versionId: string;
    text: string;
    score: number;
  }>>;
  getCount(): Promise<number>;
  close(): void;
}

export interface IExtractionService {
  isAvailable(): boolean;
  getProvider(): 'openai' | 'anthropic' | 'ollama' | 'disabled';
  extract(input: {
    context: string;
    contextType?: 'conversation' | 'code' | 'mixed';
    focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools')[];
  }): Promise<{
    entries: Array<{
      type: 'guideline' | 'knowledge' | 'tool';
      name?: string;
      title?: string;
      content: string;
      confidence: number;
    }>;
    entities: Array<{ name: string; entityType: string; confidence: number }>;
    relationships: Array<{ sourceRef: string; targetRef: string; relationType: string; confidence: number }>;
    model: string;
    provider: string;
  }>;
}

/**
 * Services container
 * Optional services for embedding, vector, extraction
 * Permission is required for all authorization checks
 */
export interface AppContextServices {
  embedding?: IEmbeddingService;
  vector?: IVectorService;
  extraction?: IExtractionService;
  permission: PermissionService; // Required - all code paths must have permission service
  verification?: VerificationService;
}

/**
 * Application Context
 *
 * Holds the lifecycle-bound dependencies for the application.
 * Passed down to services and controllers to avoid global state.
 */
export interface AppContext {
  config: Config;
  /** Type-safe Drizzle database with full schema type information */
  db: AppDb;
  sqlite: Database.Database;
  logger: Logger;
  queryDeps: PipelineDependencies;
  security: SecurityService;
  runtime: Runtime;
  services?: AppContextServices;
  repos: Repositories;
  /** Adapter layer for storage, cache, locks, and events */
  adapters?: Adapters;
}

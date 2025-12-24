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
export type EmbeddingProvider = 'openai' | 'local' | 'disabled';

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
  searchSimilar(
    embedding: number[],
    entryTypes: string[],
    limit?: number
  ): Promise<
    Array<{
      entryType: string;
      entryId: string;
      versionId: string;
      text: string;
      score: number;
    }>
  >;
  removeEmbedding(entryType: string, entryId: string, versionId?: string): Promise<void>;
  getCount(): Promise<number>;
  close(): void;
}

export type ExtractionProvider = 'openai' | 'anthropic' | 'ollama' | 'disabled';
export type EntityType = 'person' | 'technology' | 'component' | 'concept' | 'organization';
export type ExtractedRelationType = 'depends_on' | 'related_to' | 'applies_to' | 'conflicts_with';

export interface IExtractionService {
  isAvailable(): boolean;
  getProvider(): ExtractionProvider;
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
    entities: Array<{
      name: string;
      entityType: EntityType;
      description?: string;
      confidence: number;
    }>;
    relationships: Array<{
      sourceRef: string;
      sourceType: 'guideline' | 'knowledge' | 'tool' | 'entity';
      targetRef: string;
      targetType: 'guideline' | 'knowledge' | 'tool' | 'entity';
      relationType: ExtractedRelationType;
      confidence: number;
    }>;
    model: string;
    provider: ExtractionProvider;
    tokensUsed?: number;
    processingTimeMs: number;
  }>;
}

/**
 * Hierarchical summarization service interface
 */
export interface IHierarchicalSummarizationService {
  buildSummaries(options: {
    scopeType: 'global' | 'org' | 'project' | 'session';
    scopeId?: string;
    entryTypes?: Array<'tool' | 'guideline' | 'knowledge' | 'experience'>;
    forceRebuild?: boolean;
  }): Promise<{
    summariesCreated: number;
    levelsBuilt: number;
    processingTimeMs: number;
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
  summarization?: IHierarchicalSummarizationService;
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
  /** SQLite handle - only present in SQLite mode, undefined in PostgreSQL mode */
  sqlite?: Database.Database;
  logger: Logger;
  queryDeps: PipelineDependencies;
  security: SecurityService;
  runtime: Runtime;
  services?: AppContextServices;
  repos: Repositories;
  /** Adapter layer for storage, cache, locks, and events */
  adapters?: Adapters;
}

import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createComponentLogger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import {
  createVectorInvalidInputError,
  createVectorNotInitializedError,
  createVectorDbError,
} from '../../core/errors.js';
import type { IVectorStore } from '../../core/interfaces/vector-store.js';
import type {
  DistanceMetric,
  SearchResult,
  VectorRecord,
} from '../../core/interfaces/vector.service.js';

const logger = createComponentLogger('lancedb-store');

// Configuration from centralized config
const DEFAULT_VECTOR_DB_PATH = config.vectorDb.path;

/**
 * Validate and sanitize identifier for use in LanceDB filter queries
 * Uses whitelist approach to prevent SQL injection
 * @throws Error if identifier contains invalid characters
 */
function validateIdentifier(input: string, fieldName: string): string {
  // Allow alphanumeric, hyphens, underscores (common in UUIDs and IDs)
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
    throw createVectorInvalidInputError(
      fieldName,
      'contains disallowed characters. Only alphanumeric, hyphens, and underscores are allowed.'
    );
  }
  // Additional length check to prevent abuse
  if (input.length > 200) {
    throw createVectorInvalidInputError(fieldName, 'exceeds maximum length of 200 characters');
  }
  return input;
}

/**
 * LanceDB implementation of IVectorStore
 */
export class LanceDbVectorStore implements IVectorStore {
  private connection: Connection | null = null;
  private table: Table | null = null;
  private tableName = 'embeddings';
  private dbPath: string;
  private expectedDimension: number | null = null;
  private distanceMetric: DistanceMetric;
  private initPromise: Promise<void> | null = null;
  private ensureTablePromise: Promise<{ createdWithRecord: boolean }> | null = null;

  constructor(dbPath?: string, distanceMetric?: DistanceMetric) {
    this.dbPath = dbPath || DEFAULT_VECTOR_DB_PATH;
    this.distanceMetric = distanceMetric || config.vectorDb.distanceMetric;
  }

  getDistanceMetric(): DistanceMetric {
    return this.distanceMetric;
  }

  isAvailable(): boolean {
    return !!this.connection;
  }

  getExpectedDimension(): number | null {
    return this.expectedDimension;
  }

  setExpectedDimension(dimension: number): void {
    if (this.expectedDimension !== null && this.expectedDimension !== dimension) {
      logger.warn(
        { existingDimension: this.expectedDimension, newDimension: dimension },
        'Embedding dimension mismatch detected. This may cause search issues.'
      );
    }
    this.expectedDimension = dimension;
  }

  async initialize(): Promise<void> {
    if (this.connection) {
      return; // Already initialized
    }

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Connect to LanceDB with timeout
    const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
    const connectionPromise = connect(this.dbPath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Vector DB connection timeout after ${CONNECTION_TIMEOUT_MS}ms`)),
        CONNECTION_TIMEOUT_MS
      )
    );

    try {
      this.connection = await Promise.race([connectionPromise, timeoutPromise]);
    } catch (error) {
      throw createVectorDbError('connect', error instanceof Error ? error.message : String(error));
    }

    // Check if table exists - errors here are OK, table will be created on first use
    try {
      const tableNames = await this.connection.tableNames();

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.connection.openTable(this.tableName);
      }
      // Table will be created on first store call
    } catch (error) {
      // If error is about table not found, it's ok - table will be created later
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(
        { error: errorMessage },
        'Could not list/open vector table, will create on first embedding'
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.connection) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize().finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  private async ensureTable(
    recordForCreate?: VectorRecord
  ): Promise<{ createdWithRecord: boolean }> {
    if (this.table) return { createdWithRecord: false };
    if (this.ensureTablePromise) return this.ensureTablePromise;

    this.ensureTablePromise = (async () => {
      await this.ensureInitialized();
      if (this.table) return { createdWithRecord: false };
      if (!this.connection) {
        throw createVectorNotInitializedError();
      }

      try {
        const tableNames = await this.connection.tableNames();
        if (tableNames.includes(this.tableName)) {
          this.table = await this.connection.openTable(this.tableName);
          return { createdWithRecord: false };
        }
      } catch (error) {
        logger.debug({ error }, 'Could not list tables, will try open/create table');
      }

      try {
        this.table = await this.connection.openTable(this.tableName);
        return { createdWithRecord: false };
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to open vector table, will try to create it'
        );
      }

      if (!recordForCreate) {
        throw createVectorDbError(
          'ensureTable',
          'Table is missing and no record provided to create it'
        );
      }

      try {
        this.table = await this.connection.createTable(this.tableName, [recordForCreate]);
        return { createdWithRecord: true };
      } catch (error) {
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to create vector table, will try to open it'
        );
        this.table = await this.connection.openTable(this.tableName);
        return { createdWithRecord: false };
      }
    })().finally(() => {
      this.ensureTablePromise = null;
    });

    return this.ensureTablePromise;
  }

  async store(record: VectorRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      const { createdWithRecord } = await this.ensureTable(record);
      if (createdWithRecord) return;
      if (!this.table) return;

      await this.table.add([record]);
    } catch (error) {
      throw createVectorDbError('store', error instanceof Error ? error.message : String(error));
    }
  }

  async delete(filter: {
    entryType: string;
    entryId: string;
    versionId?: string;
    excludeVersionId?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    if (!this.table) return;

    try {
      const validatedEntryType = validateIdentifier(filter.entryType, 'entryType');
      const validatedEntryId = validateIdentifier(filter.entryId, 'entryId');

      let filterPredicate = `"entryType" = '${validatedEntryType}' AND "entryId" = '${validatedEntryId}'`;

      if (filter.versionId) {
        const validatedVersionId = validateIdentifier(filter.versionId, 'versionId');
        filterPredicate += ` AND "versionId" = '${validatedVersionId}'`;
      }

      if (filter.excludeVersionId) {
        const validatedExcludeVersionId = validateIdentifier(
          filter.excludeVersionId,
          'excludeVersionId'
        );
        filterPredicate += ` AND "versionId" != '${validatedExcludeVersionId}'`;
      }

      await this.table.delete(filterPredicate);
    } catch (error) {
      logger.warn({ error, filter }, 'Failed to delete embeddings');
    }
  }

  async search(
    embedding: number[],
    options: {
      limit: number;
      entryTypes?: string[];
    }
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    try {
      let query = this.table.search(embedding);
      query = query.limit(options.limit);

      if (options.entryTypes && options.entryTypes.length > 0) {
        const typeFilter = options.entryTypes
          .map((t) => {
            const validated = validateIdentifier(t, 'entryType');
            return `"entryType" = '${validated}'`;
          })
          .join(' OR ');
        query = query.filter(`(${typeFilter})`);
      }

      const results = await query.toArray();

      if (!Array.isArray(results)) {
        logger.warn(
          { resultsType: typeof results },
          'Vector search returned non-array result, treating as empty'
        );
        return [];
      }

      return results
        .map((result): SearchResult | null => {
          if (
            typeof result !== 'object' ||
            result === null ||
            !('entryType' in result) ||
            !('entryId' in result) ||
            !('versionId' in result) ||
            !('text' in result)
          ) {
            return null;
          }

          const record = result as Record<string, unknown>;
          return {
            entryType: String(record.entryType),
            entryId: String(record.entryId),
            versionId: String(record.versionId),
            score:
              typeof record._distance === 'number'
                ? this.distanceToSimilarity(record._distance)
                : 0,
            text: String(record.text),
          };
        })
        .filter((result): result is SearchResult => result !== null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isExpectedError =
        errorMessage.includes('not initialized') ||
        errorMessage.includes('empty') ||
        errorMessage.includes('does not exist') ||
        errorMessage.includes('no such table');

      if (isExpectedError) {
        logger.debug(
          { error: errorMessage },
          'Search returned empty (table not initialized or empty)'
        );
        return [];
      }

      logger.error({ error }, 'Unexpected error during vector search');
      throw error;
    }
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    if (!this.table) return 0;

    try {
      const result = await this.table.countRows();
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      return 0;
    }
  }

  close(): void {
    this.connection = null;
    this.table = null;
  }

  private distanceToSimilarity(distance: number): number {
    if (this.distanceMetric === 'cosine') {
      return Math.max(0, Math.min(1, 1 - distance));
    } else if (this.distanceMetric === 'l2') {
      return Math.max(0, 1 - distance / 2);
    } else if (this.distanceMetric === 'dot') {
      return Math.max(0, Math.min(1, (1 - distance) / 2));
    }
    return 1 / (1 + distance);
  }
}

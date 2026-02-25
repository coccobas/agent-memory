import type Database from 'better-sqlite3';
import type {
  CandidateHit,
  EntrySnapshot,
  EntrySource,
  EntryType,
  QueryRequest,
  RetrievalStrategy,
} from '../../contracts/index.js';
import type {
  CandidateSource,
  EntryFilter,
  EntryRanker,
  EntryReader,
  ReadPipelineDeps,
  StrategyResolver,
} from '../../read/index.js';
import {
  SimpleTagFilter,
  StaticStrategyResolver,
  WeightedChannelRanker,
} from '../../read/index.js';
import {
  cosineSimilarity,
  getScopeVisibilityKeys,
  loadEntrySnapshot,
  sqliteBool,
  stringScoreOverlap,
} from './shared.js';

export interface SqliteReadDeps {
  sqlite: Database.Database;
}

function buildInClause(values: readonly string[]): string {
  return values.map(() => '?').join(', ');
}

function asLimit(request: QueryRequest): number {
  return Math.max(1, Math.min(500, request.limit * 4));
}

function normalizeRank(rank: number): number {
  const value = Number.isFinite(rank) ? Math.abs(rank) : 1;
  return 1 / (1 + value);
}

function entryTypeFilterSql(types: readonly EntryType[] | undefined): {
  clause: string;
  params: unknown[];
} {
  if (!types || types.length === 0) {
    return {
      clause: '',
      params: [],
    };
  }

  return {
    clause: ` AND e.entry_type IN (${buildInClause(types)})`,
    params: [...types],
  };
}

function scopeFilterSql(scopeIds: readonly string[]): { clause: string; params: unknown[] } {
  if (scopeIds.length === 0) {
    return {
      clause: '',
      params: [],
    };
  }

  return {
    clause: ` AND e.scope_id IN (${buildInClause(scopeIds)})`,
    params: [...scopeIds],
  };
}

function sourceFilterSql(sources: readonly EntrySource[] | undefined): {
  clause: string;
  params: unknown[];
} {
  if (!sources || sources.length === 0) {
    return {
      clause: '',
      params: [],
    };
  }

  return {
    clause: ` AND e.source IN (${buildInClause(sources)})`,
    params: [...sources],
  };
}

function activeFilterSql(includeInactive: boolean | undefined): string {
  return includeInactive ? '' : ' AND e.is_active = 1';
}

export class SqliteFtsCandidateSource implements CandidateSource {
  readonly channel = 'fts' as const;

  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async fetchCandidates(
    request: QueryRequest,
    strategy: RetrievalStrategy
  ): Promise<readonly CandidateHit[]> {
    if (strategy === 'semantic') {
      return [];
    }

    const query = request.query?.trim();
    if (!query) {
      return [];
    }

    const scopeIds = [...getScopeVisibilityKeys(this.sqlite, request.scope)];
    const scopeFilter = scopeFilterSql(scopeIds);
    const typeFilter = entryTypeFilterSql(request.types);
    const srcFilter = sourceFilterSql(request.sources);

    const sql = `
      SELECT
        e.id AS entry_id,
        e.entry_type AS entry_type,
        bm25(v2_entry_fts) AS rank
      FROM v2_entry_fts
      INNER JOIN v2_entries e ON e.id = v2_entry_fts.entry_id
      WHERE v2_entry_fts MATCH ?
      ${activeFilterSql(request.includeInactive)}
      ${scopeFilter.clause}
      ${typeFilter.clause}
      ${srcFilter.clause}
      ORDER BY rank ASC
      LIMIT ?
    `;

    const params = [
      query,
      ...scopeFilter.params,
      ...typeFilter.params,
      ...srcFilter.params,
      asLimit(request),
    ];

    try {
      const rows = this.sqlite.prepare(sql).all(...params) as Array<{
        entry_id: string;
        entry_type: EntryType;
        rank: number;
      }>;

      return rows.map((row) => ({
        entryId: row.entry_id,
        entryType: row.entry_type,
        channel: 'fts',
        score: normalizeRank(row.rank),
      }));
    } catch {
      // Invalid FTS query syntax should fail open and continue other channels.
      return [];
    }
  }
}

export class SqliteSemanticCandidateSource implements CandidateSource {
  readonly channel = 'semantic' as const;

  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async fetchCandidates(
    request: QueryRequest,
    strategy: RetrievalStrategy
  ): Promise<readonly CandidateHit[]> {
    if (strategy === 'fts') {
      return [];
    }

    if (request.queryEmbedding && request.queryEmbedding.length > 0) {
      return this.fetchByVector(request);
    }

    return this.fetchByTokenOverlap(request);
  }

  private fetchByVector(request: QueryRequest): readonly CandidateHit[] {
    const queryVec = new Float32Array(request.queryEmbedding!);

    const scopeIds = [...getScopeVisibilityKeys(this.sqlite, request.scope)];
    const scopeFilter = scopeFilterSql(scopeIds);
    const typeFilter = entryTypeFilterSql(request.types);
    const srcFilter = sourceFilterSql(request.sources);

    const sql = `
      SELECT
        e.id AS entry_id,
        e.entry_type AS entry_type,
        emb.embedding AS embedding
      FROM v2_entry_embeddings emb
      INNER JOIN v2_entries e ON e.id = emb.entry_id
      WHERE emb.status = 'ready'
        AND emb.embedding IS NOT NULL
      ${activeFilterSql(request.includeInactive)}
      ${scopeFilter.clause}
      ${typeFilter.clause}
      ${srcFilter.clause}
    `;

    const params = [...scopeFilter.params, ...typeFilter.params, ...srcFilter.params];
    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      entry_id: string;
      entry_type: EntryType;
      embedding: Buffer;
    }>;

    const scored = rows
      .map((row) => {
        const storedVec = new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
        );
        return {
          entryId: row.entry_id,
          entryType: row.entry_type,
          score: cosineSimilarity(queryVec, storedVec),
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, asLimit(request));

    return scored.map((row) => ({
      entryId: row.entryId,
      entryType: row.entryType,
      channel: 'semantic' as const,
      score: row.score,
    }));
  }

  private fetchByTokenOverlap(request: QueryRequest): readonly CandidateHit[] {
    const query = request.query?.trim();
    if (!query) {
      return [];
    }

    const scopeIds = [...getScopeVisibilityKeys(this.sqlite, request.scope)];
    const scopeFilter = scopeFilterSql(scopeIds);
    const typeFilter = entryTypeFilterSql(request.types);
    const srcFilter = sourceFilterSql(request.sources);

    const sql = `
      SELECT
        e.id AS entry_id,
        e.entry_type AS entry_type,
        e.title AS title,
        ev.content AS content
      FROM v2_entries e
      INNER JOIN v2_entry_versions ev
        ON ev.entry_id = e.id
       AND ev.version_num = e.current_version
      WHERE 1 = 1
      ${activeFilterSql(request.includeInactive)}
      ${scopeFilter.clause}
      ${typeFilter.clause}
      ${srcFilter.clause}
      ORDER BY e.updated_at DESC
      LIMIT ?
    `;

    const params = [
      ...scopeFilter.params,
      ...typeFilter.params,
      ...srcFilter.params,
      Math.max(50, asLimit(request) * 3),
    ];
    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      entry_id: string;
      entry_type: EntryType;
      title: string;
      content: string;
    }>;

    const scored = rows
      .map((row) => ({
        entryId: row.entry_id,
        entryType: row.entry_type,
        score: stringScoreOverlap(query, `${row.title} ${row.content}`),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, asLimit(request));

    return scored.map((row) => ({
      entryId: row.entryId,
      entryType: row.entryType,
      channel: 'semantic' as const,
      score: row.score,
    }));
  }
}

export class SqliteRelationCandidateSource implements CandidateSource {
  readonly channel = 'relation' as const;

  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async fetchCandidates(
    request: QueryRequest,
    _strategy: RetrievalStrategy
  ): Promise<readonly CandidateHit[]> {
    if (!request.relatedTo) {
      return [];
    }

    const maxDepth = Math.max(1, Math.min(5, request.relatedTo.depth ?? 1));
    const seenDepth = new Map<string, number>();
    let frontier = new Set<string>([request.relatedTo.entryId]);

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      if (frontier.size === 0) {
        break;
      }

      const ids = [...frontier];
      const params: unknown[] = [...ids, ...ids];
      let relationFilter = '';
      if (request.relatedTo.relationType) {
        relationFilter = ' AND relation_type = ?';
        params.push(request.relatedTo.relationType);
      }

      const inClause = buildInClause(ids);
      const relationRows = this.sqlite
        .prepare(
          `
          SELECT source_entry_id, target_entry_id
          FROM v2_relations
          WHERE (source_entry_id IN (${inClause}) OR target_entry_id IN (${inClause}))
          ${relationFilter}
        `
        )
        .all(...params) as Array<{ source_entry_id: string; target_entry_id: string }>;

      const nextFrontier = new Set<string>();

      for (const row of relationRows) {
        const neighbors = [row.source_entry_id, row.target_entry_id];
        for (const neighbor of neighbors) {
          if (neighbor === request.relatedTo.entryId) {
            continue;
          }

          if (seenDepth.has(neighbor)) {
            continue;
          }

          seenDepth.set(neighbor, depth);
          nextFrontier.add(neighbor);
        }
      }

      frontier = nextFrontier;
    }

    if (seenDepth.size === 0) {
      return [];
    }

    const candidateIds = [...seenDepth.keys()];
    const scopeIds = [...getScopeVisibilityKeys(this.sqlite, request.scope)];
    const scopeFilter = scopeFilterSql(scopeIds);
    const typeFilter = entryTypeFilterSql(request.types);
    const srcFilter = sourceFilterSql(request.sources);

    const sql = `
      SELECT id AS entry_id, entry_type AS entry_type
      FROM v2_entries e
      WHERE e.id IN (${buildInClause(candidateIds)})
      ${activeFilterSql(request.includeInactive)}
      ${scopeFilter.clause}
      ${typeFilter.clause}
      ${srcFilter.clause}
    `;

    const rows = this.sqlite
      .prepare(sql)
      .all(
        ...candidateIds,
        ...scopeFilter.params,
        ...typeFilter.params,
        ...srcFilter.params
      ) as Array<{
      entry_id: string;
      entry_type: EntryType;
    }>;

    return rows.map((row) => {
      const depth = seenDepth.get(row.entry_id) ?? maxDepth;
      return {
        entryId: row.entry_id,
        entryType: row.entry_type,
        channel: 'relation',
        score: 1 / depth,
      };
    });
  }
}

export class SqlitePrimaryCandidateSource implements CandidateSource {
  readonly channel = 'primary' as const;

  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async fetchCandidates(
    request: QueryRequest,
    _strategy: RetrievalStrategy
  ): Promise<readonly CandidateHit[]> {
    const scopeIds = [...getScopeVisibilityKeys(this.sqlite, request.scope)];
    const scopeFilter = scopeFilterSql(scopeIds);
    const typeFilter = entryTypeFilterSql(request.types);
    const srcFilter = sourceFilterSql(request.sources);

    const sql = `
      SELECT
        e.id AS entry_id,
        e.entry_type AS entry_type,
        e.title AS title,
        ev.content AS content,
        e.updated_at AS updated_at
      FROM v2_entries e
      INNER JOIN v2_entry_versions ev
        ON ev.entry_id = e.id
       AND ev.version_num = e.current_version
      WHERE 1 = 1
      ${activeFilterSql(request.includeInactive)}
      ${scopeFilter.clause}
      ${typeFilter.clause}
      ${srcFilter.clause}
      ORDER BY e.updated_at DESC
      LIMIT ?
    `;

    const rows = this.sqlite
      .prepare(sql)
      .all(
        ...scopeFilter.params,
        ...typeFilter.params,
        ...srcFilter.params,
        Math.max(25, asLimit(request))
      ) as Array<{
      entry_id: string;
      entry_type: EntryType;
      title: string;
      content: string;
      updated_at: string;
    }>;

    const query = request.query?.trim();

    return rows.map((row, index) => {
      const baseScore = query
        ? Math.max(0.01, stringScoreOverlap(query, `${row.title} ${row.content}`))
        : Math.max(0.01, 1 - index / Math.max(1, rows.length));

      return {
        entryId: row.entry_id,
        entryType: row.entry_type,
        channel: 'primary',
        score: baseScore,
      };
    });
  }
}

export class SqliteEntryReader implements EntryReader {
  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async getEntries(
    refs: readonly { type: EntryType; id: string }[]
  ): Promise<readonly EntrySnapshot[]> {
    const deduped = new Map<string, EntryType>();

    for (const ref of refs) {
      deduped.set(ref.id, ref.type);
    }

    const entries: EntrySnapshot[] = [];

    for (const [entryId, entryType] of deduped.entries()) {
      const snapshot = loadEntrySnapshot(this.sqlite, entryId);
      if (!snapshot || snapshot.ref.type !== entryType) {
        continue;
      }
      entries.push(snapshot);
    }

    return entries;
  }
}

export class SqliteIncludeInactiveFilter implements EntryFilter {
  private readonly sqlite: Database.Database;

  constructor(deps: SqliteReadDeps) {
    this.sqlite = deps.sqlite;
  }

  async apply(
    entries: readonly EntrySnapshot[],
    request: QueryRequest
  ): Promise<readonly EntrySnapshot[]> {
    if (request.includeInactive) {
      return entries;
    }

    if (entries.length === 0) {
      return entries;
    }

    const ids = entries.map((entry) => entry.ref.id);
    const sql = `
      SELECT id, is_active
      FROM v2_entries
      WHERE id IN (${buildInClause(ids)})
    `;

    const rows = this.sqlite.prepare(sql).all(...ids) as Array<{ id: string; is_active: number }>;
    const activeById = new Map(rows.map((row) => [row.id, row.is_active === sqliteBool(true)]));

    return entries.filter((entry) => activeById.get(entry.ref.id) ?? false);
  }
}

export function createSqliteReadPipelineDeps(deps: SqliteReadDeps): ReadPipelineDeps {
  const strategyResolver: StrategyResolver = new StaticStrategyResolver();
  const ranker: EntryRanker = new WeightedChannelRanker();

  return {
    strategyResolver,
    candidateSources: [
      new SqliteFtsCandidateSource(deps),
      new SqliteSemanticCandidateSource(deps),
      new SqliteRelationCandidateSource(deps),
      new SqlitePrimaryCandidateSource(deps),
    ],
    entryReader: new SqliteEntryReader(deps),
    filters: [new SqliteIncludeInactiveFilter(deps), new SimpleTagFilter()],
    ranker,
  };
}

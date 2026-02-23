import type Database from 'better-sqlite3';
import { CompositeIndexProjector, OutboxProjectionRunner } from '../../indexing/index.js';
import { ReadPipeline, type ReadTraceEmitter } from '../../read/index.js';
import { MemoryWriteService } from '../../write/index.js';
import {
  SqliteCacheInvalidationProjector,
  SqliteFtsProjector,
  SqliteOutboxSubscriber,
  SqliteRelationBookkeepingProjector,
  SqliteSemanticProjector,
} from './indexing.js';
import { createSqliteReadPipelineDeps } from './read.js';
import { SqliteWriteUnitOfWork } from './write.js';

export interface CreateSqliteMemoryV2Deps {
  sqlite: Database.Database;
  idGenerator?: () => string;
  clock?: () => Date;
  cacheInvalidator?: (key: string) => void | Promise<void>;
  projectorName?: string;
  traceEmitter?: ReadTraceEmitter;
}

export interface SqliteMemoryV2Runtime {
  memory: {
    write: MemoryWriteService;
    read: ReadPipeline;
    projector: CompositeIndexProjector;
  };
  projectorRunner: OutboxProjectionRunner;
  projectorSubscriber: SqliteOutboxSubscriber;
}

export function createSqliteMemoryV2Runtime(deps: CreateSqliteMemoryV2Deps): SqliteMemoryV2Runtime {
  const indexingDeps = {
    sqlite: deps.sqlite,
    clock: deps.clock,
  };

  const projectors = [
    new SqliteFtsProjector(indexingDeps),
    new SqliteSemanticProjector(indexingDeps),
    new SqliteRelationBookkeepingProjector(indexingDeps),
    new SqliteCacheInvalidationProjector(deps.cacheInvalidator ?? (() => undefined)),
  ];

  const memory = {
    write: new MemoryWriteService({
      uow: new SqliteWriteUnitOfWork({
        sqlite: deps.sqlite,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
      }),
      idGenerator: deps.idGenerator,
      clock: deps.clock,
    }),
    read: new ReadPipeline({
      ...createSqliteReadPipelineDeps({ sqlite: deps.sqlite }),
      traceEmitter: deps.traceEmitter,
    }),
    projector: new CompositeIndexProjector(projectors),
  };

  const projectorSubscriber = new SqliteOutboxSubscriber(indexingDeps, {
    projectorName: deps.projectorName ?? 'v2-core',
  });

  const projectorRunner = new OutboxProjectionRunner(projectorSubscriber, memory.projector);

  return {
    memory,
    projectorRunner,
    projectorSubscriber,
  };
}

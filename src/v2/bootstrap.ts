/**
 * V2 composition root.
 */

import { CompositeIndexProjector, type IndexProjector } from './indexing/index.js';
import { ReadPipeline, type ReadPipelineDeps } from './read/index.js';
import { MemoryWriteService, type MemoryWriteServiceDeps } from './write/index.js';

export interface MemoryV2 {
  write: MemoryWriteService;
  read: ReadPipeline;
  projector: CompositeIndexProjector;
}

export interface CreateMemoryV2Deps {
  write: MemoryWriteServiceDeps;
  read: ReadPipelineDeps;
  projectors?: readonly IndexProjector[];
}

export function createMemoryV2(deps: CreateMemoryV2Deps): MemoryV2 {
  return {
    write: new MemoryWriteService(deps.write),
    read: new ReadPipeline(deps.read),
    projector: new CompositeIndexProjector(deps.projectors ?? []),
  };
}

export {
  createSqliteMemoryV2Runtime,
  type CreateSqliteMemoryV2Deps,
  type SqliteMemoryV2Runtime,
} from './adapters/sqlite/factory.js';

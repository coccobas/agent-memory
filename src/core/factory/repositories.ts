/**
 * Repository factory functions
 *
 * Creates all repository instances with injected database dependencies.
 */

import type { DatabaseDeps } from '../types.js';
import type { Repositories } from '../interfaces/repositories.js';
import {
  createTagRepository,
  createEntryTagRepository,
  createEntryRelationRepository,
} from '../../db/repositories/tags.js';
import {
  createOrganizationRepository,
  createProjectRepository,
  createSessionRepository,
} from '../../db/repositories/scopes.js';
import { createFileLockRepository } from '../../db/repositories/file_locks.js';
import { createGuidelineRepository } from '../../db/repositories/guidelines.js';
import { createKnowledgeRepository } from '../../db/repositories/knowledge.js';
import { createToolRepository } from '../../db/repositories/tools.js';
import { createConversationRepository } from '../../db/repositories/conversations.js';
import { createConflictRepository } from '../../db/repositories/conflicts.js';
import { createExperienceRepository } from '../../db/repositories/experiences.js';
import { createNodeRepository, createEdgeRepository } from '../../db/repositories/graph/index.js';
import { createTypeRegistry } from '../../services/graph/index.js';
import { createTaskRepository } from '../../db/repositories/tasks.js';
import { createEvidenceRepository } from '../../db/repositories/evidence.js';
import { createEpisodeRepository } from '../../db/repositories/episodes.js';
import { createHookMetricsRepository } from '../../db/repositories/hook-metrics.js';
import { createIDETranscriptRepository } from '../../db/repositories/ide-transcripts.js';

/**
 * Create all repositories with injected dependencies
 *
 * @param deps - Database dependencies (db, sqlite)
 * @returns All repository instances
 */
export function createRepositories(deps: DatabaseDeps): Repositories {
  // TagRepo is created first as it's a dependency for entryTags
  const tagRepo = createTagRepository(deps);

  // Graph repositories (NodeRepo is dependency for EdgeRepo)
  const typeRegistry = createTypeRegistry(deps);
  const nodeRepo = createNodeRepository(deps);
  const edgeRepo = createEdgeRepository(deps, nodeRepo);

  return {
    tags: tagRepo,
    entryTags: createEntryTagRepository(deps, tagRepo),
    entryRelations: createEntryRelationRepository(deps),
    organizations: createOrganizationRepository(deps),
    projects: createProjectRepository(deps),
    sessions: createSessionRepository(deps),
    fileLocks: createFileLockRepository(deps),
    guidelines: createGuidelineRepository(deps),
    knowledge: createKnowledgeRepository(deps),
    tools: createToolRepository(deps),
    conversations: createConversationRepository(deps),
    conflicts: createConflictRepository(deps),
    experiences: createExperienceRepository(deps),
    // Graph repositories (Flexible Knowledge Graph)
    typeRegistry,
    graphNodes: nodeRepo,
    graphEdges: edgeRepo,
    // Task and Evidence repositories
    tasks: createTaskRepository(deps),
    evidence: createEvidenceRepository(deps),
    // Episode repository (Temporal Activity Grouping)
    episodes: createEpisodeRepository(deps),
    // Hook metrics repository (Claude Code hook analytics)
    hookMetrics: createHookMetricsRepository(deps.db),
    // IDE Transcripts (Immutable conversation archive)
    ideTranscripts: createIDETranscriptRepository(deps),
  };
}

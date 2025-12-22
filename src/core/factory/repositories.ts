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

/**
 * Create all repositories with injected dependencies
 *
 * @param deps - Database dependencies (db, sqlite)
 * @returns All repository instances
 */
export function createRepositories(deps: DatabaseDeps): Repositories {
  // TagRepo is created first as it's a dependency for entryTags
  const tagRepo = createTagRepository(deps);

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
  };
}

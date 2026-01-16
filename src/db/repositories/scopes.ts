/**
 * Organization, Project, and Session Repositories
 *
 * Factory functions that accept DatabaseDeps for dependency injection.
 */

import { eq, and, isNull, sql } from 'drizzle-orm';
import {
  organizations,
  projects,
  sessions,
  tools,
  guidelines,
  knowledge,
  type Organization,
  type NewOrganization,
  type Project,
  type NewProject,
  type Session,
  type NewSession,
} from '../schema.js';
import { generateId, now, type PaginationOptions, DEFAULT_LIMIT, MAX_LIMIT } from './base.js';
import { invalidateScopeChainCache } from '../../services/query.service.js';
import type { DatabaseDeps } from '../../core/types.js';
import { createConflictError } from '../../core/errors.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('scopes-repo');

// =============================================================================
// FINDBYPATH CACHE (Request-scoped caching for project lookups)
// =============================================================================

interface FindByPathCacheEntry {
  project: Project | undefined;
  timestamp: number;
}

// Cache for findByPath results - short TTL for request-scoped caching
const findByPathCache = new Map<string, FindByPathCacheEntry>();
const FINDBYPATH_CACHE_TTL_MS = 5000; // 5 seconds - suitable for rapid sequential requests
const FINDBYPATH_CACHE_MAX_SIZE = 100;

/**
 * Get cached findByPath result if still valid
 */
function getCachedFindByPath(path: string): Project | undefined | null {
  const entry = findByPathCache.get(path);
  if (!entry) return null; // null = not in cache

  if (Date.now() - entry.timestamp > FINDBYPATH_CACHE_TTL_MS) {
    findByPathCache.delete(path);
    return null; // expired
  }

  return entry.project; // can be undefined (meaning no project found)
}

/**
 * Cache findByPath result
 */
function setCachedFindByPath(path: string, project: Project | undefined): void {
  // Evict oldest entries if cache is full
  if (findByPathCache.size >= FINDBYPATH_CACHE_MAX_SIZE) {
    const oldestKey = findByPathCache.keys().next().value;
    if (oldestKey) {
      findByPathCache.delete(oldestKey);
    }
  }

  findByPathCache.set(path, {
    project,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate all findByPath cache entries
 * Called when projects are created, updated, or deleted
 */
function invalidateFindByPathCache(): void {
  findByPathCache.clear();
}
import type {
  IOrganizationRepository,
  IProjectRepository,
  ISessionRepository,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsFilter,
  CreateSessionInput,
  UpdateSessionInput,
  ListSessionsFilter,
} from '../../core/interfaces/repositories.js';

// Re-export input types for backward compatibility
export type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsFilter,
  CreateSessionInput,
  UpdateSessionInput,
  ListSessionsFilter,
} from '../../core/interfaces/repositories.js';

// =============================================================================
// ORGANIZATION REPOSITORY FACTORY
// =============================================================================

/**
 * Create an organization repository with injected database dependencies
 */
export function createOrganizationRepository(deps: DatabaseDeps): IOrganizationRepository {
  const { db } = deps;

  const repo: IOrganizationRepository = {
    async create(input: CreateOrganizationInput): Promise<Organization> {
      const id = generateId();

      const org: NewOrganization = {
        id,
        name: input.name,
        metadata: input.metadata,
      };

      db.insert(organizations).values(org).run();

      const result = await repo.getById(id);
      if (!result) {
        throw createConflictError('organization', `failed to create with id ${id}`);
      }
      invalidateScopeChainCache('org', id);
      return result;
    },

    async getById(id: string): Promise<Organization | undefined> {
      return db.select().from(organizations).where(eq(organizations.id, id)).get();
    },

    async list(options: PaginationOptions = {}): Promise<Organization[]> {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      return db.select().from(organizations).limit(limit).offset(offset).all();
    },

    async update(id: string, input: UpdateOrganizationInput): Promise<Organization | undefined> {
      const existing = await repo.getById(id);
      if (!existing) return undefined;

      db.update(organizations)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        })
        .where(eq(organizations.id, id))
        .run();

      const result = await repo.getById(id);
      if (result) {
        invalidateScopeChainCache('org', id);
      }
      return result;
    },

    async delete(id: string): Promise<boolean> {
      // Bug #20 fix: Cascade delete org-scoped entries before deleting organization
      // Delete entries that reference this org
      const toolsDeleted = db
        .delete(tools)
        .where(and(eq(tools.scopeType, 'org'), eq(tools.scopeId, id)))
        .run().changes;
      const guidelinesDeleted = db
        .delete(guidelines)
        .where(and(eq(guidelines.scopeType, 'org'), eq(guidelines.scopeId, id)))
        .run().changes;
      const knowledgeDeleted = db
        .delete(knowledge)
        .where(and(eq(knowledge.scopeType, 'org'), eq(knowledge.scopeId, id)))
        .run().changes;

      // Delete child projects (which will cascade to their entries)
      const childProjects = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.orgId, id))
        .all();

      for (const project of childProjects) {
        // Delete project-scoped entries
        db.delete(tools)
          .where(and(eq(tools.scopeType, 'project'), eq(tools.scopeId, project.id)))
          .run();
        db.delete(guidelines)
          .where(and(eq(guidelines.scopeType, 'project'), eq(guidelines.scopeId, project.id)))
          .run();
        db.delete(knowledge)
          .where(and(eq(knowledge.scopeType, 'project'), eq(knowledge.scopeId, project.id)))
          .run();
        // Sessions cascade via FK constraint
      }

      // Delete child projects
      const projectsDeleted = db.delete(projects).where(eq(projects.orgId, id)).run().changes;

      const result = db.delete(organizations).where(eq(organizations.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('org', id);
        logger.info(
          {
            orgId: id,
            projectsDeleted,
            toolsDeleted,
            guidelinesDeleted,
            knowledgeDeleted,
          },
          'Organization deleted with cascade'
        );
      }
      return result.changes > 0;
    },
  };

  return repo;
}

// =============================================================================
// PROJECT REPOSITORY FACTORY
// =============================================================================

/**
 * Create a project repository with injected database dependencies
 */
export function createProjectRepository(deps: DatabaseDeps): IProjectRepository {
  const { db } = deps;

  const repo: IProjectRepository = {
    async create(input: CreateProjectInput): Promise<Project> {
      const id = generateId();

      const project: NewProject = {
        id,
        orgId: input.orgId,
        name: input.name,
        description: input.description,
        rootPath: input.rootPath,
        metadata: input.metadata,
      };

      db.insert(projects).values(project).run();

      const result = await repo.getById(id);
      if (!result) {
        throw createConflictError('project', `failed to create with id ${id}`);
      }
      invalidateScopeChainCache('project', id);
      invalidateFindByPathCache(); // Invalidate path cache when projects change
      return result;
    },

    async getById(id: string): Promise<Project | undefined> {
      return db.select().from(projects).where(eq(projects.id, id)).get();
    },

    async getByName(name: string, orgId?: string): Promise<Project | undefined> {
      if (orgId) {
        return db
          .select()
          .from(projects)
          .where(and(eq(projects.orgId, orgId), sql`lower(${projects.name}) = lower(${name})`))
          .get();
      }

      return db
        .select()
        .from(projects)
        .where(and(isNull(projects.orgId), sql`lower(${projects.name}) = lower(${name})`))
        .get();
    },

    async findByPath(path: string): Promise<Project | undefined> {
      // Check cache first
      const cached = getCachedFindByPath(path);
      if (cached !== null) {
        return cached; // Cache hit (can be undefined meaning "no project found")
      }

      // Get all projects with a rootPath set
      const allProjects = db
        .select()
        .from(projects)
        .where(sql`${projects.rootPath} IS NOT NULL AND ${projects.rootPath} != ''`)
        .all();

      // Normalize the search path (remove trailing slash)
      const normalizedPath = path.replace(/\/+$/, '');

      // Find projects whose rootPath matches or is a parent of the given path
      const matchingProjects = allProjects.filter((project) => {
        if (!project.rootPath) return false;
        const normalizedRootPath = project.rootPath.replace(/\/+$/, '');
        // Check if path starts with rootPath (exact match or subdirectory)
        return (
          normalizedPath === normalizedRootPath ||
          normalizedPath.startsWith(normalizedRootPath + '/')
        );
      });

      if (matchingProjects.length === 0) {
        setCachedFindByPath(path, undefined);
        return undefined;
      }

      // Return the most specific match (longest rootPath)
      const result = matchingProjects.reduce((best, current) => {
        const bestLen = best.rootPath?.length ?? 0;
        const currentLen = current.rootPath?.length ?? 0;
        return currentLen > bestLen ? current : best;
      });

      setCachedFindByPath(path, result);
      return result;
    },

    async list(
      filter: ListProjectsFilter = {},
      options: PaginationOptions = {}
    ): Promise<Project[]> {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      let query = db.select().from(projects);

      if (filter.orgId !== undefined) {
        query = query.where(eq(projects.orgId, filter.orgId)) as typeof query;
      }

      return query.limit(limit).offset(offset).all();
    },

    async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
      const existing = await repo.getById(id);
      if (!existing) return undefined;

      db.update(projects)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.rootPath !== undefined && { rootPath: input.rootPath }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
          updatedAt: now(),
        })
        .where(eq(projects.id, id))
        .run();

      const result = await repo.getById(id);
      if (result) {
        invalidateScopeChainCache('project', id);
        invalidateFindByPathCache(); // Invalidate path cache when projects change
      }
      return result;
    },

    async delete(id: string): Promise<boolean> {
      // Bug #19 fix: Cascade delete project-scoped entries before deleting project
      const toolsDeleted = db
        .delete(tools)
        .where(and(eq(tools.scopeType, 'project'), eq(tools.scopeId, id)))
        .run().changes;
      const guidelinesDeleted = db
        .delete(guidelines)
        .where(and(eq(guidelines.scopeType, 'project'), eq(guidelines.scopeId, id)))
        .run().changes;
      const knowledgeDeleted = db
        .delete(knowledge)
        .where(and(eq(knowledge.scopeType, 'project'), eq(knowledge.scopeId, id)))
        .run().changes;

      // Sessions will cascade via FK constraint

      const result = db.delete(projects).where(eq(projects.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('project', id);
        invalidateFindByPathCache(); // Invalidate path cache when projects change
        logger.info(
          {
            projectId: id,
            toolsDeleted,
            guidelinesDeleted,
            knowledgeDeleted,
          },
          'Project deleted with cascade'
        );
      }
      return result.changes > 0;
    },
  };

  return repo;
}

// =============================================================================
// SESSION REPOSITORY FACTORY
// =============================================================================

/**
 * Create a session repository with injected database dependencies
 */
export function createSessionRepository(deps: DatabaseDeps): ISessionRepository {
  const { db } = deps;

  const repo: ISessionRepository = {
    async create(input: CreateSessionInput): Promise<Session> {
      const id = input.id ?? generateId();

      const session: NewSession = {
        id,
        projectId: input.projectId,
        name: input.name,
        purpose: input.purpose,
        agentId: input.agentId,
        status: 'active',
        metadata: input.metadata,
      };

      db.insert(sessions).values(session).run();

      const result = await repo.getById(id);
      if (!result) {
        throw createConflictError('session', `failed to create with id ${id}`);
      }
      invalidateScopeChainCache('session', id);
      return result;
    },

    async getById(id: string): Promise<Session | undefined> {
      return db.select().from(sessions).where(eq(sessions.id, id)).get();
    },

    async list(
      filter: ListSessionsFilter = {},
      options: PaginationOptions = {}
    ): Promise<Session[]> {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      const conditions = [];
      if (filter.projectId !== undefined) {
        conditions.push(eq(sessions.projectId, filter.projectId));
      }
      if (filter.status !== undefined) {
        conditions.push(eq(sessions.status, filter.status));
      }

      let query = db.select().from(sessions);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return query.limit(limit).offset(offset).all();
    },

    async update(id: string, input: UpdateSessionInput): Promise<Session | undefined> {
      const existing = await repo.getById(id);
      if (!existing) return undefined;

      const endedAt =
        input.status === 'completed' || input.status === 'discarded' ? now() : undefined;

      db.update(sessions)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.purpose !== undefined && { purpose: input.purpose }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
          ...(endedAt && { endedAt }),
        })
        .where(eq(sessions.id, id))
        .run();

      const result = await repo.getById(id);
      if (result) {
        invalidateScopeChainCache('session', id);
      }
      return result;
    },

    async end(
      id: string,
      status: 'completed' | 'discarded' = 'completed'
    ): Promise<Session | undefined> {
      return repo.update(id, { status });
    },

    async delete(id: string): Promise<boolean> {
      const result = db.delete(sessions).where(eq(sessions.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('session', id);
      }
      return result.changes > 0;
    },
  };

  return repo;
}

/**
 * Organization, Project, and Session Repositories
 *
 * Factory functions that accept DatabaseDeps for dependency injection.
 */

import { eq, and, isNull, sql } from 'drizzle-orm';
import { getDb } from '../connection.js';
import {
  organizations,
  projects,
  sessions,
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
    create(input: CreateOrganizationInput): Organization {
      const id = generateId();

      const org: NewOrganization = {
        id,
        name: input.name,
        metadata: input.metadata,
      };

      db.insert(organizations).values(org).run();

      const result = repo.getById(id);
      if (!result) {
        throw new Error(`Failed to create organization ${id}`);
      }
      invalidateScopeChainCache('org', id);
      return result;
    },

    getById(id: string): Organization | undefined {
      return db.select().from(organizations).where(eq(organizations.id, id)).get();
    },

    list(options: PaginationOptions = {}): Organization[] {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      return db.select().from(organizations).limit(limit).offset(offset).all();
    },

    update(id: string, input: UpdateOrganizationInput): Organization | undefined {
      const existing = repo.getById(id);
      if (!existing) return undefined;

      db.update(organizations)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
        })
        .where(eq(organizations.id, id))
        .run();

      const result = repo.getById(id);
      if (result) {
        invalidateScopeChainCache('org', id);
      }
      return result;
    },

    delete(id: string): boolean {
      const result = db.delete(organizations).where(eq(organizations.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('org', id);
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
    create(input: CreateProjectInput): Project {
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

      const result = repo.getById(id);
      if (!result) {
        throw new Error(`Failed to create project ${id}`);
      }
      invalidateScopeChainCache('project', id);
      return result;
    },

    getById(id: string): Project | undefined {
      return db.select().from(projects).where(eq(projects.id, id)).get();
    },

    getByName(name: string, orgId?: string): Project | undefined {
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

    list(filter: ListProjectsFilter = {}, options: PaginationOptions = {}): Project[] {
      const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = options.offset ?? 0;

      let query = db.select().from(projects);

      if (filter.orgId !== undefined) {
        query = query.where(eq(projects.orgId, filter.orgId)) as typeof query;
      }

      return query.limit(limit).offset(offset).all();
    },

    update(id: string, input: UpdateProjectInput): Project | undefined {
      const existing = repo.getById(id);
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

      const result = repo.getById(id);
      if (result) {
        invalidateScopeChainCache('project', id);
      }
      return result;
    },

    delete(id: string): boolean {
      const result = db.delete(projects).where(eq(projects.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('project', id);
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
    create(input: CreateSessionInput): Session {
      const id = generateId();

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

      const result = repo.getById(id);
      if (!result) {
        throw new Error(`Failed to create session ${id}`);
      }
      invalidateScopeChainCache('session', id);
      return result;
    },

    getById(id: string): Session | undefined {
      return db.select().from(sessions).where(eq(sessions.id, id)).get();
    },

    list(filter: ListSessionsFilter = {}, options: PaginationOptions = {}): Session[] {
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

    update(id: string, input: UpdateSessionInput): Session | undefined {
      const existing = repo.getById(id);
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

      const result = repo.getById(id);
      if (result) {
        invalidateScopeChainCache('session', id);
      }
      return result;
    },

    end(id: string, status: 'completed' | 'discarded' = 'completed'): Session | undefined {
      return repo.update(id, { status });
    },

    delete(id: string): boolean {
      const result = db.delete(sessions).where(eq(sessions.id, id)).run();
      if (result.changes > 0) {
        invalidateScopeChainCache('session', id);
      }
      return result.changes > 0;
    },
  };

  return repo;
}

// =============================================================================
// TEMPORARY BACKWARD COMPAT EXPORTS
// TODO: Remove these when all call sites are updated to use AppContext.repos
// =============================================================================

/**
 * @deprecated Use createOrganizationRepository(deps) instead. Will be removed when AppContext.repos is wired.
 */
function createLegacyOrgRepo(): IOrganizationRepository {
  return createOrganizationRepository({ db: getDb(), sqlite: null as any });
}

/**
 * @deprecated Use createProjectRepository(deps) instead. Will be removed when AppContext.repos is wired.
 */
function createLegacyProjectRepo(): IProjectRepository {
  return createProjectRepository({ db: getDb(), sqlite: null as any });
}

/**
 * @deprecated Use createSessionRepository(deps) instead. Will be removed when AppContext.repos is wired.
 */
function createLegacySessionRepo(): ISessionRepository {
  return createSessionRepository({ db: getDb(), sqlite: null as any });
}

// Lazy-initialized singleton instances for backward compatibility
let _organizationRepo: IOrganizationRepository | null = null;
let _projectRepo: IProjectRepository | null = null;
let _sessionRepo: ISessionRepository | null = null;

/**
 * @deprecated Use AppContext.repos.organizations instead
 */
export const organizationRepo: IOrganizationRepository = new Proxy({} as IOrganizationRepository, {
  get(_, prop: keyof IOrganizationRepository) {
    if (!_organizationRepo) _organizationRepo = createLegacyOrgRepo();
    return _organizationRepo[prop];
  },
});

/**
 * @deprecated Use AppContext.repos.projects instead
 */
export const projectRepo: IProjectRepository = new Proxy({} as IProjectRepository, {
  get(_, prop: keyof IProjectRepository) {
    if (!_projectRepo) _projectRepo = createLegacyProjectRepo();
    return _projectRepo[prop];
  },
});

/**
 * @deprecated Use AppContext.repos.sessions instead
 */
export const sessionRepo: ISessionRepository = new Proxy({} as ISessionRepository, {
  get(_, prop: keyof ISessionRepository) {
    if (!_sessionRepo) _sessionRepo = createLegacySessionRepo();
    return _sessionRepo[prop];
  },
});

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

// =============================================================================
// ORGANIZATION REPOSITORY
// =============================================================================

export interface CreateOrganizationInput {
  name: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateOrganizationInput {
  name?: string;
  metadata?: Record<string, unknown>;
}

export const organizationRepo = {
  /**
   * Create a new organization
   */
  create(input: CreateOrganizationInput): Organization {
    const db = getDb();
    const id = generateId();

    const org: NewOrganization = {
      id,
      name: input.name,
      metadata: input.metadata,
    };

    db.insert(organizations).values(org).run();

    const result = this.getById(id);
    if (!result) {
      throw new Error(`Failed to create organization ${id}`);
    }
    return result;
  },

  /**
   * Get organization by ID
   */
  getById(id: string): Organization | undefined {
    const db = getDb();
    return db.select().from(organizations).where(eq(organizations.id, id)).get();
  },

  /**
   * List all organizations
   */
  list(options: PaginationOptions = {}): Organization[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    return db.select().from(organizations).limit(limit).offset(offset).all();
  },

  /**
   * Update an organization
   */
  update(id: string, input: UpdateOrganizationInput): Organization | undefined {
    const db = getDb();

    const existing = this.getById(id);
    if (!existing) return undefined;

    db.update(organizations)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      })
      .where(eq(organizations.id, id))
      .run();

    return this.getById(id);
  },

  /**
   * Delete an organization (and cascade to projects)
   */
  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(organizations).where(eq(organizations.id, id)).run();
    return result.changes > 0;
  },
};

// =============================================================================
// PROJECT REPOSITORY
// =============================================================================

export interface CreateProjectInput {
  orgId?: string;
  name: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  rootPath?: string;
  metadata?: Record<string, unknown>;
}

export interface ListProjectsFilter {
  orgId?: string;
}

export const projectRepo = {
  /**
   * Create a new project
   */
  create(input: CreateProjectInput): Project {
    const db = getDb();
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

    const result = this.getById(id);
    if (!result) {
      throw new Error(`Failed to create project ${id}`);
    }
    return result;
  },

  /**
   * Get project by ID
   */
  getById(id: string): Project | undefined {
    const db = getDb();
    return db.select().from(projects).where(eq(projects.id, id)).get();
  },

  /**
   * Get project by name within an org (case-insensitive)
   */
  getByName(name: string, orgId?: string): Project | undefined {
    const db = getDb();

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

  /**
   * List projects
   */
  list(filter: ListProjectsFilter = {}, options: PaginationOptions = {}): Project[] {
    const db = getDb();
    const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options.offset ?? 0;

    let query = db.select().from(projects);

    if (filter.orgId !== undefined) {
      query = query.where(eq(projects.orgId, filter.orgId)) as typeof query;
    }

    return query.limit(limit).offset(offset).all();
  },

  /**
   * Update a project
   */
  update(id: string, input: UpdateProjectInput): Project | undefined {
    const db = getDb();

    const existing = this.getById(id);
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

    return this.getById(id);
  },

  /**
   * Delete a project
   */
  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(projects).where(eq(projects.id, id)).run();
    return result.changes > 0;
  },
};

// =============================================================================
// SESSION REPOSITORY
// =============================================================================

export interface CreateSessionInput {
  projectId?: string;
  name?: string;
  purpose?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  name?: string;
  purpose?: string;
  status?: 'active' | 'paused' | 'completed' | 'discarded';
  metadata?: Record<string, unknown>;
}

export interface ListSessionsFilter {
  projectId?: string;
  status?: 'active' | 'paused' | 'completed' | 'discarded';
}

export const sessionRepo = {
  /**
   * Create a new session
   */
  create(input: CreateSessionInput): Session {
    const db = getDb();
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

    const result = this.getById(id);
    if (!result) {
      throw new Error(`Failed to create session ${id}`);
    }
    return result;
  },

  /**
   * Get session by ID
   */
  getById(id: string): Session | undefined {
    const db = getDb();
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  },

  /**
   * List sessions
   */
  list(filter: ListSessionsFilter = {}, options: PaginationOptions = {}): Session[] {
    const db = getDb();
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

  /**
   * Update a session
   */
  update(id: string, input: UpdateSessionInput): Session | undefined {
    const db = getDb();

    const existing = this.getById(id);
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

    return this.getById(id);
  },

  /**
   * End a session
   */
  end(id: string, status: 'completed' | 'discarded' = 'completed'): Session | undefined {
    return this.update(id, { status });
  },

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(sessions).where(eq(sessions.id, id)).run();
    return result.changes > 0;
  },
};

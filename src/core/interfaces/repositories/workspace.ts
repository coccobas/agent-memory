/**
 * Workspace Repository Interfaces
 *
 * Organizations, Projects, Sessions, and File Locks
 */

import type { Organization, Project, Session, FileLock } from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

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

export interface IOrganizationRepository {
  /**
   * Create a new organization.
   * @param input - Organization creation parameters
   * @returns Created organization
   * @throws {AgentMemoryError} E1000 - Missing required field (name)
   * @throws {AgentMemoryError} E2001 - Organization with same name already exists
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateOrganizationInput): Promise<Organization>;

  /**
   * Get an organization by ID.
   * @param id - Organization ID
   * @returns Organization if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<Organization | undefined>;

  /**
   * List all organizations.
   * @param options - Pagination options
   * @returns Array of organizations
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(options?: PaginationOptions): Promise<Organization[]>;

  /**
   * Update an organization.
   * @param id - Organization ID
   * @param input - Update parameters
   * @returns Updated organization, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateOrganizationInput): Promise<Organization | undefined>;

  /**
   * Delete an organization and all its projects.
   * @param id - Organization ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

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

export interface IProjectRepository {
  /**
   * Create a new project.
   * @param input - Project creation parameters
   * @returns Created project
   * @throws {AgentMemoryError} E1000 - Missing required field (name)
   * @throws {AgentMemoryError} E2001 - Project with same name already exists in org
   * @throws {AgentMemoryError} E2000 - Referenced organization not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateProjectInput): Promise<Project>;

  /**
   * Get a project by ID.
   * @param id - Project ID
   * @returns Project if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<Project | undefined>;

  /**
   * Get a project by name within an organization.
   * @param name - Project name
   * @param orgId - Optional organization ID
   * @returns Project if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(name: string, orgId?: string): Promise<Project | undefined>;

  /**
   * Find a project by filesystem path.
   * Returns the project whose rootPath matches or is a parent of the given path.
   * If multiple projects match, returns the most specific one (longest rootPath).
   * @param path - Filesystem path to search for
   * @returns Project if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  findByPath(path: string): Promise<Project | undefined>;

  /**
   * List projects matching filter criteria.
   * @param filter - Filter options (orgId)
   * @param options - Pagination options
   * @returns Array of projects
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListProjectsFilter, options?: PaginationOptions): Promise<Project[]>;

  /**
   * Update a project.
   * @param id - Project ID
   * @param input - Update parameters
   * @returns Updated project, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateProjectInput): Promise<Project | undefined>;

  /**
   * Delete a project and all its sessions and entries.
   * @param id - Project ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// SESSION REPOSITORY
// =============================================================================

export interface CreateSessionInput {
  /** Optional custom ID. If not provided, a new ID is generated. */
  id?: string;
  projectId?: string;
  name?: string;
  purpose?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  status?: 'active' | 'completed' | 'discarded' | 'paused';
  name?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

export interface ListSessionsFilter {
  projectId?: string;
  status?: 'active' | 'completed' | 'discarded' | 'paused';
  agentId?: string;
}

export interface ISessionRepository {
  /**
   * Create a new session.
   * @param input - Session creation parameters
   * @returns Created session
   * @throws {AgentMemoryError} E2000 - Referenced project not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateSessionInput): Promise<Session>;

  /**
   * Get a session by ID.
   * @param id - Session ID
   * @returns Session if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<Session | undefined>;

  /**
   * List sessions matching filter criteria.
   * @param filter - Filter options (projectId, status, agentId)
   * @param options - Pagination options
   * @returns Array of sessions
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListSessionsFilter, options?: PaginationOptions): Promise<Session[]>;

  /**
   * Update a session.
   * @param id - Session ID
   * @param input - Update parameters
   * @returns Updated session, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateSessionInput): Promise<Session | undefined>;

  /**
   * End a session with final status.
   * @param id - Session ID
   * @param status - Final status (completed or discarded)
   * @returns Updated session, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  end(id: string, status?: 'completed' | 'discarded'): Promise<Session | undefined>;

  /**
   * Delete a session and all its associated data.
   * @param id - Session ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// FILE LOCK REPOSITORY
// =============================================================================

export interface CheckoutOptions {
  sessionId?: string;
  projectId?: string;
  expiresIn?: number;
  metadata?: Record<string, unknown>;
}

export interface ListLocksFilter {
  projectId?: string;
  sessionId?: string;
  agentId?: string;
}

export interface IFileLockRepository {
  /**
   * Acquire a lock on a file for an agent.
   * @param filePath - Absolute path to the file
   * @param agentId - Agent requesting the lock
   * @param options - Lock options (sessionId, projectId, expiration)
   * @returns Created file lock
   * @throws {AgentMemoryError} E1000 - Missing required field (filePath, agentId)
   * @throws {AgentMemoryError} E5001 - File already locked by another agent
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  checkout(filePath: string, agentId: string, options?: CheckoutOptions): Promise<FileLock>;

  /**
   * Release a lock on a file.
   * @param filePath - Absolute path to the file
   * @param agentId - Agent releasing the lock
   * @throws {AgentMemoryError} E2000 - Lock not found or owned by different agent
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  checkin(filePath: string, agentId: string): Promise<void>;

  /**
   * Force unlock a file (admin operation).
   * @param filePath - Absolute path to the file
   * @param agentId - Agent performing the force unlock
   * @param reason - Reason for force unlock
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  forceUnlock(filePath: string, agentId: string, reason?: string): Promise<void>;

  /**
   * Check if a file is currently locked.
   * @param filePath - Absolute path to the file
   * @returns true if locked, false otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  isLocked(filePath: string): Promise<boolean>;

  /**
   * Get the lock on a file if it exists.
   * @param filePath - Absolute path to the file
   * @returns Lock if exists, null otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getLock(filePath: string): Promise<FileLock | null>;

  /**
   * List active file locks.
   * @param filter - Filter options (projectId, sessionId, agentId)
   * @returns Array of file locks
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  listLocks(filter?: ListLocksFilter): Promise<FileLock[]>;

  /**
   * Cleanup locks that have exceeded their expiration time.
   * @returns Number of locks cleaned up
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  cleanupExpiredLocks(): Promise<number>;

  /**
   * Cleanup locks older than the specified age.
   * @param maxAgeHours - Maximum age in hours (default: 24)
   * @returns Number of locks cleaned up
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  cleanupStaleLocks(maxAgeHours?: number): Promise<number>;
}

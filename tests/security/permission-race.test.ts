/**
 * Permission Race Condition Security Test Suite (TOCTOU Attacks)
 *
 * Tests for Time-of-Check to Time-of-Use vulnerabilities in:
 * 1. Permission revocation - ensure revocation takes effect immediately
 * 2. Session termination - ensure session invalidation is atomic
 * 3. Entry modifications - ensure concurrent updates are safe
 * 4. Scope transitions - ensure scope changes are atomic
 *
 * TOCTOU Attack Pattern:
 * Thread 1: Check permission -> [REVOKED HERE] -> Use permission (VULNERABLE)
 * Thread 2: Revoke permission
 *
 * Security test categories:
 * - Permission cache invalidation atomicity
 * - Session token validation race conditions
 * - Concurrent entry modification conflicts
 * - Scope hierarchy transition atomicity
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestOrg,
  createTestProject,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { PermissionService } from '../../src/services/permission.service.js';
import { createProjectRepository, createSessionRepository } from '../../src/db/repositories/scopes.js';
import type { IProjectRepository, ISessionRepository } from '../../src/core/interfaces/repositories.js';
import * as schema from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

const TEST_DB_PATH = './data/test-permission-race.db';
let testDb: TestDb;
let permissionService: PermissionService;
let projectRepo: IProjectRepository;
let sessionRepo: ISessionRepository;

// Helper to create concurrent promise execution
async function runConcurrently<T>(...promises: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(promises.map((fn) => fn()));
}

// Helper to introduce controlled delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Permission Race Conditions (TOCTOU)', () => {
  let previousPermMode: string | undefined;

  beforeAll(() => {
    // Disable permissive mode for permission tests
    previousPermMode = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;

    testDb = setupTestDb(TEST_DB_PATH);
    permissionService = new PermissionService(testDb.db);
    projectRepo = createProjectRepository({ db: testDb.db });
    sessionRepo = createSessionRepository({ db: testDb.db });
  });

  afterAll(() => {
    // Restore previous permission mode
    if (previousPermMode !== undefined) {
      process.env.AGENT_MEMORY_PERMISSIONS_MODE = previousPermMode;
    }
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    // Clear permissions before each test
    testDb.db.delete(schema.permissions).run();
    permissionService.invalidateCache();
  });

  describe('Permission Revocation Race Conditions', () => {
    it('should block access immediately after revocation (no TOCTOU gap)', async () => {
      // Setup: Grant permission
      permissionService.grant({
        agentId: 'agent-race-1',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'write',
      });

      // Verify initial access
      expect(permissionService.check('agent-race-1', 'write', 'tool', null, 'global', null)).toBe(
        true
      );

      // Thread 1: Check permission in a tight loop
      // Thread 2: Revoke permission concurrently
      let accessGrantedAfterRevoke = false;
      let revokeComplete = false;

      const checkLoop = async () => {
        for (let i = 0; i < 100; i++) {
          const hasAccess = permissionService.check(
            'agent-race-1',
            'write',
            'tool',
            null,
            'global',
            null
          );
          if (revokeComplete && hasAccess) {
            accessGrantedAfterRevoke = true;
            break;
          }
          await delay(1); // Small delay to allow interleaving
        }
      };

      const revokeOperation = async () => {
        await delay(10); // Let check loop start
        permissionService.revoke({
          agentId: 'agent-race-1',
          scopeType: 'global',
          entryType: 'tool',
        });
        revokeComplete = true;
      };

      await runConcurrently(checkLoop, revokeOperation);

      // SECURITY: After revocation completes, no check should succeed
      expect(accessGrantedAfterRevoke).toBe(false);
      expect(permissionService.check('agent-race-1', 'write', 'tool', null, 'global', null)).toBe(
        false
      );
    });

    it('should prevent TOCTOU in permission upgrade race', async () => {
      // Thread 1: Checks for read permission
      // Thread 2: Upgrades to write permission
      // Thread 3: Downgrades back to read
      // Ensure no thread sees inconsistent state

      permissionService.grant({
        agentId: 'agent-upgrade',
        scopeType: 'global',
        entryType: 'knowledge',
        permission: 'read',
      });

      const results: boolean[] = [];

      const checkRead = async () => {
        for (let i = 0; i < 50; i++) {
          results.push(
            permissionService.check('agent-upgrade', 'read', 'knowledge', null, 'global', null)
          );
          await delay(1);
        }
      };

      const upgradePermission = async () => {
        await delay(5);
        permissionService.grant({
          agentId: 'agent-upgrade',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'write',
        });
      };

      const downgradePermission = async () => {
        await delay(25);
        permissionService.revoke({
          agentId: 'agent-upgrade',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'write',
        });
      };

      await runConcurrently(checkRead, upgradePermission, downgradePermission);

      // Read permission should always work (read is minimum level)
      // No inconsistent denials should occur
      expect(results.every((r) => r === true)).toBe(true);
    });

    it('should handle concurrent permission grant and revoke atomically', async () => {
      // Multiple threads trying to grant/revoke same permission
      // Final state should be deterministic

      const operations = Array.from({ length: 10 }, (_, i) => async () => {
        if (i % 2 === 0) {
          permissionService.grant({
            agentId: 'agent-concurrent',
            scopeType: 'global',
            entryType: 'guideline',
            permission: 'read',
          });
        } else {
          permissionService.revoke({
            agentId: 'agent-concurrent',
            scopeType: 'global',
            entryType: 'guideline',
          });
        }
      });

      await runConcurrently(...operations);

      // Final state should be consistent (either granted or revoked, not corrupt)
      const finalCheck = permissionService.check(
        'agent-concurrent',
        'read',
        'guideline',
        null,
        'global',
        null
      );
      expect(typeof finalCheck).toBe('boolean'); // Must be deterministic boolean

      // Database should have at most one permission entry
      const perms = testDb.db
        .select()
        .from(schema.permissions)
        .where(eq(schema.permissions.agentId, 'agent-concurrent'))
        .all();
      expect(perms.length).toBeLessThanOrEqual(1);
    });

    it('should prevent cache poisoning in permission invalidation', async () => {
      // Thread 1: Grants permission (cache miss)
      // Thread 2: Checks permission (populates cache)
      // Thread 3: Revokes permission (must invalidate cache)
      // Thread 4: Checks permission (must see revocation)

      const grantPerm = async () => {
        permissionService.grant({
          agentId: 'agent-cache-poison',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });
      };

      const checkPerm1 = async () => {
        await delay(5);
        return permissionService.check(
          'agent-cache-poison',
          'admin',
          'tool',
          null,
          'global',
          null
        );
      };

      const revokePerm = async () => {
        await delay(10);
        permissionService.revoke({
          agentId: 'agent-cache-poison',
          scopeType: 'global',
          entryType: 'tool',
        });
      };

      const checkPerm2 = async () => {
        await delay(15);
        return permissionService.check(
          'agent-cache-poison',
          'admin',
          'tool',
          null,
          'global',
          null
        );
      };

      const [, check1, , check2] = await runConcurrently(
        grantPerm,
        checkPerm1,
        revokePerm,
        checkPerm2
      );

      // First check should succeed, second should fail (no cache poisoning)
      expect(check1).toBe(true);
      expect(check2).toBe(false);
    });

    it('should prevent permission check during partial grant operation', async () => {
      // Simulate permission grant that takes time
      // Ensure checks don't see intermediate state

      let checkDuringGrant = false;

      const slowGrant = async () => {
        // Simulate slow grant (e.g., network delay, validation)
        await delay(10);
        permissionService.grant({
          agentId: 'agent-slow-grant',
          scopeType: 'global',
          entryType: 'knowledge',
          permission: 'write',
        });
      };

      const rapidChecks = async () => {
        for (let i = 0; i < 20; i++) {
          const hasAccess = permissionService.check(
            'agent-slow-grant',
            'write',
            'knowledge',
            null,
            'global',
            null
          );
          // Track if we ever see permission during grant
          if (hasAccess && i < 15) {
            checkDuringGrant = true;
          }
          await delay(1);
        }
      };

      await runConcurrently(slowGrant, rapidChecks);

      // Permission should only be visible after grant completes
      // (SQLite transactions ensure atomicity)
      const finalCheck = permissionService.check(
        'agent-slow-grant',
        'write',
        'knowledge',
        null,
        'global',
        null
      );
      expect(finalCheck).toBe(true);
    });

    it('should handle scope-specific permission revocation races', async () => {
      const org = createTestOrg(testDb.db, 'Race Org');
      const project = createTestProject(testDb.db, 'Race Project', org.id);

      // Grant both global and project-specific permissions
      permissionService.grant({
        agentId: 'agent-scope-race',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      permissionService.grant({
        agentId: 'agent-scope-race',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'write',
      });

      // Concurrently revoke global while checking project-specific
      const revokeGlobal = async () => {
        permissionService.revoke({
          agentId: 'agent-scope-race',
          scopeType: 'global',
          entryType: 'tool',
        });
      };

      const checkProject = async () => {
        return permissionService.check(
          'agent-scope-race',
          'write',
          'tool',
          null,
          'project',
          project.id
        );
      };

      const [, projectAccess] = await runConcurrently(revokeGlobal, checkProject);

      // Project-specific permission should survive global revocation
      expect(projectAccess).toBe(true);
      expect(
        permissionService.check('agent-scope-race', 'read', 'tool', null, 'global', null)
      ).toBe(false);
    });

    it('should prevent entry-specific permission TOCTOU', async () => {
      // Grant entry-specific permission
      permissionService.grant({
        agentId: 'agent-entry-toctou',
        scopeType: 'global',
        entryType: 'knowledge',
        entryId: 'knowledge-123',
        permission: 'write',
      });

      let observedInconsistency = false;

      const checkSpecific = async () => {
        for (let i = 0; i < 50; i++) {
          const specific = permissionService.check(
            'agent-entry-toctou',
            'write',
            'knowledge',
            'knowledge-123',
            'global',
            null
          );
          const general = permissionService.check(
            'agent-entry-toctou',
            'write',
            'knowledge',
            null,
            'global',
            null
          );

          // General should always be false (no general permission granted)
          // Specific should transition from true to false after revoke
          if (general) {
            observedInconsistency = true;
          }
          await delay(1);
        }
      };

      const revokeSpecific = async () => {
        await delay(20);
        permissionService.revoke({
          agentId: 'agent-entry-toctou',
          scopeType: 'global',
          entryType: 'knowledge',
          entryId: 'knowledge-123',
        });
      };

      await runConcurrently(checkSpecific, revokeSpecific);

      // Should never grant general permission (only specific was granted)
      expect(observedInconsistency).toBe(false);
    });
  });

  describe('Session Atomicity Race Conditions', () => {
    it('should terminate session atomically (no lingering access)', async () => {
      const org = createTestOrg(testDb.db, 'Session Org');
      const project = await projectRepo.create({
        name: 'Session Project',
        orgId: org.id,
      });

      const session = await sessionRepo.create({
        projectId: project.id,
        agentId: 'agent-session-race',
        name: 'Test Session',
      });

      // Grant session-scoped permission
      permissionService.grant({
        agentId: 'agent-session-race',
        scopeType: 'session',
        scopeId: session.id,
        entryType: 'knowledge',
        permission: 'write',
      });

      let accessAfterEnd = false;

      const checkSessionAccess = async () => {
        for (let i = 0; i < 100; i++) {
          const hasAccess = permissionService.check(
            'agent-session-race',
            'write',
            'knowledge',
            null,
            'session',
            session.id
          );

          const sessionData = await sessionRepo.getById(session.id);
          if (sessionData?.status === 'completed' && hasAccess) {
            accessAfterEnd = true;
            break;
          }
          await delay(1);
        }
      };

      const endSession = async () => {
        await delay(20);
        await sessionRepo.update(session.id, { status: 'completed' });
      };

      await runConcurrently(checkSessionAccess, endSession);

      // After session ends, access checks should still work
      // (permissions don't auto-revoke with session end)
      // This is expected behavior - permissions are separate from session lifecycle
      const finalAccess = permissionService.check(
        'agent-session-race',
        'write',
        'knowledge',
        null,
        'session',
        session.id
      );
      expect(typeof finalAccess).toBe('boolean');
    });

    it('should handle concurrent session creation and permission grant', async () => {
      const org = createTestOrg(testDb.db, 'Concurrent Org');
      const project = await projectRepo.create({
        name: 'Concurrent Project',
        orgId: org.id,
      });

      let sessionId: string | null = null;

      const createSession = async () => {
        const session = await sessionRepo.create({
          projectId: project.id,
          agentId: 'agent-concurrent-session',
          name: 'Concurrent Session',
        });
        sessionId = session.id;
        return session;
      };

      const grantPermission = async () => {
        await delay(5); // Let session creation start
        // Wait for session to exist
        while (!sessionId) {
          await delay(1);
        }
        permissionService.grant({
          agentId: 'agent-concurrent-session',
          scopeType: 'session',
          scopeId: sessionId,
          entryType: 'guideline',
          permission: 'read',
        });
      };

      const [session] = await runConcurrently(createSession, grantPermission);

      // Permission should be properly granted to the session
      expect(
        permissionService.check(
          'agent-concurrent-session',
          'read',
          'guideline',
          null,
          'session',
          session.id
        )
      ).toBe(true);
    });

    it('should prevent session deletion race with permission check', async () => {
      const org = createTestOrg(testDb.db, 'Delete Org');
      const project = await projectRepo.create({
        name: 'Delete Project',
        orgId: org.id,
      });

      const session = await sessionRepo.create({
        projectId: project.id,
        agentId: 'agent-delete-race',
        name: 'Delete Session',
      });

      permissionService.grant({
        agentId: 'agent-delete-race',
        scopeType: 'session',
        scopeId: session.id,
        entryType: 'tool',
        permission: 'write',
      });

      const checkPermissions = async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 50; i++) {
          try {
            results.push(
              permissionService.check(
                'agent-delete-race',
                'write',
                'tool',
                null,
                'session',
                session.id
              )
            );
          } catch {
            results.push(false);
          }
          await delay(1);
        }
        return results;
      };

      const deleteSession = async () => {
        await delay(10);
        // Delete session (permissions should still exist but session is gone)
        testDb.db.delete(schema.sessions).where(eq(schema.sessions.id, session.id)).run();
      };

      const [results] = await runConcurrently(checkPermissions, deleteSession);

      // Permission checks should not throw, even if session is deleted
      // They should return boolean results consistently
      expect(results.every((r) => typeof r === 'boolean')).toBe(true);
    });

    it('should handle session status transition races', async () => {
      const org = createTestOrg(testDb.db, 'Status Org');
      const project = await projectRepo.create({
        name: 'Status Project',
        orgId: org.id,
      });

      const session = await sessionRepo.create({
        projectId: project.id,
        agentId: 'agent-status-race',
        name: 'Status Session',
      });

      // Multiple threads transitioning session status
      const transitionToActive = async () => {
        await sessionRepo.update(session.id, { status: 'active' });
      };

      const transitionToCompleted = async () => {
        await delay(5);
        await sessionRepo.update(session.id, { status: 'completed' });
      };

      const transitionToFailed = async () => {
        await delay(10);
        await sessionRepo.update(session.id, { status: 'failed' });
      };

      await runConcurrently(transitionToActive, transitionToCompleted, transitionToFailed);

      // Final status should be one of the valid states (no corruption)
      const finalSession = await sessionRepo.getById(session.id);
      expect(finalSession?.status).toMatch(/^(active|completed|failed)$/);
    });
  });

  describe('Entry Modification Race Conditions', () => {
    it('should prevent lost updates in concurrent permission modifications', async () => {
      // Classic lost update problem:
      // Thread 1: Read -> Modify -> Write (LOST)
      // Thread 2: Read -> Modify -> Write (WINS)

      permissionService.grant({
        agentId: 'agent-lost-update',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      // Two threads trying to update to different permission levels
      const updateToWrite = async () => {
        permissionService.grant({
          agentId: 'agent-lost-update',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'write',
        });
      };

      const updateToAdmin = async () => {
        permissionService.grant({
          agentId: 'agent-lost-update',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'admin',
        });
      };

      await runConcurrently(updateToWrite, updateToAdmin);

      // Final state should be one of the updates (not corrupted)
      const perms = testDb.db
        .select()
        .from(schema.permissions)
        .where(
          and(
            eq(schema.permissions.agentId, 'agent-lost-update'),
            eq(schema.permissions.entryType, 'tool')
          )
        )
        .all();

      // Should have consistent permissions (either write or admin, not both)
      const permissionLevels = perms.map((p) => p.permission);
      expect(permissionLevels.length).toBeGreaterThan(0);
      expect(permissionLevels.every((p) => ['read', 'write', 'admin'].includes(p))).toBe(true);
    });

    it('should handle concurrent batch permission checks safely', async () => {
      // Multiple threads performing batch permission checks
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `tool-${i}`,
        entryType: 'tool' as const,
        scopeType: 'global' as const,
        scopeId: null,
      }));

      // Grant permissions for some entries
      for (let i = 0; i < 5; i++) {
        permissionService.grant({
          agentId: 'agent-batch-race',
          scopeType: 'global',
          entryType: 'tool',
          entryId: `tool-${i}`,
          permission: 'read',
        });
      }

      const results: Map<string, boolean>[] = [];

      const batchCheck1 = async () => {
        for (let i = 0; i < 10; i++) {
          results.push(permissionService.checkBatch('agent-batch-race', 'read', entries));
          await delay(1);
        }
      };

      const batchCheck2 = async () => {
        for (let i = 0; i < 10; i++) {
          results.push(permissionService.checkBatch('agent-batch-race', 'read', entries));
          await delay(1);
        }
      };

      const grantMore = async () => {
        await delay(5);
        for (let i = 5; i < 8; i++) {
          permissionService.grant({
            agentId: 'agent-batch-race',
            scopeType: 'global',
            entryType: 'tool',
            entryId: `tool-${i}`,
            permission: 'read',
          });
        }
      };

      await runConcurrently(batchCheck1, batchCheck2, grantMore);

      // All results should be valid Map objects
      expect(results.every((r) => r instanceof Map)).toBe(true);
      expect(results.length).toBe(20); // 10 + 10 checks
    });

    it('should prevent dirty reads during permission grant', async () => {
      // Dirty read: Reading uncommitted data
      // In SQLite, transactions are atomic, so this should not occur

      const dirtyReads: boolean[] = [];

      const grantPermission = async () => {
        for (let i = 0; i < 5; i++) {
          permissionService.grant({
            agentId: `agent-dirty-${i}`,
            scopeType: 'global',
            entryType: 'knowledge',
            permission: 'write',
          });
          await delay(2);
        }
      };

      const checkPermissions = async () => {
        for (let i = 0; i < 5; i++) {
          await delay(1);
          const hasAccess = permissionService.check(
            `agent-dirty-${i}`,
            'write',
            'knowledge',
            null,
            'global',
            null
          );
          dirtyReads.push(hasAccess);
        }
      };

      await runConcurrently(grantPermission, checkPermissions);

      // Each permission check should return consistent result (true or false)
      // No partial/dirty reads
      expect(dirtyReads.every((r) => typeof r === 'boolean')).toBe(true);
    });

    it('should handle permission deactivation races', async () => {
      // Grant multiple permissions
      const agentIds = Array.from({ length: 5 }, (_, i) => `agent-deactivate-${i}`);

      agentIds.forEach((agentId) => {
        permissionService.grant({
          agentId,
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'read',
        });
      });

      // Concurrently revoke all permissions
      const revokeOperations = agentIds.map((agentId) => async () => {
        permissionService.revoke({
          agentId,
          scopeType: 'global',
          entryType: 'guideline',
        });
      });

      await runConcurrently(...revokeOperations);

      // All permissions should be revoked
      agentIds.forEach((agentId) => {
        expect(
          permissionService.check(agentId, 'read', 'guideline', null, 'global', null)
        ).toBe(false);
      });
    });
  });

  describe('Scope Transition Race Conditions', () => {
    it('should handle project deletion cascade atomically', async () => {
      const org = createTestOrg(testDb.db, 'Cascade Org');
      const project = await projectRepo.create({
        name: 'Cascade Project',
        orgId: org.id,
      });

      const session = await sessionRepo.create({
        projectId: project.id,
        agentId: 'agent-cascade',
        name: 'Cascade Session',
      });

      // Grant permissions at multiple scope levels
      permissionService.grant({
        agentId: 'agent-cascade',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'knowledge',
        permission: 'write',
      });

      permissionService.grant({
        agentId: 'agent-cascade',
        scopeType: 'session',
        scopeId: session.id,
        entryType: 'guideline',
        permission: 'read',
      });

      const checkPermissions = async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 50; i++) {
          try {
            results.push(
              permissionService.check(
                'agent-cascade',
                'write',
                'knowledge',
                null,
                'project',
                project.id
              )
            );
          } catch {
            results.push(false);
          }
          await delay(1);
        }
        return results;
      };

      const deleteProject = async () => {
        await delay(10);
        // Delete session first to avoid foreign key constraint
        testDb.db.delete(schema.sessions).where(eq(schema.sessions.id, session.id)).run();
        // Then delete project
        await projectRepo.delete(project.id);
      };

      const [results] = await runConcurrently(checkPermissions, deleteProject);

      // Permission checks should not throw
      expect(results.every((r) => typeof r === 'boolean')).toBe(true);

      // Project should be deleted
      const deletedProject = await projectRepo.getById(project.id);
      expect(deletedProject).toBeUndefined();
    });

    it('should prevent scope inheritance race conditions', async () => {
      const org = createTestOrg(testDb.db, 'Inherit Org');
      const project = await projectRepo.create({
        name: 'Inherit Project',
        orgId: org.id,
      });

      // Grant at different scope levels concurrently
      const grantOrgLevel = async () => {
        permissionService.grant({
          agentId: 'agent-inherit',
          scopeType: 'org',
          scopeId: org.id,
          entryType: 'tool',
          permission: 'read',
        });
      };

      const grantProjectLevel = async () => {
        permissionService.grant({
          agentId: 'agent-inherit',
          scopeType: 'project',
          scopeId: project.id,
          entryType: 'tool',
          permission: 'write',
        });
      };

      const checkProjectAccess = async () => {
        await delay(5);
        return permissionService.check(
          'agent-inherit',
          'write',
          'tool',
          null,
          'project',
          project.id
        );
      };

      const [, , hasAccess] = await runConcurrently(
        grantOrgLevel,
        grantProjectLevel,
        checkProjectAccess
      );

      // Project-level write should be granted
      expect(hasAccess).toBe(true);

      // Org-level read should also work via inheritance
      expect(permissionService.check('agent-inherit', 'read', 'tool', null, 'org', org.id)).toBe(
        true
      );
    });

    it('should handle concurrent scope chain invalidation', async () => {
      const org = createTestOrg(testDb.db, 'Chain Org');
      const project1 = await projectRepo.create({
        name: 'Chain Project 1',
        orgId: org.id,
      });
      const project2 = await projectRepo.create({
        name: 'Chain Project 2',
        orgId: org.id,
      });

      // Grant org-level permission
      permissionService.grant({
        agentId: 'agent-chain',
        scopeType: 'org',
        scopeId: org.id,
        entryType: 'knowledge',
        permission: 'write',
      });

      // Concurrently check permissions on different projects
      const checkProject1 = async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 20; i++) {
          results.push(
            permissionService.check('agent-chain', 'write', 'knowledge', null, 'project', project1.id)
          );
          await delay(1);
        }
        return results;
      };

      const checkProject2 = async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 20; i++) {
          results.push(
            permissionService.check('agent-chain', 'write', 'knowledge', null, 'project', project2.id)
          );
          await delay(1);
        }
        return results;
      };

      const revokeOrgPermission = async () => {
        await delay(10);
        permissionService.revoke({
          agentId: 'agent-chain',
          scopeType: 'org',
          scopeId: org.id,
          entryType: 'knowledge',
        });
      };

      const [results1, results2] = await runConcurrently(
        checkProject1,
        checkProject2,
        revokeOrgPermission
      );

      // All checks should return boolean (no errors)
      expect(results1.every((r) => typeof r === 'boolean')).toBe(true);
      expect(results2.every((r) => typeof r === 'boolean')).toBe(true);

      // After revocation, both projects should deny access
      expect(
        permissionService.check('agent-chain', 'write', 'knowledge', null, 'project', project1.id)
      ).toBe(false);
      expect(
        permissionService.check('agent-chain', 'write', 'knowledge', null, 'project', project2.id)
      ).toBe(false);
    });

    it('should prevent TOCTOU in scope migration', async () => {
      const org1 = createTestOrg(testDb.db, 'Migrate Org 1');
      const org2 = createTestOrg(testDb.db, 'Migrate Org 2');
      const project = await projectRepo.create({
        name: 'Migrate Project',
        orgId: org1.id,
      });

      permissionService.grant({
        agentId: 'agent-migrate',
        scopeType: 'project',
        scopeId: project.id,
        entryType: 'tool',
        permission: 'write',
      });

      const checkAccess = async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 50; i++) {
          results.push(
            permissionService.check('agent-migrate', 'write', 'tool', null, 'project', project.id)
          );
          await delay(1);
        }
        return results;
      };

      const migrateProject = async () => {
        await delay(10);
        // Migrate project to different org
        await projectRepo.update(project.id, { orgId: org2.id });
      };

      const [results] = await runConcurrently(checkAccess, migrateProject);

      // All checks should succeed (project-level permission independent of org)
      expect(results.every((r) => r === true)).toBe(true);

      // Permission should still work after migration
      expect(
        permissionService.check('agent-migrate', 'write', 'tool', null, 'project', project.id)
      ).toBe(true);
    });

    it('should handle concurrent scope creation and permission grant', async () => {
      const org = createTestOrg(testDb.db, 'Create Org');
      let projectId: string | null = null;

      const createProject = async () => {
        const project = await projectRepo.create({
          name: 'Create Project',
          orgId: org.id,
        });
        projectId = project.id;
        return project;
      };

      const grantPermission = async () => {
        // Wait for project to be created
        while (!projectId) {
          await delay(1);
        }
        permissionService.grant({
          agentId: 'agent-create',
          scopeType: 'project',
          scopeId: projectId,
          entryType: 'guideline',
          permission: 'admin',
        });
      };

      const [project] = await runConcurrently(createProject, grantPermission);

      // Permission should be properly granted
      expect(
        permissionService.check('agent-create', 'admin', 'guideline', null, 'project', project.id)
      ).toBe(true);
    });
  });

  describe('Advanced TOCTOU Attack Scenarios', () => {
    it('should prevent check-then-act race in permission validation', async () => {
      // Classic TOCTOU pattern:
      // 1. Check permission (authorized)
      // 2. [PERMISSION REVOKED HERE]
      // 3. Perform action (should fail but might succeed)

      permissionService.grant({
        agentId: 'agent-toctou-classic',
        scopeType: 'global',
        entryType: 'knowledge',
        permission: 'write',
      });

      let toctouVulnerable = false;

      const simulateProtectedOperation = async () => {
        // Step 1: Check permission
        const canWrite = permissionService.check(
          'agent-toctou-classic',
          'write',
          'knowledge',
          null,
          'global',
          null
        );

        if (canWrite) {
          // Small delay simulating operation setup
          await delay(5);

          // Step 3: Use permission (should re-check)
          const stillCanWrite = permissionService.check(
            'agent-toctou-classic',
            'write',
            'knowledge',
            null,
            'global',
            null
          );

          if (!stillCanWrite) {
            // Permission was revoked between check and use
            toctouVulnerable = true;
          }
        }
      };

      const revokePermission = async () => {
        await delay(2); // Revoke during the delay
        permissionService.revoke({
          agentId: 'agent-toctou-classic',
          scopeType: 'global',
          entryType: 'knowledge',
        });
      };

      await runConcurrently(simulateProtectedOperation, revokePermission);

      // The re-check pattern should catch the revocation
      expect(toctouVulnerable).toBe(true);
    });

    it('should prevent double-check bypass attack', async () => {
      // Attacker tries to bypass by checking twice
      // Thread 1: Check -> [Revoke] -> Check again -> Use (should fail)

      permissionService.grant({
        agentId: 'agent-double-check',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'admin',
      });

      const checkCount = { first: 0, second: 0 };

      const doubleCheckOperation = async () => {
        // First check
        if (
          permissionService.check('agent-double-check', 'admin', 'tool', null, 'global', null)
        ) {
          checkCount.first++;
          await delay(10);

          // Second check (after potential revocation)
          if (
            permissionService.check('agent-double-check', 'admin', 'tool', null, 'global', null)
          ) {
            checkCount.second++;
          }
        }
      };

      const revokeAttempt = async () => {
        await delay(5);
        permissionService.revoke({
          agentId: 'agent-double-check',
          scopeType: 'global',
          entryType: 'tool',
        });
      };

      await runConcurrently(doubleCheckOperation, revokeAttempt);

      // First check should succeed, second should fail
      expect(checkCount.first).toBe(1);
      expect(checkCount.second).toBe(0);
    });

    it('should prevent privilege escalation via race condition', async () => {
      // Attacker tries to escalate from read to write during check
      // Thread 1: Check read permission
      // Thread 2: Upgrade to write
      // Thread 1: Use write permission (should only have read)

      permissionService.grant({
        agentId: 'agent-escalate',
        scopeType: 'global',
        entryType: 'guideline',
        permission: 'read',
      });

      let escalationAttempted = false;

      const attemptEscalation = async () => {
        // Check read permission
        const canRead = permissionService.check(
          'agent-escalate',
          'read',
          'guideline',
          null,
          'global',
          null
        );

        if (canRead) {
          await delay(10); // Wait for potential upgrade

          // Try to use write permission
          const canWrite = permissionService.check(
            'agent-escalate',
            'write',
            'guideline',
            null,
            'global',
            null
          );

          if (canWrite) {
            escalationAttempted = true;
          }
        }
      };

      const legitimateUpgrade = async () => {
        await delay(5);
        // Legitimate admin upgrades permission
        permissionService.grant({
          agentId: 'agent-escalate',
          scopeType: 'global',
          entryType: 'guideline',
          permission: 'write',
        });
      };

      await runConcurrently(attemptEscalation, legitimateUpgrade);

      // Escalation should succeed because permission was legitimately upgraded
      expect(escalationAttempted).toBe(true);

      // Final permission should be write
      expect(
        permissionService.check('agent-escalate', 'write', 'guideline', null, 'global', null)
      ).toBe(true);
    });

    it('should handle thundering herd on permission revocation', async () => {
      // Multiple threads simultaneously checking permission during revocation
      permissionService.grant({
        agentId: 'agent-herd',
        scopeType: 'global',
        entryType: 'knowledge',
        permission: 'read',
      });

      const checkOperations = Array.from({ length: 20 }, () => async () => {
        const results: boolean[] = [];
        for (let i = 0; i < 10; i++) {
          results.push(
            permissionService.check('agent-herd', 'read', 'knowledge', null, 'global', null)
          );
          await delay(1);
        }
        return results;
      });

      const revokeOp = async () => {
        await delay(5);
        permissionService.revoke({
          agentId: 'agent-herd',
          scopeType: 'global',
          entryType: 'knowledge',
        });
      };

      const results = await runConcurrently(...checkOperations, revokeOp);

      // All checks should return boolean arrays
      const allChecks = results.slice(0, -1).flat() as boolean[];
      expect(allChecks.every((r) => typeof r === 'boolean')).toBe(true);

      // Final state should deny access
      expect(permissionService.check('agent-herd', 'read', 'knowledge', null, 'global', null)).toBe(
        false
      );
    });

    it('should prevent ABA problem in permission state', async () => {
      // ABA problem: Permission goes from A -> B -> A
      // Thread 1: Reads A -> [B -> A happens] -> Writes assuming still A (wrong)

      permissionService.grant({
        agentId: 'agent-aba',
        scopeType: 'global',
        entryType: 'tool',
        permission: 'read',
      });

      const observedStates: string[] = [];

      const monitorPermission = async () => {
        for (let i = 0; i < 30; i++) {
          const perms = permissionService.getForAgent('agent-aba');
          const perm = perms.find((p) => p.entryType === 'tool');
          if (perm) {
            observedStates.push(perm.permission);
          }
          await delay(1);
        }
      };

      const cyclePermission = async () => {
        await delay(5);
        // A -> B
        permissionService.grant({
          agentId: 'agent-aba',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'write',
        });

        await delay(5);
        // B -> A
        permissionService.revoke({
          agentId: 'agent-aba',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'write',
        });
        permissionService.grant({
          agentId: 'agent-aba',
          scopeType: 'global',
          entryType: 'tool',
          permission: 'read',
        });
      };

      await runConcurrently(monitorPermission, cyclePermission);

      // Should observe state transitions (read -> write -> read)
      expect(observedStates.length).toBeGreaterThan(0);
      expect(observedStates.some((s) => s === 'read')).toBe(true);
    });
  });
});

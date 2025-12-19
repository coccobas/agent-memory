/**
 * Critical Guidelines Service
 *
 * Provides functionality to retrieve critical guidelines (priority >= 90)
 * for session start and verification purposes.
 */

import { eq, and, isNull, desc, gte, or, inArray } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { guidelines, guidelineVersions, type ScopeType } from '../db/schema.js';
import { resolveScopeChain, type ScopeDescriptor } from './query.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('critical-guidelines');

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum priority threshold for critical guidelines */
export const CRITICAL_PRIORITY_THRESHOLD = 90;

// =============================================================================
// TYPES
// =============================================================================

export interface CriticalGuideline {
  id: string;
  name: string;
  content: string;
  priority: number;
  category: string | null;
  rationale: string | null;
  examples: { bad?: string[]; good?: string[] } | null;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface CriticalGuidelinesResult {
  count: number;
  guidelines: CriticalGuideline[];
  message: string | null;
  acknowledgmentRequired: boolean;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get critical guidelines for a session/project scope.
 *
 * Retrieves all guidelines with priority >= 90 from the scope chain
 * (session -> project -> org -> global).
 *
 * @param projectId - The project ID to start the scope chain from
 * @param sessionId - Optional session ID for more specific scope
 * @returns Array of critical guidelines sorted by priority (highest first)
 */
export function getCriticalGuidelinesForScope(
  projectId: string | null,
  sessionId?: string | null
): CriticalGuideline[] {
  const db = getDb();

  // Determine the scope chain
  let scopeChain: ScopeDescriptor[];

  if (sessionId) {
    scopeChain = resolveScopeChain({
      type: 'session',
      id: sessionId,
      inherit: true,
    });
  } else if (projectId) {
    scopeChain = resolveScopeChain({
      type: 'project',
      id: projectId,
      inherit: true,
    });
  } else {
    scopeChain = resolveScopeChain({
      type: 'global',
      inherit: true,
    });
  }

  logger.debug({ scopeChain }, 'Resolved scope chain for critical guidelines');

  // Build OR conditions for each scope in the chain
  const scopeConditions = scopeChain.map((scope) => {
    if (scope.scopeId === null) {
      return and(eq(guidelines.scopeType, scope.scopeType), isNull(guidelines.scopeId));
    }
    return and(eq(guidelines.scopeType, scope.scopeType), eq(guidelines.scopeId, scope.scopeId));
  });

  if (scopeConditions.length === 0) {
    return [];
  }

  // Query guidelines with priority >= CRITICAL_PRIORITY_THRESHOLD
  const criticalGuidelines = db
    .select()
    .from(guidelines)
    .where(
      and(
        or(...scopeConditions),
        gte(guidelines.priority, CRITICAL_PRIORITY_THRESHOLD),
        eq(guidelines.isActive, true)
      )
    )
    .orderBy(desc(guidelines.priority))
    .all();

  if (criticalGuidelines.length === 0) {
    return [];
  }

  // Get current versions for all guidelines
  const versionIds = criticalGuidelines
    .map((g) => g.currentVersionId)
    .filter((id): id is string => id !== null);

  const versions =
    versionIds.length > 0
      ? db.select().from(guidelineVersions).where(inArray(guidelineVersions.id, versionIds)).all()
      : [];

  const versionMap = new Map(versions.map((v) => [v.id, v]));

  // Map to CriticalGuideline format
  const result: CriticalGuideline[] = criticalGuidelines.map((g) => {
    const version = g.currentVersionId ? versionMap.get(g.currentVersionId) : undefined;
    return {
      id: g.id,
      name: g.name,
      content: version?.content ?? '',
      priority: g.priority,
      category: g.category,
      rationale: version?.rationale ?? null,
      examples: version?.examples ?? null,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
    };
  });

  logger.info({ count: result.length }, 'Retrieved critical guidelines');
  return result;
}

/**
 * Get critical guidelines formatted for session start response.
 *
 * @param projectId - The project ID
 * @param sessionId - Optional session ID
 * @returns Formatted result with count, guidelines, and message
 */
export function getCriticalGuidelinesForSession(
  projectId: string | null,
  sessionId?: string | null
): CriticalGuidelinesResult {
  const guidelines = getCriticalGuidelinesForScope(projectId, sessionId);

  return {
    count: guidelines.length,
    guidelines,
    message:
      guidelines.length > 0
        ? `CRITICAL: ${guidelines.length} guideline(s) with priority >= ${CRITICAL_PRIORITY_THRESHOLD} require acknowledgment before proceeding.`
        : null,
    acknowledgmentRequired: guidelines.length > 0,
  };
}

/**
 * Get IDs of critical guidelines for a scope.
 * Useful for verification/acknowledgment tracking.
 *
 * @param projectId - The project ID
 * @param sessionId - Optional session ID
 * @returns Array of guideline IDs
 */
export function getCriticalGuidelineIds(
  projectId: string | null,
  sessionId?: string | null
): string[] {
  const guidelines = getCriticalGuidelinesForScope(projectId, sessionId);
  return guidelines.map((g) => g.id);
}

/**
 * Check if a specific guideline is critical (priority >= 90).
 *
 * @param guidelineId - The guideline ID to check
 * @returns True if the guideline exists and has priority >= 90
 */
export function isGuidelineCritical(guidelineId: string): boolean {
  const db = getDb();

  const guideline = db
    .select({ priority: guidelines.priority })
    .from(guidelines)
    .where(and(eq(guidelines.id, guidelineId), eq(guidelines.isActive, true)))
    .get();

  return guideline !== undefined && guideline.priority >= CRITICAL_PRIORITY_THRESHOLD;
}

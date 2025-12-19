/**
 * Verification Service
 *
 * Provides functionality to verify actions against critical guidelines,
 * track acknowledgments, and log verification results.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import {
  guidelines,
  guidelineVersions,
  sessions,
  sessionGuidelineAcknowledgments,
  verificationLog,
  type VerificationActionType,
} from '../db/schema.js';
import { generateId } from '../db/repositories/base.js';
import {
  getCriticalGuidelinesForScope,
  type CriticalGuideline,
} from './critical-guidelines.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('verification');

// =============================================================================
// TYPES
// =============================================================================

export type ProposedActionType = 'file_write' | 'code_generate' | 'api_call' | 'command' | 'other';

export interface ProposedAction {
  type: ProposedActionType;
  description?: string;
  filePath?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface Violation {
  guidelineId: string;
  guidelineName: string;
  severity: 'critical' | 'warning';
  message: string;
  suggestedAction?: string;
}

export interface VerificationResult {
  allowed: boolean;
  blocked: boolean;
  violations: Violation[];
  warnings: string[];
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
}

export interface VerificationRules {
  filePatterns?: string[];
  contentPatterns?: string[];
  forbiddenActions?: string[];
  requiredPatterns?: string[];
}

// =============================================================================
// VERIFICATION LOGIC
// =============================================================================

/**
 * Check if a file path matches any of the given patterns.
 * Supports glob-like patterns with * wildcard.
 */
function matchesFilePattern(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    if (regex.test(filePath)) {
      return true;
    }

    // Also check if pattern appears anywhere in path
    if (filePath.includes(pattern.replace(/\*/g, ''))) {
      return true;
    }
  }
  return false;
}

/**
 * Check if content matches any of the given patterns.
 */
function matchesContentPattern(content: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(content)) {
        return true;
      }
    } catch {
      // If pattern is not valid regex, do simple string match
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Verify an action against a single guideline's verification rules.
 */
function verifyAgainstGuideline(
  action: ProposedAction,
  guideline: CriticalGuideline,
  rules: VerificationRules | null
): Violation | null {
  if (!rules) {
    return null;
  }

  // Check forbidden actions
  if (rules.forbiddenActions?.includes(action.type)) {
    return {
      guidelineId: guideline.id,
      guidelineName: guideline.name,
      severity: 'critical',
      message: `Action type '${action.type}' is forbidden by guideline "${guideline.name}"`,
      suggestedAction: `Review the guideline: ${guideline.content}`,
    };
  }

  // Check file patterns
  if (action.filePath && rules.filePatterns?.length) {
    if (matchesFilePattern(action.filePath, rules.filePatterns)) {
      return {
        guidelineId: guideline.id,
        guidelineName: guideline.name,
        severity: 'critical',
        message: `File path "${action.filePath}" matches forbidden pattern in guideline "${guideline.name}"`,
        suggestedAction: `Review the guideline: ${guideline.content}`,
      };
    }
  }

  // Check content patterns
  if (action.content && rules.contentPatterns?.length) {
    if (matchesContentPattern(action.content, rules.contentPatterns)) {
      return {
        guidelineId: guideline.id,
        guidelineName: guideline.name,
        severity: 'critical',
        message: `Content matches forbidden pattern in guideline "${guideline.name}"`,
        suggestedAction: `Review the guideline: ${guideline.content}`,
      };
    }
  }

  return null;
}

/**
 * Get verification rules for a guideline.
 */
function getVerificationRules(guidelineId: string): VerificationRules | null {
  const db = getDb();

  const guideline = db.select().from(guidelines).where(eq(guidelines.id, guidelineId)).get();

  if (!guideline?.currentVersionId) {
    return null;
  }

  const version = db
    .select()
    .from(guidelineVersions)
    .where(eq(guidelineVersions.id, guideline.currentVersionId))
    .get();

  return (version?.verificationRules as VerificationRules) ?? null;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Verify a proposed action against critical guidelines.
 *
 * @param sessionId - The session ID (optional)
 * @param projectId - The project ID (optional)
 * @param action - The proposed action to verify
 * @returns Verification result with violations and warnings
 */
export function verifyAction(
  sessionId: string | null,
  projectId: string | null,
  action: ProposedAction
): VerificationResult {
  // Get critical guidelines for the scope
  const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId);

  const violations: Violation[] = [];
  const warnings: string[] = [];
  const checkedGuidelineIds: string[] = [];

  for (const guideline of criticalGuidelines) {
    checkedGuidelineIds.push(guideline.id);
    const rules = getVerificationRules(guideline.id);

    const violation = verifyAgainstGuideline(action, guideline, rules);
    if (violation) {
      violations.push(violation);
    }

    // Also check guideline examples for bad patterns
    if (guideline.examples?.bad && action.content) {
      for (const badExample of guideline.examples.bad) {
        if (action.content.includes(badExample)) {
          violations.push({
            guidelineId: guideline.id,
            guidelineName: guideline.name,
            severity: 'critical',
            message: `Content contains pattern from "bad examples" in guideline "${guideline.name}"`,
            suggestedAction: guideline.examples.good?.[0]
              ? `Consider using: ${guideline.examples.good[0]}`
              : `Review the guideline: ${guideline.content}`,
          });
          break;
        }
      }
    }
  }

  const hasViolations = violations.length > 0;

  const result: VerificationResult = {
    allowed: !hasViolations,
    blocked: hasViolations,
    violations,
    warnings,
    requiresConfirmation: hasViolations,
    confirmationPrompt: hasViolations
      ? `${violations.length} critical guideline violation(s) detected. Please address before proceeding.`
      : undefined,
  };

  // Log the verification
  logVerification(sessionId, 'pre_check', action, result, checkedGuidelineIds);

  return result;
}

/**
 * Log a completed action for post-check analytics.
 *
 * @param sessionId - The session ID
 * @param action - The completed action
 * @param agentId - The agent ID that performed the action
 */
export function logCompletedAction(
  sessionId: string | null,
  action: ProposedAction,
  agentId?: string
): VerificationResult {
  // Run the same verification logic for analytics
  const projectId = sessionId ? getProjectIdForSession(sessionId) : null;
  const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId);

  const violations: Violation[] = [];
  const checkedGuidelineIds = criticalGuidelines.map((g) => g.id);

  for (const guideline of criticalGuidelines) {
    const rules = getVerificationRules(guideline.id);
    const violation = verifyAgainstGuideline(action, guideline, rules);
    if (violation) {
      violations.push(violation);
    }
  }

  const result: VerificationResult = {
    allowed: violations.length === 0,
    blocked: false, // Post-check doesn't block
    violations,
    warnings:
      violations.length > 0
        ? [`Post-check found ${violations.length} potential violation(s) for audit purposes`]
        : [],
    requiresConfirmation: false,
  };

  // Log the post-check
  logVerification(sessionId, 'post_check', action, result, checkedGuidelineIds, agentId);

  return result;
}

/**
 * Acknowledge critical guidelines for a session.
 *
 * @param sessionId - The session ID
 * @param guidelineIds - The guideline IDs to acknowledge (or all critical if empty)
 * @param acknowledgedBy - The agent/user who acknowledged
 * @returns Number of guidelines acknowledged
 */
export function acknowledgeGuidelines(
  sessionId: string,
  guidelineIds?: string[],
  acknowledgedBy?: string
): { acknowledged: number; guidelineIds: string[] } {
  const db = getDb();

  // If no specific IDs provided, get all critical guidelines for the session
  let idsToAcknowledge = guidelineIds;
  if (!idsToAcknowledge || idsToAcknowledge.length === 0) {
    const projectId = getProjectIdForSession(sessionId);
    const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId);
    idsToAcknowledge = criticalGuidelines.map((g) => g.id);
  }

  let acknowledged = 0;
  const acknowledgedIds: string[] = [];

  for (const guidelineId of idsToAcknowledge) {
    try {
      db.insert(sessionGuidelineAcknowledgments)
        .values({
          id: generateId(),
          sessionId,
          guidelineId,
          acknowledgedBy,
        })
        .onConflictDoNothing()
        .run();

      acknowledged++;
      acknowledgedIds.push(guidelineId);
    } catch (error) {
      logger.warn({ error, guidelineId }, 'Failed to acknowledge guideline');
    }
  }

  // Log the acknowledgment
  logVerification(
    sessionId,
    'acknowledge',
    { type: 'other', description: 'Acknowledged critical guidelines' },
    {
      allowed: true,
      blocked: false,
      violations: [],
      warnings: [],
      requiresConfirmation: false,
    },
    acknowledgedIds,
    acknowledgedBy
  );

  logger.info({ sessionId, acknowledged }, 'Guidelines acknowledged');

  return { acknowledged, guidelineIds: acknowledgedIds };
}

/**
 * Get acknowledged guideline IDs for a session.
 */
export function getAcknowledgedGuidelineIds(sessionId: string): string[] {
  const db = getDb();

  const acknowledgments = db
    .select({ guidelineId: sessionGuidelineAcknowledgments.guidelineId })
    .from(sessionGuidelineAcknowledgments)
    .where(eq(sessionGuidelineAcknowledgments.sessionId, sessionId))
    .all();

  return acknowledgments.map((a) => a.guidelineId);
}

/**
 * Check if all critical guidelines have been acknowledged for a session.
 */
export function areAllCriticalGuidelinesAcknowledged(
  sessionId: string,
  projectId: string | null
): { acknowledged: boolean; missing: string[] } {
  const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId);
  const acknowledgedIds = new Set(getAcknowledgedGuidelineIds(sessionId));

  const missing = criticalGuidelines.filter((g) => !acknowledgedIds.has(g.id)).map((g) => g.name);

  return {
    acknowledged: missing.length === 0,
    missing,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get project ID for a session.
 */
function getProjectIdForSession(sessionId: string): string | null {
  const db = getDb();

  const session = db
    .select({ projectId: sessions.projectId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  return session?.projectId ?? null;
}

/**
 * Log a verification action.
 */
function logVerification(
  sessionId: string | null,
  actionType: VerificationActionType,
  proposedAction: ProposedAction,
  result: VerificationResult,
  guidelineIds: string[],
  createdBy?: string
): void {
  try {
    const db = getDb();

    db.insert(verificationLog)
      .values({
        id: generateId(),
        sessionId,
        actionType,
        proposedAction,
        result,
        guidelineIds,
        createdBy,
      })
      .run();
  } catch (error) {
    logger.error({ error }, 'Failed to log verification');
  }
}

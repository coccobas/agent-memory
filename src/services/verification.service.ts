/**
 * Verification Service
 *
 * Provides functionality to verify actions against critical guidelines,
 * track acknowledgments, and log verification results.
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/connection.js';
import {
  guidelines,
  guidelineVersions,
  sessions,
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
// VERIFICATION SERVICE CLASS
// =============================================================================

/**
 * VerificationService class with encapsulated DI
 */
export class VerificationService {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  /**
   * Verify a proposed action against critical guidelines.
   */
  verifyAction(
    sessionId: string | null,
    projectId: string | null,
    action: ProposedAction
  ): VerificationResult {
    return verifyAction(sessionId, projectId, action, this.db);
  }

  /**
   * Log a completed action for post-check analytics.
   */
  logCompletedAction(
    sessionId: string | null,
    action: ProposedAction,
    agentId?: string
  ): VerificationResult {
    return logCompletedAction(sessionId, action, agentId, this.db);
  }
}

// =============================================================================
// VERIFICATION LOGIC
// =============================================================================

/**
 * Escape all regex special characters in a string.
 * Used before converting glob wildcards to regex patterns.
 *
 * Security: Prevents regex injection via malicious patterns.
 */
function escapeRegexChars(str: string): string {
  // Escape all regex special characters: \ ^ $ . | ? * + ( ) [ ] { }
  // Note: We handle * and ? separately as they are glob wildcards
  return str.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
}

/**
 * Check if a file path matches any of the given patterns.
 * Supports glob-like patterns with * and ? wildcards.
 *
 * Security: Properly escapes regex special characters to prevent injection.
 */
function matchesFilePattern(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // First escape all regex special characters (except * and ?)
    // Then convert glob wildcards to regex equivalents
    const escaped = escapeRegexChars(
      pattern.replace(/\*/g, '\0STAR\0').replace(/\?/g, '\0QUESTION\0')
    );
    const regexPattern = escaped.replace(/\0STAR\0/g, '.*').replace(/\0QUESTION\0/g, '.');

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(filePath)) {
        return true;
      }
    } catch {
      // If regex is invalid despite escaping, fall back to simple include check
      logger.warn({ pattern }, 'Invalid file pattern, falling back to string match');
    }

    // Also check if pattern appears anywhere in path (simple substring match)
    const patternWithoutWildcards = pattern.replace(/[*?]/g, '');
    if (patternWithoutWildcards && filePath.includes(patternWithoutWildcards)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a regex pattern is safe (no ReDoS potential).
 * Rejects patterns with nested quantifiers that could cause exponential backtracking.
 */
function isSafeRegexPattern(pattern: string): boolean {
  // Detect dangerous patterns: nested quantifiers like (a+)+, (a*)+, (a?)+, etc.
  // These can cause catastrophic backtracking (ReDoS)
  const dangerousPatterns = [
    /\([^)]*[+*?]\)[+*?]/, // Nested quantifiers: (x+)+, (x*)+, (x?)*, etc.
    /\([^)]*\)\{[^}]*\}[+*?]/, // Quantified groups with trailing quantifier: (x){2,}+
    /([+*?])\1{2,}/, // Multiple consecutive quantifiers: +++, ***, ???
    /\[[^\]]*\][+*?]\{/, // Character class with quantifier and brace: [a-z]+{
  ];

  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  // Additional length check to prevent abuse
  if (pattern.length > 500) {
    return false;
  }

  return true;
}

/**
 * Test regex with timeout protection to prevent ReDoS.
 * Returns match result or false if timeout exceeded.
 */
function safeRegexTest(regex: RegExp, content: string, _timeoutMs: number = 100): boolean {
  // For very long content, limit what we test to prevent hanging
  const maxContentLength = 100000;
  const testContent =
    content.length > maxContentLength ? content.slice(0, maxContentLength) : content;

  // Simple regex test - JavaScript regex runs synchronously, so we can't truly timeout.
  // Instead, we limit content length and reject dangerous patterns upfront.
  try {
    return regex.test(testContent);
  } catch {
    return false;
  }
}

/**
 * Check if content matches any of the given patterns.
 * Uses safe regex handling to prevent ReDoS attacks.
 */
function matchesContentPattern(content: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // First, check if pattern is safe
    if (!isSafeRegexPattern(pattern)) {
      logger.warn({ pattern }, 'Rejected potentially dangerous regex pattern (ReDoS risk)');
      // Fall back to simple string match for unsafe patterns
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        return true;
      }
      continue;
    }

    try {
      const regex = new RegExp(pattern, 'i');
      if (safeRegexTest(regex, content)) {
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
 *
 * @param guidelineId - The guideline ID
 * @param db - Database client (required)
 */
function getVerificationRules(guidelineId: string, db: DbClient): VerificationRules | null {
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
 * @param db - Database client (required)
 * @returns Verification result with violations and warnings
 */
export function verifyAction(
  sessionId: string | null,
  projectId: string | null,
  action: ProposedAction,
  db: DbClient
): VerificationResult {
  // Get critical guidelines for the scope
  const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId, db);

  const violations: Violation[] = [];
  const warnings: string[] = [];
  const checkedGuidelineIds: string[] = [];

  for (const guideline of criticalGuidelines) {
    checkedGuidelineIds.push(guideline.id);
    const rules = getVerificationRules(guideline.id, db);

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
  logVerification(sessionId, 'pre_check', action, result, checkedGuidelineIds, undefined, db);

  return result;
}

/**
 * Log a completed action for post-check analytics.
 *
 * @param sessionId - The session ID
 * @param action - The completed action
 * @param agentId - The agent ID that performed the action
 * @param db - Database client (required)
 */
export function logCompletedAction(
  sessionId: string | null,
  action: ProposedAction,
  agentId: string | undefined,
  db: DbClient
): VerificationResult {
  // Run the same verification logic for analytics
  const projectId = sessionId ? getProjectIdForSession(sessionId, db) : null;
  const criticalGuidelines = getCriticalGuidelinesForScope(projectId, sessionId, db);

  const violations: Violation[] = [];
  const checkedGuidelineIds = criticalGuidelines.map((g) => g.id);

  for (const guideline of criticalGuidelines) {
    const rules = getVerificationRules(guideline.id, db);
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
  logVerification(sessionId, 'post_check', action, result, checkedGuidelineIds, agentId, db);

  return result;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get project ID for a session.
 *
 * @param sessionId - The session ID
 * @param db - Database client (required)
 */
function getProjectIdForSession(sessionId: string, db: DbClient): string | null {
  const session = db
    .select({ projectId: sessions.projectId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  return session?.projectId ?? null;
}

/**
 * Log a verification action.
 *
 * @param sessionId - The session ID
 * @param actionType - The type of verification action
 * @param proposedAction - The proposed action
 * @param result - The verification result
 * @param guidelineIds - The guideline IDs checked
 * @param createdBy - The agent/user who performed the action
 * @param db - Database client (required)
 */
function logVerification(
  sessionId: string | null,
  actionType: VerificationActionType,
  proposedAction: ProposedAction,
  result: VerificationResult,
  guidelineIds: string[],
  createdBy: string | undefined,
  db: DbClient
): void {
  try {
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

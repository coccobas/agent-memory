/**
 * Verification handlers for memory_verify tool
 *
 * Provides handlers for pre-check, post-check, and acknowledge actions
 * to verify compliance with critical guidelines.
 */

import type { ProposedAction, ProposedActionType } from '../../services/verification.service.js';
import { getCriticalGuidelinesForSession } from '../../services/critical-guidelines.service.js';
import { createValidationError, createServiceUnavailableError } from '../../core/errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { AppContext } from '../../core/context.js';

import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isObject,
  isArray,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

const logger = createComponentLogger('verification');

/**
 * Ensure verification service is available in context
 */
function requireVerificationService(context: AppContext) {
  if (!context.services?.verification) {
    throw createServiceUnavailableError('verification', 'Service not available in context');
  }
  return context.services.verification;
}

/**
 * Type guard for action type
 */
function isActionType(value: unknown): value is ProposedActionType {
  return (
    isString(value) &&
    ['file_write', 'code_generate', 'api_call', 'command', 'other'].includes(value)
  );
}

/**
 * Type guard for proposed action object
 */
function isProposedAction(value: unknown): value is ProposedAction {
  if (!isObject(value)) return false;
  const obj = value;
  if (!obj.type || !isActionType(obj.type)) return false;
  return true;
}

/**
 * Type guard for string array
 */
function isStringArray(value: unknown): value is string[] {
  return isArray(value) && value.every(isString);
}

export const verificationHandlers = {
  /**
   * Pre-check: Verify a proposed action BEFORE execution.
   *
   * Returns blocked: true if the action would violate critical guidelines.
   * Agents should NOT proceed if blocked.
   */
  preCheck(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const proposedAction = getRequiredParam(params, 'proposedAction', isProposedAction);
    // agentId is accepted but not currently used for pre_check
    getOptionalParam(params, 'agentId', isString);

    logger.info({ sessionId, actionType: proposedAction.type }, 'Pre-check verification requested');

    // Verify the action using injected service
    const verification = requireVerificationService(context);
    const result = verification.verifyAction(
      sessionId ?? null,
      projectId ?? null,
      proposedAction
    );

    return formatTimestamps({
      success: true,
      action: 'pre_check',
      sessionId,
      ...result,
      message: result.blocked
        ? `BLOCKED: ${result.violations.length} critical guideline violation(s) detected. Do NOT proceed with this action.`
        : 'Action verified. You may proceed.',
    });
  },

  /**
   * Post-check: Log a completed action for compliance tracking.
   *
   * Does not block - used for analytics and audit purposes.
   */
  postCheck(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getOptionalParam(params, 'sessionId', isString);
    // projectId is accepted but derived internally from sessionId
    getOptionalParam(params, 'projectId', isString);
    const completedAction = getOptionalParam(params, 'completedAction', isProposedAction);
    const content = getOptionalParam(params, 'content', isString);
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Build action from either completedAction object or content string
    let action: ProposedAction;
    if (completedAction) {
      action = completedAction;
    } else if (content) {
      action = {
        type: 'other',
        content,
        description: 'Agent response content',
      };
    } else {
      throw createValidationError(
        'completedAction',
        'Either completedAction or content is required for post_check'
      );
    }

    logger.info({ sessionId, actionType: action.type }, 'Post-check verification requested');

    // Log and verify the completed action using injected service
    const verification = requireVerificationService(context);
    const result = verification.logCompletedAction(
      sessionId ?? null,
      action,
      agentId
    );

    return formatTimestamps({
      success: true,
      action: 'post_check',
      sessionId,
      ...result,
      message:
        result.violations.length > 0
          ? `Post-check found ${result.violations.length} potential violation(s) logged for audit.`
          : 'Action logged. No violations detected.',
    });
  },

  /**
   * Acknowledge: Mark critical guidelines as acknowledged for a session.
   *
   * Should be called after reviewing critical guidelines at session start.
   */
  acknowledge(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const guidelineIds = getOptionalParam(params, 'guidelineIds', isStringArray);
    const agentId = getOptionalParam(params, 'agentId', isString);

    logger.info({ sessionId, guidelineIds }, 'Acknowledgment requested');

    // Acknowledge the guidelines using injected service
    const verification = requireVerificationService(context);
    const result = verification.acknowledgeGuidelines(
      sessionId,
      guidelineIds,
      agentId
    );

    // Check if all critical guidelines are now acknowledged
    const projectId = null; // Will be resolved from session
    const status = verification.areAllCriticalGuidelinesAcknowledged(
      sessionId,
      projectId
    );

    return formatTimestamps({
      success: true,
      action: 'acknowledge',
      sessionId,
      acknowledged: result.acknowledged,
      guidelineIds: result.guidelineIds,
      allAcknowledged: status.acknowledged,
      missingAcknowledgments: status.missing,
      message: status.acknowledged
        ? `All ${result.acknowledged} critical guideline(s) acknowledged. You may proceed.`
        : `${result.acknowledged} guideline(s) acknowledged. Still missing: ${status.missing.join(', ')}`,
    });
  },

  /**
   * Status: Get verification status for a session.
   *
   * Returns critical guidelines and acknowledgment status.
   */
  status(context: AppContext, params: Record<string, unknown>) {
    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);

    logger.info({ sessionId }, 'Verification status requested');

    // Get critical guidelines
    const criticalGuidelines = getCriticalGuidelinesForSession(
      projectId ?? null,
      sessionId,
      context.db
    );

    // Get acknowledged guidelines using injected service
    const verification = requireVerificationService(context);
    const acknowledgedIds = new Set(
      verification.getAcknowledgedGuidelineIds(sessionId)
    );

    // Build status for each guideline
    const guidelinesStatus = criticalGuidelines.guidelines.map((g) => ({
      id: g.id,
      name: g.name,
      priority: g.priority,
      acknowledged: acknowledgedIds.has(g.id),
    }));

    const allAcknowledged = guidelinesStatus.every((g) => g.acknowledged);
    const acknowledgedCount = guidelinesStatus.filter((g) => g.acknowledged).length;

    return formatTimestamps({
      success: true,
      action: 'status',
      sessionId,
      criticalGuidelinesCount: criticalGuidelines.count,
      acknowledgedCount,
      allAcknowledged,
      guidelines: guidelinesStatus,
      message: allAcknowledged
        ? 'All critical guidelines acknowledged.'
        : `${acknowledgedCount}/${criticalGuidelines.count} critical guidelines acknowledged.`,
    });
  },
};

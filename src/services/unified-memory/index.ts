/**
 * Unified Memory Service
 *
 * Provides a single natural language interface to memory operations.
 * Combines intent detection with action dispatch for simplified UX.
 */

import type { AppContext } from '../../core/context.js';
import type { DetectedContext } from '../context-detection.service.js';
import {
  createIntentDetectionService,
  type IIntentDetectionService,
  type IntentDetectionResult,
} from '../intent-detection/index.js';
import { dispatch, type DispatchResult } from './dispatcher.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('unified-memory');

// =============================================================================
// TYPES
// =============================================================================

export interface UnifiedMemoryRequest {
  /** Natural language input */
  text: string;
  /** Detected context (auto-filled if available) */
  context?: DetectedContext;
  /** Override project ID */
  projectId?: string;
  /** Override session ID */
  sessionId?: string;
  /** Agent identifier */
  agentId?: string;
}

export interface UnifiedMemoryResponse extends DispatchResult {
  /** Original request text */
  request: string;
  /** Detected intent details */
  detectedIntent: IntentDetectionResult;
  /** Was the action auto-executed? */
  autoExecuted: boolean;
}

export interface IUnifiedMemoryService {
  /**
   * Process natural language memory request
   */
  process(request: UnifiedMemoryRequest, appContext: AppContext): Promise<UnifiedMemoryResponse>;

  /**
   * Just detect intent without executing
   */
  analyze(text: string): IntentDetectionResult;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export class UnifiedMemoryService implements IUnifiedMemoryService {
  private readonly intentService: IIntentDetectionService;
  private readonly autoExecuteThreshold: number;

  constructor(options?: { confidenceThreshold?: number; autoExecuteThreshold?: number }) {
    this.intentService = createIntentDetectionService({
      confidenceThreshold: options?.confidenceThreshold ?? 0.7,
    });
    this.autoExecuteThreshold = options?.autoExecuteThreshold ?? 0.8;
  }

  async process(
    request: UnifiedMemoryRequest,
    appContext: AppContext
  ): Promise<UnifiedMemoryResponse> {
    const { text, context } = request;

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      const errorIntent: IntentDetectionResult = {
        intent: 'unknown',
        confidence: 0,
        rawPatterns: [],
      };
      return {
        action: 'error',
        status: 'error',
        message:
          'Input cannot be empty. Please provide a command like "Remember that..." or "What do we know about..."',
        request: text,
        detectedIntent: errorIntent,
        autoExecuted: false,
      };
    }

    if (trimmedText.length === 1) {
      const errorIntent: IntentDetectionResult = {
        intent: 'unknown',
        confidence: 0,
        rawPatterns: [],
      };
      return {
        action: 'error',
        status: 'error',
        message: `Input "${trimmedText}" is too short. Please provide a meaningful command (at least 2 characters).`,
        request: text,
        detectedIntent: errorIntent,
        autoExecuted: false,
      };
    }

    const detectedIntent = this.intentService.detect(trimmedText);

    logger.debug(
      {
        text: trimmedText.substring(0, 100),
        intent: detectedIntent.intent,
        confidence: detectedIntent.confidence,
      },
      'Processing unified memory request'
    );

    // Determine project/session from context or request
    // DetectedContext uses project.id and session.id
    const projectId = request.projectId ?? context?.project?.id;
    const sessionId = request.sessionId ?? context?.session?.id;
    // agentId is a DetectedAgentId object with value property
    const agentIdValue =
      typeof context?.agentId === 'object' && context.agentId ? context.agentId.value : undefined;
    const agentId = request.agentId ?? agentIdValue ?? 'unified-memory';

    // Dispatch to appropriate handler
    const result = await dispatch(detectedIntent, {
      context: appContext,
      projectId,
      sessionId,
      agentId,
    });

    // Build response
    const response: UnifiedMemoryResponse = {
      ...result,
      request: text,
      detectedIntent,
      autoExecuted: detectedIntent.confidence >= this.autoExecuteThreshold,
      _context: {
        projectId,
        sessionId,
        agentId,
      },
    };

    return response;
  }

  analyze(text: string): IntentDetectionResult {
    return this.intentService.detect(text);
  }
}

/**
 * Create a unified memory service instance
 */
export function createUnifiedMemoryService(options?: {
  confidenceThreshold?: number;
  autoExecuteThreshold?: number;
}): IUnifiedMemoryService {
  return new UnifiedMemoryService(options);
}

// Re-export types
export type { IntentDetectionResult } from '../intent-detection/index.js';
export type { DispatchResult } from './dispatcher.js';

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { formatError } from '../errors.js';
import {
  getOptionalParam,
  getRequiredParam,
  isString,
  isBoolean,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

const logger = createComponentLogger('hook-learning-handler');

function isEpisodeEventType(
  value: unknown
): value is 'started' | 'checkpoint' | 'decision' | 'error' | 'completed' {
  return (
    isString(value) && ['started', 'checkpoint', 'decision', 'error', 'completed'].includes(value)
  );
}

function isRole(value: unknown): value is 'user' | 'assistant' {
  return isString(value) && ['user', 'assistant'].includes(value);
}

function isOutcomeType(value: unknown): value is 'success' | 'failure' | 'partial' {
  return isString(value) && ['success', 'failure', 'partial'].includes(value);
}

export const hookLearningHandlers = {
  async block_start(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const userMessage = getRequiredParam(params, 'userMessage', isString);
    const messageId = getRequiredParam(params, 'messageId', isString);

    try {
      const result = await service.onBlockStart({
        sessionId,
        userMessage,
        messageId,
      });

      return formatTimestamps({
        success: true,
        action: 'block_start',
        ...result,
      });
    } catch (error) {
      logger.error({ error: formatError(error), sessionId }, 'Block start failed');
      return formatTimestamps({
        success: false,
        action: 'block_start',
        error: formatError(error),
      });
    }
  },

  async block_end(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const messageId = getRequiredParam(params, 'messageId', isString);
    const assistantMessage = getRequiredParam(params, 'assistantMessage', isString);
    const success = getOptionalParam(params, 'success', isBoolean) ?? true;

    try {
      const result = await service.onBlockEnd({
        sessionId,
        messageId,
        assistantMessage,
        success,
      });

      return formatTimestamps({
        success: true,
        action: 'block_end',
        ...result,
      });
    } catch (error) {
      logger.error({ error: formatError(error), sessionId }, 'Block end failed');
      return formatTimestamps({
        success: false,
        action: 'block_end',
        error: formatError(error),
      });
    }
  },

  async conversation(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const role = getRequiredParam(params, 'role', isRole);
    const message = getRequiredParam(params, 'message', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);

    try {
      const result = await service.onConversationMessage({
        sessionId,
        projectId,
        role,
        message,
      });

      return formatTimestamps({
        success: true,
        action: 'conversation',
        ...result,
      });
    } catch (error) {
      logger.error(
        { error: formatError(error), sessionId },
        'Conversation message processing failed'
      );
      return formatTimestamps({
        success: false,
        action: 'conversation',
        error: formatError(error),
      });
    }
  },

  async episode(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const episodeId = getRequiredParam(params, 'episodeId', isString);
    const eventType = getRequiredParam(params, 'eventType', isEpisodeEventType);
    const message = getRequiredParam(params, 'message', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);

    try {
      const result = await service.onEpisodeEvent({
        sessionId,
        projectId,
        episodeId,
        eventType,
        message,
      });

      return formatTimestamps({
        success: true,
        action: 'episode',
        ...result,
      });
    } catch (error) {
      logger.error(
        { error: formatError(error), sessionId, episodeId },
        'Episode event processing failed'
      );
      return formatTimestamps({
        success: false,
        action: 'episode',
        error: formatError(error),
      });
    }
  },

  async status(context: AppContext, _params: Record<string, unknown>) {
    const service = context.services.hookLearning;

    return formatTimestamps({
      success: true,
      action: 'status',
      available: service?.isAvailable() ?? false,
      knowledgeExtractionAvailable: service?.isKnowledgeAvailable() ?? false,
      config: service?.getConfig(),
    });
  },

  async tool_outcome(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);
    const toolName = getRequiredParam(params, 'toolName', isString);
    const outcome = getRequiredParam(params, 'outcome', isOutcomeType);
    const inputSummary = getOptionalParam(params, 'inputSummary', isString);
    const outputSummary = getOptionalParam(params, 'outputSummary', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);

    try {
      const result = await service.recordToolOutcome({
        sessionId,
        projectId,
        toolName,
        outcome,
        inputSummary,
        outputSummary,
      });

      return formatTimestamps({
        success: true,
        action: 'tool_outcome',
        ...result,
      });
    } catch (error) {
      logger.error({ error: formatError(error), sessionId }, 'Tool outcome recording failed');
      return formatTimestamps({
        success: false,
        action: 'tool_outcome',
        error: formatError(error),
      });
    }
  },

  async session_end_analysis(context: AppContext, params: Record<string, unknown>) {
    const service = context.services.hookLearning;
    if (!service?.isAvailable()) {
      return formatTimestamps({
        success: false,
        message: 'Hook learning service not available',
      });
    }

    const sessionId = getRequiredParam(params, 'sessionId', isString);

    try {
      await service.onSessionEnd(sessionId);
      return formatTimestamps({
        success: true,
        action: 'session_end_analysis',
        sessionId,
      });
    } catch (error) {
      logger.error({ error: formatError(error), sessionId }, 'Session-end analysis failed');
      return formatTimestamps({
        success: false,
        action: 'session_end_analysis',
        error: formatError(error),
      });
    }
  },
};

export function createHookLearningHandler(): ContextAwareHandler {
  return async (context: AppContext, params: Record<string, unknown>) => {
    const action = getRequiredParam(
      params,
      'action',
      isString
    ) as keyof typeof hookLearningHandlers;

    const handler = hookLearningHandlers[action];
    if (!handler) {
      return formatTimestamps({
        success: false,
        error: `Unknown action: ${action}. Valid actions: ${Object.keys(hookLearningHandlers).join(', ')}`,
      });
    }

    return handler(context, params);
  };
}

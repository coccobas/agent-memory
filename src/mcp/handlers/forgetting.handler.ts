/**
 * MCP Handler: memory_forget
 *
 * Handles memory forgetting and decay operations.
 */

import type { AppContext } from '../../core/context.js';
import { createForgettingService } from '../../services/forgetting/index.js';
import type {
  AnalyzeParams,
  ForgetParams,
  ForgettingStrategy,
  EntryType,
} from '../../services/forgetting/types.js';

// =============================================================================
// TYPES
// =============================================================================

interface AnalyzeInput {
  action: 'analyze';
  scopeType: string;
  scopeId?: string;
  entryTypes?: string[];
  strategy?: string;
  staleDays?: number;
  minAccessCount?: number;
  importanceThreshold?: number;
  limit?: number;
}

interface ForgetInput {
  action: 'forget';
  scopeType: string;
  scopeId?: string;
  entryTypes?: string[];
  strategy?: string;
  staleDays?: number;
  minAccessCount?: number;
  importanceThreshold?: number;
  limit?: number;
  dryRun?: boolean;
  agentId?: string;
}

interface StatusInput {
  action: 'status';
}

type ForgettingInput = AnalyzeInput | ForgetInput | StatusInput;

// =============================================================================
// HANDLERS
// =============================================================================

export const forgettingHandlers = {
  /**
   * Analyze entries and identify forgetting candidates.
   */
  async analyze(context: AppContext, input: AnalyzeInput) {
    const service = createForgettingService({ db: context.db });

    const params: AnalyzeParams = {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      entryTypes: input.entryTypes as EntryType[] | undefined,
      strategy: input.strategy as ForgettingStrategy | undefined,
      staleDays: input.staleDays,
      minAccessCount: input.minAccessCount,
      importanceThreshold: input.importanceThreshold,
      limit: input.limit,
    };

    const result = await service.analyze(params);
    // ForgettingResult already has success field
    return result;
  },

  /**
   * Execute forgetting on identified candidates.
   */
  async forget(context: AppContext, input: ForgetInput) {
    const service = createForgettingService({ db: context.db });

    const params: ForgetParams = {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      entryTypes: input.entryTypes as EntryType[] | undefined,
      strategy: input.strategy as ForgettingStrategy | undefined,
      staleDays: input.staleDays,
      minAccessCount: input.minAccessCount,
      importanceThreshold: input.importanceThreshold,
      limit: input.limit,
      dryRun: input.dryRun,
      agentId: input.agentId,
    };

    const result = await service.forget(params);
    // ForgettingResult already has success field
    return result;
  },

  /**
   * Get current forgetting service status.
   */
  async status(context: AppContext, _input: StatusInput) {
    const service = createForgettingService({ db: context.db });
    const status = service.getStatus();

    return {
      success: true,
      status,
    };
  },
};

// =============================================================================
// ROUTER
// =============================================================================

export async function handleForgetting(
  context: AppContext,
  input: ForgettingInput
): Promise<unknown> {
  switch (input.action) {
    case 'analyze':
      return forgettingHandlers.analyze(context, input);
    case 'forget':
      return forgettingHandlers.forget(context, input);
    case 'status':
      return forgettingHandlers.status(context, input);
    default:
      throw new Error(`Unknown action: ${(input as any).action}`);
  }
}

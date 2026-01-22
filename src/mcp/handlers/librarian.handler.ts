/**
 * Librarian MCP Handler
 *
 * Handles MCP requests for the Librarian Agent.
 */

import type { AppContext } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getLibrarianSchedulerStatus } from '../../services/librarian/scheduler.service.js';
import { generateId } from '../../db/repositories/base.js';
import { formatError } from '../errors.js';
import {
  getOptionalParam,
  isScopeType,
  isRecommendationStatus,
  isString,
  isNumber,
  isBoolean,
} from '../../utils/type-guards.js';
import type { IContextDetectionService } from '../../services/context-detection.service.js';
import type { ScopeType } from '../../db/schema/types.js';
import type { IRecommendationStore } from '../../services/librarian/recommendations/recommendation-store.js';
import {
  getMaintenanceJobManager,
  type MaintenanceJobStatus,
} from '../../services/librarian/maintenance/job-manager.js';
import { createMaintenanceJobRepository } from '../../db/repositories/maintenance-jobs.js';

const logger = createComponentLogger('librarian-handler');

let jobManagerInitialized = false;

async function ensureJobManagerInitialized(context: AppContext): Promise<void> {
  if (jobManagerInitialized) return;

  const jobManager = getMaintenanceJobManager();
  if (context.db && context.sqlite) {
    const repo = createMaintenanceJobRepository({ db: context.db, sqlite: context.sqlite });
    jobManager.setRepository(repo);
    await jobManager.initialize();
  }
  jobManagerInitialized = true;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of scope resolution for librarian operations
 */
export interface ResolvedScope {
  scopeType: ScopeType;
  scopeId: string | undefined;
  warning?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get librarian service from context
 */
function getLibrarianServiceFromContext(context: AppContext) {
  return context.services.librarian;
}

/**
 * Resolve effective scope for librarian operations.
 *
 * When scopeType='project' and no scopeId is provided, uses the context detection
 * service to resolve the projectId from the active session or cwd.
 *
 * This ensures maintenance operations always run on the correct project,
 * preventing issues from stale context detection.
 *
 * @param contextDetection - Optional context detection service
 * @param scopeType - The requested scope type
 * @param scopeId - The explicit scope ID (if provided)
 * @returns Resolved scope with potentially resolved scopeId
 */
export async function resolveEffectiveScope(
  contextDetection: IContextDetectionService | undefined,
  scopeType: ScopeType,
  scopeId: string | undefined
): Promise<ResolvedScope> {
  // If no context detection service, fall back to original behavior
  if (!contextDetection) {
    return {
      scopeType,
      scopeId,
    };
  }

  // Try to resolve the project scope using context detection
  try {
    const resolved = await contextDetection.resolveProjectScope(scopeType, scopeId);
    return {
      scopeType,
      scopeId: resolved.projectId || undefined,
      warning: resolved.warning,
    };
  } catch {
    // If resolution fails (e.g., no active session), fall back to original behavior
    logger.debug(
      { scopeType, scopeId },
      'Context detection failed for scope resolution, using fallback'
    );
    return {
      scopeType,
      scopeId,
    };
  }
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Run pattern detection analysis
 */
const analyze: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);
  const lookbackDays = getOptionalParam(params, 'lookbackDays', isNumber);
  const dryRun = getOptionalParam(params, 'dryRun', isBoolean);

  // Resolve effective scope using session binding
  const contextDetection = context.services.contextDetection;
  const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
  const { scopeType, scopeId, warning: scopeWarning } = resolved;

  logger.info(
    { scopeType, scopeId, lookbackDays, dryRun, scopeWarning },
    'Starting librarian analysis'
  );

  try {
    const result = await service.analyze({
      scopeType,
      scopeId,
      lookbackDays,
      dryRun,
      runId: generateId(),
      initiatedBy: 'mcp-handler',
    });

    return {
      success: true,
      ...(scopeWarning && { warning: scopeWarning }),
      analysis: {
        runId: result.runId,
        dryRun: result.dryRun,
        timing: result.timing,
        stats: result.stats,
        recommendations: result.generatedRecommendations.map((rec) => ({
          title: rec.input.title,
          confidence: rec.input.confidence,
          patternCount: rec.input.patternCount,
          type: rec.input.type,
        })),
      },
    };
  } catch (error) {
    logger.error({ error }, 'Librarian analysis failed');
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Get librarian status
 */
const status: ContextAwareHandler = async (context, _params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  try {
    const serviceStatus = await service.getStatus();
    const schedulerStatus = getLibrarianSchedulerStatus();

    const jobManager = getMaintenanceJobManager();
    const runningJobs = jobManager.getRunningJobs();
    const recentJobs = jobManager.listJobs().slice(0, 5);

    return {
      success: true,
      status: {
        service: {
          enabled: serviceStatus.enabled,
          config: serviceStatus.config,
          pendingRecommendations: serviceStatus.pendingRecommendations,
          lastAnalysis: serviceStatus.lastAnalysis,
        },
        scheduler: schedulerStatus,
        maintenanceJobs: {
          running: runningJobs.map((j) => jobManager.getJobSummary(j.id)),
          recent: recentJobs.map((j) => jobManager.getJobSummary(j.id)),
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * List pending recommendations
 */
const list_recommendations: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const store = service.getRecommendationStore();
  const statusFilter = getOptionalParam(params, 'status', isRecommendationStatus);
  const minConfidence = getOptionalParam(params, 'minConfidence', isNumber);
  const limit = getOptionalParam(params, 'limit', isNumber);
  const offset = getOptionalParam(params, 'offset', isNumber);
  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType);
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);

  // Resolve effective scope using session binding (only when scopeType is provided)
  let scopeType = rawScopeType;
  let scopeId = rawScopeId;
  let scopeWarning: string | undefined;

  if (rawScopeType) {
    const contextDetection = context.services.contextDetection;
    const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
    scopeType = resolved.scopeType;
    scopeId = resolved.scopeId;
    scopeWarning = resolved.warning;
  }

  try {
    const recommendations = await store.list(
      {
        status: statusFilter ?? 'pending',
        minConfidence,
        scopeType,
        scopeId,
        inherit: true,
      },
      { limit, offset }
    );

    const count = await store.count({
      status: statusFilter ?? 'pending',
      scopeType,
      scopeId,
    });

    return {
      success: true,
      ...(scopeWarning && { warning: scopeWarning }),
      recommendations: recommendations.map((rec) => ({
        id: rec.id,
        title: rec.title,
        type: rec.type,
        status: rec.status,
        confidence: rec.confidence,
        patternCount: rec.patternCount,
        createdAt: rec.createdAt,
        expiresAt: rec.expiresAt,
      })),
      total: count,
      limit,
      offset,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Show recommendation details
 */
const show_recommendation: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const recommendation = await store.getById(recommendationId, true);

    if (!recommendation) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    return {
      success: true,
      recommendation: {
        ...recommendation,
        // JSON.parse returns unknown - parse string array from DB
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        sourceExperienceIds: JSON.parse(recommendation.sourceExperienceIds),
      },
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

const isMissedExtractionType = (type: string): boolean => {
  return type === 'missed_guideline' || type === 'missed_knowledge' || type === 'missed_tool';
};

const approve: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const recommendation = await store.getById(recommendationId);
    if (!recommendation) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    if (isMissedExtractionType(recommendation.type)) {
      return await approveMissedExtraction(context, recommendation, store, reviewedBy, notes);
    } else {
      return await approvePatternPromotion(context, recommendation, store, reviewedBy, notes);
    }
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

async function approvePatternPromotion(
  context: AppContext,
  recommendation: Awaited<ReturnType<IRecommendationStore['getById']>>,
  store: IRecommendationStore,
  reviewedBy: string | undefined,
  notes: string | undefined
) {
  if (!recommendation) {
    return { success: false, error: 'Recommendation not found' };
  }

  const promotionService = context.services.experiencePromotion;
  if (!promotionService) {
    return {
      success: false,
      error: 'Experience promotion service not available',
    };
  }

  if (!recommendation.exemplarExperienceId) {
    return {
      success: false,
      error: 'Recommendation has no exemplar experience to promote',
    };
  }

  const promotionResult = await promotionService.promote(recommendation.exemplarExperienceId, {
    toLevel: recommendation.type as 'strategy' | 'skill',
    pattern: recommendation.pattern ?? undefined,
    applicability: recommendation.applicability ?? undefined,
    contraindications: recommendation.contraindications ?? undefined,
    reason: recommendation.rationale ?? undefined,
    promotedBy: reviewedBy ?? 'mcp-handler',
  });

  const updated = await store.approve(
    recommendation.id,
    reviewedBy ?? 'mcp-handler',
    promotionResult.experience.id,
    promotionResult.createdTool?.id,
    notes
  );

  if (!updated) {
    return {
      success: false,
      error: 'Failed to update recommendation after promotion',
    };
  }

  logger.info(
    {
      recommendationId: recommendation.id,
      reviewedBy,
      promotedExperienceId: promotionResult.experience.id,
      createdToolId: promotionResult.createdTool?.id,
    },
    'Recommendation approved and promotion completed'
  );

  return {
    success: true,
    recommendation: updated,
    promotedExperience: promotionResult.experience,
    createdTool: promotionResult.createdTool,
    message: 'Recommendation approved and experience promoted successfully.',
  };
}

interface ExtractedEntryData {
  content: string;
  category?: string;
  tags?: string[];
  priority?: number;
}

async function approveMissedExtraction(
  context: AppContext,
  recommendation: Awaited<ReturnType<IRecommendationStore['getById']>>,
  store: IRecommendationStore,
  reviewedBy: string | undefined,
  notes: string | undefined
) {
  if (!recommendation) {
    return { success: false, error: 'Recommendation not found' };
  }

  if (!recommendation.extractedEntry) {
    return {
      success: false,
      error: 'Missed extraction recommendation has no extracted entry data',
    };
  }

  let entryData: ExtractedEntryData;
  try {
    entryData = JSON.parse(recommendation.extractedEntry) as ExtractedEntryData;
  } catch {
    return {
      success: false,
      error: 'Failed to parse extracted entry data',
    };
  }

  let createdEntryId: string | undefined;
  let createdEntryType: string | undefined;

  const agentId = reviewedBy ?? 'mcp-handler';

  if (recommendation.type === 'missed_guideline') {
    const result = await context.repos.guidelines.create({
      scopeType: recommendation.scopeType,
      scopeId: recommendation.scopeId ?? undefined,
      name: recommendation.title,
      content: entryData.content,
      category: entryData.category,
      priority: entryData.priority ?? 50,
      createdBy: agentId,
    });
    createdEntryId = result.id;
    createdEntryType = 'guideline';
  } else if (recommendation.type === 'missed_knowledge') {
    const result = await context.repos.knowledge.create({
      scopeType: recommendation.scopeType,
      scopeId: recommendation.scopeId ?? undefined,
      title: recommendation.title,
      content: entryData.content,
      category: (entryData.category as 'decision' | 'fact' | 'context' | 'reference') ?? 'fact',
      createdBy: agentId,
    });
    createdEntryId = result.id;
    createdEntryType = 'knowledge';
  } else if (recommendation.type === 'missed_tool') {
    const result = await context.repos.tools.create({
      scopeType: recommendation.scopeType,
      scopeId: recommendation.scopeId ?? undefined,
      name: recommendation.title,
      description: entryData.content,
      category: (entryData.category as 'mcp' | 'cli' | 'function' | 'api') ?? 'cli',
      createdBy: agentId,
    });
    createdEntryId = result.id;
    createdEntryType = 'tool';
  }

  if (!createdEntryId) {
    return {
      success: false,
      error: `Unknown missed extraction type: ${recommendation.type}`,
    };
  }

  const updated = await store.update(recommendation.id, {
    status: 'approved',
    reviewedBy: agentId,
    reviewNotes: notes,
  });

  if (!updated) {
    return {
      success: false,
      error: 'Failed to update recommendation after creating entry',
    };
  }

  logger.info(
    {
      recommendationId: recommendation.id,
      reviewedBy,
      createdEntryId,
      createdEntryType,
    },
    'Missed extraction recommendation approved and entry created'
  );

  return {
    success: true,
    recommendation: updated,
    createdEntry: {
      id: createdEntryId,
      type: createdEntryType,
      title: recommendation.title,
    },
    message: `Missed extraction approved. Created ${createdEntryType}: ${recommendation.title}`,
  };
}

/**
 * Reject a recommendation
 */
const reject: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.reject(recommendationId, reviewedBy ?? 'mcp-handler', notes);

    if (!updated) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    logger.info({ recommendationId, reviewedBy }, 'Recommendation rejected');

    return {
      success: true,
      recommendation: updated,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

/**
 * Run maintenance tasks in background (non-blocking)
 * Returns job ID immediately, poll with get_job_status
 */
const run_maintenance: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  if (!service.hasMaintenanceOrchestrator()) {
    return {
      success: false,
      error: 'Maintenance orchestrator not initialized. Ensure librarian is properly configured.',
    };
  }

  await ensureJobManagerInitialized(context);

  const rawScopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const rawScopeId = getOptionalParam(params, 'scopeId', isString);
  const dryRun = getOptionalParam(params, 'dryRun', isBoolean) ?? false;
  const initiatedBy = getOptionalParam(params, 'initiatedBy', isString) ?? 'mcp-handler';

  const contextDetection = context.services.contextDetection;
  const resolved = await resolveEffectiveScope(contextDetection, rawScopeType, rawScopeId);
  const { scopeType, scopeId, warning: scopeWarning } = resolved;

  type MaintenanceTask =
    | 'consolidation'
    | 'forgetting'
    | 'graphBackfill'
    | 'latentPopulation'
    | 'tagRefinement'
    | 'semanticEdgeInference';
  let tasks: MaintenanceTask[] | undefined;
  if (params.tasks && Array.isArray(params.tasks)) {
    const validTasks = [
      'consolidation',
      'forgetting',
      'graphBackfill',
      'latentPopulation',
      'tagRefinement',
      'semanticEdgeInference',
    ];
    tasks = (params.tasks as string[]).filter((t): t is MaintenanceTask => validTasks.includes(t));
  }

  const jobManager = getMaintenanceJobManager();

  // Check if we can start a new job
  if (!jobManager.canStartJob()) {
    const runningJobs = jobManager.getRunningJobs();
    return {
      success: false,
      error: 'A maintenance job is already running',
      runningJob: runningJobs[0] ? jobManager.getJobSummary(runningJobs[0].id) : undefined,
    };
  }

  // Create job
  const request = { scopeType, scopeId, tasks, dryRun, initiatedBy };
  const job = await jobManager.createJob(request);

  logger.info({ jobId: job.id, scopeType, scopeId, tasks, dryRun }, 'Created maintenance job');

  // Start job execution in background (fire and forget)
  await jobManager.startJob(job.id);

  // Run maintenance asynchronously with progress updates
  void (async () => {
    try {
      const result = await service.runMaintenance(request, (taskName, status, taskResult) => {
        void jobManager.updateTaskProgress(job.id, taskName, { status, result: taskResult });
      });
      await jobManager.completeJob(job.id, result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await jobManager.failJob(job.id, errorMsg);
      logger.error({ jobId: job.id, error: errorMsg }, 'Maintenance job failed');
    }
  })();

  return {
    success: true,
    ...(scopeWarning && { warning: scopeWarning }),
    job: {
      id: job.id,
      status: job.status,
      message: 'Maintenance job started. Poll with get_job_status action.',
      tasks: job.progress.tasks.map((t: { name: string }) => t.name),
    },
  };
};

/**
 * Get status of a maintenance job
 */
const get_job_status: ContextAwareHandler = async (context, params) => {
  const jobId = getOptionalParam(params, 'jobId', isString);

  if (!jobId) {
    return {
      success: false,
      error: 'jobId is required',
    };
  }

  await ensureJobManagerInitialized(context);
  const jobManager = getMaintenanceJobManager();
  const job = await jobManager.getJobWithFallback(jobId);
  if (!job) {
    return {
      success: false,
      error: `Job not found: ${jobId}`,
    };
  }

  const summary = jobManager.getJobSummary(jobId);
  return {
    success: true,
    job: summary,
  };
};

/**
 * List all maintenance jobs
 */
const list_jobs: ContextAwareHandler = async (context, params) => {
  const statusFilter = getOptionalParam(params, 'status', isString) as
    | MaintenanceJobStatus
    | undefined;

  await ensureJobManagerInitialized(context);
  const jobManager = getMaintenanceJobManager();
  const jobs = await jobManager.listJobsWithFallback(statusFilter);

  return {
    success: true,
    jobs: jobs.map((j) => jobManager.getJobSummary(j.id)),
    count: jobs.length,
  };
};

/**
 * Skip a recommendation (defer for later)
 */
const skip: ContextAwareHandler = async (context, params) => {
  const service = getLibrarianServiceFromContext(context);

  if (!service) {
    return {
      success: false,
      error: 'Librarian service not available',
    };
  }

  const recommendationId = getOptionalParam(params, 'recommendationId', isString);
  const reviewedBy = getOptionalParam(params, 'reviewedBy', isString);
  const notes = getOptionalParam(params, 'notes', isString);

  if (!recommendationId) {
    return {
      success: false,
      error: 'recommendationId is required',
    };
  }

  const store = service.getRecommendationStore();

  try {
    const updated = await store.skip(recommendationId, reviewedBy ?? 'mcp-handler', notes);

    if (!updated) {
      return {
        success: false,
        error: 'Recommendation not found',
      };
    }

    logger.info({ recommendationId, reviewedBy }, 'Recommendation skipped');

    return {
      success: true,
      recommendation: updated,
    };
  } catch (error) {
    return {
      success: false,
      ...formatError(error),
    };
  }
};

export const librarianHandlers = {
  analyze,
  status,
  list_recommendations,
  show_recommendation,
  approve,
  reject,
  skip,
  run_maintenance,
  get_job_status,
  list_jobs,
};

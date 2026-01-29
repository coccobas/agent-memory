/**
 * Error Analysis Maintenance Task
 *
 * Analyzes cross-session error patterns from the error log and generates
 * recommendations for corrective knowledge/guidelines. Detects errors that
 * appear in 2+ different sessions within a lookback window, indicating
 * systemic issues that should be addressed with memory entries.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { ScopeType } from '../../../db/schema.js';
import type { ErrorAnalyzerService } from '../../learning/error-analyzer.service.js';
import type { ErrorLogRepository } from '../../../db/repositories/error-log.js';

const logger = createComponentLogger('error-analysis');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Error analysis task configuration
 */
export interface ErrorAnalysisConfig {
  /** Enable error analysis during maintenance */
  enabled: boolean;
  /** Days to look back for errors (default: 7) */
  lookbackDays: number;
  /** Minimum sessions an error must appear in to be considered a pattern */
  minSessionsForPattern: number;
  /** Maximum errors to analyze per run */
  maxErrors: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ERROR_ANALYSIS_CONFIG: ErrorAnalysisConfig = {
  enabled: false, // Opt-in task
  lookbackDays: 7,
  minSessionsForPattern: 2,
  maxErrors: 50,
};

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from error analysis task
 */
export interface ErrorAnalysisResult {
  /** Task was executed */
  executed: boolean;
  /** Errors analyzed */
  errorsAnalyzed: number;
  /** Patterns detected */
  patternsDetected: number;
  /** Recommendations created */
  recommendationsCreated: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

// =============================================================================
// TASK RUNNER
// =============================================================================

export interface ErrorAnalysisDeps {
  repos: Repositories;
  errorAnalyzer?: ErrorAnalyzerService;
  errorLogRepo?: ErrorLogRepository;
}

/**
 * Run error analysis task
 */
export async function runErrorAnalysis(
  deps: ErrorAnalysisDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: ErrorAnalysisConfig
): Promise<ErrorAnalysisResult> {
  const startTime = Date.now();
  const result: ErrorAnalysisResult = {
    executed: true,
    errorsAnalyzed: 0,
    patternsDetected: 0,
    recommendationsCreated: 0,
    durationMs: 0,
  };

  try {
    // Check if error analyzer service is available
    if (!deps.errorAnalyzer) {
      logger.debug('Error analysis skipped: error analyzer service not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Check if error log repository is available
    if (!deps.errorLogRepo) {
      logger.debug('Error analysis skipped: error log repository not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Only support project scope for now
    if (request.scopeType !== 'project' || !request.scopeId) {
      logger.debug(
        { scopeType: request.scopeType },
        'Error analysis skipped: only project scope supported'
      );
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const projectId = request.scopeId;

    // Query errors from last N days
    logger.debug(
      { projectId, lookbackDays: config.lookbackDays },
      'Querying errors for cross-session analysis'
    );

    const errors = await deps.errorLogRepo.getByProject(projectId, config.lookbackDays);

    if (errors.length === 0) {
      logger.debug({ projectId }, 'No errors found in lookback window');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    result.errorsAnalyzed = errors.length;

    // Group errors by signature to find cross-session patterns
    const errorsBySignature = new Map<string, Set<string>>();
    for (const error of errors) {
      if (!errorsBySignature.has(error.errorSignature)) {
        errorsBySignature.set(error.errorSignature, new Set());
      }
      errorsBySignature.get(error.errorSignature)!.add(error.sessionId);
    }

    // Filter to patterns appearing in 2+ sessions
    const crossSessionPatterns = Array.from(errorsBySignature.entries()).filter(
      ([_signature, sessions]) => sessions.size >= config.minSessionsForPattern
    );

    if (crossSessionPatterns.length === 0) {
      logger.debug({ projectId }, 'No cross-session error patterns detected');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    logger.info(
      {
        projectId,
        totalErrors: errors.length,
        crossSessionPatterns: crossSessionPatterns.length,
      },
      'Cross-session error patterns detected'
    );

    // Analyze patterns with LLM
    const analysisResult = await deps.errorAnalyzer.analyzeCrossSessionPatterns(
      projectId,
      config.lookbackDays
    );

    result.patternsDetected = analysisResult.patterns.length;

    // Create recommendations for each pattern (if not dry run)
    if (!request.dryRun && analysisResult.patterns.length > 0) {
      for (const pattern of analysisResult.patterns) {
        try {
          // Generate corrective entry
          const correctiveEntry = await deps.errorAnalyzer.generateCorrectiveEntry(pattern);

          // Store as recommendation (not auto-promote to project scope)
          // Recommendations require human review before promotion
          // TODO: Store recommendation in recommendations table
          // For now, just log it
          logger.info(
            {
              projectId,
              patternType: pattern.patternType,
              description: pattern.description,
              frequency: pattern.frequency,
              confidence: pattern.confidence,
              entryType: correctiveEntry.type,
              createdBy: request.initiatedBy ?? 'error-analysis-maintenance',
            },
            'Generated error correction recommendation'
          );

          result.recommendationsCreated++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn(
            { patternType: pattern.patternType, error: errorMsg },
            'Failed to create recommendation for pattern'
          );
        }
      }
    }

    logger.info(
      {
        projectId,
        errorsAnalyzed: result.errorsAnalyzed,
        patternsDetected: result.patternsDetected,
        recommendationsCreated: result.recommendationsCreated,
        dryRun: request.dryRun,
      },
      'Error analysis completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMsg }, 'Error analysis task failed');
    result.errors = [errorMsg];
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

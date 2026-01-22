import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists, getObserveState } from './session.js';
import { hasWarnedReview, isReviewSuspended, setWarnedReview } from './state-file.js';
import { ingestTranscript, type TranscriptIngestResult } from './transcript-ingest.js';
import { writeSessionSummaryFile } from './session-summary.js';
import { getHookLearningService } from '../../services/learning/index.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { detectComplexitySignals } from '../../utils/transcript-analysis.js';
import type { TurnData } from '../../services/capture/types.js';

const logger = createComponentLogger('stop-command');

/**
 * Configuration for Stop hook
 */
export interface StopConfig {
  /** Enable complexity detection (default: true) */
  enableComplexityDetection: boolean;
  /** Minimum messages to consider complex (default: 10) */
  complexityMessageThreshold: number;
  /** Minimum lines to consider complex (default: 50) */
  complexityLineThreshold: number;
  /** Enable early capture for complex conversations (default: true) */
  enableEarlyCapture: boolean;
}

interface ComplexityAssessment {
  isComplex: boolean;
  score: number;
  reasons: string[];
}

export interface ComplexityAssessmentWithSignals extends ComplexityAssessment {
  volumeScore: number;
  signalScore?: number;
  hasErrorRecovery?: boolean;
  hasDecisions?: boolean;
  hasLearning?: boolean;
}

/**
 * Get configuration from environment variables
 */
function getConfig(overrides?: Partial<StopConfig>): StopConfig {
  const envComplexityDetection = process.env.AGENT_MEMORY_STOP_COMPLEXITY_DETECTION;
  const envMessageThreshold = process.env.AGENT_MEMORY_STOP_MESSAGE_THRESHOLD;
  const envLineThreshold = process.env.AGENT_MEMORY_STOP_LINE_THRESHOLD;
  const envEarlyCapture = process.env.AGENT_MEMORY_STOP_EARLY_CAPTURE;

  return {
    enableComplexityDetection:
      overrides?.enableComplexityDetection ??
      (envComplexityDetection !== 'false' && envComplexityDetection !== '0'),
    complexityMessageThreshold:
      overrides?.complexityMessageThreshold ??
      (envMessageThreshold ? parseInt(envMessageThreshold, 10) : 10),
    complexityLineThreshold:
      overrides?.complexityLineThreshold ??
      (envLineThreshold ? parseInt(envLineThreshold, 10) : 50),
    enableEarlyCapture:
      overrides?.enableEarlyCapture ?? (envEarlyCapture !== 'false' && envEarlyCapture !== '0'),
  };
}

function assessConversationComplexity(
  ingestResult: TranscriptIngestResult,
  config: StopConfig
): ComplexityAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (ingestResult.appended >= config.complexityMessageThreshold) {
    reasons.push(
      `${ingestResult.appended} messages appended (threshold: ${config.complexityMessageThreshold})`
    );
    score += 0.4;
  }

  if (ingestResult.linesRead >= config.complexityLineThreshold) {
    reasons.push(
      `${ingestResult.linesRead} lines processed (threshold: ${config.complexityLineThreshold})`
    );
    score += 0.3;
  }

  if (ingestResult.wasTruncated) {
    reasons.push('Transcript was truncated (indicates long session)');
    score += 0.3;
  }

  const isComplex = score >= 0.5;

  return { isComplex, score, reasons };
}

export function assessConversationComplexityWithSignals(
  ingestResult: { appended: number; linesRead: number; wasTruncated: boolean },
  config: { complexityMessageThreshold: number; complexityLineThreshold: number },
  transcript?: TurnData[]
): ComplexityAssessmentWithSignals {
  const reasons: string[] = [];
  let volumeScore = 0;

  if (ingestResult.appended >= config.complexityMessageThreshold) {
    reasons.push(
      `${ingestResult.appended} messages appended (threshold: ${config.complexityMessageThreshold})`
    );
    volumeScore += 0.4;
  }

  if (ingestResult.linesRead >= config.complexityLineThreshold) {
    reasons.push(
      `${ingestResult.linesRead} lines processed (threshold: ${config.complexityLineThreshold})`
    );
    volumeScore += 0.3;
  }

  if (ingestResult.wasTruncated) {
    reasons.push('Transcript was truncated (indicates long session)');
    volumeScore += 0.3;
  }

  if (!transcript || transcript.length === 0) {
    const isComplex = volumeScore >= 0.5;
    return {
      isComplex,
      score: volumeScore,
      reasons,
      volumeScore,
    };
  }

  const signals = detectComplexitySignals(transcript);

  if (signals.hasErrorRecovery) {
    reasons.push('Error recovery patterns detected');
  }
  if (signals.hasDecisions) {
    reasons.push('Decision-making patterns detected');
  }
  if (signals.hasLearning) {
    reasons.push('Learning moments detected');
  }

  const combinedScore = volumeScore * 0.4 + signals.score * 0.6;
  const isComplex = combinedScore >= 0.4 || signals.score >= 0.6;

  return {
    isComplex,
    score: combinedScore,
    reasons,
    volumeScore,
    signalScore: signals.score,
    hasErrorRecovery: signals.hasErrorRecovery,
    hasDecisions: signals.hasDecisions,
    hasLearning: signals.hasLearning,
  };
}

/**
 * Trigger lightweight capture for complex conversations
 *
 * This runs experience extraction without full librarian analysis
 */
async function triggerLightweightCapture(
  sessionId: string,
  projectId: string | undefined,
  assessment: ComplexityAssessment
): Promise<{ triggered: boolean; experienceCreated?: boolean }> {
  try {
    const learningService = getHookLearningService();
    const analyticsService = getHookAnalyticsService();

    // Record complexity detection metric
    await analyticsService.recordNotification({
      sessionId,
      projectId,
      type: 'complexity_detected',
      message: assessment.reasons.join('; '),
      severity: 'info',
      category: 'stop_hook',
    });

    // Trigger analysis if available (non-blocking)
    const analysisResult = await learningService.triggerAnalysis({
      sessionId,
      projectId,
      dryRun: false,
    });

    if (analysisResult.triggered) {
      logger.info(
        {
          sessionId,
          complexityScore: assessment.score,
          patternsFound: analysisResult.patternsFound,
        },
        'Early capture triggered for complex conversation'
      );
      return { triggered: true, experienceCreated: (analysisResult.patternsFound ?? 0) > 0 };
    }

    return { triggered: false };
  } catch (error) {
    // Non-blocking
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      },
      'Failed to trigger lightweight capture (non-blocking)'
    );
    return { triggered: false };
  }
}

export async function runStopCommand(params: {
  projectId?: string;
  agentId?: string;
  input: ClaudeHookInput;
  config?: Partial<StopConfig>;
}): Promise<HookCommandResult> {
  const { projectId, agentId, input, config: configOverrides } = params;
  const config = getConfig(configOverrides);

  const sessionId = input.session_id;
  const transcriptPath = input.transcript_path;
  const cwd = input.cwd || process.cwd();

  // Handle missing session_id gracefully - exit successfully but skip processing
  // This can happen when Claude Code sends minimal/empty input
  if (!sessionId) {
    logger.debug('Stop hook called without session_id, skipping (no-op)');
    return { exitCode: 0, stdout: [], stderr: [] };
  }
  // Handle missing transcript_path gracefully - exit successfully but skip processing
  if (!transcriptPath) {
    logger.debug({ sessionId }, 'Stop hook called without transcript_path, skipping (no-op)');
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  await ensureSessionIdExists(sessionId, projectId);

  // Ingest transcript and capture result for complexity analysis
  const ingestResult = await ingestTranscript({
    sessionId,
    transcriptPath,
    projectId,
    agentId,
    cwd,
  });

  logger.debug(
    {
      sessionId,
      appended: ingestResult.appended,
      linesRead: ingestResult.linesRead,
      wasTruncated: ingestResult.wasTruncated,
    },
    'Transcript ingested'
  );

  // Step 1: Complexity detection and early capture
  if (config.enableComplexityDetection && ingestResult.appended > 0) {
    const assessment = assessConversationComplexity(ingestResult, config);

    if (assessment.isComplex) {
      logger.info(
        {
          sessionId,
          complexityScore: assessment.score,
          reasons: assessment.reasons,
        },
        'Complex conversation detected'
      );

      if (config.enableEarlyCapture) {
        await triggerLightweightCapture(sessionId, projectId, assessment);
      }
    }
  }

  // Step 2: Check if review is suspended
  if (isReviewSuspended(sessionId)) {
    return { exitCode: 0, stdout: [], stderr: [] };
  }

  // Step 3: Write session summary
  const observe = await getObserveState(sessionId);
  const { itemCount } = await writeSessionSummaryFile(sessionId, cwd);

  // Step 4: Review reminder logic
  if (!observe.committedAt && !hasWarnedReview(sessionId)) {
    setWarnedReview(sessionId);
    if (itemCount > 0) {
      return {
        exitCode: 0,
        stdout: [],
        stderr: [`✓ Session tracked (${itemCount} items) - see .claude/session-summary.md`],
      };
    }
    return { exitCode: 0, stdout: [], stderr: ['✓ Session tracked - no new items'] };
  }

  if ((observe.needsReviewCount ?? 0) > 0 && !observe.reviewedAt) {
    return {
      exitCode: 0,
      stdout: [],
      stderr: [
        `✓ Session (${itemCount} items, ${observe.needsReviewCount} need review) - run: npx agent-memory review`,
      ],
    };
  }

  return { exitCode: 0, stdout: [], stderr: [] };
}

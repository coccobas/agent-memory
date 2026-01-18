import type { ClaudeHookInput, HookCommandResult } from './types.js';
import { ensureSessionIdExists, getObserveState } from './session.js';
import { hasWarnedReview, isReviewSuspended, setWarnedReview } from './state-file.js';
import { ingestTranscript, type TranscriptIngestResult } from './transcript-ingest.js';
import { writeSessionSummaryFile } from './session-summary.js';
import { getHookLearningService } from '../../services/learning/index.js';
import { getHookAnalyticsService } from '../../services/analytics/index.js';
import { createComponentLogger } from '../../utils/logger.js';

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

/**
 * Complexity assessment result
 */
interface ComplexityAssessment {
  isComplex: boolean;
  score: number;
  reasons: string[];
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

/**
 * Assess conversation complexity based on ingestion results
 *
 * Heuristics:
 * - Message count > threshold (indicates substantial conversation)
 * - Lines read > threshold (indicates long transcript)
 * - Truncation detected (indicates very long session)
 */
function assessConversationComplexity(
  ingestResult: TranscriptIngestResult,
  config: StopConfig
): ComplexityAssessment {
  const reasons: string[] = [];
  let score = 0;

  // Check message count
  if (ingestResult.appended >= config.complexityMessageThreshold) {
    reasons.push(`${ingestResult.appended} messages appended (threshold: ${config.complexityMessageThreshold})`);
    score += 0.4;
  }

  // Check lines read
  if (ingestResult.linesRead >= config.complexityLineThreshold) {
    reasons.push(`${ingestResult.linesRead} lines processed (threshold: ${config.complexityLineThreshold})`);
    score += 0.3;
  }

  // Check for truncation (indicates very long session)
  if (ingestResult.wasTruncated) {
    reasons.push('Transcript was truncated (indicates long session)');
    score += 0.3;
  }

  // Consider complex if score >= 0.5
  const isComplex = score >= 0.5;

  return { isComplex, score, reasons };
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

  if (!sessionId) {
    return { exitCode: 2, stdout: [], stderr: ['Missing session_id in hook input'] };
  }
  if (!transcriptPath) {
    return { exitCode: 2, stdout: [], stderr: ['Missing transcript_path in hook input'] };
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

/**
 * Experience handlers
 *
 * Uses the generic handler factory for standard CRUD operations,
 * plus custom handlers for experience-specific operations:
 * - promote (case→strategy or strategy→skill)
 * - record_outcome (update success/failure metrics)
 * - add_step (add trajectory step)
 */

import {
  type CreateExperienceInput,
  type UpdateExperienceInput,
  type ExperienceWithVersion,
  type TrajectoryStepInput,
  type PromoteExperienceInput,
  type RecordOutcomeInput,
} from '../../db/repositories/experiences.js';
import { createCrudHandlers } from './factory.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isBoolean,
  isArrayOfObjects,
  isObject,
  isScopeType,
} from '../../utils/type-guards.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { logAction } from '../../services/audit.service.js';
import type { ScopeType, ExperienceLevel, ExperienceSource } from '../../db/schema.js';
import type { AppContext, IExtractionService } from '../../core/context.js';
import type { ContextAwareHandler } from '../descriptors/types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('experiences:learn');
import {
  createExperienceCaptureModule,
  type RecordCaseParams,
  type TurnData,
  type TrajectoryStep,
} from '../../services/capture/index.js';

// Type guards for experience-specific types
function isExperienceLevel(v: unknown): v is ExperienceLevel {
  return v === 'case' || v === 'strategy';
}

function isExperienceSource(v: unknown): v is ExperienceSource {
  return v === 'observation' || v === 'reflection' || v === 'user' || v === 'promotion';
}

function isPromoteLevel(v: unknown): v is 'strategy' | 'skill' {
  return v === 'strategy' || v === 'skill';
}

function isToolCategory(v: unknown): v is 'mcp' | 'cli' | 'function' | 'api' {
  return v === 'mcp' || v === 'cli' || v === 'function' || v === 'api';
}

// Type-specific extractors for the factory

function extractAddParams(
  params: Record<string, unknown>,
  defaults: { scopeType?: ScopeType; scopeId?: string }
): CreateExperienceInput {
  const title = getRequiredParam(params, 'title', isString);
  const level = getOptionalParam(params, 'level', isExperienceLevel) ?? 'case';
  const category = getOptionalParam(params, 'category', isString);
  const content = getRequiredParam(params, 'content', isString);
  const scenario = getOptionalParam(params, 'scenario', isString);
  const outcome = getOptionalParam(params, 'outcome', isString);
  const pattern = getOptionalParam(params, 'pattern', isString);
  const applicability = getOptionalParam(params, 'applicability', isString);
  const contraindications = getOptionalParam(params, 'contraindications', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const source = getOptionalParam(params, 'source', isExperienceSource);
  const createdBy = getOptionalParam(params, 'createdBy', isString);

  // Extract trajectory steps if provided
  let steps: TrajectoryStepInput[] | undefined;
  const stepsParam = params.steps;
  if (stepsParam !== undefined && isArrayOfObjects(stepsParam)) {
    steps = stepsParam.map((step) => {
      if (!isObject(step)) {
        throw createValidationError(
          'steps',
          'each step must be an object',
          'Provide valid step objects'
        );
      }
      const stepObj = step;
      return {
        action: getRequiredParam(stepObj, 'action', isString),
        observation: getOptionalParam(stepObj, 'observation', isString),
        reasoning: getOptionalParam(stepObj, 'reasoning', isString),
        toolUsed: getOptionalParam(stepObj, 'toolUsed', isString),
        success: getOptionalParam(stepObj, 'success', isBoolean),
        timestamp: getOptionalParam(stepObj, 'timestamp', isString),
        durationMs: getOptionalParam(stepObj, 'durationMs', isNumber),
      };
    });
  }

  // Ensure scopeType is provided (required by factory contract)
  if (!defaults.scopeType) {
    throw createValidationError('scopeType', 'is required', 'Provide a valid scope type');
  }

  return {
    scopeType: defaults.scopeType,
    scopeId: defaults.scopeId,
    title,
    level,
    category,
    content,
    scenario,
    outcome,
    pattern,
    applicability,
    contraindications,
    confidence,
    source,
    steps,
    createdBy,
  };
}

function extractUpdateParams(params: Record<string, unknown>): UpdateExperienceInput {
  const category = getOptionalParam(params, 'category', isString);
  const content = getOptionalParam(params, 'content', isString);
  const scenario = getOptionalParam(params, 'scenario', isString);
  const outcome = getOptionalParam(params, 'outcome', isString);
  const pattern = getOptionalParam(params, 'pattern', isString);
  const applicability = getOptionalParam(params, 'applicability', isString);
  const contraindications = getOptionalParam(params, 'contraindications', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const changeReason = getOptionalParam(params, 'changeReason', isString);
  const updatedBy = getOptionalParam(params, 'updatedBy', isString);

  const input: UpdateExperienceInput = {};
  if (category !== undefined) input.category = category;
  if (content !== undefined) input.content = content;
  if (scenario !== undefined) input.scenario = scenario;
  if (outcome !== undefined) input.outcome = outcome;
  if (pattern !== undefined) input.pattern = pattern;
  if (applicability !== undefined) input.applicability = applicability;
  if (contraindications !== undefined) input.contraindications = contraindications;
  if (confidence !== undefined) input.confidence = confidence;
  if (changeReason !== undefined) input.changeReason = changeReason;
  if (updatedBy !== undefined) input.updatedBy = updatedBy;

  return input;
}

function getNameValue(params: Record<string, unknown>): string {
  return getRequiredParam(params, 'title', isString);
}

function getContentForRedFlags(entry: ExperienceWithVersion): string {
  return entry.currentVersion?.content || '';
}

function getValidationData(
  params: Record<string, unknown>,
  existingEntry?: ExperienceWithVersion
): Record<string, unknown> {
  const title = existingEntry?.title ?? getOptionalParam(params, 'title', isString);
  // For updates, use existing content if not provided in params
  const content =
    getOptionalParam(params, 'content', isString) ?? existingEntry?.currentVersion?.content;
  const level = getOptionalParam(params, 'level', isExperienceLevel) ?? existingEntry?.level;
  const category = getOptionalParam(params, 'category', isString) ?? existingEntry?.category;

  return { title, content, level, category };
}

function extractListFilters(params: Record<string, unknown>): Record<string, unknown> {
  const level = getOptionalParam(params, 'level', isExperienceLevel);
  const category = getOptionalParam(params, 'category', isString);
  return { level, category };
}

// Create standard CRUD handlers using factory
// Note: We cast to 'knowledge' entryType since the factory only supports tool/guideline/knowledge
// The experience repository handles its own embedding with 'experience' type
const crudHandlers = createCrudHandlers<
  ExperienceWithVersion,
  CreateExperienceInput,
  UpdateExperienceInput
>({
  entryType: 'knowledge', // Using knowledge type for factory compatibility (closest match)
  getRepo: (context: AppContext) => context.repos.experiences as never,
  responseKey: 'experience',
  responseListKey: 'experiences',
  nameField: 'title',
  extractAddParams,
  extractUpdateParams,
  getNameValue,
  getContentForRedFlags,
  getValidationData,
  extractListFilters,
});

// Custom handlers for experience-specific operations

const promoteHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const id = getRequiredParam(params, 'id', isString);
  const toLevel = getRequiredParam(params, 'toLevel', isPromoteLevel);
  const agentId = getRequiredParam(params, 'agentId', isString);

  // For strategy promotion
  const pattern = getOptionalParam(params, 'pattern', isString);
  const applicability = getOptionalParam(params, 'applicability', isString);
  const contraindications = getOptionalParam(params, 'contraindications', isString);

  // For skill promotion
  const toolName = getOptionalParam(params, 'toolName', isString);
  const toolDescription = getOptionalParam(params, 'toolDescription', isString);
  const toolCategory = getOptionalParam(params, 'toolCategory', isToolCategory);
  const toolParameters = params.toolParameters as Record<string, unknown> | undefined;

  const reason = getOptionalParam(params, 'reason', isString);

  const input: PromoteExperienceInput = {
    toLevel,
    pattern,
    applicability,
    contraindications,
    toolName,
    toolDescription,
    toolCategory,
    toolParameters,
    reason,
    promotedBy: agentId,
  };

  // Use the ExperiencePromotionService for business logic orchestration
  if (!context.services.experiencePromotion) {
    throw createValidationError('experiencePromotion', 'service not available');
  }
  const result = await context.services.experiencePromotion.promote(id, input);

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      entryType: 'experience',
      entryId: id,
      scopeType: result.experience.scopeType,
      scopeId: result.experience.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    experience: result.experience,
    createdTool: result.createdTool,
  });
};

const recordOutcomeHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const id = getRequiredParam(params, 'id', isString);
  const success = getRequiredParam(params, 'success', isBoolean);
  const feedback = getOptionalParam(params, 'feedback', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  const input: RecordOutcomeInput = { success, feedback };
  const experience = await context.repos.experiences.recordOutcome(id, input);

  if (!experience) {
    throw createNotFoundError('experience', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'update',
      entryType: 'experience',
      entryId: id,
      scopeType: experience.scopeType,
      scopeId: experience.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    success: true,
    experience,
    metrics: {
      useCount: experience.useCount,
      successCount: experience.successCount,
      confidence: experience.currentVersion?.confidence,
    },
  });
};

const addStepHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const id = getRequiredParam(params, 'id', isString);
  // Use 'stepAction' to avoid collision with MCP action selector
  const stepAction = getRequiredParam(params, 'stepAction', isString);
  const observation = getOptionalParam(params, 'observation', isString);
  const reasoning = getOptionalParam(params, 'reasoning', isString);
  const toolUsed = getOptionalParam(params, 'toolUsed', isString);
  const success = getOptionalParam(params, 'success', isBoolean);
  const timestamp = getOptionalParam(params, 'timestamp', isString);
  const durationMs = getOptionalParam(params, 'durationMs', isNumber);
  const agentId = getRequiredParam(params, 'agentId', isString);

  const stepInput: TrajectoryStepInput = {
    action: stepAction,
    observation,
    reasoning,
    toolUsed,
    success,
    timestamp,
    durationMs,
  };

  const step = await context.repos.experiences.addStep(id, stepInput);

  // Log audit
  const experience = await context.repos.experiences.getById(id);
  if (experience) {
    logAction(
      {
        agentId,
        action: 'update',
        entryType: 'experience',
        entryId: id,
        scopeType: experience.scopeType,
        scopeId: experience.scopeId ?? null,
      },
      context.db
    );
  }

  return formatTimestamps({
    success: true,
    step,
  });
};

const getTrajectoryHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const id = getRequiredParam(params, 'id', isString);
  const agentId = getRequiredParam(params, 'agentId', isString);

  const experience = await context.repos.experiences.getById(id, true);
  if (!experience) {
    throw createNotFoundError('experience', id);
  }

  // Log audit
  logAction(
    {
      agentId,
      action: 'read',
      entryType: 'experience',
      entryId: id,
      scopeType: experience.scopeType,
      scopeId: experience.scopeId ?? null,
    },
    context.db
  );

  return formatTimestamps({
    experience,
    trajectorySteps: experience.trajectorySteps ?? [],
  });
};

// =============================================================================
// CAPTURE HANDLERS
// =============================================================================

function isRole(v: unknown): v is 'user' | 'assistant' | 'system' {
  return v === 'user' || v === 'assistant' || v === 'system';
}

function isSource(v: unknown): v is 'user' | 'observation' {
  return v === 'user' || v === 'observation';
}

const recordCaseHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const title = getRequiredParam(params, 'title', isString);
  const scenario = getRequiredParam(params, 'scenario', isString);
  const outcome = getRequiredParam(params, 'outcome', isString);
  const content = getOptionalParam(params, 'content', isString);
  const category = getOptionalParam(params, 'category', isString);
  const confidence = getOptionalParam(params, 'confidence', isNumber);
  const source = getOptionalParam(params, 'source', isSource);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);

  // Extract trajectory if provided
  let trajectory: TrajectoryStep[] | undefined;
  const trajectoryParam = params.trajectory;
  if (trajectoryParam !== undefined && isArrayOfObjects(trajectoryParam)) {
    trajectory = trajectoryParam.map((step) => {
      if (!isObject(step)) {
        throw createValidationError(
          'trajectory',
          'each step must be an object',
          'Provide valid step objects'
        );
      }
      const stepObj = step;
      return {
        action: getRequiredParam(stepObj, 'action', isString),
        observation: getOptionalParam(stepObj, 'observation', isString),
        reasoning: getOptionalParam(stepObj, 'reasoning', isString),
        toolUsed: getOptionalParam(stepObj, 'toolUsed', isString),
        success: getOptionalParam(stepObj, 'success', isBoolean),
        timestamp: getOptionalParam(stepObj, 'timestamp', isString),
        durationMs: getOptionalParam(stepObj, 'durationMs', isNumber),
      };
    });
  }

  const recordParams: RecordCaseParams = {
    projectId,
    sessionId,
    agentId,
    title,
    scenario,
    outcome,
    content,
    trajectory,
    category,
    confidence,
    source,
  };

  // Create capture module and record case (use DI-managed state manager)
  const captureModule = createExperienceCaptureModule(
    context.repos.experiences,
    context.services.captureState
  );
  const result = await captureModule.recordCase(recordParams);

  // Log audit for each created experience
  for (const exp of result.experiences) {
    logAction(
      {
        agentId: agentId ?? 'system',
        action: 'create',
        entryType: 'experience',
        entryId: exp.experience.id,
        scopeType: exp.experience.scopeType,
        scopeId: exp.experience.scopeId ?? null,
      },
      context.db
    );
  }

  return formatTimestamps({
    success: true,
    experiences: result.experiences.map((e) => ({
      id: e.experience.id,
      title: e.experience.title,
      confidence: e.confidence,
      source: e.source,
    })),
    skippedDuplicates: result.skippedDuplicates,
    processingTimeMs: result.processingTimeMs,
  });
};

const captureFromTranscriptHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  // Get transcript
  const transcriptParam = getRequiredParam(params, 'transcript', isArrayOfObjects);
  const transcript: TurnData[] = transcriptParam.map((turn) => {
    if (!isObject(turn)) {
      throw createValidationError(
        'transcript',
        'each turn must be an object',
        'Provide valid turn objects'
      );
    }
    const turnObj = turn;
    const role = getRequiredParam(turnObj, 'role', isRole);
    const content = getRequiredParam(turnObj, 'content', isString);
    const timestamp = getOptionalParam(turnObj, 'timestamp', isString);
    const tokenCount = getOptionalParam(turnObj, 'tokenCount', isNumber);

    // Extract tool calls if provided
    let toolCalls: TurnData['toolCalls'];
    const toolCallsParam = turnObj.toolCalls;
    if (toolCallsParam !== undefined && isArrayOfObjects(toolCallsParam)) {
      toolCalls = toolCallsParam.map((call) => {
        if (!isObject(call)) {
          throw createValidationError(
            'toolCalls',
            'each call must be an object',
            'Provide valid call objects'
          );
        }
        const callObj = call;
        return {
          name: getRequiredParam(callObj, 'name', isString),
          input: (callObj.input as Record<string, unknown>) ?? {},
          output: callObj.output,
          success: getOptionalParam(callObj, 'success', isBoolean),
          durationMs: getOptionalParam(callObj, 'durationMs', isNumber),
        };
      });
    }

    return { role, content, timestamp, tokenCount, toolCalls };
  });

  // Get options
  const scopeType = getOptionalParam(params, 'scopeType', isScopeType) ?? 'project';
  const scopeId = getOptionalParam(params, 'scopeId', isString);
  const projectId = getOptionalParam(params, 'projectId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const agentId = getOptionalParam(params, 'agentId', isString);
  const autoStore = getOptionalParam(params, 'autoStore', isBoolean) ?? true;
  const confidenceThreshold = getOptionalParam(params, 'confidenceThreshold', isNumber);

  // Build metrics from transcript
  const metrics = {
    turnCount: transcript.length,
    userTurnCount: transcript.filter((t) => t.role === 'user').length,
    assistantTurnCount: transcript.filter((t) => t.role === 'assistant').length,
    totalTokens: transcript.reduce((sum, t) => sum + (t.tokenCount ?? 0), 0),
    toolCallCount: transcript.reduce((sum, t) => sum + (t.toolCalls?.length ?? 0), 0),
    uniqueToolsUsed: new Set(transcript.flatMap((t) => t.toolCalls?.map((c) => c.name) ?? [])),
    errorCount: transcript.reduce(
      (sum, t) => sum + (t.toolCalls?.filter((c) => c.success === false).length ?? 0),
      0
    ),
    startTime: Date.now(),
    lastTurnTime: Date.now(),
  };

  // Create capture module and capture experiences (use DI-managed state manager)
  const captureModule = createExperienceCaptureModule(
    context.repos.experiences,
    context.services.captureState
  );
  const result = await captureModule.capture(transcript, metrics, {
    scopeType,
    scopeId: scopeId ?? projectId,
    projectId,
    sessionId,
    agentId,
    autoStore,
    confidenceThreshold,
    skipDuplicates: true,
  });

  // Log audit for each created experience
  for (const exp of result.experiences) {
    if (exp.experience.id) {
      logAction(
        {
          agentId: agentId ?? 'system',
          action: 'create',
          entryType: 'experience',
          entryId: exp.experience.id,
          scopeType: exp.experience.scopeType,
          scopeId: exp.experience.scopeId ?? null,
        },
        context.db
      );
    }
  }

  return formatTimestamps({
    success: true,
    experiences: result.experiences.map((e) => ({
      id: e.experience.id,
      title: e.experience.title,
      confidence: e.confidence,
      source: e.source,
    })),
    skippedDuplicates: result.skippedDuplicates,
    processingTimeMs: result.processingTimeMs,
  });
};

// =============================================================================
// LEARN HANDLER - Low friction experience recording
// =============================================================================

/**
 * Parse natural language text to extract experience components.
 *
 * Patterns recognized:
 * - "Fixed X by doing Y" → scenario: X, outcome: did Y
 * - "Learned that X when Y" → outcome: X, scenario: Y
 * - "Discovered X" → outcome: discovered X
 * - "Figured out X by Y" → outcome: X, method: Y
 * - "Solved X: Y" → scenario: X, outcome: Y
 * - Free-form text → title from first sentence, content as-is
 */
function parseExperienceText(text: string): {
  title: string;
  scenario: string;
  outcome: string;
  content: string;
} {
  const normalized = text.trim();

  // Pattern: "Fixed/Resolved/Solved X by doing Y"
  const fixedByMatch = normalized.match(
    /^(fixed|resolved|solved|addressed|handled)\s+(.+?)\s+by\s+(.+)$/i
  );
  if (fixedByMatch) {
    const problem = fixedByMatch[2]?.trim() ?? '';
    const solution = fixedByMatch[3]?.trim() ?? '';
    return {
      title: `${fixedByMatch[1]} ${problem.slice(0, 50)}`,
      scenario: problem,
      outcome: `success - ${solution}`,
      content: normalized,
    };
  }

  // Pattern: "Learned/Discovered that X when/while Y"
  const learnedWhenMatch = normalized.match(
    /^(learned|discovered|realized|found out)\s+(?:that\s+)?(.+?)\s+(when|while|after)\s+(.+)$/i
  );
  if (learnedWhenMatch) {
    const learning = learnedWhenMatch[2]?.trim() ?? '';
    const context = learnedWhenMatch[4]?.trim() ?? '';
    return {
      title: learning.slice(0, 60),
      scenario: context,
      outcome: learning,
      content: normalized,
    };
  }

  // Pattern: "Figured out X by Y"
  const figuredOutMatch = normalized.match(/^figured\s+out\s+(.+?)\s+by\s+(.+)$/i);
  if (figuredOutMatch) {
    const what = figuredOutMatch[1]?.trim() ?? '';
    const how = figuredOutMatch[2]?.trim() ?? '';
    return {
      title: what.slice(0, 60),
      scenario: `needed to figure out ${what}`,
      outcome: `${what} - achieved by ${how}`,
      content: normalized,
    };
  }

  // Pattern: "X: Y" or "X - Y" (problem: solution format)
  const colonMatch = normalized.match(/^([^:-]+)[:–—-]\s*(.+)$/);
  if (colonMatch && colonMatch[1] && colonMatch[2] && colonMatch[1].length < 80) {
    return {
      title: colonMatch[1].trim().slice(0, 60),
      scenario: colonMatch[1].trim(),
      outcome: colonMatch[2].trim(),
      content: normalized,
    };
  }

  // Pattern: Simple discovery "Discovered/Found X"
  const discoveredMatch = normalized.match(
    /^(discovered|found|learned|realized)\s+(?:that\s+)?(.+)$/i
  );
  if (discoveredMatch) {
    const discovery = discoveredMatch[2]?.trim() ?? '';
    return {
      title: discovery.slice(0, 60),
      scenario: 'investigation',
      outcome: discovery,
      content: normalized,
    };
  }

  // Fallback: use first sentence as title, whole text as content
  const firstSentence = (normalized.split(/[.!?]/)[0] ?? normalized).trim();
  const title =
    firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence || 'Experience';

  return {
    title,
    scenario: normalized,
    outcome: 'recorded',
    content: normalized,
  };
}

/**
 * Infer category from experience content
 */
function inferExperienceCategory(text: string): string {
  const lower = text.toLowerCase();

  if (/debug|bug|fix|error|issue|crash/i.test(lower)) return 'debugging';
  if (/refactor|clean|improve|simplify/i.test(lower)) return 'refactoring';
  if (/api|endpoint|request|response/i.test(lower)) return 'api-design';
  if (/test|spec|coverage|mock/i.test(lower)) return 'testing';
  if (/performance|slow|optimize|fast/i.test(lower)) return 'performance';
  if (/deploy|ci|cd|pipeline|build/i.test(lower)) return 'devops';
  if (/config|setup|install|environment/i.test(lower)) return 'configuration';
  if (/database|query|sql|migration/i.test(lower)) return 'database';
  if (/auth|login|permission|security/i.test(lower)) return 'security';

  return 'general';
}

interface ParsedExperience {
  title: string;
  scenario: string;
  outcome: string;
  content: string;
}

async function parseExperienceTextWithLLM(
  text: string,
  extractionService?: IExtractionService
): Promise<ParsedExperience> {
  if (!extractionService?.isAvailable()) {
    return parseExperienceText(text);
  }

  try {
    const prompt = `Parse this experience description and extract structured information.

Text: "${text}"

Respond in this exact JSON format:
{
  "title": "Brief title (max 60 chars) summarizing the experience",
  "scenario": "The context or situation that triggered this experience",
  "outcome": "What was learned, achieved, or discovered"
}`;

    const result = await extractionService.extract({
      context: prompt,
      contextType: 'mixed',
      focusAreas: ['facts', 'decisions'],
    });

    for (const entry of result.entries) {
      try {
        const jsonMatch = entry.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            title?: string;
            scenario?: string;
            outcome?: string;
          };
          if (parsed.title && parsed.scenario && parsed.outcome) {
            logger.debug(
              { title: parsed.title, model: result.model },
              'LLM-parsed experience text'
            );
            return {
              title: parsed.title.slice(0, 60),
              scenario: parsed.scenario,
              outcome: parsed.outcome,
              content: text.trim(),
            };
          }
        }
      } catch {
        continue;
      }
    }

    logger.debug('No valid JSON in LLM response, falling back to regex');
    return parseExperienceText(text);
  } catch (error) {
    logger.debug({ error }, 'LLM extraction failed, falling back to regex');
    return parseExperienceText(text);
  }
}

const learnHandler: ContextAwareHandler = async (
  context: AppContext,
  params: Record<string, unknown>
) => {
  const text = getRequiredParam(params, 'text', isString);
  const categoryOverride = getOptionalParam(params, 'category', isString);
  const confidenceOverride = getOptionalParam(params, 'confidence', isNumber);

  const extractionService = context.services.extraction;
  const parsed = await parseExperienceTextWithLLM(text, extractionService);
  const category = categoryOverride ?? inferExperienceCategory(text);

  // Use enriched params from tool-runner (already contains projectId, sessionId, agentId)
  // Fall back to sync cached context if params weren't enriched
  const projectId = getOptionalParam(params, 'projectId', isString);
  const sessionId = getOptionalParam(params, 'sessionId', isString);
  const resolvedAgentId = getOptionalParam(params, 'agentId', isString) ?? 'claude-code';

  if (!projectId) {
    return {
      error: 'No project detected',
      message: 'Could not detect project from working directory.',
      hint: 'Run from a project directory or use record_case with explicit scopeId',
    };
  }

  // Create the experience using record_case
  const captureModule = createExperienceCaptureModule(
    context.repos.experiences,
    context.services.captureState
  );

  const result = await captureModule.recordCase({
    projectId,
    sessionId,
    agentId: resolvedAgentId,
    title: parsed.title,
    scenario: parsed.scenario,
    outcome: parsed.outcome,
    content: parsed.content,
    category,
    confidence: confidenceOverride ?? 0.8,
    source: 'user',
  });

  // Log audit for created experience
  for (const exp of result.experiences) {
    logAction(
      {
        agentId: resolvedAgentId,
        action: 'create',
        entryType: 'experience',
        entryId: exp.experience.id,
        scopeType: exp.experience.scopeType,
        scopeId: exp.experience.scopeId ?? null,
      },
      context.db
    );
  }

  const created = result.experiences[0];
  if (!created) {
    return {
      success: false,
      error: 'Failed to create experience',
      skippedDuplicates: result.skippedDuplicates,
    };
  }

  // Build human-readable display
  const truncatedTitle =
    parsed.title.length > 50 ? parsed.title.slice(0, 47) + '...' : parsed.title;
  const _display = `🧠 Learned: ${truncatedTitle}\n📁 Category: ${category}`;

  return formatTimestamps({
    success: true,
    experience: {
      id: created.experience.id,
      title: created.experience.title,
      category,
      scenario: parsed.scenario,
      outcome: parsed.outcome,
    },
    parsed: {
      title: parsed.title,
      scenario: parsed.scenario,
      outcome: parsed.outcome,
    },
    projectId,
    _display,
  });
};

// Export all handlers
export const experienceHandlers = {
  // Standard CRUD from factory
  add: crudHandlers.add,
  update: crudHandlers.update,
  get: crudHandlers.get,
  list: crudHandlers.list,
  history: crudHandlers.history,
  deactivate: crudHandlers.deactivate,
  delete: crudHandlers.delete,
  bulk_add: crudHandlers.bulk_add,
  bulk_update: crudHandlers.bulk_update,
  bulk_delete: crudHandlers.bulk_delete,

  // Experience-specific handlers
  promote: promoteHandler,
  record_outcome: recordOutcomeHandler,
  add_step: addStepHandler,
  get_trajectory: getTrajectoryHandler,

  // Capture handlers
  record_case: recordCaseHandler,
  capture_from_transcript: captureFromTranscriptHandler,

  // Low-friction handlers
  learn: learnHandler,
};

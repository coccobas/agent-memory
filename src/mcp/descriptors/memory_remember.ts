/**
 * memory_remember tool descriptor
 *
 * Natural language interface for storing memories.
 * Uses hybrid classification (regex + LLM fallback) with learning from corrections.
 *
 * Enhanced with trigger detection: When experience-related patterns are detected
 * (e.g., "fixed X by doing Y", "learned that...", "the solution was..."),
 * automatically stores as an experience instead of guideline/knowledge.
 *
 * Examples:
 * - "Remember that we use TypeScript strict mode"
 * - "Store the fact that our API uses REST"
 * - "This is a rule: always use async/await"
 * - "Fixed the auth bug by increasing the token timeout" → auto-stored as experience
 */

import type { SimpleToolDescriptor } from './types.js';
import {
  validateTextLength,
  validateArrayLength,
  SIZE_LIMITS,
} from '../../services/validation.service.js';
import { createValidationError } from '../../core/errors.js';
import { getExtractionTriggersService } from '../../services/capture/triggers.js';
import {
  createExperienceCaptureModule,
  type RecordCaseParams,
} from '../../services/capture/index.js';
import { logAction } from '../../services/audit.service.js';
import { notify } from '../notification.service.js';

/**
 * Extract the core content from natural language
 */
function extractContent(text: string): { title: string; content: string } {
  const normalized = text.trim();

  // Remove common prefixes
  const prefixes = [
    /^(remember|store|save|note) (that )?/i,
    /^(this is a |here's a )?(rule|guideline|fact|note)[\s:]+/i,
    /^(the fact (is|that) )/i,
  ];

  let content = normalized;
  for (const prefix of prefixes) {
    content = content.replace(prefix, '');
  }

  // Generate a title from the first part
  // First, get the first line (handle multi-line input)
  const firstLine = content.split(/[\r\n]+/)[0]?.trim() ?? content.trim();
  // Then get the first sentence from that line
  const firstSentence = (firstLine.split(/[.!?]/)[0] ?? firstLine).trim();

  // Smart truncation: prefer word boundaries, max 80 chars
  let title = firstSentence;

  // Fallback: if title is empty (e.g., content starts with . or ?), use firstLine or content
  if (!title) {
    title = firstLine || content.trim();
  }

  // Final fallback: if still empty, use "Untitled"
  if (!title) {
    title = 'Untitled';
  }

  if (title.length > 80) {
    // Find last space before char 77 to avoid mid-word cut
    const cutPoint = title.lastIndexOf(' ', 77);
    title = cutPoint > 40 ? title.slice(0, cutPoint) + '...' : title.slice(0, 77) + '...';
  }

  return { title, content: content.trim() };
}

/**
 * Infer category from content
 */
function inferCategory(entryType: 'guideline' | 'knowledge' | 'tool', content: string): string {
  const lower = content.toLowerCase();

  if (entryType === 'guideline') {
    if (/security|auth|password|token|secret/i.test(lower)) return 'security';
    if (/style|format|naming|convention/i.test(lower)) return 'code_style';
    if (/test|spec|coverage/i.test(lower)) return 'testing';
    if (/performance|optimize|fast/i.test(lower)) return 'performance';
    return 'workflow';
  }

  if (entryType === 'knowledge') {
    if (/decided|chose|because|reason/i.test(lower)) return 'decision';
    if (/architecture|design|pattern/i.test(lower)) return 'architecture';
    return 'fact';
  }

  if (entryType === 'tool') {
    if (/npm|yarn|pnpm/i.test(lower)) return 'cli';
    if (/api|endpoint|http/i.test(lower)) return 'api';
    return 'cli';
  }

  return 'general';
}

/**
 * Parse experience text to extract title, scenario, outcome
 * (Simplified version of parseExperienceText from experiences.handler.ts)
 */
function parseExperienceText(text: string): {
  title: string;
  scenario: string;
  outcome: string;
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
    };
  }

  // Pattern: "The fix/solution was X"
  const solutionMatch = normalized.match(/^the\s+(fix|solution|answer|resolution)\s+was\s+(.+)$/i);
  if (solutionMatch) {
    const solution = solutionMatch[2]?.trim() ?? '';
    return {
      title: `${solutionMatch[1]}: ${solution.slice(0, 50)}`,
      scenario: 'Problem encountered',
      outcome: solution,
    };
  }

  // Pattern: "Root cause was X"
  const rootCauseMatch = normalized.match(/^root\s+cause\s+was\s+(.+)$/i);
  if (rootCauseMatch) {
    const cause = rootCauseMatch[1]?.trim() ?? '';
    return {
      title: `Root cause: ${cause.slice(0, 50)}`,
      scenario: 'Debugging/investigation',
      outcome: `Identified root cause: ${cause}`,
    };
  }

  // Fallback: use first sentence as title
  const firstSentence = (normalized.split(/[.!?]/)[0] ?? normalized).trim();
  const title =
    firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence || 'Experience';

  return {
    title,
    scenario: normalized,
    outcome: 'recorded',
  };
}

/**
 * Infer experience category from text
 * Note: More specific categories (database, security) are checked before
 * generic ones (debugging) to avoid false matches on words like "fix"
 */
function inferExperienceCategory(text: string): string {
  const lower = text.toLowerCase();

  // Check specific domain categories first
  if (/database|query|sql|migration/i.test(lower)) return 'database';
  if (/auth|login|permission|security|token|password/i.test(lower)) return 'security';
  if (/api|endpoint|request|response/i.test(lower)) return 'api-design';
  if (/test|spec|coverage|mock/i.test(lower)) return 'testing';
  if (/performance|slow|optimize|fast|latency/i.test(lower)) return 'performance';
  if (/deploy|ci|cd|pipeline|build/i.test(lower)) return 'devops';
  if (/config|setup|install|environment/i.test(lower)) return 'configuration';
  if (/architecture|design|pattern|drift/i.test(lower)) return 'architecture';
  if (/refactor|clean|improve|simplify/i.test(lower)) return 'refactoring';

  // Generic debugging category last (catches "fix", "bug", "error")
  if (/debug|bug|fix|error|issue|crash/i.test(lower)) return 'debugging';

  return 'general';
}

/**
 * Store text as an experience when triggers indicate it should be
 */
async function storeAsExperience(
  ctx: Parameters<NonNullable<SimpleToolDescriptor['contextHandler']>>[0],
  text: string,
  triggerResult: ReturnType<
    ReturnType<typeof getExtractionTriggersService>['detectExperienceTriggers']
  >,
  priority: number,
  tags: string[],
  enrichedParams: { projectId?: string; sessionId?: string; agentId?: string }
): Promise<Record<string, unknown>> {
  let projectId = enrichedParams.projectId;
  let sessionId = enrichedParams.sessionId;
  let agentId = enrichedParams.agentId ?? 'claude-code';

  if (!projectId && ctx.services.contextDetection) {
    const detected = await ctx.services.contextDetection.detect();
    projectId = detected?.project?.id;
    sessionId = sessionId ?? detected?.session?.id;
    agentId = detected?.agentId?.value ?? agentId;
  }

  if (!projectId) {
    return {
      error: 'No project detected',
      message: 'Could not detect project from working directory. Please specify projectId.',
    };
  }

  // Parse experience components from text
  const parsed = parseExperienceText(text);
  const category = inferExperienceCategory(text);

  // Get the dominant trigger for metadata
  const dominantTrigger = triggerResult.triggers[0];
  const triggerTypes = [...new Set(triggerResult.triggers.map((t) => t.type))];

  // Create capture module and record the experience
  const captureModule = createExperienceCaptureModule(
    ctx.repos.experiences,
    ctx.services.captureState
  );

  // Use priority to slightly influence confidence (priority 100 adds 0.1 to confidence)
  const baseConfidence = dominantTrigger?.confidence ?? 0.85;
  const priorityBoost = (priority / 100) * 0.1; // 0-0.1 boost based on priority
  const adjustedConfidence = Math.min(1.0, baseConfidence + priorityBoost);

  const recordParams: RecordCaseParams = {
    projectId,
    sessionId,
    agentId,
    title: parsed.title,
    scenario: parsed.scenario,
    outcome: parsed.outcome,
    content: text,
    category: `auto-${category}`,
    confidence: adjustedConfidence,
    source: 'user',
  };

  try {
    const result = await captureModule.recordCase(recordParams);

    // Log audit for created experience
    for (const exp of result.experiences) {
      logAction(
        {
          agentId,
          action: 'create',
          entryType: 'experience',
          entryId: exp.experience.id,
          scopeType: exp.experience.scopeType,
          scopeId: exp.experience.scopeId ?? null,
        },
        ctx.db
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

    // Attach tags if provided
    if (tags.length > 0) {
      for (const tagName of tags) {
        try {
          const tag = await ctx.repos.tags.getOrCreate(tagName);
          await ctx.repos.entryTags.attach({
            entryType: 'knowledge', // experiences use knowledge entryType for tags
            entryId: created.experience.id,
            tagId: tag.id,
          });
        } catch {
          // Tag attachment failed, continue
        }
      }
    }

    // Build human-readable display
    const truncatedTitle =
      parsed.title.length > 50 ? parsed.title.slice(0, 47) + '...' : parsed.title;
    const _display = `🧠 Auto-stored as experience (detected: ${triggerTypes.join(', ')})\n📝 ${truncatedTitle}\n📁 Category: ${category}`;

    // Send MCP notification to client (non-blocking)
    void notify.notice(`🧠 Auto-experience: ${truncatedTitle}`, 'memory_remember');

    return {
      success: true,
      autoDetected: true,
      stored: {
        type: 'experience',
        id: created.experience.id,
        title: parsed.title,
        category,
        projectId,
      },
      triggerInfo: {
        types: triggerTypes,
        confidence: dominantTrigger?.confidence,
        reason: 'Text contains experience-worthy patterns (fix, solution, learned, etc.)',
      },
      parsed: {
        title: parsed.title,
        scenario: parsed.scenario,
        outcome: parsed.outcome,
      },
      hint: 'Use forceType to override auto-detection if needed.',
      _display,
    };
  } catch (error) {
    return {
      error: 'Failed to store experience',
      message: error instanceof Error ? error.message : String(error),
      attempted: { type: 'experience', title: parsed.title, category },
    };
  }
}

export const memoryRememberDescriptor: SimpleToolDescriptor = {
  name: 'memory_remember',
  visibility: 'core',
  description:
    'Store memories using natural language. Auto-detects type (guideline, knowledge, tool) and category.',
  params: {
    text: { type: 'string', description: 'What to remember' },
    forceType: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
    priority: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['text'],
  contextHandler: async (ctx, args) => {
    const text = args?.text as string;
    if (!text?.trim()) {
      return { error: 'Text is required', message: 'Please provide text to remember' };
    }

    const forceType = args?.forceType as 'guideline' | 'knowledge' | 'tool' | undefined;
    const priority = (args?.priority as number) ?? 50;
    const tags = (args?.tags as string[]) ?? [];

    // Validate input sizes
    validateTextLength(text, 'text', SIZE_LIMITS.CONTENT_MAX_LENGTH);
    if (tags.length > 0) {
      validateArrayLength(tags, 'tags', SIZE_LIMITS.TAGS_MAX_COUNT);
    }
    if (priority < 0 || priority > 100) {
      throw createValidationError('priority', 'Must be between 0 and 100');
    }

    // Use classification service if available, otherwise fall back to simple detection
    let classificationResult: {
      type: 'guideline' | 'knowledge' | 'tool';
      confidence: number;
      method: string;
      alternativeTypes?: Array<{ type: 'guideline' | 'knowledge' | 'tool'; confidence: number }>;
      llmReasoning?: string;
      adjustedByFeedback?: boolean;
    };

    if (ctx.services.classification) {
      // Use hybrid classification with learning
      classificationResult = await ctx.services.classification.classify(text, forceType);
    } else {
      // Fallback: simple forced type or default to knowledge
      classificationResult = {
        type: forceType ?? 'knowledge',
        confidence: forceType ? 1.0 : 0.5,
        method: forceType ? 'forced' : 'fallback',
      };
    }

    const entryType = classificationResult.type;

    // Record correction if forceType differs from what would have been predicted
    if (forceType && ctx.services.classification) {
      // Get the prediction without forceType to compare
      const prediction = await ctx.services.classification.classify(text);
      if (prediction.type !== forceType) {
        // User corrected the prediction - record for learning
        await ctx.services.classification.recordCorrection(text, prediction.type, forceType);
      }
    }

    // ==========================================================================
    // EXPERIENCE TRIGGER DETECTION
    // Check if this text contains experience-worthy patterns (fixed X by Y, etc.)
    // If so, auto-redirect to store as experience instead
    // ==========================================================================
    const triggersService = getExtractionTriggersService();
    const triggerResult = triggersService.detectExperienceTriggers(text);

    // Auto-redirect to experience if:
    // 1. No forceType specified (user didn't explicitly choose)
    // 2. High-confidence experience triggers detected
    // 3. Classification confidence is not very high (< 0.9)
    const shouldAutoExperience =
      !forceType &&
      triggerResult.hasHighConfidenceTriggers &&
      classificationResult.confidence < 0.9;

    if (shouldAutoExperience) {
      return await storeAsExperience(ctx, text, triggerResult, priority, tags, {
        projectId: args?.projectId as string | undefined,
        sessionId: args?.sessionId as string | undefined,
        agentId: args?.agentId as string | undefined,
      });
    }

    // Extract content
    const { title, content } = extractContent(text);

    // Infer category
    const category = inferCategory(entryType, content);

    let projectId = args?.projectId as string | undefined;
    let agentId = (args?.agentId as string | undefined) ?? 'claude-code';

    if (!projectId && ctx.services.contextDetection) {
      const detected = await ctx.services.contextDetection.detect();
      projectId = detected?.project?.id;
      agentId = detected?.agentId?.value ?? agentId;
    }

    if (!projectId) {
      return {
        error: 'No project detected',
        message: 'Could not detect project from working directory. Please specify projectId.',
      };
    }

    // Store based on type
    let storedEntry: { id: string } | undefined;
    let resultData: Record<string, unknown> = {};

    try {
      switch (entryType) {
        case 'guideline': {
          const guideline = await ctx.repos.guidelines.create({
            scopeType: 'project',
            scopeId: projectId,
            name: title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .slice(0, 50),
            content,
            category,
            priority,
            createdBy: agentId,
          });
          storedEntry = guideline;
          resultData = { guideline };
          break;
        }
        case 'knowledge': {
          const knowledge = await ctx.repos.knowledge.create({
            scopeType: 'project',
            scopeId: projectId,
            title,
            content,
            category: category as 'decision' | 'fact' | 'context' | 'reference',
            createdBy: agentId,
          });
          storedEntry = knowledge;
          resultData = { knowledge };
          break;
        }
        case 'tool': {
          const tool = await ctx.repos.tools.create({
            scopeType: 'project',
            scopeId: projectId,
            name: title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .slice(0, 50),
            description: content,
            category: category as 'mcp' | 'cli' | 'function' | 'api',
            createdBy: agentId,
          });
          storedEntry = tool;
          resultData = { tool };
          break;
        }
      }

      // Attach tags if provided
      if (storedEntry && tags.length > 0) {
        for (const tagName of tags) {
          try {
            // Get or create the tag first
            const tag = await ctx.repos.tags.getOrCreate(tagName);
            // Then attach it to the entry
            await ctx.repos.entryTags.attach({
              entryType,
              entryId: storedEntry.id,
              tagId: tag.id,
            });
          } catch {
            // Tag attachment failed, continue
          }
        }
      }

      // Build human-readable display
      const typeIcon = entryType === 'guideline' ? '📋' : entryType === 'knowledge' ? '💡' : '🔧';
      const truncatedTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
      const confidenceStr =
        classificationResult.confidence < 0.7
          ? ` (${Math.round(classificationResult.confidence * 100)}% confidence)`
          : '';
      const _display = `${typeIcon} Stored ${entryType} (${category})${confidenceStr}\n📝 ${truncatedTitle}`;

      return {
        success: true,
        stored: {
          type: entryType,
          id: storedEntry?.id,
          title,
          category,
          projectId,
        },
        classification: {
          type: classificationResult.type,
          confidence: classificationResult.confidence,
          method: classificationResult.method,
          wasForced: !!forceType,
          alternativeTypes: classificationResult.alternativeTypes,
          llmReasoning: classificationResult.llmReasoning,
          adjustedByFeedback: classificationResult.adjustedByFeedback,
        },
        hint:
          classificationResult.confidence < 0.7
            ? `Low confidence (${Math.round(classificationResult.confidence * 100)}%). Use forceType if incorrect.`
            : undefined,
        _display,
        ...resultData,
      };
    } catch (error) {
      return {
        error: 'Failed to store',
        message: error instanceof Error ? error.message : String(error),
        attempted: { entryType, title, category },
      };
    }
  },
};

/**
 * memory_remember tool descriptor
 *
 * Natural language interface for storing memories.
 * Uses hybrid classification (regex + LLM fallback) with learning from corrections.
 *
 * Examples:
 * - "Remember that we use TypeScript strict mode"
 * - "Store the fact that our API uses REST"
 * - "This is a rule: always use async/await"
 */

import type { SimpleToolDescriptor } from './types.js';

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
  if (title.length > 80) {
    // Find last space before char 77 to avoid mid-word cut
    const cutPoint = title.lastIndexOf(' ', 77);
    title = cutPoint > 40 ? title.slice(0, cutPoint) + '...' : title.slice(0, 77) + '...'
  }

  return { title, content: content.trim() };
}

/**
 * Infer category from content
 */
function inferCategory(
  entryType: 'guideline' | 'knowledge' | 'tool',
  content: string
): string {
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

export const memoryRememberDescriptor: SimpleToolDescriptor = {
  name: 'memory_remember',
  visibility: 'core',
  description: 'Store memories using natural language. Auto-detects type (guideline, knowledge, tool) and category.',
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

    // Extract content
    const { title, content } = extractContent(text);

    // Infer category
    const category = inferCategory(entryType, content);

    // Get detected context
    const detected = ctx.services.contextDetection
      ? await ctx.services.contextDetection.detect()
      : null;

    const projectId = detected?.project?.id;
    const agentId = detected?.agentId?.value ?? 'claude-code';

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
            name: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
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
            name: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50),
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

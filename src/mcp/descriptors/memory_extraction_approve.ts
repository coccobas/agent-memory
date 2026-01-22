/**
 * memory_extraction_approve tool descriptor
 *
 * Approve extraction suggestions from the extraction hook.
 * Allows users to store suggested entries with a single call.
 */

import type { SimpleToolDescriptor } from './types.js';
import type {
  SuggestedCategory,
  SuggestedEntryType,
} from '../../services/extraction-hook.service.js';

export const memoryExtractionApproveDescriptor: SimpleToolDescriptor = {
  name: 'memory_extraction_approve',
  visibility: 'advanced',
  description: `Approve and store extraction suggestions.

When the system detects storable patterns in content, it surfaces suggestions via _suggestions metadata.
Use this tool to approve and store those suggestions.

Parameters:
- hash: The unique hash of the suggestion to approve
- suggestions: Array of suggestion objects to approve (alternative to hash)
- modifyTitle: Optional override for the title
- modifyCategory: Optional override for the category
- tags: Optional tags to attach`,
  params: {
    hash: {
      type: 'string',
      description: 'Hash of the suggestion to approve (from _suggestions metadata)',
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['guideline', 'knowledge', 'tool'] },
          category: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          hash: { type: 'string' },
        },
      },
      description: 'Array of suggestions to approve (if not using hash)',
    },
    modifyTitle: {
      type: 'string',
      description: 'Override the suggested title',
    },
    modifyCategory: {
      type: 'string',
      description: 'Override the suggested category',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tags to attach to the stored entry',
    },
  },
  required: [],
  contextHandler: async (ctx, args) => {
    const hash = args?.hash as string | undefined;
    const suggestions = args?.suggestions as
      | Array<{
          type: SuggestedEntryType;
          category: SuggestedCategory;
          title: string;
          content: string;
          hash: string;
        }>
      | undefined;
    const modifyTitle = args?.modifyTitle as string | undefined;
    const modifyCategory = args?.modifyCategory as string | undefined;
    const tags = (args?.tags as string[]) ?? [];

    // Need either hash or suggestions
    if (!hash && (!suggestions || suggestions.length === 0)) {
      return {
        error: 'Missing parameter',
        message: 'Provide either hash or suggestions array',
      };
    }

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
        message: 'Could not detect project from working directory.',
      };
    }

    // If hash provided, we need the suggestion from somewhere
    // This would typically be passed in a session or extracted from prior response
    // For now, require full suggestions array if not using hash lookup
    if (hash && !suggestions) {
      return {
        error: 'Hash lookup not implemented',
        message: 'Please provide the full suggestions array with the suggestion to approve.',
        hint: 'The _suggestions metadata from a previous response contains the full suggestion objects.',
      };
    }

    const toApprove = suggestions ?? [];
    const results: Array<{
      hash: string;
      success: boolean;
      id?: string;
      type?: string;
      error?: string;
    }> = [];

    for (const suggestion of toApprove) {
      // Skip if hash doesn't match when hash filter is provided
      if (hash && suggestion.hash !== hash) {
        continue;
      }

      const title = modifyTitle ?? suggestion.title;
      const category = modifyCategory ?? suggestion.category;

      try {
        let storedEntry: { id: string } | undefined;

        switch (suggestion.type) {
          case 'guideline': {
            const guideline = await ctx.repos.guidelines.create({
              scopeType: 'project',
              scopeId: projectId,
              name: title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .slice(0, 50),
              content: suggestion.content,
              category,
              createdBy: agentId,
            });
            storedEntry = guideline;
            break;
          }
          case 'knowledge': {
            const knowledge = await ctx.repos.knowledge.create({
              scopeType: 'project',
              scopeId: projectId,
              title,
              content: suggestion.content,
              category: category as 'decision' | 'fact' | 'context' | 'reference',
              createdBy: agentId,
            });
            storedEntry = knowledge;
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
              description: suggestion.content,
              category: category as 'mcp' | 'cli' | 'function' | 'api',
              createdBy: agentId,
            });
            storedEntry = tool;
            break;
          }
        }

        // Attach tags
        if (storedEntry && tags.length > 0) {
          for (const tagName of tags) {
            try {
              const tag = await ctx.repos.tags.getOrCreate(tagName);
              await ctx.repos.entryTags.attach({
                entryType: suggestion.type,
                entryId: storedEntry.id,
                tagId: tag.id,
              });
            } catch {
              // Tag attachment failed, continue
            }
          }
        }

        results.push({
          hash: suggestion.hash,
          success: true,
          id: storedEntry?.id,
          type: suggestion.type,
        });
      } catch (error) {
        results.push({
          hash: suggestion.hash,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      success: failCount === 0,
      message: `Approved ${successCount} suggestion(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results,
      projectId,
    };
  },
};

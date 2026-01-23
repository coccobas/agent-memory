/**
 * Tool Tag Assignment Maintenance Task
 *
 * Uses LLM to analyze guidelines/knowledge entries and assign `tool:*` tags
 * indicating which tools (Edit, Bash, Write, etc.) each entry is relevant to.
 *
 * This enables tool-specific context injection - when an agent uses Edit,
 * only guidelines tagged with `tool:Edit` are injected.
 */

import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { IExtractionService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';

const logger = createComponentLogger('tool-tag-assignment');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Tool tag assignment task configuration
 */
export interface ToolTagAssignmentConfig {
  /** Enable tool tag assignment during maintenance */
  enabled: boolean;
  /** Maximum entries to process per run */
  maxEntries: number;
  /** Entry types to process */
  entryTypes: Array<'guideline' | 'knowledge'>;
  /** Available tools to assign (will create tool:* tags) */
  availableTools: string[];
  /** Minimum confidence from LLM to assign a tool tag (0-1) */
  minConfidence: number;
  /** Skip entries that already have tool:* tags */
  skipAlreadyTagged: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_TOOL_TAG_ASSIGNMENT_CONFIG: ToolTagAssignmentConfig = {
  enabled: true,
  maxEntries: 50,
  entryTypes: ['guideline', 'knowledge'],
  availableTools: ['Edit', 'Write', 'Bash', 'Read', 'Grep', 'Glob', 'git', 'TodoWrite', 'Task'],
  minConfidence: 0.7,
  skipAlreadyTagged: true,
};

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result from tool tag assignment task
 */
export interface ToolTagAssignmentResult {
  /** Task was executed */
  executed: boolean;
  /** Entries scanned */
  entriesScanned: number;
  /** Entries that received new tool tags */
  entriesTagged: number;
  /** Total tool tags added across all entries */
  tagsAdded: number;
  /** Entries skipped (already tagged or no applicable tools) */
  entriesSkipped: number;
  /** Breakdown by entry type */
  byType: Record<string, { scanned: number; tagged: number; tagsAdded: number }>;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any errors encountered */
  errors?: string[];
}

// =============================================================================
// LLM PROMPT
// =============================================================================

/**
 * Build the prompt for tool tag assignment
 */
function buildToolAssignmentPrompt(
  entryName: string,
  entryContent: string,
  availableTools: string[]
): string {
  return `You are analyzing a coding guideline or knowledge entry to determine which development tools it applies to.

Available tools:
${availableTools.map((t) => `- ${t}`).join('\n')}

Tool descriptions:
- Edit: Modifies existing source code files (TypeScript, JavaScript, etc.)
- Write: Creates new files
- Bash: Runs shell commands, scripts, npm, git commands
- Read: Reads file contents
- Grep: Searches file contents
- Glob: Finds files by pattern
- git: Git version control operations
- TodoWrite: Creates/manages todo items
- Task: Delegates work to sub-agents

Entry to analyze:
Name: ${entryName}
Content: ${entryContent}

Based on the entry content, which tools should this guideline/knowledge apply to?
Consider:
- If it's about code style, imports, types → Edit, Write
- If it's about file naming, structure → Write, Glob
- If it's about commands, scripts, testing → Bash
- If it's about git workflows → git, Bash
- If it's about task management → TodoWrite, Task

Respond with a JSON object:
{
  "tools": ["ToolName1", "ToolName2"],
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}

Only include tools where the entry is clearly relevant. If the entry is general (applies to everything or nothing specific), return empty tools array.`;
}

/**
 * Parse LLM response for tool assignments
 */
function parseToolAssignmentResponse(
  response: string,
  availableTools: string[]
): { tools: string[]; confidence: number } | null {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0];
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const parsedObj = parsed as Record<string, unknown>;

    if (!Array.isArray(parsedObj.tools)) {
      return null;
    }

    // Filter to only valid tools
    const validTools = (parsedObj.tools as unknown[]).filter(
      (t: unknown) => typeof t === 'string' && availableTools.includes(t)
    ) as string[];

    const confidence = typeof parsedObj.confidence === 'number' ? parsedObj.confidence : 0.5;

    return {
      tools: validTools,
      confidence,
    };
  } catch (error) {
    logger.debug({ error, response }, 'Failed to parse tool assignment response');
    return null;
  }
}

// =============================================================================
// TASK RUNNER
// =============================================================================

export interface ToolTagAssignmentDeps {
  repos: Repositories;
  extractionService?: IExtractionService;
}

/**
 * Run tool tag assignment task
 */
export async function runToolTagAssignment(
  deps: ToolTagAssignmentDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: ToolTagAssignmentConfig
): Promise<ToolTagAssignmentResult> {
  const startTime = Date.now();
  const result: ToolTagAssignmentResult = {
    executed: true,
    entriesScanned: 0,
    entriesTagged: 0,
    tagsAdded: 0,
    entriesSkipped: 0,
    byType: {},
    durationMs: 0,
  };

  try {
    // Check if extraction service is available
    if (!deps.extractionService) {
      logger.debug('Tool tag assignment skipped: extraction service not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;

    // Process each entry type
    for (const entryType of config.entryTypes) {
      const typeStats = { scanned: 0, tagged: 0, tagsAdded: 0 };

      try {
        // Get entries of this type
        let entries: Array<{ id: string; name?: string; title?: string; content?: string }> = [];

        if (entryType === 'guideline') {
          const guidelines = await deps.repos.guidelines.list({ scopeType, scopeId });
          entries = guidelines.slice(0, config.maxEntries).map((g) => ({
            id: g.id,
            name: g.name,
            content: g.currentVersion?.content ?? undefined,
          }));
        } else if (entryType === 'knowledge') {
          const knowledge = await deps.repos.knowledge.list({ scopeType, scopeId });
          entries = knowledge.slice(0, config.maxEntries).map((k) => ({
            id: k.id,
            title: k.title,
            content: k.currentVersion?.content ?? undefined,
          }));
        }

        // Process each entry
        for (const entry of entries) {
          typeStats.scanned++;
          result.entriesScanned++;

          // Check if already has tool:* tags
          if (config.skipAlreadyTagged) {
            const currentTags = await deps.repos.entryTags.getTagsForEntry(entryType, entry.id);
            const hasToolTag = currentTags.some((t) => t.name.startsWith('tool:'));
            if (hasToolTag) {
              result.entriesSkipped++;
              continue;
            }
          }

          // Build text for analysis
          const entryName = entry.name ?? entry.title ?? 'Untitled';
          const entryContent = entry.content ?? '';
          if (!entryContent || entryContent.length < 10) {
            result.entriesSkipped++;
            continue;
          }

          // Call LLM for tool assignment
          const userPrompt = buildToolAssignmentPrompt(
            entryName,
            entryContent,
            config.availableTools
          );

          try {
            const llmResponse = await deps.extractionService.generate({
              systemPrompt:
                'You are a code analysis assistant that determines which development tools are relevant to coding guidelines and knowledge entries.',
              userPrompt,
              maxTokens: 500,
              temperature: 0.3,
            });

            if (!llmResponse.texts || llmResponse.texts.length === 0 || !llmResponse.texts[0]) {
              logger.debug({ entryId: entry.id }, 'Empty LLM response for entry');
              result.entriesSkipped++;
              continue;
            }

            const parsed = parseToolAssignmentResponse(llmResponse.texts[0], config.availableTools);

            if (!parsed || parsed.tools.length === 0) {
              result.entriesSkipped++;
              continue;
            }

            if (parsed.confidence < config.minConfidence) {
              logger.debug(
                { entryId: entry.id, confidence: parsed.confidence },
                'Tool assignment confidence below threshold'
              );
              result.entriesSkipped++;
              continue;
            }

            // Apply tool tags (skip if dry run)
            if (!request.dryRun) {
              let tagsAddedForEntry = 0;

              for (const toolName of parsed.tools) {
                const tagName = `tool:${toolName}`;

                try {
                  // Get or create the tool tag
                  const tag = await deps.repos.tags.getOrCreate(tagName, 'meta');

                  // Attach tag to entry
                  await deps.repos.entryTags.attach({
                    entryType,
                    entryId: entry.id,
                    tagId: tag.id,
                  });

                  tagsAddedForEntry++;
                  typeStats.tagsAdded++;
                  result.tagsAdded++;
                } catch (tagError) {
                  // Ignore duplicate tag errors
                  const errorMsg = tagError instanceof Error ? tagError.message : String(tagError);
                  if (!errorMsg.includes('already attached')) {
                    logger.debug(
                      { entryType, entryId: entry.id, tagName, error: errorMsg },
                      'Failed to attach tool tag'
                    );
                  }
                }
              }

              if (tagsAddedForEntry > 0) {
                typeStats.tagged++;
                result.entriesTagged++;
                logger.debug(
                  {
                    entryType,
                    entryId: entry.id,
                    entryName,
                    tools: parsed.tools,
                    confidence: parsed.confidence,
                  },
                  'Assigned tool tags to entry'
                );
              }
            } else {
              // Dry run - just count what would be done
              typeStats.tagged++;
              typeStats.tagsAdded += parsed.tools.length;
              result.entriesTagged++;
              result.tagsAdded += parsed.tools.length;
            }
          } catch (llmError) {
            const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
            logger.debug({ entryId: entry.id, error: errorMsg }, 'LLM call failed for entry');
            // Continue with other entries
          }
        }
      } catch (typeError) {
        const errorMsg = `Failed to process ${entryType}: ${typeError instanceof Error ? typeError.message : String(typeError)}`;
        logger.warn({ entryType, error: errorMsg }, 'Entry type processing failed');
        result.errors = result.errors ?? [];
        result.errors.push(errorMsg);
      }

      result.byType[entryType] = typeStats;
    }

    logger.info(
      {
        scopeType,
        scopeId,
        entriesScanned: result.entriesScanned,
        entriesTagged: result.entriesTagged,
        tagsAdded: result.tagsAdded,
        entriesSkipped: result.entriesSkipped,
        dryRun: request.dryRun,
      },
      'Tool tag assignment completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMsg }, 'Tool tag assignment task failed');
    result.errors = [errorMsg];
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

import type { DbClient } from '../../../db/connection.js';
import type { IExtractionService } from '../../../core/context.js';
import { createComponentLogger } from '../../../utils/logger.js';
import type { ConsolidationStrategy } from '../strategy.interface.js';
import type { SimilarityGroup, StrategyResult } from '../types.js';
import {
  getEntryDetails,
  batchDeactivateEntries,
  updateEntryContent,
  createConsolidationRelation,
  createMergedContent,
} from '../helpers.js';

const logger = createComponentLogger('consolidation.merge');

export interface MergeStrategyOptions {
  extractionService?: IExtractionService;
}

export class MergeStrategy implements ConsolidationStrategy {
  readonly name = 'semantic_merge' as const;
  private extractionService?: IExtractionService;

  constructor(options: MergeStrategyOptions = {}) {
    this.extractionService = options.extractionService;
  }

  async execute(
    group: SimilarityGroup,
    consolidatedBy: string | undefined,
    db: DbClient
  ): Promise<StrategyResult> {
    const allEntryIds = [group.primaryId, ...group.members.map((m) => m.id)];
    const entries = getEntryDetails(group.entryType, allEntryIds, db);

    const entriesById = new Map(entries.map((e) => [e.id, e]));

    const primaryEntry = entriesById.get(group.primaryId);
    if (!primaryEntry) {
      return {
        success: false,
        entriesProcessed: 0,
        entriesDeactivated: 0,
        entriesMerged: 0,
        relationsCreated: 0,
        error: `Primary entry ${group.primaryId} not found`,
      };
    }

    const memberContents = group.members
      .map((m) => {
        const entry = entriesById.get(m.id);
        return entry?.content || '';
      })
      .filter((c) => c.length > 0);

    const mergedContent = await this.synthesizeMergedContent(
      primaryEntry.content,
      memberContents,
      group.entryType
    );

    updateEntryContent(
      group.entryType,
      group.primaryId,
      mergedContent,
      `Merged from ${group.members.length} similar entries`,
      consolidatedBy,
      db
    );

    const memberIds = group.members.map((m) => m.id);
    batchDeactivateEntries(group.entryType, memberIds, db);

    for (const member of group.members) {
      createConsolidationRelation(group.entryType, member.id, group.primaryId, 'merged_into', db);
    }

    logger.info(
      {
        primaryId: group.primaryId,
        mergedCount: group.members.length,
      },
      'Merge consolidation completed'
    );

    return {
      success: true,
      entriesProcessed: group.members.length + 1,
      entriesDeactivated: group.members.length,
      entriesMerged: group.members.length,
      relationsCreated: group.members.length,
    };
  }

  private async synthesizeMergedContent(
    primaryContent: string,
    memberContents: string[],
    entryType: string
  ): Promise<string> {
    if (!this.extractionService?.isAvailable()) {
      return createMergedContent(primaryContent, memberContents);
    }

    try {
      const allContents = [primaryContent, ...memberContents];
      const prompt = `Merge these ${allContents.length} similar ${entryType} entries into a single, coherent entry.
Preserve all unique information while eliminating redundancy.

Entry 1 (primary):
${primaryContent}

${memberContents.map((c, i) => `Entry ${i + 2}:\n${c}`).join('\n\n')}

Respond in this exact JSON format:
{
  "merged_content": "The synthesized content combining all unique information",
  "key_points": ["array", "of", "key", "points", "preserved"]
}`;

      const result = await this.extractionService.extract({
        context: prompt,
        contextType: 'mixed',
        focusAreas: ['facts', 'rules'],
      });

      for (const entry of result.entries) {
        try {
          const jsonMatch = entry.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as {
              merged_content?: string;
              key_points?: string[];
            };
            if (parsed.merged_content && parsed.merged_content.length > 0) {
              logger.debug(
                { entryType, keyPoints: parsed.key_points?.length },
                'LLM synthesis successful for merge'
              );
              return parsed.merged_content;
            }
          }
        } catch {
          continue;
        }
      }

      logger.debug({ entryType }, 'LLM synthesis returned no valid content, using heuristic');
      return createMergedContent(primaryContent, memberContents);
    } catch (error) {
      logger.debug(
        { error: error instanceof Error ? error.message : String(error), entryType },
        'LLM synthesis failed, using heuristic fallback'
      );
      return createMergedContent(primaryContent, memberContents);
    }
  }
}

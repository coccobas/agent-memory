/**
 * Format Stage
 *
 * Applies final transformations:
 * - Limit results
 * - Compact mode (strip unnecessary fields)
 */

import type { Tool, Guideline, Knowledge } from '../../../db/schema.js';
import type { PipelineContext, QueryResultItem } from '../pipeline.js';

/**
 * Format stage - applies limit and compact transformations
 */
export function formatStage(ctx: PipelineContext): PipelineContext {
  const { results, limit, params } = ctx;

  // Apply limit
  const limited = results.slice(0, limit);

  // Apply compact mode if requested
  if (!params.compact) {
    return {
      ...ctx,
      results: limited,
    };
  }

  const compacted = limited.map((item): QueryResultItem => {
    if (item.type === 'tool') {
      return {
        ...item,
        version: undefined,
        versions: undefined,
        tool: {
          id: item.tool.id,
          name: item.tool.name,
          category: item.tool.category,
        } as Tool,
      };
    } else if (item.type === 'guideline') {
      return {
        ...item,
        version: undefined,
        versions: undefined,
        guideline: {
          id: item.guideline.id,
          name: item.guideline.name,
          category: item.guideline.category,
          priority: item.guideline.priority,
        } as Guideline,
      };
    } else {
      return {
        ...item,
        version: undefined,
        versions: undefined,
        knowledge: {
          id: item.knowledge.id,
          title: item.knowledge.title,
          category: item.knowledge.category,
        } as Knowledge,
      };
    }
  });

  return {
    ...ctx,
    results: compacted,
  };
}

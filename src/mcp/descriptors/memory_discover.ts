/**
 * memory_discover tool descriptor
 *
 * Helps users discover hidden/advanced memory features that may not be visible by default.
 * Categorizes tools by feature area (Graph, Summarization, Advanced Query, System/Admin).
 */

import type { SimpleToolDescriptor, AnyToolDescriptor, VisibilityLevel } from './types.js';
import type { AppContext } from '../../core/context.js';

// Helper to get visibility level from descriptor
function getVisibility(descriptor: AnyToolDescriptor): VisibilityLevel {
  return descriptor.visibility ?? 'standard';
}

export interface DiscoverResult {
  categories: Record<string, Array<{ name: string; description: string; visibility: string }>>;
  totalCount: number;
  _display: string;
}

export const memoryDiscoverDescriptor: SimpleToolDescriptor = {
  name: 'memory_discover',
  visibility: 'standard',
  description: 'Discover hidden/advanced memory features with usage examples.',
  params: {
    filter: {
      type: 'string',
      enum: ['all', 'advanced', 'system', 'graph', 'summarization'],
      description: 'Filter by feature category (default: all)',
    },
  },
  contextHandler: async (
    _ctx: AppContext,
    args?: Record<string, unknown>
  ): Promise<DiscoverResult> => {
    const filter = (args?.filter as string) ?? 'all';

    // Import allDescriptors dynamically to avoid circular dependency
    const { allDescriptors } = await import('./index.js');

    // Group tools by category
    const categories: Record<
      string,
      Array<{ name: string; description: string; visibility: string }>
    > = {
      'Graph Operations': [],
      'Hierarchical Summarization': [],
      'Advanced Query': [],
      'System/Admin': [],
    };

    for (const desc of allDescriptors) {
      const visibility = getVisibility(desc);

      // Skip core/standard unless filter is 'all'
      if (filter !== 'all' && visibility !== 'advanced' && visibility !== 'system') {
        continue;
      }

      // Categorize
      const toolName = desc.name;
      const firstLine = desc.description.split('\n')[0] ?? '';

      if (toolName.startsWith('graph_') || toolName === 'memory_graph_status') {
        categories['Graph Operations']?.push({
          name: toolName,
          description: firstLine,
          visibility,
        });
      } else if (toolName.includes('summar')) {
        categories['Hierarchical Summarization']?.push({
          name: toolName,
          description: firstLine,
          visibility,
        });
      } else if (visibility === 'advanced') {
        categories['Advanced Query']?.push({
          name: toolName,
          description: firstLine,
          visibility,
        });
      } else if (visibility === 'system') {
        categories['System/Admin']?.push({
          name: toolName,
          description: firstLine,
          visibility,
        });
      }
    }

    // Build display
    const lines = ['🔍 Discoverable Features\n'];

    for (const [category, tools] of Object.entries(categories)) {
      if (tools.length === 0) continue;

      lines.push(`\n## ${category} (${tools.length} tools)`);
      for (const tool of tools) {
        lines.push(`- ${tool.name} [${tool.visibility}]`);
        lines.push(`  ${tool.description}`);
      }
    }

    lines.push(
      '\n💡 Enable with: AGENT_MEMORY_TOOL_VISIBILITY=advanced (or "all" for system tools)'
    );

    return {
      categories,
      totalCount: Object.values(categories).flat().length,
      _display: lines.join('\n'),
    };
  },
};

/**
 * Graph Status handler
 *
 * MCP handler for memory_graph_status tool - provides diagnostic information
 * about the knowledge graph's current state.
 */

import type { AppContext } from '../../core/context.js';
import { createValidationError } from '../../core/errors.js';

/**
 * Ensure graph repositories are available in context
 */
function ensureGraphRepos(context: AppContext) {
  if (!context.repos.graphNodes || !context.repos.graphEdges || !context.repos.typeRegistry) {
    throw createValidationError(
      'repositories',
      'Graph repositories not initialized. Run database migration first.'
    );
  }
  return {
    nodeRepo: context.repos.graphNodes,
    edgeRepo: context.repos.graphEdges,
    typeRegistry: context.repos.typeRegistry,
  };
}

export const graphStatusHandlers = {
  /**
   * Get current knowledge graph status
   * Returns diagnostic information: type counts, node/edge counts, sample type names
   */
  async getStatus(context: AppContext, _params: Record<string, unknown>) {
    const { nodeRepo, edgeRepo, typeRegistry } = ensureGraphRepos(context);

    // Get all types
    const nodeTypes = await typeRegistry.listNodeTypes({ includeBuiltin: true });
    const edgeTypes = await typeRegistry.listEdgeTypes({ includeBuiltin: true });

    // Get all nodes and edges (for counting - should add count methods in future)
    // Note: Empty filter {} returns all nodes regardless of scope
    const nodes = await nodeRepo.list({}, { limit: 10000 });
    const edges = await edgeRepo.list({}, { limit: 10000 });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              nodeTypes: {
                count: nodeTypes.length,
                names: nodeTypes.map((t) => t.name),
                builtinCount: nodeTypes.filter((t) => t.isBuiltin).length,
                customCount: nodeTypes.filter((t) => !t.isBuiltin).length,
              },
              edgeTypes: {
                count: edgeTypes.length,
                names: edgeTypes.map((t) => t.name),
                builtinCount: edgeTypes.filter((t) => t.isBuiltin).length,
                customCount: edgeTypes.filter((t) => !t.isBuiltin).length,
              },
              nodes: {
                count: nodes.length,
                sampleNames: nodes.slice(0, 5).map((n) => n.name),
              },
              edges: {
                count: edges.length,
              },
              status: nodes.length === 0 && edges.length === 0 ? 'empty' : 'active',
              message:
                nodes.length === 0 && edges.length === 0
                  ? 'Graph is empty. No nodes or edges created yet.'
                  : `Graph is active with ${nodes.length} nodes and ${edges.length} edges.`,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

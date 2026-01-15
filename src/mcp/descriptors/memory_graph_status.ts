/**
 * memory_graph_status tool descriptor
 *
 * Diagnostic tool that returns current knowledge graph status including
 * type counts, node/edge counts, and sample data.
 */

import type { ToolDescriptor } from './types.js';
import { graphStatusHandlers } from '../handlers/graph-status.handler.js';

export const memoryGraphStatusDescriptor: ToolDescriptor = {
  name: 'memory_graph_status',
  visibility: 'standard',
  description: `Get diagnostic information about the knowledge graph's current state.

Returns:
- Node type count and names (builtin vs custom)
- Edge type count and names (builtin vs custom)
- Current node count with sample names
- Current edge count
- Graph status (empty or active)

Example: {}

This tool requires no parameters and provides a snapshot of the graph's health.`,
  commonParams: {},
  actions: {
    status: {
      required: [],
      contextHandler: graphStatusHandlers.getStatus,
    },
  },
};

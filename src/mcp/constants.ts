/**
 * MCP Tool Constants
 *
 * Shared constants for MCP tool handling.
 */

/**
 * Human-readable labels for auto-session naming based on tool type.
 * Used when inferring session names from tool operations.
 */
export const TOOL_LABELS: Record<string, string> = {
  memory_guideline: 'Adding guideline',
  memory_knowledge: 'Adding knowledge',
  memory_tool: 'Adding tool',
  memory_experience: 'Recording experience',
  graph_node: 'Creating graph node',
  graph_edge: 'Creating graph edge',
};

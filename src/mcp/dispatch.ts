/**
 * MCP Handler Dispatch
 *
 * This module re-exports the generated handlers from the descriptor system.
 * The bundledHandlers export is maintained for backward compatibility.
 *
 * @see src/mcp/descriptors/ for the unified tool descriptor system
 */

// Re-export generated handlers from descriptors
// This maintains backward compatibility while centralizing the source of truth
export { GENERATED_HANDLERS as bundledHandlers } from './descriptors/index.js';

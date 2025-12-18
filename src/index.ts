// Main entry point for agent-memory core (library usage)
// Transports (MCP/REST) are exposed via subpath exports.

// Load configuration first (imports .env)
import './config/index.js';

// Re-export core/shared types (avoid name collisions with db exports)
export type { MemoryContextParams, MemoryQueryParams } from './core/types.js';

// Re-export database utilities
export * from './db/index.js';

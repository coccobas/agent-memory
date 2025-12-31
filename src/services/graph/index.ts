/**
 * Graph Services - Index
 *
 * Exports graph-related services (type registry).
 */

export { createTypeRegistry } from './type-registry.service.js';
export { BUILTIN_NODE_TYPES, BUILTIN_EDGE_TYPES } from './builtin-types.js';
export type { BuiltinNodeTypeDef, BuiltinEdgeTypeDef } from './builtin-types.js';

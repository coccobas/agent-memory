/**
 * Application Context Factory
 *
 * This module provides the main factory function for creating AppContext,
 * along with specialized sub-factories for different concerns.
 *
 * @module core/factory
 */

// Re-export sub-factories for direct use
export { createRepositories } from './repositories.js';
export { createServices } from './services.js';
export { createQueryPipeline, wireQueryCache } from './query-pipeline.js';

// Re-export main factory from parent module
export { createAppContext } from '../factory.js';

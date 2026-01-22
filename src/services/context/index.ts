/**
 * Context Management Module
 *
 * Provides enhanced context injection with:
 * - Dynamic budget calculation
 * - Priority-based entry selection
 * - Staleness detection
 * - Progressive compression
 */

// Staleness Detection
export {
  StaleContextDetector,
  createStaleContextDetector,
  type StaleDetectorConfig,
  type StalenessEntry,
  type StalenessWarning,
  type StaleDetectorResult,
  DEFAULT_STALE_DETECTOR_CONFIG,
} from './stale-detector.js';

// Dynamic Budget Calculation
export {
  DynamicBudgetCalculator,
  createBudgetCalculator,
  type BudgetCalculatorConfig,
  type BudgetEntry,
  type BudgetResult,
  type TaskComplexity,
  DEFAULT_BUDGET_CONFIG,
  COMPLEXITY_MULTIPLIERS,
  INTENT_COMPLEXITY_MAP,
  INTENT_TYPE_WEIGHTS,
} from './budget-calculator.js';

// Priority Integration
export {
  PriorityIntegrationService,
  createPriorityIntegrationService,
  type PriorityIntegrationConfig,
  type PrioritizableEntry,
  type PrioritizedEntry,
  type PriorityIntegrationResult,
  DEFAULT_PRIORITY_INTEGRATION_CONFIG,
} from './priority-integration.js';

// Compression
export {
  CompressionManager,
  createCompressionManager,
  type CompressionManagerConfig,
  type CompressibleEntry,
  type CompressionLevel,
  type CompressionResult,
  DEFAULT_COMPRESSION_CONFIG,
} from './compression-manager.js';

// Context Manager (Orchestrator)
export {
  ContextManagerService,
  createContextManagerService,
  type ContextManagerConfig,
  type ContextEntry,
  type ContextRequest,
  type ContextResult,
  DEFAULT_CONTEXT_MANAGER_CONFIG,
} from './context-manager.service.js';

// Unified Context Service (Single API for all context retrieval)
export {
  UnifiedContextService,
  createUnifiedContextService,
  type ContextPurpose,
  type IncludableEntryType,
  type UnifiedContextRequest,
  type UnifiedContextResult,
  type StalenessWarning as UnifiedStalenessWarning,
} from './unified-context.service.js';

export type { PurposeBudgetConfig } from '../../config/registry/sections/contextBudget.js';

// Existing services
export { enrichResultsWithVersionContent } from './version-enricher.js';
export { formatHierarchicalContext } from './hierarchical-formatter.js';

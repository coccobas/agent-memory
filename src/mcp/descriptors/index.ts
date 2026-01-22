/**
 * Unified Tool Descriptor System - Main Export
 *
 * This module provides:
 * 1. All tool descriptors in a single array
 * 2. Generated TOOLS array for MCP ListToolsRequest
 * 3. Generated bundledHandlers for dispatch routing
 */

// Re-export types
export * from './types.js';

// Import all descriptors
import { memoryOrgDescriptor } from './memory_org.js';
import { memoryProjectDescriptor } from './memory_project.js';
import { memorySessionDescriptor } from './memory_session.js';
import { memoryToolDescriptor } from './memory_tool.js';
import { memoryGuidelineDescriptor } from './memory_guideline.js';
import { memoryKnowledgeDescriptor } from './memory_knowledge.js';
import { memoryTagDescriptor } from './memory_tag.js';
import { memoryRelationDescriptor } from './memory_relation.js';
import { memoryFileLockDescriptor } from './memory_file_lock.js';
import { memoryQueryDescriptor } from './memory_query.js';
import { memoryDecompositionDescriptor } from './memory_decomposition.js';
import { memoryTaskDescriptor } from './memory_task.js';
import { memoryVotingDescriptor } from './memory_voting.js';
import { memoryAnalyticsDescriptor } from './memory_analytics.js';
import { memoryPermissionDescriptor } from './memory_permission.js';
import { memoryConflictDescriptor } from './memory_conflict.js';
import { memoryHealthDescriptor } from './memory_health.js';
import { memoryBackupDescriptor } from './memory_backup.js';
import { memoryInitDescriptor } from './memory_init.js';
import { memoryExportDescriptor } from './memory_export.js';
import { memoryImportDescriptor } from './memory_import.js';
import { memoryConversationDescriptor } from './memory_conversation.js';
import { memoryVerifyDescriptor } from './memory_verify.js';
import { memoryHookDescriptor } from './memory_hook.js';
import { memoryObserveDescriptor } from './memory_observe.js';
import { memoryConsolidateDescriptor } from './memory_consolidate.js';
import { memoryReviewDescriptor } from './memory_review.js';
import { memoryExperienceDescriptor } from './memory_experience.js';
import { memory_librarian as memoryLibrarianDescriptor } from './memory_librarian.js';
import { memoryForgetDescriptor } from './memory_forget.js';
import { memoryFeedbackDescriptor } from './memory_feedback.js';
import { memoryRlDescriptor } from './memory_rl.js';
import { memoryLatentDescriptor } from './memory_latent.js';
import { memorySummarizeDescriptor } from './memory_summarize.js';
import { memoryLoraDescriptor } from './memory_lora.js';
import { graphNodeDescriptor } from './graph_node.js';
import { graphEdgeDescriptor } from './graph_edge.js';
import { memoryGraphStatusDescriptor } from './memory_graph_status.js';
import { memoryContextDescriptor } from './memory_context.js';
import { memoryQuickstartDescriptor } from './memory_quickstart.js';
import { memoryRememberDescriptor } from './memory_remember.js';

import { memoryEvidenceDescriptor } from './memory_evidence.js';
import { memoryDescriptor } from './memory.js';
import { memoryExtractionApproveDescriptor } from './memory_extraction_approve.js';
import { memoryStatusDescriptor } from './memory_status.js';
import { memoryDiscoverDescriptor } from './memory_discover.js';
import { memoryEpisodeDescriptor } from './memory_episode.js';
import { memoryOpsDescriptor } from './memory_ops.js';
import { memoryOnboardDescriptor } from './memory_onboard.js';
import { memoryWalkthroughDescriptor } from './memory_walkthrough.js';

import {
  type AnyToolDescriptor,
  type VisibilityLevel,
  descriptorToTool,
  descriptorToHandler,
} from './types.js';

/**
 * Valid visibility level configuration options
 */
type VisibilityConfig = 'core' | 'standard' | 'advanced' | 'experimental' | 'all';

/**
 * Visibility hierarchy - each level includes all lower levels
 * - core: Essential tools only
 * - standard: core + common tools
 * - advanced: standard + power-user tools
 * - experimental: advanced + specialized ML/multi-agent features
 * - all: experimental + system/admin tools
 */
const VISIBILITY_HIERARCHY: Record<VisibilityConfig, VisibilityLevel[]> = {
  core: ['core'],
  standard: ['core', 'standard'],
  advanced: ['core', 'standard', 'advanced'],
  experimental: ['core', 'standard', 'advanced', 'experimental'],
  all: ['core', 'standard', 'advanced', 'experimental', 'system'],
};

/**
 * Get effective visibility level for a descriptor
 * Defaults to 'standard' if not specified
 */
function getVisibility(descriptor: AnyToolDescriptor): VisibilityLevel {
  return descriptor.visibility ?? 'standard';
}

/**
 * Filter descriptors by visibility level
 */
export function filterByVisibility(
  descriptors: AnyToolDescriptor[],
  visibilityLevel: VisibilityConfig = 'standard'
): AnyToolDescriptor[] {
  const allowedLevels = VISIBILITY_HIERARCHY[visibilityLevel];
  return descriptors.filter((d) => allowedLevels.includes(getVisibility(d)));
}

/**
 * All tool descriptors in registration order
 */
export const allDescriptors: AnyToolDescriptor[] = [
  // Organization Management
  memoryOrgDescriptor,
  // Project Management
  memoryProjectDescriptor,
  // Session Management
  memorySessionDescriptor,
  // Tools Registry
  memoryToolDescriptor,
  // Guidelines
  memoryGuidelineDescriptor,
  // Knowledge
  memoryKnowledgeDescriptor,
  // Tags
  memoryTagDescriptor,
  // Relations
  memoryRelationDescriptor,
  // File Locks
  memoryFileLockDescriptor,
  // Query
  memoryQueryDescriptor,
  // Task Decomposition
  memoryDecompositionDescriptor,
  // Work Items and Tasks
  memoryTaskDescriptor,
  // Multi-Agent Voting
  memoryVotingDescriptor,
  // Analytics
  memoryAnalyticsDescriptor,
  // Permissions
  memoryPermissionDescriptor,
  // Conflicts
  memoryConflictDescriptor,
  // Health Check
  memoryHealthDescriptor,
  // Backup
  memoryBackupDescriptor,
  // Init
  memoryInitDescriptor,
  // Export
  memoryExportDescriptor,
  // Import
  memoryImportDescriptor,
  // Conversation History
  memoryConversationDescriptor,
  // Verification
  memoryVerifyDescriptor,
  // Hook Management
  memoryHookDescriptor,
  // Auto-capture Observation
  memoryObserveDescriptor,
  // Memory Consolidation
  memoryConsolidateDescriptor,
  // Review Candidates
  memoryReviewDescriptor,
  // Experiential Memory
  memoryExperienceDescriptor,
  // Librarian Agent
  memoryLibrarianDescriptor,
  // Memory Forgetting
  memoryForgetDescriptor,
  // RL Feedback
  memoryFeedbackDescriptor,
  // RL Policies
  memoryRlDescriptor,
  // Latent Memory / KV-Cache
  memoryLatentDescriptor,
  // Hierarchical Summarization
  memorySummarizeDescriptor,
  // LoRA Training Data Export
  memoryLoraDescriptor,
  // Graph Nodes (Flexible Knowledge Graph)
  graphNodeDescriptor,
  // Graph Edges (Flexible Knowledge Graph)
  graphEdgeDescriptor,
  // Graph Status (Diagnostic)
  memoryGraphStatusDescriptor,
  // Context Detection Diagnostic
  memoryContextDescriptor,
  // Quickstart (composite tool)
  memoryQuickstartDescriptor,
  // Natural language memory store
  memoryRememberDescriptor,
  // Immutable Evidence Artifacts
  memoryEvidenceDescriptor,
  // Unified Natural Language Interface (simplified entry point)
  memoryDescriptor,
  // Extraction Approval (for approving auto-detected suggestions)
  memoryExtractionApproveDescriptor,
  // Status Dashboard (user-facing summary)
  memoryStatusDescriptor,
  // Feature Discovery (helps discover hidden/advanced tools)
  memoryDiscoverDescriptor,
  // Episodes (Temporal Activity Grouping)
  memoryEpisodeDescriptor,
  // Operational Utilities (auto-tag, session timeout, red flags, embedding coverage, backfill)
  memoryOpsDescriptor,
  // Onboarding Wizard (guided setup for new projects)
  memoryOnboardDescriptor,
  // Interactive Walkthrough Tutorial
  memoryWalkthroughDescriptor,
];

/**
 * Generated MCP TOOLS array (all tools)
 *
 * Use this as a drop-in replacement for the manually-defined TOOLS in server.ts
 */
export const GENERATED_TOOLS = allDescriptors.map(descriptorToTool);

/**
 * Generate filtered TOOLS array based on visibility level
 * Use this for progressive disclosure of tools
 */
export function getFilteredTools(visibilityLevel: VisibilityConfig = 'standard') {
  return filterByVisibility(allDescriptors, visibilityLevel).map(descriptorToTool);
}

// Export the visibility config type for use in other modules
export type { VisibilityConfig };

/**
 * Generated bundled handlers (always includes all handlers)
 *
 * Use this as a drop-in replacement for bundledHandlers in dispatch.ts
 * Note: Handlers for all tools are always available, even if tool is hidden from listing
 */
export const GENERATED_HANDLERS = Object.fromEntries(
  allDescriptors.map((d) => [d.name, descriptorToHandler(d)])
);

// Also export individual descriptors for direct access if needed
export {
  memoryOrgDescriptor,
  memoryProjectDescriptor,
  memorySessionDescriptor,
  memoryToolDescriptor,
  memoryGuidelineDescriptor,
  memoryKnowledgeDescriptor,
  memoryTagDescriptor,
  memoryRelationDescriptor,
  memoryFileLockDescriptor,
  memoryQueryDescriptor,
  memoryDecompositionDescriptor,
  memoryTaskDescriptor,
  memoryVotingDescriptor,
  memoryAnalyticsDescriptor,
  memoryPermissionDescriptor,
  memoryConflictDescriptor,
  memoryHealthDescriptor,
  memoryBackupDescriptor,
  memoryInitDescriptor,
  memoryExportDescriptor,
  memoryImportDescriptor,
  memoryConversationDescriptor,
  memoryVerifyDescriptor,
  memoryHookDescriptor,
  memoryObserveDescriptor,
  memoryConsolidateDescriptor,
  memoryReviewDescriptor,
  memoryExperienceDescriptor,
  memoryLibrarianDescriptor,
  memoryForgetDescriptor,
  memoryFeedbackDescriptor,
  memoryRlDescriptor,
  memoryLatentDescriptor,
  memorySummarizeDescriptor,
  memoryLoraDescriptor,
  graphNodeDescriptor,
  graphEdgeDescriptor,
  memoryGraphStatusDescriptor,
  memoryContextDescriptor,
  memoryQuickstartDescriptor,
  memoryRememberDescriptor,
  memoryEvidenceDescriptor,
  memoryDescriptor,
  memoryExtractionApproveDescriptor,
  memoryStatusDescriptor,
  memoryEpisodeDescriptor,
  memoryOpsDescriptor,
  memoryOnboardDescriptor,
  memoryWalkthroughDescriptor,
};

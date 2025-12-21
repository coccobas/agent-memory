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

import {
  type AnyToolDescriptor,
  descriptorToTool,
  descriptorToHandler,
} from './types.js';

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
];

/**
 * Generated MCP TOOLS array
 *
 * Use this as a drop-in replacement for the manually-defined TOOLS in server.ts
 */
export const GENERATED_TOOLS = allDescriptors.map(descriptorToTool);

/**
 * Generated bundled handlers
 *
 * Use this as a drop-in replacement for bundledHandlers in dispatch.ts
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
};

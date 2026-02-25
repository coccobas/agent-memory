/**
 * V2 Tool Descriptor System - 12 Tools
 *
 * Collapsed from 54 v1 tools to 12 v2 tools:
 * - memory_quickstart: Session bootstrap + context load
 * - memory: Natural language read/write interface
 * - memory_remember: Quick store with auto-type detection
 * - memory_write: Structured CRUD (entries, relations, tags, scopes)
 * - memory_query: Search + hierarchical context
 * - memory_session: Session start/end/list
 * - memory_projector: Admin: outbox status, drain, replay, embed
 * - memory_observe: Conversation transcript ingestion
 * - memory_notion_ingest: Import Notion pages as memory entries
 * - memory_slack_ingest: Import Slack threads as memory entries
 * - memory_openwebui_ingest: Import Open WebUI documents via pipelines
 * - memory_transcript_search: Search transcripts + entry provenance
 */

// Re-export types
export * from './types.js';

// V2 descriptors (new)
import { memoryQuickstartDescriptor } from './v2/memory_quickstart.js';
import { memoryDescriptor } from './v2/memory.js';
import { memoryRememberDescriptor } from './v2/memory_remember.js';
import { memorySessionDescriptor } from './v2/memory_session.js';
import { memoryTopicDescriptor } from './v2/memory_topic.js';
import { memoryQueryDescriptor } from './v2/memory_query.js';
import { memoryObserveDescriptor } from './v2/memory_observe.js';
import { memoryNotionIngestDescriptor } from './v2/memory_notion_ingest.js';
import { memorySlackIngestDescriptor } from './v2/memory_slack_ingest.js';
import { memoryOpenWebUIIngestDescriptor } from './v2/memory_openwebui_ingest.js';
import { memoryTranscriptSearchDescriptor } from './v2/memory_transcript_search.js';

// V2 descriptors (existing, already delegate to v2 handlers)
import { memoryWriteDescriptor } from './memory_write.js';
import { memoryProjectorDescriptor } from './memory_projector.js';

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

const VISIBILITY_HIERARCHY: Record<VisibilityConfig, VisibilityLevel[]> = {
  core: ['core'],
  standard: ['core', 'standard'],
  advanced: ['core', 'standard', 'advanced'],
  experimental: ['core', 'standard', 'advanced', 'experimental'],
  all: ['core', 'standard', 'advanced', 'experimental', 'system'],
};

function getVisibility(descriptor: AnyToolDescriptor): VisibilityLevel {
  return descriptor.visibility ?? 'standard';
}

export function filterByVisibility(
  descriptors: AnyToolDescriptor[],
  visibilityLevel: VisibilityConfig = 'standard'
): AnyToolDescriptor[] {
  const allowedLevels = VISIBILITY_HIERARCHY[visibilityLevel];
  return descriptors.filter((d) => allowedLevels.includes(getVisibility(d)));
}

/**
 * All 11 v2 tool descriptors
 */
export const allDescriptors: AnyToolDescriptor[] = [
  memoryQuickstartDescriptor,
  memoryDescriptor,
  memoryRememberDescriptor,
  memoryWriteDescriptor,
  memoryQueryDescriptor,
  memorySessionDescriptor,
  memoryTopicDescriptor,
  memoryProjectorDescriptor,
  memoryObserveDescriptor,
  memoryNotionIngestDescriptor,
  memorySlackIngestDescriptor,
  memoryOpenWebUIIngestDescriptor,
  memoryTranscriptSearchDescriptor,
];

export const GENERATED_TOOLS = allDescriptors.map(descriptorToTool);

export function getFilteredTools(visibilityLevel: VisibilityConfig = 'standard') {
  return filterByVisibility(allDescriptors, visibilityLevel).map(descriptorToTool);
}

export type { VisibilityConfig };

export const GENERATED_HANDLERS = Object.fromEntries(
  allDescriptors.map((d) => [d.name, descriptorToHandler(d)])
);

export {
  memoryQuickstartDescriptor,
  memoryDescriptor,
  memoryRememberDescriptor,
  memoryWriteDescriptor,
  memoryQueryDescriptor,
  memorySessionDescriptor,
  memoryTopicDescriptor,
  memoryProjectorDescriptor,
  memoryObserveDescriptor,
  memoryNotionIngestDescriptor,
  memorySlackIngestDescriptor,
  memoryOpenWebUIIngestDescriptor,
  memoryTranscriptSearchDescriptor,
};

/**
 * Repository Interfaces
 *
 * Defines contracts for all repository implementations.
 * Used for dependency injection and testing.
 *
 * Domain split:
 * - metadata.ts: Tags, EntryTags, EntryRelations
 * - workspace.ts: Organizations, Projects, Sessions, FileLocks
 * - memory-entries.ts: Guidelines, Knowledge, Tools, Experiences
 * - conversations.ts: Conversations and context linking
 * - knowledge-graph.ts: TypeRegistry, Nodes, Edges
 * - temporal.ts: Episodes
 * - analytics.ts: Analytics, Voting, Verification
 */

// Re-export all interfaces from domain files
export * from './metadata.js';
export * from './workspace.js';
export * from './memory-entries.js';
export * from './conversations.js';
export * from './knowledge-graph.js';
export * from './temporal.js';
export * from './analytics.js';
export * from './ide-transcripts.js';

// Re-export external repository interfaces
import type {
  IConflictRepository,
  ListConflictsFilter,
} from '../../../db/repositories/conflicts.js';
import type { ITaskRepository } from '../../../db/repositories/tasks.js';
import type { IEvidenceRepository } from '../../../db/repositories/evidence.js';
import type { IHookMetricsRepository } from '../../../db/repositories/hook-metrics.js';
export type { IConflictRepository, ListConflictsFilter };

// Import types for Repositories aggregate
import type { ITagRepository, IEntryTagRepository, IEntryRelationRepository } from './metadata.js';
import type {
  IOrganizationRepository,
  IProjectRepository,
  ISessionRepository,
  IFileLockRepository,
} from './workspace.js';
import type {
  IGuidelineRepository,
  IKnowledgeRepository,
  IToolRepository,
  IExperienceRepository,
} from './memory-entries.js';
import type { IConversationRepository } from './conversations.js';
import type { ITypeRegistry, INodeRepository, IEdgeRepository } from './knowledge-graph.js';
import type { IEpisodeRepository } from './temporal.js';
import type { IIDETranscriptRepository } from './ide-transcripts.js';
import type {
  IAnalyticsRepository,
  IVotingRepository,
  IVerificationRepository,
} from './analytics.js';

// =============================================================================
// AGGREGATED REPOSITORIES TYPE
// =============================================================================

/**
 * All repository instances, used in AppContext
 */
export interface Repositories {
  tags: ITagRepository;
  entryTags: IEntryTagRepository;
  entryRelations: IEntryRelationRepository;
  organizations: IOrganizationRepository;
  projects: IProjectRepository;
  sessions: ISessionRepository;
  fileLocks: IFileLockRepository;
  guidelines: IGuidelineRepository;
  knowledge: IKnowledgeRepository;
  tools: IToolRepository;
  conversations: IConversationRepository;
  conflicts: IConflictRepository;
  experiences: IExperienceRepository;
  verification?: IVerificationRepository;
  voting?: IVotingRepository;
  analytics?: IAnalyticsRepository;
  // Graph repositories (Flexible Knowledge Graph)
  typeRegistry?: ITypeRegistry;
  graphNodes?: INodeRepository;
  graphEdges?: IEdgeRepository;
  // Task and Evidence repositories
  tasks?: ITaskRepository;
  evidence?: IEvidenceRepository;
  // Episode repository (Temporal Activity Grouping)
  episodes?: IEpisodeRepository;
  // Hook metrics repository (Claude Code hook analytics)
  hookMetrics?: IHookMetricsRepository;
  // IDE Transcripts (Immutable conversation archive)
  ideTranscripts?: IIDETranscriptRepository;
}

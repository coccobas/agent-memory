/**
 * Memory Entry Repository Interfaces
 *
 * Guidelines, Knowledge, Tools, and Experiences
 */

import type {
  Guideline,
  GuidelineVersion,
  Knowledge,
  KnowledgeVersion,
  Tool,
  ToolVersion,
  Experience,
  ExperienceVersion,
  ExperienceTrajectoryStep,
  ExperienceLevel,
  ExperienceSource,
  ScopeType,
} from '../../../db/schema.js';
import type { PaginationOptions } from '../../../db/repositories/base.js';

// =============================================================================
// GUIDELINE REPOSITORY
// =============================================================================

export interface CreateGuidelineInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: string;
  priority?: number;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  createdBy?: string;
}

export interface UpdateGuidelineInput {
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: string;
  priority?: number;
  content?: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  changeReason?: string;
  updatedBy?: string;
}

export interface ListGuidelinesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface GuidelineWithVersion extends Guideline {
  currentVersion?: GuidelineVersion;
}

export interface IGuidelineRepository {
  /**
   * Create a new guideline entry.
   * @param input - Guideline creation parameters
   * @returns Created guideline with version info
   * @throws {AgentMemoryError} E1000 - Missing required field (name, content, scopeType)
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2001 - Guideline with same name exists in scope
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateGuidelineInput): Promise<GuidelineWithVersion>;

  /**
   * Get a guideline by ID.
   * @param id - Guideline ID
   * @returns Guideline with current version, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<GuidelineWithVersion | undefined>;

  /**
   * Batch fetch guidelines by IDs using SQL IN clause for efficiency.
   * @param ids - Array of guideline IDs
   * @returns Array of guidelines (may be fewer if some IDs not found)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByIds(ids: string[]): Promise<GuidelineWithVersion[]>;

  /**
   * Get a guideline by name within a scope.
   * @param name - Guideline name
   * @param scopeType - Scope type to search
   * @param scopeId - Scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes
   * @returns Guideline if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<GuidelineWithVersion | undefined>;

  /**
   * List guidelines matching filter criteria.
   * @param filter - Filter options (scope, category, include inactive)
   * @param options - Pagination options (limit, offset)
   * @returns Array of guidelines
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListGuidelinesFilter, options?: PaginationOptions): Promise<GuidelineWithVersion[]>;

  /**
   * Update a guideline (creates new version).
   * @param id - Guideline ID
   * @param input - Update parameters
   * @returns Updated guideline, or undefined if not found
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2000 - Guideline not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateGuidelineInput): Promise<GuidelineWithVersion | undefined>;

  /**
   * Get version history for a guideline.
   * @param guidelineId - Guideline ID
   * @returns Array of versions (newest first)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getHistory(guidelineId: string): Promise<GuidelineVersion[]>;

  /**
   * Deactivate a guideline (soft delete).
   * @param id - Guideline ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Reactivate a previously deactivated guideline.
   * @param id - Guideline ID
   * @returns true if reactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  reactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete a guideline and all versions.
   * @param id - Guideline ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// KNOWLEDGE REPOSITORY
// =============================================================================

export interface CreateKnowledgeInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content: string;
  source?: string;
  confidence?: number;
  /** When this knowledge becomes valid (ISO timestamp). For temporal KG. */
  validFrom?: string;
  /** When this knowledge expires (ISO timestamp). For temporal KG. */
  validUntil?: string;
  createdBy?: string;
}

export interface UpdateKnowledgeInput {
  scopeType?: ScopeType;
  scopeId?: string | null;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  content?: string;
  source?: string;
  confidence?: number;
  /** When this knowledge becomes valid (ISO timestamp). For temporal KG. */
  validFrom?: string;
  /** When this knowledge expires (ISO timestamp). For temporal KG. */
  validUntil?: string;
  /** ID of entry that supersedes/invalidates this knowledge. For temporal KG. */
  invalidatedBy?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListKnowledgeFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'decision' | 'fact' | 'context' | 'reference';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface KnowledgeWithVersion extends Knowledge {
  currentVersion?: KnowledgeVersion;
}

export interface IKnowledgeRepository {
  /**
   * Create a new knowledge entry.
   * @param input - Knowledge creation parameters
   * @returns Created knowledge with version info
   * @throws {AgentMemoryError} E1000 - Missing required field (title, content, scopeType)
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2001 - Knowledge with same title exists in scope
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateKnowledgeInput): Promise<KnowledgeWithVersion>;

  /**
   * Get a knowledge entry by ID.
   * @param id - Knowledge ID
   * @returns Knowledge with current version, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<KnowledgeWithVersion | undefined>;

  /**
   * Batch fetch knowledge entries by IDs using SQL IN clause for efficiency.
   * @param ids - Array of knowledge IDs
   * @returns Array of knowledge entries (may be fewer if some IDs not found)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByIds(ids: string[]): Promise<KnowledgeWithVersion[]>;

  /**
   * Get a knowledge entry by title within a scope.
   * @param title - Knowledge title
   * @param scopeType - Scope type to search
   * @param scopeId - Scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes
   * @returns Knowledge if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<KnowledgeWithVersion | undefined>;

  /**
   * List knowledge entries matching filter criteria.
   * @param filter - Filter options (scope, category, include inactive)
   * @param options - Pagination options (limit, offset)
   * @returns Array of knowledge entries
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListKnowledgeFilter, options?: PaginationOptions): Promise<KnowledgeWithVersion[]>;

  /**
   * Update a knowledge entry (creates new version).
   * @param id - Knowledge ID
   * @param input - Update parameters
   * @returns Updated knowledge, or undefined if not found
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2000 - Knowledge not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateKnowledgeInput): Promise<KnowledgeWithVersion | undefined>;

  /**
   * Get version history for a knowledge entry.
   * @param knowledgeId - Knowledge ID
   * @returns Array of versions (newest first)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getHistory(knowledgeId: string): Promise<KnowledgeVersion[]>;

  /**
   * Deactivate a knowledge entry (soft delete).
   * @param id - Knowledge ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Reactivate a previously deactivated knowledge entry.
   * @param id - Knowledge ID
   * @returns true if reactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  reactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete a knowledge entry and all versions.
   * @param id - Knowledge ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// TOOL REPOSITORY
// =============================================================================

export interface CreateToolInput {
  scopeType: ScopeType;
  scopeId?: string;
  name: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: unknown[]; // Allow strings or objects
  constraints?: string;
  createdBy?: string;
}

export interface UpdateToolInput {
  category?: 'mcp' | 'cli' | 'function' | 'api';
  description?: string;
  parameters?: Record<string, unknown>;
  examples?: unknown[]; // Allow strings or objects
  constraints?: string;
  changeReason?: string;
  updatedBy?: string;
}

export interface ListToolsFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  category?: 'mcp' | 'cli' | 'function' | 'api';
  includeInactive?: boolean;
  inherit?: boolean;
}

export interface ToolWithVersion extends Tool {
  currentVersion?: ToolVersion;
}

export interface IToolRepository {
  /**
   * Create a new tool entry.
   * @param input - Tool creation parameters
   * @returns Created tool with version info
   * @throws {AgentMemoryError} E1000 - Missing required field (name, scopeType)
   * @throws {AgentMemoryError} E1005 - Description or parameters exceeds size limit
   * @throws {AgentMemoryError} E2001 - Tool with same name exists in scope
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateToolInput): Promise<ToolWithVersion>;

  /**
   * Get a tool by ID.
   * @param id - Tool ID
   * @returns Tool with current version, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string): Promise<ToolWithVersion | undefined>;

  /**
   * Batch fetch tools by IDs using SQL IN clause for efficiency.
   * @param ids - Array of tool IDs
   * @returns Array of tools (may be fewer if some IDs not found)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByIds(ids: string[]): Promise<ToolWithVersion[]>;

  /**
   * Get a tool by name within a scope.
   * @param name - Tool name
   * @param scopeType - Scope type to search
   * @param scopeId - Scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes
   * @returns Tool if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByName(
    name: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<ToolWithVersion | undefined>;

  /**
   * List tools matching filter criteria.
   * @param filter - Filter options (scope, category, include inactive)
   * @param options - Pagination options (limit, offset)
   * @returns Array of tools
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(filter?: ListToolsFilter, options?: PaginationOptions): Promise<ToolWithVersion[]>;

  /**
   * Update a tool (creates new version).
   * @param id - Tool ID
   * @param input - Update parameters
   * @returns Updated tool, or undefined if not found
   * @throws {AgentMemoryError} E1005 - Description or parameters exceeds size limit
   * @throws {AgentMemoryError} E2000 - Tool not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateToolInput): Promise<ToolWithVersion | undefined>;

  /**
   * Get version history for a tool.
   * @param toolId - Tool ID
   * @returns Array of versions (newest first)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getHistory(toolId: string): Promise<ToolVersion[]>;

  /**
   * Deactivate a tool (soft delete).
   * @param id - Tool ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Reactivate a previously deactivated tool.
   * @param id - Tool ID
   * @returns true if reactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  reactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete a tool and all versions.
   * @param id - Tool ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;
}

// =============================================================================
// EXPERIENCE REPOSITORY (Experiential Memory)
// =============================================================================

/** Input for creating a trajectory step */
export interface TrajectoryStepInput {
  action: string;
  observation?: string;
  reasoning?: string;
  toolUsed?: string;
  success?: boolean;
  timestamp?: string;
  durationMs?: number;
}

/** Input for creating a new experience */
export interface CreateExperienceInput {
  scopeType: ScopeType;
  scopeId?: string;
  title: string;
  level?: ExperienceLevel;
  category?: string;
  content: string;
  scenario?: string;
  outcome?: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  confidence?: number;
  source?: ExperienceSource;
  steps?: TrajectoryStepInput[];
  createdBy?: string;
}

/** Input for updating an experience */
export interface UpdateExperienceInput {
  category?: string;
  content?: string;
  scenario?: string;
  outcome?: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  confidence?: number;
  changeReason?: string;
  updatedBy?: string;
}

/** Input for promoting an experience to a higher level */
export interface PromoteExperienceInput {
  toLevel: 'strategy' | 'skill';
  // For strategy promotion
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  // For skill promotion (creates linked memory_tool)
  toolName?: string;
  toolDescription?: string;
  toolCategory?: 'mcp' | 'cli' | 'function' | 'api';
  toolParameters?: Record<string, unknown>;
  reason?: string;
  promotedBy?: string;
}

/** Input for recording an outcome */
export interface RecordOutcomeInput {
  success: boolean;
  feedback?: string;
}

/** List filter for experiences */
export interface ListExperiencesFilter {
  scopeType?: ScopeType;
  scopeId?: string;
  level?: ExperienceLevel;
  category?: string;
  includeInactive?: boolean;
  inherit?: boolean;
}

/** Experience with current version and optional trajectory */
export interface ExperienceWithVersion extends Experience {
  currentVersion?: ExperienceVersion;
  trajectorySteps?: ExperienceTrajectoryStep[];
}

/** Result of promoting to skill (includes created tool) */
export interface PromoteToSkillResult {
  experience: ExperienceWithVersion;
  createdTool?: {
    id: string;
    name: string;
    scopeType: ScopeType;
    scopeId: string | null;
  };
}

export interface IExperienceRepository {
  // Standard CRUD

  /**
   * Create a new experience entry.
   * @param input - Experience creation parameters
   * @returns Created experience with version info
   * @throws {AgentMemoryError} E1000 - Missing required field (title, content, scopeType)
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2001 - Experience with same title exists in scope
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  create(input: CreateExperienceInput): Promise<ExperienceWithVersion>;

  /**
   * Get an experience by ID.
   * @param id - Experience ID
   * @param includeTrajectory - Whether to include trajectory steps (default: false)
   * @returns Experience with current version, or undefined if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getById(id: string, includeTrajectory?: boolean): Promise<ExperienceWithVersion | undefined>;

  /**
   * Get an experience by title within a scope.
   * @param title - Experience title
   * @param scopeType - Scope type to search
   * @param scopeId - Scope ID (required for non-global scopes)
   * @param inherit - Whether to search parent scopes
   * @returns Experience if found, undefined otherwise
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getByTitle(
    title: string,
    scopeType: ScopeType,
    scopeId?: string,
    inherit?: boolean
  ): Promise<ExperienceWithVersion | undefined>;

  /**
   * List experiences matching filter criteria.
   * @param filter - Filter options (scope, level, category, include inactive)
   * @param options - Pagination options (limit, offset)
   * @returns Array of experiences
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  list(
    filter?: ListExperiencesFilter,
    options?: PaginationOptions
  ): Promise<ExperienceWithVersion[]>;

  /**
   * Update an experience (creates new version).
   * @param id - Experience ID
   * @param input - Update parameters
   * @returns Updated experience, or undefined if not found
   * @throws {AgentMemoryError} E1005 - Content exceeds size limit
   * @throws {AgentMemoryError} E2000 - Experience not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  update(id: string, input: UpdateExperienceInput): Promise<ExperienceWithVersion | undefined>;

  /**
   * Get version history for an experience.
   * @param experienceId - Experience ID
   * @returns Array of versions (newest first)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getHistory(experienceId: string): Promise<ExperienceVersion[]>;

  /**
   * Deactivate an experience (soft delete).
   * @param id - Experience ID
   * @returns true if deactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Reactivate a previously deactivated experience.
   * @param id - Experience ID
   * @returns true if reactivated, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  reactivate(id: string): Promise<boolean>;

  /**
   * Permanently delete an experience and all versions.
   * @param id - Experience ID
   * @returns true if deleted, false if not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  delete(id: string): Promise<boolean>;

  // Experience-specific operations

  /**
   * Add a trajectory step to an experience.
   * Used for recording agent action sequences for case-level experiences.
   * @param experienceId - Experience ID
   * @param step - Trajectory step data
   * @returns Created trajectory step
   * @throws {AgentMemoryError} E2000 - Experience not found
   * @throws {AgentMemoryError} E1000 - Missing required field (action)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  addStep(experienceId: string, step: TrajectoryStepInput): Promise<ExperienceTrajectoryStep>;

  /**
   * Get all trajectory steps for an experience.
   * @param experienceId - Experience ID
   * @returns Array of trajectory steps in order
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  getTrajectory(experienceId: string): Promise<ExperienceTrajectoryStep[]>;

  /**
   * Promote an experience to a higher level (strategy or skill).
   * Strategy promotion abstracts patterns from case experiences.
   * Skill promotion creates a linked memory_tool entry.
   * @param id - Experience ID
   * @param input - Promotion parameters
   * @returns Updated experience and optionally created tool
   * @throws {AgentMemoryError} E2000 - Experience not found
   * @throws {AgentMemoryError} E1002 - Invalid level transition (e.g., already at skill level)
   * @throws {AgentMemoryError} E1000 - Missing required field (toolName for skill promotion)
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  promote(id: string, input: PromoteExperienceInput): Promise<PromoteToSkillResult>;

  /**
   * Record an outcome for an experience.
   * Updates confidence based on success rate.
   * @param id - Experience ID
   * @param input - Outcome data (success boolean and optional feedback)
   * @returns Updated experience, or undefined if not found
   * @throws {AgentMemoryError} E2000 - Experience not found
   * @throws {AgentMemoryError} E4000 - Database operation failed
   */
  recordOutcome(id: string, input: RecordOutcomeInput): Promise<ExperienceWithVersion | undefined>;
}

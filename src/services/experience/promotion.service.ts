/**
 * Experience Promotion Service
 *
 * Handles the business logic for promoting experiences from case → strategy → skill.
 * Validates inputs, orchestrates repository calls, and emits events.
 */

import type { IExperienceRepository } from '../../core/interfaces/repositories.js';
import type {
  PromoteExperienceInput,
  PromoteToSkillResult,
  ExperienceWithVersion,
} from '../../core/interfaces/repositories.js';
import type { IEventAdapter } from '../../core/adapters/index.js';
import type { EntryChangedEvent } from '../../utils/events.js';
import { createValidationError, createNotFoundError } from '../../core/errors.js';

/**
 * Dependencies required by the ExperiencePromotionService
 */
export interface ExperiencePromotionServiceDeps {
  experienceRepo: IExperienceRepository;
  eventAdapter?: IEventAdapter<EntryChangedEvent>;
}

/**
 * Input for promoting to strategy level
 */
export interface PromoteToStrategyInput {
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  reason?: string;
  promotedBy: string;
}

/**
 * Input for promoting to skill level
 */
export interface PromoteToSkillInput {
  toolName: string;
  toolDescription?: string;
  toolCategory?: 'mcp' | 'cli' | 'function' | 'api';
  toolParameters?: Record<string, unknown>;
  reason?: string;
  promotedBy: string;
}

/**
 * Service for handling experience promotion business logic
 */
export class ExperiencePromotionService {
  private readonly experienceRepo: IExperienceRepository;
  private readonly eventAdapter?: IEventAdapter<EntryChangedEvent>;

  constructor(deps: ExperiencePromotionServiceDeps) {
    this.experienceRepo = deps.experienceRepo;
    this.eventAdapter = deps.eventAdapter;
  }

  /**
   * Promote a case experience to strategy level.
   * Creates a new strategy experience linked to the original case.
   */
  async promoteToStrategy(
    experienceId: string,
    input: PromoteToStrategyInput
  ): Promise<PromoteToSkillResult> {
    // Validate input
    if (!input.promotedBy?.trim()) {
      throw createValidationError('promotedBy', 'is required');
    }

    // Validate experience exists and is at case level
    const existing = await this.experienceRepo.getById(experienceId);
    if (!existing) {
      throw createNotFoundError('experience', experienceId);
    }

    if (existing.level !== 'case') {
      throw createValidationError('level', 'can only promote case-level experiences to strategy');
    }

    // Prepare promotion input
    const promoteInput: PromoteExperienceInput = {
      toLevel: 'strategy',
      pattern: input.pattern,
      applicability: input.applicability,
      contraindications: input.contraindications,
      reason: input.reason,
      promotedBy: input.promotedBy,
    };

    // Execute promotion via repository (handles transaction)
    const result = await this.experienceRepo.promote(experienceId, promoteInput);

    // Emit event for the new strategy experience
    this.emitPromotionEvent(existing, result.experience, 'strategy', input.promotedBy);

    return result;
  }

  /**
   * Promote a strategy experience to skill level.
   * Creates a new tool linked to the experience.
   */
  async promoteToSkill(
    experienceId: string,
    input: PromoteToSkillInput
  ): Promise<PromoteToSkillResult> {
    // Validate input
    if (!input.promotedBy?.trim()) {
      throw createValidationError('promotedBy', 'is required');
    }

    if (!input.toolName?.trim()) {
      throw createValidationError('toolName', 'is required for skill promotion');
    }

    // Validate experience exists and is at strategy level
    const existing = await this.experienceRepo.getById(experienceId);
    if (!existing) {
      throw createNotFoundError('experience', experienceId);
    }

    if (existing.level !== 'strategy') {
      throw createValidationError('level', 'can only promote strategy-level experiences to skill');
    }

    // Prepare promotion input
    const promoteInput: PromoteExperienceInput = {
      toLevel: 'skill',
      toolName: input.toolName,
      toolDescription: input.toolDescription,
      toolCategory: input.toolCategory,
      toolParameters: input.toolParameters,
      reason: input.reason,
      promotedBy: input.promotedBy,
    };

    // Execute promotion via repository (handles transaction)
    const result = await this.experienceRepo.promote(experienceId, promoteInput);

    // Emit events
    this.emitPromotionEvent(existing, result.experience, 'skill', input.promotedBy);

    // Emit event for the created tool
    if (result.createdTool) {
      this.emitToolCreatedEvent(result.createdTool, input.promotedBy);
    }

    return result;
  }

  /**
   * Generic promote method that delegates to the appropriate promotion type
   */
  async promote(
    experienceId: string,
    input: PromoteExperienceInput
  ): Promise<PromoteToSkillResult> {
    if (input.toLevel === 'strategy') {
      return this.promoteToStrategy(experienceId, {
        pattern: input.pattern,
        applicability: input.applicability,
        contraindications: input.contraindications,
        reason: input.reason,
        promotedBy: input.promotedBy ?? 'unknown',
      });
    } else if (input.toLevel === 'skill') {
      if (!input.toolName) {
        throw createValidationError('toolName', 'is required for skill promotion');
      }
      return this.promoteToSkill(experienceId, {
        toolName: input.toolName,
        toolDescription: input.toolDescription,
        toolCategory: input.toolCategory,
        toolParameters: input.toolParameters,
        reason: input.reason,
        promotedBy: input.promotedBy ?? 'unknown',
      });
    }

    throw createValidationError('toLevel', `invalid promotion level: ${String(input.toLevel)}`);
  }

  /**
   * Emit promotion event for the promoted experience
   * Note: Experiences are not part of the standard EntryType, so we only log internally.
   * If experience events become needed, extend EntryType in events.ts.
   */
  private emitPromotionEvent(
    _original: ExperienceWithVersion,
    _promoted: ExperienceWithVersion,
    _toLevel: 'strategy' | 'skill',
    _agentId: string
  ): void {
    // Experience promotion events are not emitted to the standard event bus
    // as EntryType does not include 'experience'.
    // The audit log in the handler captures this action.
  }

  /**
   * Emit event for created tool (skill promotion)
   */
  private emitToolCreatedEvent(
    tool: { id: string; name: string; scopeType: string; scopeId: string | null },
    _agentId: string
  ): void {
    if (!this.eventAdapter) return;

    this.eventAdapter.emit({
      entryType: 'tool',
      entryId: tool.id,
      action: 'create',
      scopeType: tool.scopeType as 'global' | 'org' | 'project' | 'session',
      scopeId: tool.scopeId ?? null,
    });
  }
}

/**
 * Factory function to create the ExperiencePromotionService
 */
export function createExperiencePromotionService(
  deps: ExperiencePromotionServiceDeps
): ExperiencePromotionService {
  return new ExperiencePromotionService(deps);
}

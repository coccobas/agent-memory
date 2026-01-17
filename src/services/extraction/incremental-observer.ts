/**
 * Incremental Memory Observer
 *
 * Implements IMemoryObserver to bridge trigger detection with incremental extraction.
 * When triggers fire, this observer runs incremental extraction and stores results.
 *
 * Trigger-to-focus mapping:
 * - USER_CORRECTION → rules (guidelines)
 * - ERROR_RECOVERY → tools, decisions
 * - ENTHUSIASM → facts, decisions
 * - REPEATED_REQUEST → rules, tools
 * - SURPRISE_MOMENT → facts, decisions
 *
 * @module extraction/incremental-observer
 */

import { createComponentLogger } from '../../utils/logger.js';
import type { TriggerEvent, SessionContext, IMemoryObserver, TriggerType } from './triggers.js';
import type { IncrementalExtractor } from './incremental.js';
import type { ObserveCommitService, CommitInput } from '../observe/index.js';
import type { ObserveCommitEntry } from '../../mcp/handlers/observe/types.js';

const logger = createComponentLogger('incremental-observer');

// =============================================================================
// TRIGGER TO FOCUS MAPPING
// =============================================================================

/**
 * Map trigger types to extraction focus areas
 */
const TRIGGER_FOCUS_MAP: Record<TriggerType, ('decisions' | 'facts' | 'rules' | 'tools')[]> = {
  USER_CORRECTION: ['rules'],
  ERROR_RECOVERY: ['tools', 'decisions'],
  ENTHUSIASM: ['facts', 'decisions'],
  REPEATED_REQUEST: ['rules', 'tools'],
  SURPRISE_MOMENT: ['facts', 'decisions'],
};

// =============================================================================
// OBSERVER IMPLEMENTATION
// =============================================================================

/**
 * Memory observer that runs incremental extraction when triggers fire
 */
export class IncrementalMemoryObserver implements IMemoryObserver {
  private extractor: IncrementalExtractor;
  private commitService: ObserveCommitService | null;
  private defaultAgentId: string;

  constructor(
    extractor: IncrementalExtractor,
    commitService: ObserveCommitService | null,
    defaultAgentId: string = 'incremental-observer'
  ) {
    this.extractor = extractor;
    this.commitService = commitService;
    this.defaultAgentId = defaultAgentId;
  }

  /**
   * Set the commit service after construction.
   * Allows deferred injection when commit service is created later.
   */
  setCommitService(commitService: ObserveCommitService): void {
    this.commitService = commitService;
  }

  /**
   * Observe a trigger event and run incremental extraction
   *
   * @param event - The trigger event that fired
   * @param context - Session context
   */
  async observe(event: TriggerEvent, context: SessionContext): Promise<void> {
    logger.debug(
      {
        type: event.type,
        confidence: event.confidence,
        sessionId: context.sessionId,
      },
      'Observer received trigger event'
    );

    // Check if extractor is available
    if (!this.extractor.isAvailable()) {
      logger.debug('Incremental extractor not available, skipping');
      return;
    }

    // Get focus areas for this trigger type
    const focusAreas = TRIGGER_FOCUS_MAP[event.type as TriggerType] || ['facts', 'rules'];

    // Run incremental extraction
    const result = await this.extractor.extractFromSession(context.sessionId, {
      projectId: context.projectId,
      focusAreas,
    });

    if (!result) {
      logger.debug({ sessionId: context.sessionId }, 'No extraction window available');
      return;
    }

    if (!result.extractionRan || result.entries.length === 0) {
      logger.debug(
        {
          sessionId: context.sessionId,
          extractionRan: result.extractionRan,
          entriesCount: result.entries.length,
        },
        'No entries extracted'
      );
      return;
    }

    // Store entries if commit service is available
    if (this.commitService) {
      await this.storeEntries(result.entries, context);
    } else {
      logger.info(
        {
          sessionId: context.sessionId,
          entriesCount: result.entries.length,
          types: result.entries.map((e) => e.type),
        },
        'Extracted entries (commit service not available - entries not stored)'
      );
    }
  }

  /**
   * Store extracted entries via ObserveCommitService
   */
  private async storeEntries(
    entries: Array<{
      type: 'guideline' | 'knowledge' | 'tool';
      name?: string;
      title?: string;
      content: string;
      category?: string;
      priority?: number;
      confidence: number;
      rationale?: string;
      suggestedTags?: string[];
    }>,
    context: SessionContext
  ): Promise<void> {
    if (!this.commitService) {
      return;
    }

    // Convert extracted entries to ObserveCommitEntry format
    const commitEntries: ObserveCommitEntry[] = entries.map((entry) => ({
      type: entry.type,
      name: entry.name,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      priority: entry.priority,
      confidence: entry.confidence,
      source: 'incremental-extraction',
      suggestedTags: entry.suggestedTags,
    }));

    const input: CommitInput = {
      sessionId: context.sessionId,
      projectId: context.projectId,
      agentId: context.agentId || this.defaultAgentId,
      entries: commitEntries,
      entities: [],
      relationships: [],
      autoPromote: true,
      autoPromoteThreshold: 0.85,
    };

    try {
      const result = await this.commitService.commit(input);

      logger.info(
        {
          sessionId: context.sessionId,
          storedCount: result.meta.storedCount,
          storedToProject: result.meta.storedToProject,
          storedToSession: result.meta.storedToSession,
          skippedDuplicates: result.skippedDuplicates.length,
        },
        'Stored incremental extraction results'
      );
    } catch (error) {
      logger.error(
        {
          sessionId: context.sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to store incremental extraction results'
      );
      // Don't re-throw - extraction is best-effort
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an incremental memory observer
 */
export function createIncrementalMemoryObserver(
  extractor: IncrementalExtractor,
  commitService: ObserveCommitService | null,
  defaultAgentId?: string
): IncrementalMemoryObserver {
  return new IncrementalMemoryObserver(extractor, commitService, defaultAgentId);
}

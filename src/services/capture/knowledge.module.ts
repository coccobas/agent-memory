/**
 * Knowledge Capture Module
 *
 * Handles extraction of knowledge, guidelines, and tools from conversation transcripts.
 * Features:
 * - Turn-based threshold evaluation
 * - Dynamic capture trigger logic
 * - Knowledge/guideline/tool extraction
 */

import { ExtractionService, type ExtractionInput, type ExtractedEntry } from '../extraction.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import type {
  TurnData,
  TurnMetrics,
  KnowledgeCaptureResult,
  CaptureOptions,
  CaptureConfig,
  CaptureModule,
} from './types.js';
import type { Knowledge, Guideline, Tool } from '../../db/schema.js';
import type { IKnowledgeRepository, IGuidelineRepository, IToolRepository } from '../../core/interfaces/repositories.js';
import { CaptureStateManager } from './state.js';

const logger = createComponentLogger('capture:knowledge');

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeModuleDeps {
  knowledgeRepo: IKnowledgeRepository;
  guidelineRepo: IGuidelineRepository;
  toolRepo: IToolRepository;
  extractionService?: ExtractionService;
  /** State manager for capture threshold tracking - injected by CaptureService */
  stateManager?: CaptureStateManager;
}

// =============================================================================
// KNOWLEDGE CAPTURE MODULE
// =============================================================================

export class KnowledgeCaptureModule implements CaptureModule<KnowledgeCaptureResult> {
  private extractionService: ExtractionService;
  private knowledgeRepo: IKnowledgeRepository;
  private guidelineRepo: IGuidelineRepository;
  private toolRepo: IToolRepository;
  private stateManager: CaptureStateManager;

  constructor(deps: KnowledgeModuleDeps) {
    if (!deps.stateManager) {
      throw new Error('KnowledgeCaptureModule requires stateManager to be provided');
    }
    this.extractionService = deps.extractionService ?? new ExtractionService();
    this.knowledgeRepo = deps.knowledgeRepo;
    this.guidelineRepo = deps.guidelineRepo;
    this.toolRepo = deps.toolRepo;
    this.stateManager = deps.stateManager;
  }

  /**
   * Check if capture should be triggered based on turn-based thresholds
   */
  shouldCapture(metrics: TurnMetrics, captureConfig: CaptureConfig): boolean {
    return this.stateManager.shouldTriggerTurnCapture(metrics, captureConfig, 0);
  }

  /**
   * Capture knowledge, guidelines, and tools from transcript
   */
  async capture(
    transcript: TurnData[],
    metrics: TurnMetrics,
    options: CaptureOptions
  ): Promise<KnowledgeCaptureResult> {
    const startTime = Date.now();
    const result: KnowledgeCaptureResult = {
      knowledge: [],
      guidelines: [],
      tools: [],
      skippedDuplicates: 0,
      processingTimeMs: 0,
    };

    if (!this.extractionService.isAvailable()) {
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }

    try {
      // Format transcript for extraction with metrics context
      const transcriptText = this.formatTranscript(transcript);
      const contextWithMetrics = [
        transcriptText,
        '',
        '---',
        'Session Metrics:',
        `- Total turns: ${metrics.turnCount}`,
        `- User turns: ${metrics.userTurnCount}`,
        `- Tool calls: ${metrics.toolCallCount}`,
        `- Unique tools: ${Array.from(metrics.uniqueToolsUsed).join(', ') || 'none'}`,
        `- Errors: ${metrics.errorCount}`,
      ].join('\n');

      // Build extraction input
      const extractionInput: ExtractionInput = {
        context: contextWithMetrics,
        contextType: 'conversation',
        focusAreas: this.mapFocusAreas(options.focusAreas),
      };

      // Extract entries using ExtractionService
      const extracted = await this.extractionService.extract(extractionInput);

      // Process extracted entries
      for (const entry of extracted.entries) {
        // Check confidence threshold
        const threshold = this.getConfidenceThreshold(entry.type, options);
        if (entry.confidence < threshold) {
          logger.debug(
            { type: entry.type, name: entry.name ?? entry.title, confidence: entry.confidence },
            'Entry below confidence threshold'
          );
          continue;
        }

        // Check for duplicates
        if (options.skipDuplicates !== false && options.sessionId) {
          const contentKey = entry.name ?? entry.title ?? entry.content.slice(0, 50);
          const contentHash = this.stateManager.generateContentHash(
            `${entry.type}|${contentKey}|${entry.content}`
          );

          if (this.stateManager.isDuplicateInSession(options.sessionId, contentHash)) {
            result.skippedDuplicates++;
            continue;
          }

          // Register hash
          if (options.autoStore !== false) {
            this.stateManager.registerHash(contentHash, entry.type, '', options.sessionId);
          }
        }

        // Store or return entry based on type
        if (options.autoStore !== false) {
          await this.storeEntry(entry, options, result);
        } else {
          this.addToResult(entry, options, result);
        }
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Knowledge capture failed'
      );
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Format transcript for LLM consumption
   */
  private formatTranscript(transcript: TurnData[]): string {
    return transcript.map(turn => {
      const lines: string[] = [];
      lines.push(`[${turn.role.toUpperCase()}]:`);
      lines.push(turn.content);

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        lines.push('Tool calls:');
        for (const call of turn.toolCalls) {
          lines.push(`  - ${call.name}: ${call.success ? 'success' : 'failed'}`);
          if (call.output) {
            lines.push(`    Output: ${JSON.stringify(call.output).slice(0, 200)}`);
          }
        }
      }

      return lines.join('\n');
    }).join('\n\n');
  }

  /**
   * Map capture focus areas to extraction focus areas
   */
  private mapFocusAreas(
    focusAreas?: ('decisions' | 'facts' | 'rules' | 'tools' | 'experiences')[]
  ): ('decisions' | 'facts' | 'rules' | 'tools')[] | undefined {
    if (!focusAreas) return undefined;

    // Filter out 'experiences' as it's handled by ExperienceCaptureModule
    return focusAreas.filter(
      (area): area is 'decisions' | 'facts' | 'rules' | 'tools' =>
        area !== 'experiences'
    );
  }

  /**
   * Get confidence threshold for entry type
   */
  private getConfidenceThreshold(
    type: 'guideline' | 'knowledge' | 'tool',
    options: CaptureOptions
  ): number {
    // Use provided threshold or fall back to defaults
    if (options.confidenceThreshold !== undefined) {
      return options.confidenceThreshold;
    }

    // Default thresholds by type
    switch (type) {
      case 'guideline':
        return 0.75;
      case 'knowledge':
        return 0.7;
      case 'tool':
        return 0.65;
      default:
        return 0.7;
    }
  }

  /**
   * Store extracted entry to database
   */
  private async storeEntry(
    entry: ExtractedEntry,
    options: CaptureOptions,
    result: KnowledgeCaptureResult
  ): Promise<void> {
    try {
      switch (entry.type) {
        case 'knowledge': {
          const created = await this.knowledgeRepo.create({
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            title: entry.title ?? entry.content.slice(0, 100),
            content: entry.content,
            category: (entry.category as 'decision' | 'fact' | 'context' | 'reference') ?? 'fact',
            source: 'extraction',
            createdBy: options.agentId,
          });

          result.knowledge.push({
            entry: created,
            confidence: entry.confidence,
          });
          break;
        }

        case 'guideline': {
          const created = await this.guidelineRepo.create({
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            name: entry.name ?? this.toKebabCase(entry.content.slice(0, 50)),
            content: entry.content,
            category: entry.category,
            priority: entry.priority ?? 50,
            rationale: entry.rationale,
            createdBy: options.agentId,
          });

          result.guidelines.push({
            entry: created,
            confidence: entry.confidence,
          });
          break;
        }

        case 'tool': {
          const created = await this.toolRepo.create({
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            name: entry.name ?? this.toKebabCase(entry.content.slice(0, 50)),
            description: entry.content,
            category: (entry.category as 'cli' | 'function' | 'api' | 'mcp') ?? 'cli',
            createdBy: options.agentId,
          });

          result.tools.push({
            entry: created,
            confidence: entry.confidence,
          });
          break;
        }
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          type: entry.type,
          name: entry.name ?? entry.title,
        },
        'Failed to store extracted entry'
      );
    }
  }

  /**
   * Add entry to result without storing (for preview mode)
   */
  private addToResult(
    entry: ExtractedEntry,
    options: CaptureOptions,
    result: KnowledgeCaptureResult
  ): void {
    const now = new Date().toISOString();

    switch (entry.type) {
      case 'knowledge': {
        const knowledgeEntry: Knowledge = {
          id: '',
          scopeType: options.scopeType,
          scopeId: options.scopeId ?? null,
          title: entry.title ?? entry.content.slice(0, 100),
          category: (entry.category as 'decision' | 'fact' | 'context' | 'reference') ?? null,
          currentVersionId: null,
          isActive: true,
          createdAt: now,
          createdBy: options.agentId ?? null,
          lastAccessedAt: null,
          accessCount: 0,
        };
        result.knowledge.push({
          entry: knowledgeEntry,
          confidence: entry.confidence,
        });
        break;
      }

      case 'guideline': {
        const guidelineEntry: Guideline = {
          id: '',
          scopeType: options.scopeType,
          scopeId: options.scopeId ?? null,
          name: entry.name ?? this.toKebabCase(entry.content.slice(0, 50)),
          category: entry.category ?? null,
          priority: entry.priority ?? 50,
          currentVersionId: null,
          isActive: true,
          createdAt: now,
          createdBy: options.agentId ?? null,
          lastAccessedAt: null,
          accessCount: 0,
        };
        result.guidelines.push({
          entry: guidelineEntry,
          confidence: entry.confidence,
        });
        break;
      }

      case 'tool': {
        const toolEntry: Tool = {
          id: '',
          scopeType: options.scopeType,
          scopeId: options.scopeId ?? null,
          name: entry.name ?? this.toKebabCase(entry.content.slice(0, 50)),
          category: (entry.category as 'cli' | 'function' | 'api' | 'mcp') ?? null,
          currentVersionId: null,
          isActive: true,
          createdAt: now,
          createdBy: options.agentId ?? null,
          lastAccessedAt: null,
          accessCount: 0,
        };
        result.tools.push({
          entry: toolEntry,
          confidence: entry.confidence,
        });
        break;
      }
    }
  }

  /**
   * Convert string to kebab-case
   */
  private toKebabCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

/**
 * Create a knowledge capture module instance
 */
export function createKnowledgeCaptureModule(deps: KnowledgeModuleDeps): KnowledgeCaptureModule {
  return new KnowledgeCaptureModule(deps);
}

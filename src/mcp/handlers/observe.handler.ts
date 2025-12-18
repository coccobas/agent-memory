/**
 * Observe handlers for auto-capture memory extraction
 */

import {
  getExtractionService,
  type ExtractedEntry,
  type ExtractionInput,
} from '../../services/extraction.service.js';
import { checkForDuplicates, type SimilarEntry } from '../../services/duplicate.service.js';
import { guidelineRepo, type CreateGuidelineInput } from '../../db/repositories/guidelines.js';
import { knowledgeRepo, type CreateKnowledgeInput } from '../../db/repositories/knowledge.js';
import { toolRepo, type CreateToolInput } from '../../db/repositories/tools.js';
import { logAction } from '../../services/audit.service.js';
import { config } from '../../config/index.js';

import {
  createValidationError,
  createExtractionUnavailableError,
  createExtractionError,
} from '../errors.js';
import { createComponentLogger } from '../../utils/logger.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isScopeType,
  isBoolean,
  isNumber,
  isArray,
} from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import type { ScopeType } from '../types.js';

const logger = createComponentLogger('observe');

interface ProcessedEntry extends ExtractedEntry {
  isDuplicate: boolean;
  similarEntries: SimilarEntry[];
  shouldStore: boolean;
}

interface StoredEntry {
  id: string;
  type: 'guideline' | 'knowledge' | 'tool';
  name: string;
}

export const observeHandlers = {
  /**
   * Extract memory entries from raw context using LLM
   */
  async extract(params: Record<string, unknown>) {
    // Extract and validate parameters
    const context = getRequiredParam(params, 'context', isString);
    const contextType = getOptionalParam(params, 'contextType', isString) as
      | 'conversation'
      | 'code'
      | 'mixed'
      | undefined;
    const scopeType = (getOptionalParam(params, 'scopeType', isScopeType) || 'project') as ScopeType;
    const scopeId = getOptionalParam(params, 'scopeId', isString);
    const autoStore = getOptionalParam(params, 'autoStore', isBoolean) || false;
    const confidenceThreshold = getOptionalParam(params, 'confidenceThreshold', isNumber);
    const focusAreas = getOptionalParam(params, 'focusAreas', isArray) as
      | ('decisions' | 'facts' | 'rules' | 'tools')[]
      | undefined;
    const agentId = getOptionalParam(params, 'agentId', isString);

    // Validate scope
    if (scopeType !== 'global' && !scopeId) {
      throw createValidationError(
        'scopeId',
        `is required for ${scopeType} scope`,
        'Provide the ID of the parent scope'
      );
    }

    // Check if extraction service is available
    const extractionService = getExtractionService();
    if (!extractionService.isAvailable()) {
      throw createExtractionUnavailableError();
    }

    // Prepare extraction input
    const extractionInput: ExtractionInput = {
      context,
      contextType,
      focusAreas,
    };

    // Extract entries using LLM
    let result;
    try {
      result = await extractionService.extract(extractionInput);
    } catch (error) {
      throw createExtractionError(
        extractionService.getProvider(),
        error instanceof Error ? error.message : String(error)
      );
    }

    // Process each extracted entry for duplicates
    const threshold = confidenceThreshold ?? config.extraction.confidenceThreshold;
    const processedEntries: ProcessedEntry[] = result.entries.map((entry) => {
      const entryType = entry.type;
      const name = entry.name || entry.title || 'Unnamed';

      // Check for duplicates
      const duplicateCheck = checkForDuplicates(entryType, name, scopeType, scopeId ?? null);

      // Determine if entry should be stored
      const meetsThreshold = entry.confidence >= threshold;
      const shouldStore = meetsThreshold && !duplicateCheck.isDuplicate;

      return {
        ...entry,
        isDuplicate: duplicateCheck.isDuplicate,
        similarEntries: duplicateCheck.similarEntries.slice(0, 3),
        shouldStore,
      };
    });

    // Auto-store if enabled
    const storedEntries: StoredEntry[] = [];
    if (autoStore) {
      for (const entry of processedEntries) {
        if (entry.shouldStore) {
          try {
            const stored = storeEntry(entry, scopeType, scopeId, agentId);
            if (stored) {
              storedEntries.push(stored);
            }
          } catch (error) {
            logger.warn(
              {
                entryName: entry.name || entry.title,
                error: error instanceof Error ? error.message : String(error),
              },
              'Failed to auto-store extracted entry'
            );
          }
        }
      }
    }

    // Log audit (omit entryType as 'observation' is not a valid EntryType)
    logAction({
      agentId,
      action: 'query', // Using 'query' as extraction is read-like
      scopeType,
      scopeId: scopeId ?? null,
      resultCount: result.entries.length,
    });

    return formatTimestamps({
      success: true,
      extraction: {
        entries: processedEntries.map((e) => ({
          type: e.type,
          name: e.name,
          title: e.title,
          content: e.content,
          category: e.category,
          priority: e.priority,
          confidence: e.confidence,
          rationale: e.rationale,
          suggestedTags: e.suggestedTags,
          isDuplicate: e.isDuplicate,
          similarEntries: e.similarEntries,
          shouldStore: e.shouldStore,
        })),
        model: result.model,
        provider: result.provider,
        processingTimeMs: result.processingTimeMs,
        tokensUsed: result.tokensUsed,
      },
      stored: autoStore ? storedEntries : undefined,
      meta: {
        totalExtracted: result.entries.length,
        duplicatesFound: processedEntries.filter((e) => e.isDuplicate).length,
        aboveThreshold: processedEntries.filter((e) => e.confidence >= threshold).length,
        storedCount: storedEntries.length,
      },
    });
  },

  /**
   * Get extraction service status
   */
  status() {
    const service = getExtractionService();
    return {
      available: service.isAvailable(),
      provider: service.getProvider(),
      configured: service.getProvider() !== 'disabled',
    };
  },
};

/**
 * Store an extracted entry to the appropriate repository
 */
function storeEntry(
  entry: ProcessedEntry,
  scopeType: ScopeType,
  scopeId: string | undefined,
  agentId?: string
): StoredEntry | null {
  if (entry.type === 'guideline') {
    const input: CreateGuidelineInput = {
      scopeType,
      scopeId,
      name: entry.name || 'unnamed-guideline',
      content: entry.content,
      category: entry.category,
      priority: entry.priority,
      rationale: entry.rationale,
      createdBy: agentId,
    };
    const guideline = guidelineRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'guideline',
      entryId: guideline.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: guideline.id,
      type: 'guideline',
      name: guideline.name,
    };
  }

  if (entry.type === 'knowledge') {
    const input: CreateKnowledgeInput = {
      scopeType,
      scopeId,
      title: entry.title || 'Untitled Knowledge',
      content: entry.content,
      category: entry.category as 'decision' | 'fact' | 'context' | 'reference' | undefined,
      source: entry.rationale, // Using rationale as source
      createdBy: agentId,
    };
    const knowledge = knowledgeRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'knowledge',
      entryId: knowledge.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: knowledge.id,
      type: 'knowledge',
      name: knowledge.title,
    };
  }

  if (entry.type === 'tool') {
    const input: CreateToolInput = {
      scopeType,
      scopeId,
      name: entry.name || 'unnamed-tool',
      description: entry.content,
      category: entry.category as 'mcp' | 'cli' | 'function' | 'api' | undefined,
      createdBy: agentId,
    };
    const tool = toolRepo.create(input);

    logAction({
      agentId,
      action: 'create',
      entryType: 'tool',
      entryId: tool.id,
      scopeType,
      scopeId: scopeId ?? null,
    });

    return {
      id: tool.id,
      type: 'tool',
      name: tool.name,
    };
  }

  return null;
}

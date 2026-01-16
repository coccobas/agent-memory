/**
 * Forgetting Service
 *
 * Manages memory decay and cleanup using multiple strategies:
 * - Recency: Time-based decay since last access
 * - Frequency: Low access count pruning
 * - Importance: Priority/confidence weighted filtering
 * - Combined: Weighted combination of all strategies
 *
 * NOTE: Uses dynamic table operations and Drizzle ORM with flexible schemas.
 * ESLint unsafe warnings are suppressed for database operations.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

import { eq, and } from 'drizzle-orm';
import {
  tools,
  guidelines,
  knowledge,
  type Tool,
  type Guideline,
  type Knowledge,
} from '../../db/schema/memory.js';
import { experiences, type Experience } from '../../db/schema/experiences.js';
import type { ScopeType } from '../../db/schema/types.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { DbClient } from '../../db/connection.js';
import type {
  ForgettingCandidate,
  ForgettingResult,
  ForgettingConfig,
  AnalyzeParams,
  ForgetParams,
  ForgettingStatus,
  EntryType,
  ForgettingStrategy,
} from './types.js';

/**
 * Union type of all memory entry types for forgetting service
 */
type MemoryEntry = Tool | Guideline | Knowledge | Experience;

/**
 * Helper to safely get priority from an entry (only guidelines have it)
 */
function getEntryPriority(entry: MemoryEntry): number | null {
  return 'priority' in entry ? entry.priority : null;
}

/**
 * Helper to safely get confidence from an entry (knowledge and experience have it)
 */
function getEntryConfidence(entry: MemoryEntry): number | null {
  if ('confidence' in entry && typeof entry.confidence === 'number') {
    return entry.confidence;
  }
  return null;
}

/**
 * Helper to safely check if entry is critical (guidelines only)
 */
function getEntryIsCritical(entry: MemoryEntry): boolean | null {
  if ('isCritical' in entry && typeof entry.isCritical === 'boolean') {
    return entry.isCritical;
  }
  return null;
}

/**
 * Helper to get name/title from an entry
 */
function getEntryName(entry: MemoryEntry, entryType: EntryType): string {
  if (entryType === 'knowledge' || entryType === 'experience') {
    return (entry as Knowledge | Experience).title;
  }
  return (entry as Tool | Guideline).name;
}

/**
 * Helper to get use count for experiences
 */
function getEntryUseCount(entry: MemoryEntry, entryType: EntryType): number | null {
  if (entryType === 'experience') {
    return (entry as Experience).useCount;
  }
  return null;
}

/**
 * Helper to get success count for experiences
 */
function getEntrySuccessCount(entry: MemoryEntry, entryType: EntryType): number | null {
  if (entryType === 'experience') {
    return (entry as Experience).successCount;
  }
  return null;
}
import {
  calculateRecencyScore,
  shouldForgetByRecency,
  getRecencyReason,
} from './strategies/recency.js';
import {
  calculateFrequencyScore,
  shouldForgetByFrequency,
  getFrequencyReason,
} from './strategies/frequency.js';
import {
  calculateImportanceScore,
  shouldForgetByImportance,
  getImportanceReason,
  isProtected,
} from './strategies/importance.js';

const logger = createComponentLogger('forgetting');

// Default configuration
const DEFAULT_CONFIG: ForgettingConfig = {
  enabled: false,
  schedule: '0 3 * * *',
  recency: {
    enabled: true,
    staleDays: 90,
    threshold: 0.3,
  },
  frequency: {
    enabled: true,
    minAccessCount: 2,
    lookbackDays: 180,
  },
  importance: {
    enabled: true,
    threshold: 0.4,
  },
  dryRunDefault: true,
  maxEntriesPerRun: 100,
  excludeCritical: true,
  excludeHighPriority: 90,
};

export interface ForgettingServiceDeps {
  db: DbClient;
  config?: Partial<ForgettingConfig>;
}

export interface IForgettingService {
  analyze(params: AnalyzeParams): Promise<ForgettingResult>;
  forget(params: ForgetParams): Promise<ForgettingResult>;
  getStatus(): ForgettingStatus;
}

/**
 * Create a Forgetting Service instance.
 */
export function createForgettingService(deps: ForgettingServiceDeps): IForgettingService {
  const config: ForgettingConfig = { ...DEFAULT_CONFIG, ...deps.config };
  let lastRun: { at: string; forgotten: number; errors: number } | null = null;

  /**
   * Analyze entries and identify forgetting candidates.
   */
  async function analyze(params: AnalyzeParams): Promise<ForgettingResult> {
    const startedAt = new Date().toISOString();
    const strategy = params.strategy ?? 'combined';
    const entryTypes = params.entryTypes ?? ['tool', 'guideline', 'knowledge', 'experience'];
    const limit = params.limit ?? config.maxEntriesPerRun;

    const allCandidates: ForgettingCandidate[] = [];
    let totalAnalyzed = 0;

    // Analyze each entry type
    for (const entryType of entryTypes) {
      const { candidates, analyzed } = await analyzeEntryType(
        deps.db,
        entryType,
        params,
        strategy,
        config
      );
      allCandidates.push(...candidates);
      totalAnalyzed += analyzed;
    }

    // Sort by combined score (lowest first = most forgettable)
    allCandidates.sort((a, b) => a.scores.combined - b.scores.combined);

    // Limit results
    const limitedCandidates = allCandidates.slice(0, limit);

    const completedAt = new Date().toISOString();
    return {
      success: true,
      dryRun: true,
      strategy,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      stats: {
        analyzed: totalAnalyzed,
        candidates: limitedCandidates.length,
        forgotten: 0,
        skipped: allCandidates.length - limitedCandidates.length,
        errors: 0,
      },
      candidates: limitedCandidates,
      timing: {
        startedAt,
        completedAt,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      },
    };
  }

  /**
   * Execute forgetting on identified candidates.
   */
  async function forget(params: ForgetParams): Promise<ForgettingResult> {
    const dryRun = params.dryRun ?? config.dryRunDefault;

    // First analyze to get candidates
    const analysisResult = await analyze(params);

    if (dryRun) {
      return analysisResult;
    }

    // Execute forgetting (deactivate entries)
    const startedAt = new Date().toISOString();
    let forgotten = 0;
    let errors = 0;
    const errorList: Array<{ id: string; error: string }> = [];

    for (const candidate of analysisResult.candidates) {
      try {
        await deactivateEntry(deps.db, candidate.entryType, candidate.id, params.agentId);
        forgotten++;
      } catch (error) {
        errors++;
        errorList.push({
          id: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.error({ error, candidate }, 'Failed to forget entry');
      }
    }

    const completedAt = new Date().toISOString();

    // Update last run
    lastRun = { at: completedAt, forgotten, errors };

    return {
      ...analysisResult,
      dryRun: false,
      stats: {
        ...analysisResult.stats,
        forgotten,
        errors,
      },
      errors: errorList.length > 0 ? errorList : undefined,
      timing: {
        startedAt,
        completedAt,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      },
    };
  }

  /**
   * Get current service status.
   */
  function getStatus(): ForgettingStatus {
    return {
      enabled: config.enabled,
      schedule: config.schedule,
      lastRun,
      config,
    };
  }

  return { analyze, forget, getStatus };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

async function analyzeEntryType(
  db: DbClient,
  entryType: EntryType,
  params: AnalyzeParams,
  strategy: ForgettingStrategy,
  config: ForgettingConfig
): Promise<{ candidates: ForgettingCandidate[]; analyzed: number }> {
  const table = getTableForType(entryType);

  // Build query conditions
  const conditions = [eq(table.isActive, true)];

  if (params.scopeType) {
    conditions.push(eq(table.scopeType, params.scopeType as ScopeType));
  }
  if (params.scopeId) {
    conditions.push(eq(table.scopeId, params.scopeId));
  }

  // Query entries
  const entries = await db
    .select()
    .from(table)
    .where(and(...conditions));

  const candidates: ForgettingCandidate[] = [];

  for (const entry of entries) {
    const lastAccessedAt = getLastAccessedAt(entry, entryType);
    const accessCount = getAccessCount(entry, entryType);

    // Calculate scores
    const recencyScore = calculateRecencyScore(
      lastAccessedAt,
      entry.createdAt,
      params.staleDays ?? config.recency.staleDays
    );

    const frequencyScore = calculateFrequencyScore(
      accessCount,
      params.minAccessCount ?? config.frequency.minAccessCount
    );

    const typedEntry = entry as MemoryEntry;
    const importanceInput = {
      priority: getEntryPriority(typedEntry),
      confidence: getEntryConfidence(typedEntry),
      isCritical: getEntryIsCritical(typedEntry),
      accessCount: getEntryUseCount(typedEntry, entryType) ?? accessCount,
      successCount: getEntrySuccessCount(typedEntry, entryType),
    };

    const importanceScore = calculateImportanceScore(importanceInput);

    // Combined score (weighted average)
    const combinedScore = recencyScore * 0.35 + frequencyScore * 0.35 + importanceScore * 0.3;

    // Check if should be forgotten based on strategy
    const shouldForget = checkShouldForget(
      strategy,
      recencyScore,
      frequencyScore,
      importanceInput,
      lastAccessedAt,
      entry.createdAt,
      accessCount,
      params,
      config
    );

    // Skip protected entries - construct ImportanceConfig with top-level safety settings
    const importanceConfig = {
      threshold: config.importance.threshold,
      excludeCritical: config.excludeCritical,
      excludeHighPriority: config.excludeHighPriority,
    };
    if (isProtected(importanceInput, importanceConfig)) {
      continue;
    }

    if (shouldForget) {
      candidates.push({
        id: entry.id,
        entryType,
        name: getEntryName(typedEntry, entryType),
        scopeType: entry.scopeType,
        scopeId: entry.scopeId,
        createdAt: entry.createdAt,
        lastAccessedAt,
        accessCount,
        priority: getEntryPriority(typedEntry) ?? undefined,
        confidence: getEntryConfidence(typedEntry) ?? undefined,
        isCritical: getEntryIsCritical(typedEntry) ?? undefined,
        scores: {
          recency: recencyScore,
          frequency: frequencyScore,
          importance: importanceScore,
          combined: Math.round(combinedScore * 1000) / 1000,
        },
        reason: getForgetReason(
          strategy,
          lastAccessedAt,
          entry.createdAt,
          accessCount,
          importanceInput,
          params,
          config
        ),
      });
    }
  }

  return { candidates, analyzed: entries.length };
}

function getTableForType(entryType: EntryType) {
  switch (entryType) {
    case 'tool':
      return tools;
    case 'guideline':
      return guidelines;
    case 'knowledge':
      return knowledge;
    case 'experience':
      return experiences;
  }
}

function getLastAccessedAt(entry: any, entryType: EntryType): string | null {
  if (entryType === 'experience') {
    return entry.lastUsedAt;
  }
  return entry.lastAccessedAt;
}

function getAccessCount(entry: any, entryType: EntryType): number {
  if (entryType === 'experience') {
    return entry.useCount ?? 0;
  }
  return entry.accessCount ?? 0;
}

function checkShouldForget(
  strategy: ForgettingStrategy,
  recencyScore: number,
  frequencyScore: number,
  importanceInput: any,
  lastAccessedAt: string | null,
  createdAt: string,
  accessCount: number,
  params: AnalyzeParams,
  config: ForgettingConfig
): boolean {
  switch (strategy) {
    case 'recency':
      return shouldForgetByRecency(lastAccessedAt, createdAt, {
        staleDays: params.staleDays ?? config.recency.staleDays,
        threshold: config.recency.threshold,
      });
    case 'frequency':
      return shouldForgetByFrequency(accessCount, lastAccessedAt, {
        minAccessCount: params.minAccessCount ?? config.frequency.minAccessCount,
        lookbackDays: config.frequency.lookbackDays,
      });
    case 'importance':
      return shouldForgetByImportance(importanceInput, {
        threshold: params.importanceThreshold ?? config.importance.threshold,
        excludeCritical: config.excludeCritical,
        excludeHighPriority: config.excludeHighPriority,
      });
    case 'combined': {
      // For combined, use weighted score threshold
      const combinedScore =
        recencyScore * 0.35 + frequencyScore * 0.35 + importanceInput.priority
          ? calculateImportanceScore(importanceInput) * 0.3
          : 0.3;
      return combinedScore < 0.4;
    }
  }
}

function getForgetReason(
  strategy: ForgettingStrategy,
  lastAccessedAt: string | null,
  createdAt: string,
  accessCount: number,
  importanceInput: any,
  params: AnalyzeParams,
  config: ForgettingConfig
): string {
  switch (strategy) {
    case 'recency':
      return getRecencyReason(
        lastAccessedAt,
        createdAt,
        params.staleDays ?? config.recency.staleDays
      );
    case 'frequency':
      return getFrequencyReason(
        accessCount,
        params.minAccessCount ?? config.frequency.minAccessCount
      );
    case 'importance':
      return getImportanceReason(
        importanceInput,
        params.importanceThreshold ?? config.importance.threshold
      );
    case 'combined':
      return 'Low combined score across recency, frequency, and importance';
  }
}

async function deactivateEntry(
  db: DbClient,
  entryType: EntryType,
  id: string,
  agentId?: string
): Promise<void> {
  const table = getTableForType(entryType);
  // All entry tables have isActive column - use type assertion for union table type
  await db
    .update(table)
    .set({ isActive: false } as Partial<MemoryEntry>)
    .where(eq(table.id, id));
  logger.info({ entryType, id, agentId }, 'Entry forgotten (deactivated)');
}

// Re-export types
export type {
  ForgettingCandidate,
  ForgettingResult,
  ForgettingConfig,
  AnalyzeParams,
  ForgetParams,
  ForgettingStatus,
  EntryType,
  ForgettingStrategy,
} from './types.js';

/**
 * Operational utilities handlers for memory_ops tool
 *
 * Provides handlers for:
 * - auto_tag: Run auto-tagging on content
 * - session_timeout: Query/control session timeout
 * - red_flags: Detect red flags in content
 * - embedding_coverage: Get embedding health metrics
 * - backfill_status: Get embedding backfill status
 * - trigger_config: Get/update extraction trigger configuration
 */

import type { AppContext } from '../../core/context.js';
import { createComponentLogger } from '../../utils/logger.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { getBackfillStats } from '../../services/backfill.service.js';
import {
  getEmbeddingCoverage,
  type EmbeddingEntryType,
} from '../../services/embedding-coverage.service.js';
import { DEFAULT_TRIGGER_CONFIG, type TriggerConfig } from '../../services/extraction/triggers.js';

const logger = createComponentLogger('ops-handler');

// Module-level trigger config state (can be enhanced to persist)
let currentTriggerConfig: TriggerConfig = { ...DEFAULT_TRIGGER_CONFIG };

export const opsHandlers = {
  /**
   * Run auto-tagging on content or an existing entry
   */
  async auto_tag(context: AppContext, params: Record<string, unknown>) {
    const content = params.content as string | undefined;
    const entryType = params.entryType as 'guideline' | 'knowledge' | 'tool' | undefined;
    const entryId = params.entryId as string | undefined;
    const category = params.category as string | undefined;

    const autoTagging = context.services.autoTagging;
    if (!autoTagging) {
      return formatTimestamps({
        success: false,
        action: 'auto_tag',
        error: 'Auto-tagging service not available',
      });
    }

    // If content provided, just infer tags without applying
    if (content) {
      const suggestions = autoTagging.inferTags(content, category);
      return formatTimestamps({
        success: true,
        action: 'auto_tag',
        mode: 'infer',
        suggestions,
        message: `Inferred ${suggestions.length} tag suggestion(s)`,
      });
    }

    // If entry specified, apply tags to it
    if (entryType && entryId) {
      // Need to get the entry content first
      let entryContent = '';

      if (entryType === 'guideline') {
        const entry = await context.repos.guidelines.getById(entryId);
        entryContent = entry?.currentVersion?.content ?? '';
      } else if (entryType === 'knowledge') {
        const entry = await context.repos.knowledge.getById(entryId);
        entryContent = entry?.currentVersion?.content ?? '';
      } else if (entryType === 'tool') {
        const entry = await context.repos.tools.getById(entryId);
        entryContent = entry?.currentVersion?.description ?? '';
      }

      if (!entryContent) {
        return formatTimestamps({
          success: false,
          action: 'auto_tag',
          error: `Entry not found: ${entryType}/${entryId}`,
        });
      }

      const result = await autoTagging.applyTags(entryType, entryId, entryContent, { category });
      return formatTimestamps({
        success: true,
        action: 'auto_tag',
        mode: 'apply',
        entryType,
        entryId,
        tags: result.tags,
        suggestions: result.suggestions,
        skipped: result.skipped,
        reason: result.reason,
        message: result.skipped
          ? `Skipped: ${result.reason}`
          : `Applied ${result.tags.length} tag(s)`,
      });
    }

    return formatTimestamps({
      success: false,
      action: 'auto_tag',
      error: 'Provide either content (for inference) or entryType+entryId (for application)',
    });
  },

  /**
   * Query or control session timeout settings
   */
  async session_timeout(context: AppContext, params: Record<string, unknown>) {
    const subAction = (params.subAction as string) ?? 'status';

    const sessionTimeout = context.services.sessionTimeout;
    if (!sessionTimeout) {
      return formatTimestamps({
        success: false,
        action: 'session_timeout',
        error: 'Session timeout service not available',
      });
    }

    switch (subAction) {
      case 'status': {
        const sessionId = params.sessionId as string | undefined;
        const lastActivity = sessionId ? sessionTimeout.getLastActivity(sessionId) : undefined;

        return formatTimestamps({
          success: true,
          action: 'session_timeout',
          subAction: 'status',
          config: {
            enabled: context.config.autoContext.sessionTimeoutEnabled ?? true,
            inactivityMs: context.config.autoContext.sessionInactivityMs ?? 30 * 60 * 1000,
            checkIntervalMs: context.config.autoContext.sessionTimeoutCheckMs ?? 5 * 60 * 1000,
          },
          sessionInfo: sessionId
            ? {
                sessionId,
                lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
                idleMs: lastActivity ? Date.now() - lastActivity : null,
              }
            : null,
        });
      }

      case 'check': {
        const endedCount = await sessionTimeout.checkAndEndStaleSessions();
        return formatTimestamps({
          success: true,
          action: 'session_timeout',
          subAction: 'check',
          sessionsEnded: endedCount,
          message: endedCount > 0 ? `Ended ${endedCount} stale session(s)` : 'No stale sessions found',
        });
      }

      case 'record_activity': {
        const sessionId = params.sessionId as string;
        if (!sessionId) {
          return formatTimestamps({
            success: false,
            action: 'session_timeout',
            subAction: 'record_activity',
            error: 'sessionId is required',
          });
        }
        sessionTimeout.recordActivity(sessionId);
        return formatTimestamps({
          success: true,
          action: 'session_timeout',
          subAction: 'record_activity',
          sessionId,
          message: 'Activity recorded',
        });
      }

      default:
        return formatTimestamps({
          success: false,
          action: 'session_timeout',
          error: `Unknown subAction: ${subAction}. Valid: status, check, record_activity`,
        });
    }
  },

  /**
   * Detect red flags in content
   */
  async red_flags(context: AppContext, params: Record<string, unknown>) {
    const content = params.content as string | undefined;
    const entryType = (params.entryType as string) ?? 'knowledge';
    const entryId = params.entryId as string | undefined;

    const redFlagService = context.services.redFlag;
    if (!redFlagService) {
      return formatTimestamps({
        success: false,
        action: 'red_flags',
        error: 'Red flag service not available',
      });
    }

    // Detect red flags in provided content
    if (content) {
      const flags = await redFlagService.detectRedFlags({
        type: entryType as 'guideline' | 'knowledge' | 'tool',
        content,
      });

      return formatTimestamps({
        success: true,
        action: 'red_flags',
        mode: 'detect',
        flags,
        flagCount: flags.length,
        highSeverity: flags.filter((f) => f.severity === 'high').length,
        mediumSeverity: flags.filter((f) => f.severity === 'medium').length,
        lowSeverity: flags.filter((f) => f.severity === 'low').length,
        message:
          flags.length > 0 ? `Detected ${flags.length} red flag(s)` : 'No red flags detected',
      });
    }

    // Score an existing entry
    if (entryId && entryType) {
      const riskScore = await redFlagService.scoreRedFlagRisk(
        entryId,
        entryType as 'guideline' | 'knowledge' | 'tool'
      );

      return formatTimestamps({
        success: true,
        action: 'red_flags',
        mode: 'score',
        entryType,
        entryId,
        riskScore,
        riskLevel: riskScore >= 0.7 ? 'high' : riskScore >= 0.4 ? 'medium' : 'low',
        message: `Risk score: ${(riskScore * 100).toFixed(1)}%`,
      });
    }

    return formatTimestamps({
      success: false,
      action: 'red_flags',
      error: 'Provide either content (for detection) or entryType+entryId (for scoring)',
    });
  },

  /**
   * Get embedding coverage health metrics
   */
  async embedding_coverage(context: AppContext, params: Record<string, unknown>) {
    const scopeType = (params.scopeType as string) ?? 'project';
    const scopeId = params.scopeId as string | undefined;
    const types = (params.types as EmbeddingEntryType[]) ?? [
      'tool',
      'guideline',
      'knowledge',
      'experience',
    ];

    // Build scope chain
    const scopeChain = [{ type: scopeType, id: scopeId ?? null }];

    // Get raw SQLite connection for the coverage query
    const sqlite = context.sqlite;
    if (!sqlite) {
      return formatTimestamps({
        success: false,
        action: 'embedding_coverage',
        error: 'SQLite database not available (may be using PostgreSQL mode)',
      });
    }

    const coverage = await getEmbeddingCoverage(sqlite, scopeChain, types);

    const percentCovered = (coverage.ratio * 100).toFixed(1);
    const healthStatus =
      coverage.ratio >= 0.9 ? 'healthy' : coverage.ratio >= 0.7 ? 'degraded' : 'unhealthy';

    return formatTimestamps({
      success: true,
      action: 'embedding_coverage',
      scopeType,
      scopeId,
      types,
      coverage: {
        total: coverage.total,
        withEmbeddings: coverage.withEmbeddings,
        missing: coverage.total - coverage.withEmbeddings,
        ratio: coverage.ratio,
        percentCovered: `${percentCovered}%`,
      },
      healthStatus,
      message:
        coverage.total === 0
          ? 'No entries found in scope'
          : `${percentCovered}% coverage (${coverage.withEmbeddings}/${coverage.total} entries)`,
      recommendation:
        healthStatus === 'unhealthy'
          ? 'Run memory_ops backfill_status to check and initiate embedding backfill'
          : null,
    });
  },

  /**
   * Get embedding backfill status and stats
   */
  backfill_status(context: AppContext, _params: Record<string, unknown>) {
    const stats = getBackfillStats(context.db);

    const totalEntries = stats.tools.total + stats.guidelines.total + stats.knowledge.total;
    const totalWithEmbeddings =
      stats.tools.withEmbeddings + stats.guidelines.withEmbeddings + stats.knowledge.withEmbeddings;
    const totalMissing = totalEntries - totalWithEmbeddings;
    const overallRatio = totalEntries > 0 ? totalWithEmbeddings / totalEntries : 1;

    return formatTimestamps({
      success: true,
      action: 'backfill_status',
      stats: {
        tools: {
          ...stats.tools,
          missing: stats.tools.total - stats.tools.withEmbeddings,
          ratio: stats.tools.total > 0 ? stats.tools.withEmbeddings / stats.tools.total : 1,
        },
        guidelines: {
          ...stats.guidelines,
          missing: stats.guidelines.total - stats.guidelines.withEmbeddings,
          ratio:
            stats.guidelines.total > 0
              ? stats.guidelines.withEmbeddings / stats.guidelines.total
              : 1,
        },
        knowledge: {
          ...stats.knowledge,
          missing: stats.knowledge.total - stats.knowledge.withEmbeddings,
          ratio:
            stats.knowledge.total > 0 ? stats.knowledge.withEmbeddings / stats.knowledge.total : 1,
        },
      },
      summary: {
        totalEntries,
        totalWithEmbeddings,
        totalMissing,
        overallRatio,
        percentComplete: `${(overallRatio * 100).toFixed(1)}%`,
      },
      message:
        totalMissing > 0
          ? `${totalMissing} entries need embeddings. Run 'agent-memory reindex' to backfill.`
          : 'All entries have embeddings',
    });
  },

  /**
   * Get or update extraction trigger configuration
   */
  trigger_config(_context: AppContext, params: Record<string, unknown>) {
    const subAction = (params.subAction as string) ?? 'get';

    switch (subAction) {
      case 'get': {
        return formatTimestamps({
          success: true,
          action: 'trigger_config',
          subAction: 'get',
          config: currentTriggerConfig,
          message: 'Current extraction trigger configuration',
        });
      }

      case 'update': {
        const updates = params.updates as Partial<TriggerConfig> | undefined;
        if (!updates) {
          return formatTimestamps({
            success: false,
            action: 'trigger_config',
            subAction: 'update',
            error: 'updates object is required',
          });
        }

        currentTriggerConfig = { ...currentTriggerConfig, ...updates };
        logger.info({ updates }, 'Updated trigger config');

        return formatTimestamps({
          success: true,
          action: 'trigger_config',
          subAction: 'update',
          config: currentTriggerConfig,
          message: 'Trigger configuration updated',
        });
      }

      case 'reset': {
        currentTriggerConfig = { ...DEFAULT_TRIGGER_CONFIG };
        return formatTimestamps({
          success: true,
          action: 'trigger_config',
          subAction: 'reset',
          config: currentTriggerConfig,
          message: 'Trigger configuration reset to defaults',
        });
      }

      default:
        return formatTimestamps({
          success: false,
          action: 'trigger_config',
          error: `Unknown subAction: ${subAction}. Valid: get, update, reset`,
        });
    }
  },
};

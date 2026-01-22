/**
 * Librarian CLI Command
 *
 * Manage the Librarian Agent for pattern detection and promotion recommendations.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { librarianHandlers } from '../../mcp/handlers/librarian.handler.js';
import { typedAction } from '../utils/typed-action.js';

// =============================================================================
// CUSTOM TABLE FORMATTERS
// =============================================================================

interface StatusResult {
  success: boolean;
  status: {
    service: {
      enabled: boolean;
      config: {
        enabled: boolean;
        schedule: string;
        triggerOnSessionEnd: boolean;
        modules: {
          capture: { enabled: boolean };
          patternAnalysis: { enabled: boolean };
          latentMemory: { enabled: boolean };
        };
        patternDetection: {
          embeddingSimilarityThreshold: number;
          trajectorySimilarityThreshold: number;
          minPatternSize: number;
        };
        qualityGate: {
          autoPromoteThreshold: number;
          reviewThreshold: number;
          minSuccessRate: number;
        };
        collection: {
          lookbackDays: number;
          maxExperiences: number;
        };
      };
      pendingRecommendations: number;
    };
    scheduler: {
      running: boolean;
      schedule: string | null;
      nextRun: string | null;
    };
  };
}

function formatStatusTable(result: StatusResult): string {
  const { service, scheduler } = result.status;
  const cfg = service.config;
  const lines: string[] = [];

  const check = (enabled: boolean) => (enabled ? '✓' : '✗');

  lines.push('LIBRARIAN STATUS');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(
    `Service Enabled:         ${check(service.enabled)} ${service.enabled ? 'enabled' : 'disabled'}`
  );
  lines.push(`Schedule:                ${cfg.schedule || '(none)'}`);
  lines.push(`Trigger on Session End:  ${check(cfg.triggerOnSessionEnd)}`);
  lines.push(`Pending Recommendations: ${service.pendingRecommendations}`);
  lines.push('');
  lines.push('MODULES');
  lines.push('─'.repeat(50));
  lines.push(`  Capture:               ${check(cfg.modules.capture.enabled)}`);
  lines.push(`  Pattern Analysis:      ${check(cfg.modules.patternAnalysis.enabled)}`);
  lines.push(`  Latent Memory:         ${check(cfg.modules.latentMemory.enabled)}`);
  lines.push('');
  lines.push('PATTERN DETECTION');
  lines.push('─'.repeat(50));
  lines.push(`  Embedding Threshold:   ${cfg.patternDetection.embeddingSimilarityThreshold}`);
  lines.push(`  Trajectory Threshold:  ${cfg.patternDetection.trajectorySimilarityThreshold}`);
  lines.push(`  Min Pattern Size:      ${cfg.patternDetection.minPatternSize}`);
  lines.push('');
  lines.push('QUALITY GATE');
  lines.push('─'.repeat(50));
  lines.push(`  Auto-Promote:          ≥ ${cfg.qualityGate.autoPromoteThreshold}`);
  lines.push(`  Review Queue:          ≥ ${cfg.qualityGate.reviewThreshold}`);
  lines.push(`  Min Success Rate:      ${cfg.qualityGate.minSuccessRate}`);
  lines.push('');
  lines.push('COLLECTION');
  lines.push('─'.repeat(50));
  lines.push(`  Lookback Days:         ${cfg.collection.lookbackDays}`);
  lines.push(`  Max Experiences:       ${cfg.collection.maxExperiences}`);
  lines.push('');
  lines.push('SCHEDULER');
  lines.push('─'.repeat(50));
  lines.push(`  Running:               ${check(scheduler.running)}`);
  lines.push(`  Next Run:              ${scheduler.nextRun || '(not scheduled)'}`);

  return lines.join('\n');
}

interface Recommendation {
  id: string;
  status: string;
  confidence: number;
  patternDescription?: string;
  suggestedTitle?: string;
  createdAt: string;
  disposition?: string;
}

interface RecommendationsResult {
  success: boolean;
  recommendations: Recommendation[];
  total: number;
}

function formatRecommendationsTable(result: RecommendationsResult): string {
  const { recommendations, total } = result;

  if (recommendations.length === 0) {
    return `No recommendations found (total: ${total})`;
  }

  const lines: string[] = [];
  lines.push(`Found ${recommendations.length} recommendation(s) (total: ${total})`);
  lines.push('');

  // Column widths
  const idWidth = 12;
  const statusWidth = 10;
  const confWidth = 6;
  const patternWidth = 40;
  const dateWidth = 12;

  // Header
  const header = [
    'ID'.padEnd(idWidth),
    'Status'.padEnd(statusWidth),
    'Conf'.padEnd(confWidth),
    'Pattern'.padEnd(patternWidth),
    'Created'.padEnd(dateWidth),
  ].join(' │ ');

  const separator = [
    '─'.repeat(idWidth),
    '─'.repeat(statusWidth),
    '─'.repeat(confWidth),
    '─'.repeat(patternWidth),
    '─'.repeat(dateWidth),
  ].join('─┼─');

  lines.push(header);
  lines.push(separator);

  for (const rec of recommendations) {
    const shortId = rec.id.length > idWidth ? rec.id.slice(0, idWidth - 2) + '..' : rec.id;
    const pattern = rec.suggestedTitle || rec.patternDescription || '(no description)';
    const shortPattern =
      pattern.length > patternWidth ? pattern.slice(0, patternWidth - 2) + '..' : pattern;
    const date = rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : '';

    const row = [
      shortId.padEnd(idWidth),
      rec.status.padEnd(statusWidth),
      rec.confidence.toFixed(2).padEnd(confWidth),
      shortPattern.padEnd(patternWidth),
      date.padEnd(dateWidth),
    ].join(' │ ');

    lines.push(row);
  }

  return lines.join('\n');
}

interface AnalysisResult {
  success: boolean;
  analysis: {
    runId: string;
    dryRun: boolean;
    timing: {
      startedAt: string;
      completedAt: string;
      durationMs: number;
    };
    stats: {
      experiencesCollected: number;
      patternsDetected: number;
      autoPromoted: number;
      queuedForReview: number;
      rejected: number;
    };
    recommendations: Recommendation[];
  };
}

function formatAnalysisTable(result: AnalysisResult): string {
  const { analysis } = result;
  const { stats, timing } = analysis;
  const lines: string[] = [];

  lines.push('ANALYSIS RESULTS');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Run ID:              ${analysis.runId}`);
  lines.push(`Mode:                ${analysis.dryRun ? 'Dry Run (no changes)' : 'Live'}`);
  lines.push(`Duration:            ${timing.durationMs}ms`);
  lines.push('');
  lines.push('STATISTICS');
  lines.push('─'.repeat(50));
  lines.push(`  Experiences:       ${stats.experiencesCollected}`);
  lines.push(`  Patterns Found:    ${stats.patternsDetected}`);
  lines.push(`  Auto-Promoted:     ${stats.autoPromoted}`);
  lines.push(`  Queued for Review: ${stats.queuedForReview}`);
  lines.push(`  Rejected:          ${stats.rejected}`);

  if (analysis.recommendations.length > 0) {
    lines.push('');
    lines.push('RECOMMENDATIONS');
    lines.push('─'.repeat(50));
    for (const rec of analysis.recommendations) {
      const pattern = rec.suggestedTitle || rec.patternDescription || '(no description)';
      lines.push(`  [${rec.disposition || rec.status}] ${rec.confidence.toFixed(2)} - ${pattern}`);
    }
  }

  return lines.join('\n');
}

interface LibrarianAnalyzeOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  lookbackDays?: number;
  dryRun?: boolean;
}

interface LibrarianStatusOptions extends Record<string, unknown> {
  // No options needed
}

interface LibrarianRecommendationsOptions extends Record<string, unknown> {
  status?: string;
  scopeType?: string;
  scopeId?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

interface LibrarianShowOptions extends Record<string, unknown> {
  id: string;
}

interface LibrarianApproveOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

interface LibrarianRejectOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

interface LibrarianSkipOptions extends Record<string, unknown> {
  id: string;
  notes?: string;
}

export function addLibrarianCommand(program: Command): void {
  const librarian = program
    .command('librarian')
    .description('Librarian Agent for pattern detection and recommendations');

  // librarian analyze
  librarian
    .command('analyze')
    .description('Run pattern detection analysis on experiences')
    .option('--scope-type <type>', 'Scope type (global, org, project, session)', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--lookback-days <n>', 'Days to look back for experiences', (v) => parseInt(v, 10))
    .option('--dry-run', 'Analyze without creating recommendations')
    .action(
      typedAction<LibrarianAnalyzeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.analyze(context, {
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            lookbackDays: options.lookbackDays,
            dryRun: options.dryRun,
          });

          if (globalOpts.format === 'table') {
            console.log(formatAnalysisTable(result as AnalysisResult));
          } else {
            console.log(formatOutput(result, globalOpts.format as OutputFormat));
          }
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian status
  librarian
    .command('status')
    .description('Get librarian service and scheduler status')
    .action(
      typedAction<LibrarianStatusOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.status(context, {});

          if (globalOpts.format === 'table') {
            console.log(formatStatusTable(result as StatusResult));
          } else {
            console.log(formatOutput(result, globalOpts.format as OutputFormat));
          }
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian recommendations
  librarian
    .command('recommendations')
    .description('List pending promotion recommendations')
    .option(
      '--status <status>',
      'Filter by status (pending, approved, rejected, skipped, expired)',
      'pending'
    )
    .option('--scope-type <type>', 'Scope type')
    .option('--scope-id <id>', 'Scope ID')
    .option('--min-confidence <n>', 'Filter by minimum confidence', (v) => parseFloat(v))
    .option('--limit <n>', 'Maximum results', (v) => parseInt(v, 10))
    .option('--offset <n>', 'Skip N results', (v) => parseInt(v, 10))
    .action(
      typedAction<LibrarianRecommendationsOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.list_recommendations(context, {
            status: options.status,
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            minConfidence: options.minConfidence,
            limit: options.limit,
            offset: options.offset,
          });

          if (globalOpts.format === 'table') {
            console.log(formatRecommendationsTable(result as RecommendationsResult));
          } else {
            console.log(formatOutput(result, globalOpts.format as OutputFormat));
          }
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian show
  librarian
    .command('show')
    .description('Show details of a specific recommendation')
    .requiredOption('--id <id>', 'Recommendation ID')
    .action(
      typedAction<LibrarianShowOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.show_recommendation(context, {
            recommendationId: options.id,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian approve
  librarian
    .command('approve')
    .description('Approve a recommendation and create the promotion')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianApproveOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.approve(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian reject
  librarian
    .command('reject')
    .description('Reject a recommendation')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianRejectOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.reject(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // librarian skip
  librarian
    .command('skip')
    .description('Skip a recommendation for now')
    .requiredOption('--id <id>', 'Recommendation ID')
    .option('--notes <notes>', 'Review notes')
    .action(
      typedAction<LibrarianSkipOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await librarianHandlers.skip(context, {
            recommendationId: options.id,
            reviewedBy: globalOpts.agentId,
            notes: options.notes,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );
}

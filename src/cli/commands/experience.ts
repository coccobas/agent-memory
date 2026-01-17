/**
 * Experience CLI Command
 *
 * Manage experiential memory entries via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { experienceHandlers } from '../../mcp/handlers/experiences.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface ExperienceListOptions extends Record<string, unknown> {
  scopeType?: string;
  scopeId?: string;
  level?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

interface ExperienceGetOptions extends Record<string, unknown> {
  id: string;
  includeVersions?: boolean;
}

interface ExperienceAddOptions extends Record<string, unknown> {
  title: string;
  content: string;
  scopeType?: string;
  scopeId?: string;
  level?: string;
  category?: string;
  scenario?: string;
  outcome?: string;
  pattern?: string;
  applicability?: string;
  confidence?: number;
  source?: string;
}

interface ExperiencePromoteOptions extends Record<string, unknown> {
  id: string;
  toLevel: string;
  pattern?: string;
  applicability?: string;
  contraindications?: string;
  toolName?: string;
  toolDescription?: string;
  toolCategory?: string;
  reason?: string;
}

interface ExperienceTrajectoryOptions extends Record<string, unknown> {
  id: string;
}

interface ExperienceAddStepOptions extends Record<string, unknown> {
  id: string;
  action: string;
  observation?: string;
  reasoning?: string;
  toolUsed?: string;
  success?: boolean;
  durationMs?: number;
}

interface ExperienceRecordOutcomeOptions extends Record<string, unknown> {
  id: string;
  success: boolean;
  feedback?: string;
}

interface ExperienceRecordCaseOptions extends Record<string, unknown> {
  title: string;
  scenario: string;
  outcome: string;
  content?: string;
  category?: string;
  confidence?: number;
  source?: string;
  projectId?: string;
  sessionId?: string;
}

interface ExperienceDeactivateOptions extends Record<string, unknown> {
  id: string;
}

export function addExperienceCommand(program: Command): void {
  const experience = program
    .command('experience')
    .description('Manage experiential memory entries');

  // experience list
  experience
    .command('list')
    .description('List experiences')
    .option('--scope-type <type>', 'Scope type (global, org, project, session)', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--level <level>', 'Filter by level (case, strategy)')
    .option('--category <category>', 'Filter by category')
    .option('--limit <n>', 'Maximum results', (v) => parseInt(v, 10))
    .option('--offset <n>', 'Skip N results', (v) => parseInt(v, 10))
    .action(
      typedAction<ExperienceListOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.list(context, {
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            level: options.level,
            category: options.category,
            limit: options.limit,
            offset: options.offset,
            inherit: true,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience get
  experience
    .command('get')
    .description('Get experience by ID')
    .requiredOption('--id <id>', 'Experience ID')
    .option('--include-versions', 'Include version history')
    .action(
      typedAction<ExperienceGetOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.get(context, {
            id: options.id,
            includeVersions: options.includeVersions,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience add
  experience
    .command('add')
    .description('Add a new experience')
    .requiredOption('--title <title>', 'Experience title')
    .requiredOption('--content <content>', 'Experience content')
    .option('--scope-type <type>', 'Scope type', 'project')
    .option('--scope-id <id>', 'Scope ID')
    .option('--level <level>', 'Level (case, strategy)', 'case')
    .option('--category <category>', 'Category')
    .option('--scenario <scenario>', 'Scenario description')
    .option('--outcome <outcome>', 'Outcome description')
    .option('--pattern <pattern>', 'Pattern (for strategies)')
    .option('--applicability <applicability>', 'Applicability conditions')
    .option('--confidence <n>', 'Confidence score 0-1', (v) => parseFloat(v))
    .option('--source <source>', 'Source (observation, reflection, user, promotion)')
    .action(
      typedAction<ExperienceAddOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.add(context, {
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            title: options.title,
            content: options.content,
            level: options.level,
            category: options.category,
            scenario: options.scenario,
            outcome: options.outcome,
            pattern: options.pattern,
            applicability: options.applicability,
            confidence: options.confidence,
            source: options.source,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience promote
  experience
    .command('promote')
    .description('Promote experience to strategy or skill')
    .requiredOption('--id <id>', 'Experience ID')
    .requiredOption('--to-level <level>', 'Target level (strategy, skill)')
    .option('--pattern <pattern>', 'Pattern for strategy promotion')
    .option('--applicability <applicability>', 'Applicability conditions')
    .option('--contraindications <contraindications>', 'Contraindications')
    .option('--tool-name <name>', 'Tool name (for skill promotion)')
    .option('--tool-description <desc>', 'Tool description (for skill promotion)')
    .option('--tool-category <cat>', 'Tool category (mcp, cli, function, api)')
    .option('--reason <reason>', 'Reason for promotion')
    .action(
      typedAction<ExperiencePromoteOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.promote(context, {
            id: options.id,
            toLevel: options.toLevel,
            pattern: options.pattern,
            applicability: options.applicability,
            contraindications: options.contraindications,
            toolName: options.toolName,
            toolDescription: options.toolDescription,
            toolCategory: options.toolCategory,
            reason: options.reason,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience trajectory
  experience
    .command('trajectory')
    .description('Get trajectory steps for an experience')
    .requiredOption('--id <id>', 'Experience ID')
    .action(
      typedAction<ExperienceTrajectoryOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.get_trajectory(context, {
            id: options.id,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience add-step
  experience
    .command('add-step')
    .description('Add a trajectory step to an experience')
    .requiredOption('--id <id>', 'Experience ID')
    .requiredOption('--action <action>', 'Action taken')
    .option('--observation <observation>', 'Observation/result')
    .option('--reasoning <reasoning>', 'Reasoning')
    .option('--tool-used <tool>', 'Tool used')
    .option('--success', 'Step was successful')
    .option('--no-success', 'Step failed')
    .option('--duration-ms <ms>', 'Duration in milliseconds', (v) => parseInt(v, 10))
    .action(
      typedAction<ExperienceAddStepOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.add_step(context, {
            id: options.id,
            action: options.action,
            observation: options.observation,
            reasoning: options.reasoning,
            toolUsed: options.toolUsed,
            success: options.success,
            durationMs: options.durationMs,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience record-outcome
  experience
    .command('record-outcome')
    .description('Record success/failure outcome for an experience')
    .requiredOption('--id <id>', 'Experience ID')
    .requiredOption('--success', 'Was the outcome successful')
    .option('--no-success', 'The outcome failed')
    .option('--feedback <feedback>', 'Additional feedback')
    .action(
      typedAction<ExperienceRecordOutcomeOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.record_outcome(context, {
            id: options.id,
            success: options.success,
            feedback: options.feedback,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience record-case
  experience
    .command('record-case')
    .description('Record a new case experience')
    .requiredOption('--title <title>', 'Case title')
    .requiredOption('--scenario <scenario>', 'Scenario description')
    .requiredOption('--outcome <outcome>', 'Outcome description')
    .option('--content <content>', 'Additional content')
    .option('--category <category>', 'Category')
    .option('--confidence <n>', 'Confidence 0-1', (v) => parseFloat(v))
    .option('--source <source>', 'Source (user, observation)')
    .option('--project-id <id>', 'Project ID')
    .option('--session-id <id>', 'Session ID')
    .action(
      typedAction<ExperienceRecordCaseOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.record_case(context, {
            title: options.title,
            scenario: options.scenario,
            outcome: options.outcome,
            content: options.content,
            category: options.category,
            confidence: options.confidence,
            source: options.source,
            projectId: options.projectId,
            sessionId: options.sessionId,
            agentId: globalOpts.agentId,
          });

          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // experience deactivate
  experience
    .command('deactivate')
    .description('Deactivate an experience')
    .requiredOption('--id <id>', 'Experience ID')
    .action(
      typedAction<ExperienceDeactivateOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await experienceHandlers.deactivate(context, {
            id: options.id,
            agentId: globalOpts.agentId,
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

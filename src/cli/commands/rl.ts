/**
 * RL CLI Command
 *
 * Manage reinforcement learning policies for memory operations.
 */

import type { Command } from 'commander';
import { writeFileSync } from 'fs';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import {
  buildExtractionDataset,
  buildRetrievalDataset,
  buildConsolidationDataset,
} from '../../services/rl/training/dataset-builder.js';
import {
  trainExtractionPolicy,
  trainRetrievalPolicy,
  trainConsolidationPolicy,
} from '../../services/rl/training/dpo-trainer.js';
import { evaluatePolicyOnDataset } from '../../services/rl/training/evaluation.js';
import { typedAction } from '../utils/typed-action.js';

interface RlStatusOptions extends Record<string, never> {}

interface RlFeedbackOptions extends Record<string, unknown> {
  startDate?: string;
  endDate?: string;
  sessionId?: string;
  limit?: number;
}

export function addRlCommand(program: Command): void {
  const rl = program.command('rl').description('Reinforcement learning policy management');

  // rl status
  rl.command('status')
    .description('Show RL service and policy status')
    .action(
      typedAction<RlStatusOptions>(async (_options, globalOpts) => {
        try {
          const context = await getCliContext();

          const rlService = context.services.rl;
          if (!rlService) {
            // eslint-disable-next-line no-console
            console.error('RL service not initialized');
            return;
          }

          const status = rlService.getStatus();
          const config = rlService.getConfig();

          const result = {
            service: {
              enabled: status.enabled,
            },
            policies: {
              extraction: {
                enabled: status.extraction.enabled,
                hasModel: status.extraction.hasModel,
                modelPath: config.extraction.modelPath ?? 'none (using fallback)',
              },
              retrieval: {
                enabled: status.retrieval.enabled,
                hasModel: status.retrieval.hasModel,
                modelPath: config.retrieval.modelPath ?? 'none (using fallback)',
              },
              consolidation: {
                enabled: status.consolidation.enabled,
                hasModel: status.consolidation.hasModel,
                modelPath: config.consolidation.modelPath ?? 'none (using fallback)',
              },
            },
          };

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // rl feedback
  rl.command('feedback')
    .description('Show feedback collection statistics')
    .option('--start-date <date>', 'Start date (ISO format)')
    .option('--end-date <date>', 'End date (ISO format)')
    .option('--session-id <id>', 'Filter by session ID')
    .option('--limit <n>', 'Maximum results', (v) => parseInt(v, 10))
    .action(
      typedAction<RlFeedbackOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const feedbackService = context.services.feedback;
          if (!feedbackService) {
            // eslint-disable-next-line no-console
            console.error('Feedback service not initialized');
            return;
          }

          const data = await feedbackService.exportTrainingData({
            startDate: options.startDate,
            endDate: options.endDate,
            limit: options.limit,
          });

          const result = {
            exportedAt: data.metadata.exportedAt,
            dateRange: {
              start: data.metadata.startDate ?? 'beginning',
              end: data.metadata.endDate ?? 'now',
            },
            samples: {
              retrieval: {
                total: data.retrieval.count,
                withOutcomes: data.retrieval.samples.filter((s) => s.outcomeType).length,
              },
              extraction: {
                total: data.extraction.count,
                withOutcomes: data.extraction.samples.filter((s) => s.outcomeScore).length,
              },
              consolidation: {
                total: data.consolidation.count,
                withOutcomes: data.consolidation.samples.filter((s) => s.outcomeScore).length,
              },
            },
            stats: data.stats,
          };

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // rl train
  // Note: Commander.js doesn't provide strong typing for positional arguments,
  // so we must use 'any' types and disable related eslint rules for these commands
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  rl.command('train <policy>')
    .description('Train a policy from collected feedback (extraction|retrieval|consolidation)')
    .option('--output <path>', 'Output directory', './models/rl')
    .option('--min-examples <n>', 'Minimum examples required', (v) => parseInt(v, 10), 100)
    .option('--eval-split <ratio>', 'Evaluation split ratio', (v) => parseFloat(v), 0.2)
    .option('--start-date <date>', 'Start date for training data')
    .option('--end-date <date>', 'End date for training data')
    .option('--min-confidence <n>', 'Minimum confidence threshold', (v) => parseFloat(v))
    .action(async (policy: string, options: any, cmd: any) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as { format?: OutputFormat };
        await getCliContext();

        // eslint-disable-next-line no-console
        console.log(`Training ${policy} policy...`);

        // Validate policy type
        if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
          // eslint-disable-next-line no-console
          console.error(
            `Unknown policy: ${policy}. Must be extraction, retrieval, or consolidation.`
          );
          return;
        }

        // Build dataset
        const buildDataset =
          policy === 'extraction'
            ? buildExtractionDataset
            : policy === 'retrieval'
              ? buildRetrievalDataset
              : buildConsolidationDataset;

        // eslint-disable-next-line no-console
        console.log('Building dataset...');
        const dataset = await buildDataset({
          startDate: options.startDate,
          endDate: options.endDate,
          minConfidence: options.minConfidence,
          maxExamples: options.minExamples * 2,
          evalSplit: options.evalSplit,
        });

        // eslint-disable-next-line no-console
        console.log(
          `Dataset built: ${dataset.stats.trainExamples} train, ${dataset.stats.evalExamples} eval`
        );

        // Check minimum examples
        if (dataset.stats.totalExamples < options.minExamples) {
          // eslint-disable-next-line no-console
          console.error(
            `Insufficient training examples: ${dataset.stats.totalExamples} < ${options.minExamples}`
          );
          return;
        }

        // Train policy
        // eslint-disable-next-line no-console
        console.log('Training policy...');
        let result;
        if (policy === 'extraction') {
          result = await trainExtractionPolicy(dataset as any, {
            modelName: `${policy}-policy`,
            outputPath: `${options.output}/${policy}`,
          });
        } else if (policy === 'retrieval') {
          result = await trainRetrievalPolicy(dataset as any, {
            modelName: `${policy}-policy`,
            outputPath: `${options.output}/${policy}`,
          });
        } else {
          result = await trainConsolidationPolicy(dataset as any, {
            modelName: `${policy}-policy`,
            outputPath: `${options.output}/${policy}`,
          });
        }

        if (result.success) {
          // eslint-disable-next-line no-console
          console.log('Training complete!');
          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } else {
          // eslint-disable-next-line no-console
          console.error(`Training failed: ${result.error}`);
        }
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

  // rl export
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  rl.command('export <policy>')
    .description('Export training data for external training (extraction|retrieval|consolidation)')
    .option('--output <path>', 'Output file path', './data/rl-training.jsonl')
    .option('--format <format>', 'Output format (jsonl|json)', 'jsonl')
    .option('--start-date <date>', 'Start date for data')
    .option('--end-date <date>', 'End date for data')
    .option('--min-confidence <n>', 'Minimum confidence threshold', (v) => parseFloat(v))
    .option('--limit <n>', 'Maximum examples', (v) => parseInt(v, 10))
    .action(async (policy: string, options: any, cmd: any) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as { format?: OutputFormat };
        await getCliContext();

        // Validate policy type
        if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
          // eslint-disable-next-line no-console
          console.error(
            `Unknown policy: ${policy}. Must be extraction, retrieval, or consolidation.`
          );
          return;
        }

        // eslint-disable-next-line no-console
        console.log(`Exporting ${policy} training data...`);

        // Build dataset
        const buildDataset =
          policy === 'extraction'
            ? buildExtractionDataset
            : policy === 'retrieval'
              ? buildRetrievalDataset
              : buildConsolidationDataset;

        const dataset = await buildDataset({
          startDate: options.startDate,
          endDate: options.endDate,
          minConfidence: options.minConfidence,
          maxExamples: options.limit,
          evalSplit: 0,
        });

        // Combine train and eval for export
        const allExamples = [...dataset.train, ...dataset.eval];

        // eslint-disable-next-line no-console
        console.log(`Exporting ${allExamples.length} examples...`);

        // Format output
        let output: string;
        if (options.format === 'jsonl') {
          output = allExamples.map((ex) => JSON.stringify(ex)).join('\n');
        } else {
          output = JSON.stringify(
            {
              policy,
              exportedAt: new Date().toISOString(),
              stats: dataset.stats,
              examples: allExamples,
            },
            null,
            2
          );
        }

        // Write to file
        writeFileSync(options.output, output, 'utf-8');

        const result = {
          policy,
          exportedExamples: allExamples.length,
          outputFile: options.output,
          format: options.format,
          stats: dataset.stats,
        };

        // eslint-disable-next-line no-console
        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

  // rl evaluate
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  rl.command('evaluate <policy>')
    .description('Evaluate a policy on test data (extraction|retrieval|consolidation)')
    .option('--start-date <date>', 'Start date for test data')
    .option('--end-date <date>', 'End date for test data')
    .option('--test-size <n>', 'Number of test examples', (v) => parseInt(v, 10), 100)
    .action(async (policy: string, options: any, cmd: any) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as { format?: OutputFormat };
        const context = await getCliContext();

        // Validate policy type
        if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
          // eslint-disable-next-line no-console
          console.error(
            `Unknown policy: ${policy}. Must be extraction, retrieval, or consolidation.`
          );
          return;
        }

        const rlService = context.services.rl;
        if (!rlService) {
          // eslint-disable-next-line no-console
          console.error('RL service not initialized');
          return;
        }

        // eslint-disable-next-line no-console
        console.log(`Evaluating ${policy} policy...`);

        // Build test dataset
        const buildDataset =
          policy === 'extraction'
            ? buildExtractionDataset
            : policy === 'retrieval'
              ? buildRetrievalDataset
              : buildConsolidationDataset;

        const dataset = await buildDataset({
          startDate: options.startDate,
          endDate: options.endDate,
          maxExamples: options.testSize,
          evalSplit: 1.0,
        });

        // eslint-disable-next-line no-console
        console.log(`Test dataset: ${dataset.eval.length} examples`);

        // Evaluate based on policy type
        // eslint-disable-next-line no-console
        console.log('Running evaluation...');
        let result;
        if (policy === 'extraction') {
          const policyInstance = rlService.getExtractionPolicy();
          result = await evaluatePolicyOnDataset(policyInstance, dataset as any);
        } else if (policy === 'retrieval') {
          const policyInstance = rlService.getRetrievalPolicy();
          result = await evaluatePolicyOnDataset(policyInstance, dataset as any);
        } else {
          const policyInstance = rlService.getConsolidationPolicy();
          result = await evaluatePolicyOnDataset(policyInstance, dataset as any);
        }

        // eslint-disable-next-line no-console
        console.log('Evaluation complete!');
        // eslint-disable-next-line no-console
        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

  // rl enable
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  rl.command('enable <policy>')
    .description('Enable or disable a policy (extraction|retrieval|consolidation)')
    .option('--disable', 'Disable the policy instead of enabling it')
    .action(async (policy: string, options: any, cmd: any) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as { format?: OutputFormat };
        const context = await getCliContext();

        // Validate policy type
        if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
          // eslint-disable-next-line no-console
          console.error(
            `Unknown policy: ${policy}. Must be extraction, retrieval, or consolidation.`
          );
          return;
        }

        const rlService = context.services.rl;
        if (!rlService) {
          // eslint-disable-next-line no-console
          console.error('RL service not initialized');
          return;
        }

        const enabled = !options.disable;

        // Update config
        rlService.updateConfig({
          [policy]: {
            enabled,
          },
        });

        const result = {
          policy,
          enabled,
          message: `${policy} policy ${enabled ? 'enabled' : 'disabled'}`,
        };

        // eslint-disable-next-line no-console
        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

  // rl set-model
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  rl.command('set-model <policy> <path>')
    .description('Set the model path for a policy (extraction|retrieval|consolidation)')
    .action(async (policy: string, path: string, _options: any, cmd: any) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as { format?: OutputFormat };
        const context = await getCliContext();

        // Validate policy type
        if (!['extraction', 'retrieval', 'consolidation'].includes(policy)) {
          // eslint-disable-next-line no-console
          console.error(
            `Unknown policy: ${policy}. Must be extraction, retrieval, or consolidation.`
          );
          return;
        }

        const rlService = context.services.rl;
        if (!rlService) {
          // eslint-disable-next-line no-console
          console.error('RL service not initialized');
          return;
        }

        // Update config
        rlService.updateConfig({
          [policy]: {
            modelPath: path,
          },
        });

        const result = {
          policy,
          modelPath: path,
          message: `${policy} policy model path updated`,
        };

        // eslint-disable-next-line no-console
        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
}

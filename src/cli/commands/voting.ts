/**
 * Voting CLI Command
 *
 * Manage multi-agent voting and consensus via CLI.
 */

import type { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { votingHandlers } from '../../mcp/handlers/voting.handler.js';
import { typedAction } from '../utils/typed-action.js';

interface VotingRecordVoteOptions extends Record<string, unknown> {
  taskId: string;
  voteValue: string;
  confidence?: number;
  reasoning?: string;
}

interface VotingGetConsensusOptions extends Record<string, unknown> {
  taskId: string;
  k?: number;
}

interface VotingListVotesOptions extends Record<string, unknown> {
  taskId: string;
}

interface VotingGetStatsOptions extends Record<string, unknown> {
  taskId: string;
}

export function addVotingCommand(program: Command): void {
  const voting = program.command('voting').description('Manage multi-agent voting and consensus');

  // voting record-vote
  voting
    .command('record-vote')
    .description('Record a vote from an agent')
    .requiredOption('--task-id <id>', 'Task ID')
    .requiredOption('--vote-value <value>', 'Vote value (any string)')
    .option('--confidence <n>', 'Confidence level 0-1', parseFloat, 1.0)
    .option('--reasoning <text>', 'Reasoning for this vote')
    .action(
      typedAction<VotingRecordVoteOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await votingHandlers.record_vote(context, {
            taskId: options.taskId,
            agentId: globalOpts.agentId ?? 'cli',
            voteValue: options.voteValue,
            confidence: options.confidence,
            reasoning: options.reasoning,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // voting get-consensus
  voting
    .command('get-consensus')
    .description('Get consensus for a task')
    .requiredOption('--task-id <id>', 'Task ID')
    .option('--k <n>', 'Number of votes ahead required for consensus', parseInt, 1)
    .action(
      typedAction<VotingGetConsensusOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await votingHandlers.get_consensus(context, {
            taskId: options.taskId,
            k: options.k,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // voting list-votes
  voting
    .command('list-votes')
    .description('List votes for a task')
    .requiredOption('--task-id <id>', 'Task ID')
    .action(
      typedAction<VotingListVotesOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await votingHandlers.list_votes(context, {
            taskId: options.taskId,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );

  // voting get-stats
  voting
    .command('get-stats')
    .description('Get voting statistics for a task')
    .requiredOption('--task-id <id>', 'Task ID')
    .action(
      typedAction<VotingGetStatsOptions>(async (options, globalOpts) => {
        try {
          const context = await getCliContext();

          const result = await votingHandlers.get_stats(context, {
            taskId: options.taskId,
          });

          // eslint-disable-next-line no-console
          console.log(formatOutput(result, globalOpts.format as OutputFormat));
        } catch (error) {
          handleCliError(error);
        } finally {
          await shutdownCliContext();
        }
      })
    );
}

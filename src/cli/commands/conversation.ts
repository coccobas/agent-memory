/**
 * Conversation CLI Command
 *
 * Manage conversations via CLI.
 */

import { Command } from 'commander';
import { getCliContext, shutdownCliContext } from '../utils/context.js';
import { formatOutput, type OutputFormat } from '../utils/output.js';
import { handleCliError } from '../utils/errors.js';
import { conversationHandlers } from '../../mcp/handlers/conversations.handler.js';

export function addConversationCommand(program: Command): void {
  const conversation = program.command('conversation').description('Manage conversation history');

  // conversation start
  conversation
    .command('start')
    .description('Start a new conversation')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--title <text>', 'Conversation title')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.start(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
          title: options.title,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation add-message
  conversation
    .command('add-message')
    .description('Add a message to a conversation')
    .requiredOption('--conversation-id <id>', 'Conversation ID')
    .requiredOption('--role <role>', 'Message role: user, agent, system')
    .requiredOption('--content <text>', 'Message content')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.addMessage(context, {
          conversationId: options.conversationId,
          role: options.role,
          content: options.content,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation get
  conversation
    .command('get')
    .description('Get a conversation by ID')
    .requiredOption('--id <id>', 'Conversation ID')
    .option('--include-messages', 'Include messages')
    .option('--include-context', 'Include context links')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.get(context, {
          id: options.id,
          includeMessages: options.includeMessages,
          includeContext: options.includeContext,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation list
  conversation
    .command('list')
    .description('List conversations')
    .option('--session-id <id>', 'Filter by session ID')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--status <status>', 'Filter by status: active, completed, archived')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.list(context, {
          sessionId: options.sessionId,
          projectId: options.projectId,
          status: options.status,
          limit: options.limit,
          offset: options.offset,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation update
  conversation
    .command('update')
    .description('Update a conversation')
    .requiredOption('--id <id>', 'Conversation ID')
    .option('--title <text>', 'New title')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.update(context, {
          id: options.id,
          title: options.title,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation link-context
  conversation
    .command('link-context')
    .description('Link a memory entry to a conversation')
    .requiredOption('--conversation-id <id>', 'Conversation ID')
    .option('--message-id <id>', 'Message ID')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .option('--relevance-score <n>', 'Relevance score 0-1', parseFloat)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.linkContext(context, {
          conversationId: options.conversationId,
          messageId: options.messageId,
          entryType: options.entryType,
          entryId: options.entryId,
          relevanceScore: options.relevanceScore,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation get-context
  conversation
    .command('get-context')
    .description('Get context links for an entry')
    .requiredOption('--entry-type <type>', 'Entry type: tool, guideline, knowledge')
    .requiredOption('--entry-id <id>', 'Entry ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.getContext(context, {
          entryType: options.entryType,
          entryId: options.entryId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation search
  conversation
    .command('search')
    .description('Search conversations')
    .requiredOption('--search <query>', 'Search query')
    .option('--session-id <id>', 'Filter by session ID')
    .option('--project-id <id>', 'Filter by project ID')
    .option('--limit <n>', 'Maximum entries to return', parseInt)
    .option('--offset <n>', 'Offset for pagination', parseInt)
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.search(context, {
          search: options.search,
          sessionId: options.sessionId,
          projectId: options.projectId,
          limit: options.limit,
          offset: options.offset,
          agentId: globalOpts.agentId,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation end
  conversation
    .command('end')
    .description('End a conversation')
    .requiredOption('--id <id>', 'Conversation ID')
    .option('--generate-summary', 'Generate summary when ending')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.end(context, {
          id: options.id,
          generateSummary: options.generateSummary,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });

  // conversation archive
  conversation
    .command('archive')
    .description('Archive a conversation')
    .requiredOption('--id <id>', 'Conversation ID')
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals();
        const context = await getCliContext();

        const result = await conversationHandlers.archive(context, {
          id: options.id,
        });

        console.log(formatOutput(result, globalOpts.format as OutputFormat));
      } catch (error) {
        handleCliError(error);
      } finally {
        await shutdownCliContext();
      }
    });
}

import type { HookCommandResult } from './types.js';

/**
 * Context passed to each command handler
 */
export interface CommandContext {
  sessionId: string;
  projectId?: string;
  command: string;
  subcommand: string;
  args: string[];
}

/**
 * Command handler function signature
 */
export type CommandHandler = (ctx: CommandContext) => Promise<HookCommandResult>;

/**
 * Descriptor for a hook command
 */
export interface HookCommandDescriptor {
  /** Primary command name */
  name: string;
  /** Alternative names/patterns that match this command */
  aliases?: string[];
  /** Description shown in help text */
  description: string;
  /** Usage pattern (e.g., "<id>" for required argument) */
  usage?: string;
  /** Whether this command requires an argument */
  requiresArg?: boolean;
  /** The handler function */
  handler: CommandHandler;
}

// Import handlers
import { handleStatus } from './handlers/status.handler.js';
import { handleSummary } from './handlers/summary.handler.js';
import { handleReview, handleReviewControl } from './handlers/review.handler.js';
import { handleList } from './handlers/list.handler.js';
import { handleShow } from './handlers/show.handler.js';
import { handleApprove } from './handlers/approve.handler.js';
import { handleReject } from './handlers/reject.handler.js';
import { handleSkip } from './handlers/skip.handler.js';
import { handleRemember } from './handlers/remember.handler.js';

/**
 * Registry of all available !am commands
 */
export const commandRegistry: HookCommandDescriptor[] = [
  {
    name: 'status',
    aliases: ['review status'],
    description: 'Show session status',
    handler: handleStatus,
  },
  {
    name: 'summary',
    description: 'Show session summary',
    handler: handleSummary,
  },
  {
    name: 'review',
    description: 'List candidates for review',
    handler: handleReview,
  },
  {
    name: 'review off',
    aliases: ['review suspend'],
    description: 'Suspend review notifications',
    handler: handleReviewControl,
  },
  {
    name: 'review on',
    aliases: ['review resume'],
    description: 'Enable review notifications',
    handler: handleReviewControl,
  },
  {
    name: 'review done',
    description: 'Acknowledge review completion',
    handler: handleReviewControl,
  },
  {
    name: 'list',
    description: 'List candidates for review',
    handler: handleList,
  },
  {
    name: 'show',
    usage: '<id>',
    description: 'Show entry details',
    requiresArg: true,
    handler: handleShow,
  },
  {
    name: 'approve',
    usage: '<id>',
    description: 'Promote to project scope',
    requiresArg: true,
    handler: handleApprove,
  },
  {
    name: 'reject',
    usage: '<id>',
    description: 'Deactivate entry',
    requiresArg: true,
    handler: handleReject,
  },
  {
    name: 'skip',
    usage: '<id>',
    description: 'Remove from review queue',
    requiresArg: true,
    handler: handleSkip,
  },
  {
    name: 'remember',
    aliases: ['store', 'save'],
    usage: '<text>',
    description: 'Quick store a memory',
    requiresArg: true,
    handler: handleRemember,
  },
];

/**
 * Find a command descriptor by name, checking aliases and compound commands
 */
export function findCommand(
  command: string,
  subcommand: string
): HookCommandDescriptor | undefined {
  const fullCommand = subcommand ? `${command} ${subcommand}` : command;

  // First, try to find an exact match for compound command (e.g., "review off")
  const exactMatch = commandRegistry.find(
    (desc) => desc.name === fullCommand || desc.aliases?.includes(fullCommand)
  );
  if (exactMatch) return exactMatch;

  // Then try matching just the primary command (for commands with arguments)
  const primaryMatch = commandRegistry.find(
    (desc) => desc.name === command || desc.aliases?.includes(command)
  );

  return primaryMatch;
}

/**
 * Generate help text from the registry
 */
export function generateHelp(): string {
  const lines = ['!am commands:'];

  for (const desc of commandRegistry) {
    // Skip aliases that are duplicates of primary commands
    if (desc.name.includes(' ') && !desc.name.startsWith('review ')) continue;

    const usage = desc.usage ? ` ${desc.usage}` : '';
    const name = desc.name.padEnd(18);
    lines.push(`  ${name}${usage.padEnd(6)} ${desc.description}`);
  }

  // Add control commands as a group
  lines.push('  review off|on|done  Control review notifications');

  return lines.join('\n');
}

/**
 * Create a blocked result (exitCode 2) with stderr message
 */
export function blocked(message: string | string[]): HookCommandResult {
  return {
    exitCode: 2,
    stdout: [],
    stderr: Array.isArray(message) ? message : [message],
  };
}

/**
 * Create an allowed result (exitCode 0)
 */
export function allowed(): HookCommandResult {
  return { exitCode: 0, stdout: [], stderr: [] };
}

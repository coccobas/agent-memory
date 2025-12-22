/**
 * verify-response command
 *
 * Runs verification against critical guidelines and exits non-zero on violations.
 *
 * Exit codes:
 * - 0: no violations
 * - 1: violations detected (blocked)
 * - 2: error
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyAction, type ProposedAction } from '../services/verification.service.js';

interface CLIOptions {
  content?: string;
  filePath?: string;
  sessionId?: string;
  projectId?: string;
  actionType: 'file_write' | 'code_generate' | 'api_call' | 'command' | 'other';
  description?: string;
  outputFormat: 'human' | 'json';
  quiet: boolean;
}

function printHelp(): void {
  // Intentionally minimal; this is also used by Claude hooks.
  writeStdout(`
verify-response

Checks content against critical guidelines stored in Agent Memory.

Usage:
  agent-memory verify-response [options]
  echo "content" | agent-memory verify-response

Options:
  --content <text>         Content to verify
  --file <path>           File containing content to verify
  --session-id <id>        Session ID for scope resolution
  --project-id <id>        Project ID for scope resolution
  --type <type>            Action type (file_write, code_generate, api_call, command, other)
  --description <text>     Description of the action
  --json                   Output results as JSON
  --quiet, -q              Suppress output (exit code only)
  --help, -h               Show this help
`);
}

function writeStdout(message: string): void {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {
    actionType: 'other',
    outputFormat: 'human',
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--json') {
      options.outputFormat = 'json';
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--content') {
      options.content = argv[++i] ?? '';
    } else if (arg.startsWith('--content=')) {
      options.content = arg.slice('--content='.length);
    } else if (arg === '--file') {
      options.filePath = resolve(argv[++i] ?? '');
    } else if (arg.startsWith('--file=')) {
      options.filePath = resolve(arg.slice('--file='.length));
    } else if (arg === '--session-id' || arg === '--session') {
      options.sessionId = argv[++i] ?? '';
    } else if (arg.startsWith('--session-id=') || arg.startsWith('--session=')) {
      options.sessionId = arg.split('=')[1];
    } else if (arg === '--project-id' || arg === '--project') {
      options.projectId = argv[++i] ?? '';
    } else if (arg.startsWith('--project-id=') || arg.startsWith('--project=')) {
      options.projectId = arg.split('=')[1];
    } else if (arg === '--type') {
      const type = argv[++i] ?? '';
      if (['file_write', 'code_generate', 'api_call', 'command', 'other'].includes(type)) {
        options.actionType = type as CLIOptions['actionType'];
      }
    } else if (arg.startsWith('--type=')) {
      const type = arg.slice('--type='.length);
      if (['file_write', 'code_generate', 'api_call', 'command', 'other'].includes(type)) {
        options.actionType = type as CLIOptions['actionType'];
      }
    } else if (arg === '--description') {
      options.description = argv[++i] ?? '';
    } else if (arg.startsWith('--description=')) {
      options.description = arg.slice('--description='.length);
    } else if (arg.startsWith('-')) {
      writeStderr(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }

  return options;
}

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;

  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk: string | null;
      // Standard Node.js stream reading pattern - assignment in condition is intentional
      // eslint-disable-next-line no-cond-assign -- Idiomatic stream reading pattern
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });
    process.stdin.on('end', () => resolvePromise(data.trim() || undefined));
    setTimeout(() => resolvePromise(data.trim() || undefined), 100);
  });
}

export async function runVerifyResponseCommand(argv: string[]): Promise<void> {
  // Load config (dotenv, paths) before anything else
  await import('../config/index.js');

  const options = parseArgs(argv);

  let content = options.content;

  if (!content && options.filePath) {
    if (!existsSync(options.filePath)) {
      writeStderr(`File not found: ${options.filePath}`);
      process.exit(2);
    }
    content = readFileSync(options.filePath, 'utf-8');
  }

  if (!content) {
    content = await readStdin();
  }

  if (!content) {
    writeStderr('No content provided. Use --content, --file, or pipe through stdin.');
    printHelp();
    process.exit(2);
  }

  const proposedAction: ProposedAction = {
    type: options.actionType,
    content,
    description: options.description || `CLI verification: ${options.actionType}`,
    filePath: options.filePath,
  };

  try {
    const result = verifyAction(
      options.sessionId || null,
      options.projectId || null,
      proposedAction
    );

    if (options.outputFormat === 'json') {
      if (!options.quiet) {
        writeStdout(JSON.stringify(result, null, 2));
      }
    } else if (!options.quiet) {
      const status = result.blocked ? 'BLOCKED' : 'OK';
      writeStdout(status);
      if (result.blocked) {
        for (const v of result.violations ?? []) {
          writeStdout(`- ${v.message}`);
        }
      }
    }

    process.exit(result.blocked ? 1 : 0);
  } catch (error) {
    writeStderr(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

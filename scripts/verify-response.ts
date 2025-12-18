#!/usr/bin/env tsx
/**
 * Verify Response CLI
 *
 * Manually verify content against critical guidelines.
 * Can be used standalone or as part of IDE hooks.
 *
 * Usage:
 *   npx agent-memory verify-response --content="<content>"
 *   echo "content" | npx agent-memory verify-response
 *   npx agent-memory verify-response --file=output.txt
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyAction, type ProposedAction } from '../src/services/verification.service.js';

// =============================================================================
// TYPES
// =============================================================================

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

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    actionType: 'other',
    outputFormat: 'human',
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--content=')) {
      options.content = arg.slice(10);
    } else if (arg === '--content') {
      options.content = args[++i];
    } else if (arg.startsWith('--file=')) {
      options.filePath = resolve(arg.slice(7));
    } else if (arg === '--file') {
      options.filePath = resolve(args[++i] || '');
    } else if (arg.startsWith('--session=') || arg.startsWith('--session-id=')) {
      options.sessionId = arg.split('=')[1];
    } else if (arg === '--session' || arg === '--session-id') {
      options.sessionId = args[++i];
    } else if (arg.startsWith('--project=') || arg.startsWith('--project-id=')) {
      options.projectId = arg.split('=')[1];
    } else if (arg === '--project' || arg === '--project-id') {
      options.projectId = args[++i];
    } else if (arg.startsWith('--type=')) {
      const type = arg.slice(7);
      if (['file_write', 'code_generate', 'api_call', 'command', 'other'].includes(type)) {
        options.actionType = type as CLIOptions['actionType'];
      }
    } else if (arg === '--type') {
      const type = args[++i];
      if (['file_write', 'code_generate', 'api_call', 'command', 'other'].includes(type)) {
        options.actionType = type as CLIOptions['actionType'];
      }
    } else if (arg.startsWith('--description=')) {
      options.description = arg.slice(14);
    } else if (arg === '--description') {
      options.description = args[++i];
    } else if (arg === '--json') {
      options.outputFormat = 'json';
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === 'verify-response' || arg === 'verify') {
      // Ignore command name
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Verify Response

Checks content against critical guidelines stored in Agent Memory.
Returns exit code 1 if violations are found, 0 otherwise.

Usage:
  npx agent-memory verify-response [options]
  echo "content" | npx agent-memory verify-response

Options:
  --content=<text>      Content to verify
  --file=<path>         File containing content to verify
  --session=<id>        Session ID for scope resolution
  --project=<id>        Project ID for scope resolution
  --type=<type>         Action type (file_write, code_generate, api_call, command, other)
  --description=<text>  Description of the action
  --json                Output results as JSON
  --quiet, -q           Suppress output (exit code only)
  --help, -h            Show this help

Examples:
  # Verify inline content
  npx agent-memory verify-response --content="const apiKey = 'sk-...'"

  # Verify file content
  npx agent-memory verify-response --file=output.txt --type=file_write

  # Verify with session context
  npx agent-memory verify-response --session=sess_123 --content="..."

  # Pipe content through stdin
  echo "some content" | npx agent-memory verify-response

  # Get JSON output
  npx agent-memory verify-response --content="..." --json

Exit Codes:
  0 - No violations found
  1 - Violations detected (blocked)
  2 - Error occurred
`);
}

async function readStdin(): Promise<string | undefined> {
  // Check if stdin is a TTY (interactive terminal)
  if (process.stdin.isTTY) {
    return undefined;
  }

  return new Promise((resolve) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data.trim() || undefined);
    });

    // Timeout after 100ms if no data
    setTimeout(() => {
      resolve(data.trim() || undefined);
    }, 100);
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const options = parseArgs();

  // Get content from various sources
  let content = options.content;

  if (!content && options.filePath) {
    if (!existsSync(options.filePath)) {
      console.error(`File not found: ${options.filePath}`);
      process.exit(2);
    }
    content = readFileSync(options.filePath, 'utf-8');
  }

  if (!content) {
    content = await readStdin();
  }

  if (!content) {
    console.error('No content provided. Use --content, --file, or pipe through stdin.');
    printHelp();
    process.exit(2);
  }

  // Build proposed action
  const action: ProposedAction = {
    type: options.actionType,
    content,
    description: options.description || `CLI verification: ${options.actionType}`,
    filePath: options.filePath,
  };

  // Verify action
  try {
    const result = verifyAction(options.sessionId ?? null, options.projectId ?? null, action);

    if (options.outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (!options.quiet) {
      console.log('');
      console.log('Agent Memory - Verification Result');
      console.log('===================================');
      console.log('');

      if (result.blocked) {
        console.log('Status: BLOCKED');
        console.log('');
        console.log('Violations:');
        for (const violation of result.violations) {
          console.log(`  - [${violation.severity.toUpperCase()}] ${violation.guidelineName}`);
          console.log(`    ${violation.message}`);
          if (violation.suggestedAction) {
            console.log(`    Suggestion: ${violation.suggestedAction}`);
          }
        }
      } else {
        console.log('Status: ALLOWED');
        console.log('');
        console.log('No violations detected.');
      }

      if (result.warnings.length > 0) {
        console.log('');
        console.log('Warnings:');
        for (const warning of result.warnings) {
          console.log(`  - ${warning}`);
        }
      }

      console.log('');
    }

    // Exit with appropriate code
    process.exit(result.blocked ? 1 : 0);
  } catch (error) {
    if (options.outputFormat === 'json') {
      console.log(
        JSON.stringify({
          error: true,
          message: error instanceof Error ? error.message : String(error),
        })
      );
    } else {
      console.error('Verification failed:', error instanceof Error ? error.message : error);
    }
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(2);
});

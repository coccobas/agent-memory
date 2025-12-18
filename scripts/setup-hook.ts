#!/usr/bin/env tsx
/**
 * Setup IDE Verification Hooks
 *
 * Generates and installs verification hooks for Claude Code, Cursor, and VSCode.
 *
 * Usage:
 *   npx agent-memory setup-hook --ide=claude --project=/path/to/project
 *   npx agent-memory setup-hook --ide=cursor --project=.
 *   npx agent-memory setup-hook --status --ide=claude --project=.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateHooks,
  installHooks,
  getHookStatus,
  uninstallHooks,
  type SupportedIDE,
} from '../src/services/hook-generator.service.js';

// =============================================================================
// TYPES
// =============================================================================

interface CLIOptions {
  action: 'install' | 'status' | 'uninstall';
  ide: SupportedIDE;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
  dryRun: boolean;
  quiet: boolean;
}

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    action: 'install',
    ide: 'claude',
    projectPath: process.cwd(),
    dryRun: false,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--ide=')) {
      const ide = arg.slice(6).toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        console.error(`Invalid IDE: ${ide}. Supported: claude, cursor, vscode`);
        process.exit(1);
      }
    } else if (arg === '--ide') {
      const ide = args[++i]?.toLowerCase();
      if (ide === 'claude' || ide === 'cursor' || ide === 'vscode') {
        options.ide = ide;
      } else {
        console.error(`Invalid IDE: ${ide}. Supported: claude, cursor, vscode`);
        process.exit(1);
      }
    } else if (arg.startsWith('--project=')) {
      options.projectPath = resolve(arg.slice(10));
    } else if (arg === '--project') {
      options.projectPath = resolve(args[++i] || process.cwd());
    } else if (arg.startsWith('--project-id=')) {
      options.projectId = arg.slice(13);
    } else if (arg === '--project-id') {
      options.projectId = args[++i];
    } else if (arg.startsWith('--session-id=')) {
      options.sessionId = arg.slice(13);
    } else if (arg === '--session-id') {
      options.sessionId = args[++i];
    } else if (arg === '--status') {
      options.action = 'status';
    } else if (arg === '--uninstall') {
      options.action = 'uninstall';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === 'setup-hook') {
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
Setup IDE Verification Hooks

Generates and installs verification hooks that check agent responses against
critical guidelines stored in Agent Memory.

Usage:
  npx agent-memory setup-hook [options]

Options:
  --ide=<ide>           IDE to generate hooks for (claude, cursor, vscode)
  --project=<path>      Project path (default: current directory)
  --project-id=<id>     Agent Memory project ID for context
  --session-id=<id>     Agent Memory session ID for context
  --status              Check hook installation status
  --uninstall           Remove installed hooks
  --dry-run             Show what would be installed without writing files
  --quiet, -q           Suppress output
  --help, -h            Show this help

Examples:
  # Install Claude Code hooks in current project
  npx agent-memory setup-hook --ide=claude

  # Install Cursor rules with project context
  npx agent-memory setup-hook --ide=cursor --project-id=proj_abc123

  # Check hook status
  npx agent-memory setup-hook --status --ide=claude

  # Uninstall hooks
  npx agent-memory setup-hook --uninstall --ide=claude

IDE-Specific Behavior:
  claude    - Installs PostToolUse hook script + settings configuration
  cursor    - Generates critical-guidelines.md rules file
  vscode    - Generates critical-guidelines.md for reference (no hooks)
`);
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const options = parseArgs();

  // Validate project path
  if (!existsSync(options.projectPath)) {
    console.error(`Project path does not exist: ${options.projectPath}`);
    process.exit(1);
  }

  if (!options.quiet) {
    console.log('');
    console.log('Agent Memory - IDE Hook Setup');
    console.log('==============================');
    console.log('');
    console.log(`IDE: ${options.ide}`);
    console.log(`Project: ${options.projectPath}`);
    if (options.projectId) console.log(`Project ID: ${options.projectId}`);
    if (options.sessionId) console.log(`Session ID: ${options.sessionId}`);
    console.log('');
  }

  switch (options.action) {
    case 'status': {
      const status = getHookStatus(options.projectPath, options.ide);

      if (!options.quiet) {
        console.log(`Status: ${status.installed ? 'Installed' : 'Not installed'}`);
        console.log('');
        console.log('Files:');
        for (const file of status.files) {
          console.log(`  ${file.exists ? '✓' : '✗'} ${file.path}`);
        }
      }

      process.exit(status.installed ? 0 : 1);
      break;
    }

    case 'uninstall': {
      if (options.dryRun) {
        const status = getHookStatus(options.projectPath, options.ide);
        if (!options.quiet) {
          console.log('(Dry run - no files will be removed)');
          console.log('');
          console.log('Would remove:');
          for (const file of status.files) {
            if (file.exists) {
              console.log(`  - ${file.path}`);
            }
          }
        }
        break;
      }

      const result = uninstallHooks(options.projectPath, options.ide);

      if (!options.quiet) {
        if (result.success) {
          console.log(`Removed ${result.removed.length} file(s):`);
          for (const file of result.removed) {
            console.log(`  - ${file}`);
          }
        } else {
          console.log('Uninstall completed with errors:');
          for (const error of result.errors) {
            console.log(`  - ${error}`);
          }
        }
      }

      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'install':
    default: {
      // Generate hooks
      const genResult = generateHooks({
        ide: options.ide,
        projectPath: options.projectPath,
        projectId: options.projectId,
        sessionId: options.sessionId,
      });

      if (!genResult.success) {
        console.error(`Failed to generate hooks: ${genResult.message}`);
        process.exit(1);
      }

      if (!options.quiet) {
        console.log(genResult.message);
        console.log('');
      }

      if (options.dryRun) {
        if (!options.quiet) {
          console.log('(Dry run - no files will be written)');
          console.log('');
          console.log('Would install:');
          for (const hook of genResult.hooks) {
            console.log(`  - ${hook.filePath}`);
          }
        }
        break;
      }

      // Install hooks
      const installResult = installHooks(genResult.hooks);

      if (!options.quiet) {
        if (installResult.success) {
          console.log(`Installed ${installResult.installed.length} file(s):`);
          for (const file of installResult.installed) {
            console.log(`  ✓ ${file}`);
          }
          console.log('');

          // Print instructions for the first hook
          if (genResult.hooks.length > 0) {
            console.log('---');
            console.log(genResult.hooks[0].instructions);
          }
        } else {
          console.log('Installation completed with errors:');
          for (const error of installResult.errors) {
            console.log(`  ✗ ${error}`);
          }
          for (const file of installResult.installed) {
            console.log(`  ✓ ${file}`);
          }
        }
      }

      process.exit(installResult.success ? 0 : 1);
    }
  }
}

main();

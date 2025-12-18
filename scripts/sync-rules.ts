#!/usr/bin/env node
/**
 * CLI Script for Syncing Rules from Files to IDE Formats
 *
 * Usage:
 *   npm run sync-rules [options]
 *   node dist/scripts/sync-rules.js [options]
 */

import { writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectIDE } from '../src/utils/ide-detector.js';
import {
  IDE_DESTINATIONS,
  USER_DESTINATIONS,
  getUserHomeDir,
  loadIgnorePatterns,
  syncForIDE,
  type SyncStats,
  type FileOperation,
  type SyncOptions,
} from '../src/services/file-sync.service.js';

interface CLIOptions {
  ide?: string;
  output?: string;
  autoDetect?: boolean;
  quiet?: boolean;
  verify?: boolean;
  backup?: boolean;
  files?: string;
  logFile?: string;
  project?: boolean;
}

// Supported IDEs
const SUPPORTED_IDES = Object.keys(IDE_DESTINATIONS);

/**
 * Find the Memory project root by walking up from the script's location
 * until we find package.json with name "agent-memory"
 */
function findMemoryProjectRoot(): string {
  // Get the directory where this script is located
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  
  // Start from the script directory and walk up
  let currentDir = resolve(scriptDir);
  const root = resolve('/');
  
  while (currentDir !== root) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          readFileSync(packageJsonPath, 'utf-8')
        );
        if (packageJson.name === 'agent-memory') {
          return currentDir;
        }
      } catch {
        // Continue searching if package.json is invalid
      }
    }
    
    // Move up one directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parentDir;
  }
  
  // Fallback: if we can't find it, assume the script is in the project root
  // (walk up from scripts/ to project root)
  return resolve(scriptDir, '..');
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--ide':
        options.ide = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--auto-detect':
        options.autoDetect = true;
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      case '--backup':
        options.backup = true;
        break;
      case '--files':
        options.files = args[++i];
        break;
      case '--log-file':
        options.logFile = args[++i];
        break;
      case '--project':
      case '-p':
        options.project = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          console.error('Use --help for usage information');
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: sync-rules [options]

Sync rule files from Memory project's rules/ to IDE-specific directories.

By default, syncs to user-level directories (e.g., ~/.claude/, ~/.cursor/rules/).
Use --project to sync to the current project directory instead.

Note: When using npm run, use -- to separate npm options from script options:
  npm run sync-rules -- [options]

Options:
  --ide <ide>              IDE to sync to (cursor, claude, vscode, intellij, sublime, neovim, emacs, antigravity, generic, all)
  --project, -p            Sync to current project instead of user-level (global)
  --output <dir>           Output directory (overrides default destination)
  --auto-detect            Auto-detect IDE from workspace
  --quiet, -q              Suppress output except errors
  --verify                 Verification mode (show differences, don't modify)
  --backup                 Backup existing files before overwrite
  --files <files>          Selective sync (comma-separated file list)
  --log-file <path>        Write operations to log file
  --help, -h               Show this help message

Examples:
  # From any project directory, auto-detect IDE and sync rules
  # Option 1: Using the wrapper script (easiest - add scripts/ to PATH)
  cd /path/to/your/project
  sync-rules --auto-detect

  # Option 2: Using the wrapper script directly
  cd /path/to/your/project
  /path/to/Memory/scripts/sync-rules.sh --auto-detect

  # Option 3: Using tsx directly
  cd /path/to/your/project
  /path/to/Memory/node_modules/.bin/tsx /path/to/Memory/scripts/sync-rules.ts --auto-detect

  # Option 4: From Memory project directory
  cd /path/to/Memory
  npm run sync-rules -- --auto-detect

  # Sync to all IDEs in current project
  npm run sync-rules -- --ide all

  # Verify without making changes
  npm run sync-rules -- --ide cursor --verify

  # Sync with backup
  npm run sync-rules -- --ide cursor --backup

  # Sync specific files only
  npm run sync-rules -- --ide cursor --files "architecture.mdc,patterns.mdc"
  
  # Sync to a specific output directory
  npm run sync-rules -- --ide cursor --output /path/to/target/project
`);
}


/**
 * Write operations to log file
 */
async function writeLogFile(logPath: string, operations: FileOperation[]): Promise<void> {
  const lines = [
    `# Rules Sync Log - ${new Date().toISOString()}`,
    '',
    ...operations.map((op) => {
      const parts = [`[${op.type.toUpperCase()}]`];
      if (op.source) parts.push(`Source: ${op.source}`);
      if (op.dest) parts.push(`Dest: ${op.dest}`);
      parts.push(op.message);
      return parts.join(' | ');
    }),
  ];

  await writeFile(logPath, lines.join('\n') + '\n', 'utf-8');
}

async function main() {
  const options = parseArgs();

  try {
    // Find the Memory project root (where rules/ is located)
    const memoryProjectRoot = findMemoryProjectRoot();
    const sourceDir = join(memoryProjectRoot, 'rules');
    
    // Use current working directory as output (where user runs the command)
    const workspacePath = process.cwd();
    const outputDir = options.output ? resolve(options.output) : workspacePath;

    // Validate source directory exists
    if (!existsSync(sourceDir)) {
      console.error(`Error: Source directory not found: ${sourceDir}`);
      console.error(`Memory project root: ${memoryProjectRoot}`);
      console.error(`Current working directory: ${workspacePath}`);
      process.exit(1);
    }

    let ide = options.ide;

    // Auto-detect IDE if requested
    if (options.autoDetect || !ide) {
      const detection = detectIDE(workspacePath);
      if (detection.ide) {
        ide = detection.ide;
        if (!options.quiet) {
          console.log(`Detected IDE: ${ide} (confidence: ${(detection.confidence * 100).toFixed(0)}%)`);
        }
      } else {
        if (!options.quiet) {
          console.warn('Could not auto-detect IDE. Using generic format.');
        }
        ide = 'generic';
      }
    }

    // Validate IDE
    if (ide && ide !== 'all' && !SUPPORTED_IDES.includes(ide)) {
      console.error(
        `Error: Invalid IDE "${ide}". Must be one of: ${SUPPORTED_IDES.join(', ')}, or "all"`
      );
      process.exit(1);
    }

    // Load ignore patterns from Memory project root
    const ignorePatterns = loadIgnorePatterns(memoryProjectRoot);

    // Parse selected files if specified
    const selectedFiles = options.files
      ? new Set(options.files.split(',').map((f) => f.trim()))
      : undefined;

    // Determine which IDEs to sync
    const idesToSync = ide === 'all' ? SUPPORTED_IDES : [ide || 'generic'];

    if (!options.quiet) {
      console.log('Syncing rules from files...');
      console.log(`Source (Memory project): ${sourceDir}`);
      if (options.project) {
        console.log(`Target (project): ${outputDir}`);
      } else {
        console.log(`Target (user-level): ${getUserHomeDir()}`);
      }
      console.log(`IDEs: ${idesToSync.join(', ')}`);
      if (options.verify) {
        console.log('Mode: VERIFICATION (no changes will be made)');
      }
      if (options.backup) {
        console.log('Mode: BACKUP (existing files will be backed up)');
      }
      if (selectedFiles) {
        console.log(`Selective sync: ${selectedFiles.size} file(s)`);
      }
      console.log('');
    }

    const allOperations: FileOperation[] = [];
    let totalStats: SyncStats = {
      added: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
    };

    // Sync for each IDE (user-level by default, project-level with --project flag)
    const userLevel = !options.project;
    for (const targetIDE of idesToSync) {
      if (!options.quiet && idesToSync.length > 1) {
        console.log(`\n${targetIDE.toUpperCase()}:`);
      }

      const syncOptions: SyncOptions = {
        verify: options.verify,
        backup: options.backup,
        userLevel,
      };

      const { stats, operations } = await syncForIDE(
        targetIDE,
        sourceDir,
        outputDir,
        syncOptions,
        ignorePatterns,
        selectedFiles
      );

      allOperations.push(...operations);

      // Accumulate stats
      totalStats.added += stats.added;
      totalStats.updated += stats.updated;
      totalStats.deleted += stats.deleted;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;

      if (!options.quiet) {
        if (stats.added > 0) console.log(`  Added: ${stats.added}`);
        if (stats.updated > 0) console.log(`  Updated: ${stats.updated}`);
        if (stats.deleted > 0) console.log(`  Deleted: ${stats.deleted}`);
        if (stats.skipped > 0) console.log(`  Skipped: ${stats.skipped}`);
        if (stats.errors > 0) console.log(`  Errors: ${stats.errors}`);
      }
    }

    // Write log file if requested
    if (options.logFile) {
      await writeLogFile(resolve(options.logFile), allOperations);
      if (!options.quiet) {
        console.log(`\nLog written to: ${options.logFile}`);
      }
    }

    // Print summary
    if (!options.quiet) {
      console.log('\n---');
      console.log('Summary:');
      console.log(`  Added: ${totalStats.added}`);
      console.log(`  Updated: ${totalStats.updated}`);
      console.log(`  Deleted: ${totalStats.deleted}`);
      console.log(`  Skipped: ${totalStats.skipped}`);
      if (totalStats.errors > 0) {
        console.log(`  Errors: ${totalStats.errors}`);
      }
    }

    // Determine exit code
    if (totalStats.errors > 0) {
      process.exit(1);
    } else if (options.verify && (totalStats.added > 0 || totalStats.updated > 0 || totalStats.deleted > 0)) {
      // Verification mode found differences
      process.exit(2);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Error syncing rules:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


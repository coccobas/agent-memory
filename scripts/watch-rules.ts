#!/usr/bin/env node
/**
 * Watch Rules Script
 *
 * Watches rules/rules/ directory for file changes and auto-syncs to IDE formats
 *
 * Usage:
 *   npm run sync-rules:watch
 *   tsx scripts/watch-rules.ts [options]
 */

import { watch, readdir, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface WatchOptions {
  ide?: string;
  output?: string;
  interval?: number; // Debounce time in milliseconds (default: 500)
  quiet?: boolean;
}

function parseArgs(): WatchOptions {
  const args = process.argv.slice(2);
  const options: WatchOptions = {
    interval: 500,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--ide':
        options.ide = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--interval':
        options.interval = parseInt(args[++i], 10);
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

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

function printHelp() {
  console.log(`
Usage: watch-rules [options]

Watch rules/rules/ directory for file changes and auto-sync to IDE formats.

Options:
  --ide <ide>              IDE to export to (default: auto-detect)
  --output <dir>           Output directory (default: current working directory)
  --interval <ms>          Debounce time in milliseconds (default: 500)
  --quiet, -q              Suppress output except errors
  --help, -h               Show this help message

Examples:
  # Watch and auto-sync to detected IDE
  npm run sync-rules:watch

  # Watch with custom debounce interval
  npm run sync-rules:watch --interval 1000
`);
}

/**
 * Run sync-rules script
 */
function runSync(memoryProjectRoot: string, options: WatchOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(memoryProjectRoot, 'scripts', 'sync-rules.ts');
    const builtScriptPath = join(memoryProjectRoot, 'dist', 'scripts', 'sync-rules.js');

    // Determine which script to run
    const scriptToRun = existsSync(builtScriptPath) ? builtScriptPath : scriptPath;
    const useNode = existsSync(builtScriptPath);
    const command = useNode ? 'node' : 'tsx';
    const args = [scriptToRun];

    // Build sync-rules arguments
    if (options.ide) {
      args.push('--ide', options.ide);
    } else {
      args.push('--auto-detect');
    }

    if (options.output) {
      args.push('--output', options.output);
    }

    if (options.quiet) {
      args.push('--quiet');
    }

    // Use Memory project root as cwd for proper module resolution
    const child = spawn(command, args, {
      cwd: memoryProjectRoot,
      stdio: options.quiet ? 'pipe' : 'inherit',
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`sync-rules exited with code ${code}`));
      }
    });
  });
}

/**
 * Recursively watch a directory for changes
 */
function watchDirectory(
  dir: string,
  onChange: () => void,
  debounceMs: number
): { close: () => void } {
  let debounceTimer: NodeJS.Timeout | null = null;
  const watchers: ReturnType<typeof watch>[] = [];

  const triggerChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onChange();
    }, debounceMs);
  };

  const setupWatcher = (path: string) => {
    try {
      if (!existsSync(path)) {
        return;
      }

      const watcher = watch(
        path,
        { recursive: true },
        (eventType, filename) => {
          // Only react to file changes, not directory changes
          if (filename && !filename.includes('node_modules')) {
            triggerChange();
          }
        }
      );

      watchers.push(watcher);

      // Also watch subdirectories
      readdir(path, { withFileTypes: true }, (err, entries) => {
        if (err) return;

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = join(path, entry.name);
            setupWatcher(subPath);
          }
        }
      });
    } catch (error) {
      // Ignore errors (directory might not exist, permissions, etc.)
    }
  };

  setupWatcher(dir);

  return {
    close: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}

async function main() {
  const options = parseArgs();

  // Find the Memory project root (where rules/rules/ is located)
  const memoryProjectRoot = findMemoryProjectRoot();
  const sourceDir = join(memoryProjectRoot, 'rules', 'rules');
  
  // Use current working directory as output (where user runs the command)
  const workspacePath = process.cwd();

  // Validate source directory exists
  if (!existsSync(sourceDir)) {
    console.error(`Error: Source directory not found: ${sourceDir}`);
    console.error(`Memory project root: ${memoryProjectRoot}`);
    console.error(`Current working directory: ${workspacePath}`);
    process.exit(1);
  }

  if (!options.quiet) {
    console.log('Watching rules/rules/ for file changes...');
    console.log(`Source (Memory project): ${sourceDir}`);
    console.log(`Target (current project): ${workspacePath}`);
    console.log(`IDE: ${options.ide || 'auto-detect'}`);
    if (options.output) {
      console.log(`Output: ${options.output}`);
    }
    console.log(`Debounce interval: ${options.interval}ms`);
    console.log('Press Ctrl+C to stop\n');
  }

  // Initial sync
  try {
    if (!options.quiet) {
      console.log('Performing initial sync...');
    }
    await runSync(memoryProjectRoot, options);
    if (!options.quiet) {
      console.log('Initial sync complete. Watching for changes...\n');
    }
  } catch (error) {
    console.error('Error during initial sync:', error);
    process.exit(1);
  }

  // Watch for changes
  const watcher = watchDirectory(
    sourceDir,
    async () => {
      if (!options.quiet) {
        console.log(`[${new Date().toISOString()}] File change detected, syncing...`);
      }

      try {
        await runSync(memoryProjectRoot, options);
        if (!options.quiet) {
          console.log(`[${new Date().toISOString()}] Sync complete\n`);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error syncing rules:`, error);
      }
    },
    options.interval || 500
  );

  // Handle cleanup
  const cleanup = () => {
    if (!options.quiet) {
      console.log('\nStopping watcher...');
    }
    watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});








/**
 * Working Directory Detection Utility
 *
 * Provides a reliable way to get the client's working directory when running
 * as an MCP server. The MCP server's process.cwd() returns where the server
 * was started, not the client's (Claude Code's) working directory.
 *
 * Priority order:
 * 1. MCP Roots API (highest priority - set by MCP client)
 * 2. CLAUDE_CWD environment variable (set by Claude Code in MCP server config)
 * 3. AGENT_MEMORY_CWD environment variable (alternative/manual override)
 * 4. Fallback to process.cwd() (for non-MCP usage or testing)
 */

import { createComponentLogger } from './logger.js';
import {
  getRootWorkingDirectory,
  hasRootsCapability,
  waitForRootsReady,
} from '../mcp/roots.service.js';

const logger = createComponentLogger('working-directory');

export type WorkingDirectorySource = 'roots' | 'CLAUDE_CWD' | 'AGENT_MEMORY_CWD' | 'process.cwd';

export interface WorkingDirectoryInfo {
  path: string;
  source: WorkingDirectorySource;
}

let cachedWorkingDirectory: string | null = null;
let cachedSource: WorkingDirectorySource | null = null;
let warnedAboutFallback = false;

/**
 * Get the effective working directory with source information.
 *
 * This returns the client's working directory and its source, not the MCP server's.
 * Uses MCP roots API first, then environment variables set by the MCP client.
 *
 * @returns Object with path and source
 */
export function getWorkingDirectoryInfo(): WorkingDirectoryInfo {
  // Return cached value if available
  if (cachedWorkingDirectory !== null && cachedSource !== null) {
    return { path: cachedWorkingDirectory, source: cachedSource };
  }

  // Priority 1: MCP Roots API (highest priority)
  if (hasRootsCapability()) {
    const rootPath = getRootWorkingDirectory();
    if (rootPath) {
      cachedWorkingDirectory = rootPath;
      cachedSource = 'roots';
      logger.debug({ cwd: rootPath, source: 'roots' }, 'Using MCP roots working directory');
      return { path: rootPath, source: 'roots' };
    }
  }

  // Priority 2: CLAUDE_CWD (set by Claude Code in MCP server env config)
  const claudeCwd = process.env['CLAUDE_CWD'];
  if (claudeCwd) {
    cachedWorkingDirectory = claudeCwd;
    cachedSource = 'CLAUDE_CWD';
    logger.debug({ cwd: claudeCwd, source: 'CLAUDE_CWD' }, 'Using client working directory');
    return { path: claudeCwd, source: 'CLAUDE_CWD' };
  }

  // Priority 3: AGENT_MEMORY_CWD (manual override or alternative clients)
  const agentMemoryCwd = process.env['AGENT_MEMORY_CWD'];
  if (agentMemoryCwd) {
    cachedWorkingDirectory = agentMemoryCwd;
    cachedSource = 'AGENT_MEMORY_CWD';
    logger.debug(
      { cwd: agentMemoryCwd, source: 'AGENT_MEMORY_CWD' },
      'Using client working directory'
    );
    return { path: agentMemoryCwd, source: 'AGENT_MEMORY_CWD' };
  }

  // Priority 4: Fallback to process.cwd()
  const fallback = process.cwd();

  // Warn once about falling back (in case someone forgot to configure)
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    logger.warn(
      { cwd: fallback },
      'No MCP roots, CLAUDE_CWD, or AGENT_MEMORY_CWD env var set. ' +
        'Falling back to process.cwd() which may be incorrect when running as MCP server. ' +
        'Configure your MCP client to set CLAUDE_CWD or use MCP roots capability.'
    );
  }

  cachedWorkingDirectory = fallback;
  cachedSource = 'process.cwd';
  return { path: fallback, source: 'process.cwd' };
}

/**
 * Get the effective working directory for project detection.
 *
 * This returns the client's working directory, not the MCP server's.
 * Uses environment variables set by the MCP client (Claude Code).
 *
 * @returns The working directory path
 */
export function getWorkingDirectory(): string {
  return getWorkingDirectoryInfo().path;
}

/**
 * Get the effective working directory, waiting for roots initialization if needed.
 * Use this in handlers to ensure roots are available before falling back.
 */
export async function getWorkingDirectoryAsync(): Promise<WorkingDirectoryInfo> {
  await waitForRootsReady();
  clearWorkingDirectoryCache();
  return getWorkingDirectoryInfo();
}

/**
 * Get the source of the current working directory.
 * Useful for diagnostics and debugging.
 *
 * @returns The source that provided the working directory
 */
export function getWorkingDirectorySource(): WorkingDirectorySource | null {
  return cachedSource;
}

/**
 * Clear the cached working directory.
 * Useful for testing or when the working directory changes.
 */
export function clearWorkingDirectoryCache(): void {
  cachedWorkingDirectory = null;
  cachedSource = null;
  warnedAboutFallback = false;
}

/**
 * Check if a proper client working directory is configured.
 * Returns true if MCP roots, CLAUDE_CWD, or AGENT_MEMORY_CWD is available.
 */
export function hasClientWorkingDirectory(): boolean {
  return hasRootsCapability() || !!(process.env['CLAUDE_CWD'] || process.env['AGENT_MEMORY_CWD']);
}

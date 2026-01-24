/**
 * MCP Roots Service
 *
 * Manages MCP roots for working directory detection.
 * Provides a way to receive and cache the client's working directory
 * via the MCP roots capability, allowing the server to understand
 * the context in which it's being used.
 *
 * Roots are file:// URIs that represent the client's working directories.
 * The service handles:
 * - Checking if the client supports roots capability
 * - Fetching roots from the client
 * - Handling roots change notifications
 * - Converting file:// URIs to filesystem paths
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('roots-service');

/**
 * Root object from MCP spec
 */
export interface Root {
  uri: string;
  name?: string;
}

/**
 * Options for initializing the roots service
 */
export interface RootsServiceOptions {
  onRootsChanged?: (roots: Root[]) => void;
}

let currentRoots: Root[] = [];
let serverInstance: Server | null = null;
let rootsCapabilitySupported = false;
let onRootsChangedCallback: ((roots: Root[]) => void) | null = null;

/**
 * Initialize the roots service with an MCP server instance
 * Called once during server startup
 *
 * @param server - MCP server instance
 * @param options - Service options
 */
export async function initializeRootsService(
  server: Server,
  options?: RootsServiceOptions
): Promise<void> {
  serverInstance = server;
  onRootsChangedCallback = options?.onRootsChanged ?? null;

  logger.debug('Roots service initialized');

  if (checkRootsCapability()) {
    logger.debug('Client supports roots capability');

    try {
      await fetchRoots();
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch initial roots'
      );
    }
  } else {
    logger.debug('Client does not support roots capability');
  }
}

/**
 * Check if the client supports the roots capability
 *
 * @returns true if client supports roots, false otherwise
 */
export function checkRootsCapability(): boolean {
  if (!serverInstance) {
    logger.debug('No server instance available');
    return false;
  }

  try {
    const capabilities = serverInstance.getClientCapabilities();
    rootsCapabilitySupported = capabilities?.roots !== undefined;
    return rootsCapabilitySupported;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to check roots capability'
    );
    return false;
  }
}

/**
 * Fetch roots from the client
 * Requests the list of roots from the MCP client
 *
 * @returns Promise that resolves when roots are fetched
 */
export async function fetchRoots(): Promise<void> {
  if (!serverInstance) {
    logger.debug('No server instance available for fetching roots');
    return;
  }

  try {
    const response = await serverInstance.listRoots();
    currentRoots = response.roots ?? [];

    logger.debug(
      { rootCount: currentRoots.length, roots: currentRoots },
      'Roots fetched from client'
    );

    if (onRootsChangedCallback) {
      onRootsChangedCallback(currentRoots);
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to fetch roots from client'
    );
  }
}

/**
 * Handle roots changed notification from client
 * Called when the client sends a roots/list_changed notification
 *
 * @returns Promise that resolves when notification is handled
 */
export async function handleRootsChanged(): Promise<void> {
  logger.debug('Roots changed notification received');

  try {
    await fetchRoots();
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to handle roots changed notification'
    );
  }
}

/**
 * Get the currently cached roots
 *
 * @returns Array of Root objects
 */
export function getCurrentRoots(): Root[] {
  return [...currentRoots];
}

/**
 * Get the working directory from the first root's file:// URI
 * Parses the first root's URI and converts it to a filesystem path
 *
 * @returns Filesystem path or null if no roots available
 */
export function getRootWorkingDirectory(): string | null {
  if (currentRoots.length === 0) {
    logger.debug('No roots available');
    return null;
  }

  const firstRoot = currentRoots[0]!;
  const path = fileUriToPath(firstRoot.uri);

  logger.debug({ uri: firstRoot.uri, path }, 'Extracted working directory from root');

  return path;
}

/**
 * Check if roots capability is available
 * Returns true only if:
 * 1. The client supports the roots capability
 * 2. Roots have been successfully fetched
 *
 * @returns true if roots are available and usable
 */
export function hasRootsCapability(): boolean {
  return rootsCapabilitySupported && currentRoots.length > 0;
}

/**
 * Clear all roots state
 * Used for testing and shutdown
 */
export function clearRootsState(): void {
  currentRoots = [];
  serverInstance = null;
  rootsCapabilitySupported = false;
  onRootsChangedCallback = null;

  logger.debug('Roots state cleared');
}

/**
 * Convert a file:// URI to a filesystem path
 * Handles:
 * - Unix paths: file:///home/user → /home/user
 * - Windows paths: file:///C:/Users → C:/Users
 * - URI-encoded characters: %20 → space
 *
 * @param uri - file:// URI
 * @returns Filesystem path
 */
export function fileUriToPath(uri: string): string {
  let path = uri.replace(/^file:\/\//, '');

  if (path.match(/^\/[a-zA-Z]:/)) {
    path = path.substring(1);
  }

  try {
    path = decodeURIComponent(path);
  } catch (error) {
    logger.warn(
      { uri, error: error instanceof Error ? error.message : String(error) },
      'Failed to decode URI component'
    );
  }

  return path;
}

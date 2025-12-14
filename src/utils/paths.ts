/**
 * Cross-platform path utilities
 * Handles Windows long paths, case insensitivity, and path normalization
 */

import { normalize, resolve, sep, relative } from 'node:path';
import { realpathSync } from 'node:fs';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Normalize path for cross-platform use
 * - Converts separators to platform default
 * - Resolves relative paths
 * - Handles case insensitivity on Windows
 */
export function normalizePath(inputPath: string): string {
  let normalized = normalize(resolve(inputPath));

  // Windows: convert to lowercase for consistent comparison
  if (IS_WINDOWS) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Convert to Windows long path format if needed
 * Paths > 260 chars need \\?\ prefix on Windows
 */
export function toLongPath(inputPath: string): string {
  if (!IS_WINDOWS) return inputPath;

  const resolved = resolve(inputPath);
  if (resolved.length > 260 && !resolved.startsWith('\\\\?\\')) {
    return '\\\\?\\' + resolved;
  }
  return resolved;
}

/**
 * Get canonical path (resolved symlinks)
 */
export function getCanonicalPath(inputPath: string): string {
  try {
    return realpathSync(inputPath);
  } catch {
    return resolve(inputPath);
  }
}

/**
 * Compare paths for equality across platforms
 * Handles case-insensitivity on Windows
 */
export function pathsEqual(path1: string, path2: string): boolean {
  const norm1 = normalizePath(path1);
  const norm2 = normalizePath(path2);
  return norm1 === norm2;
}

/**
 * Get relative path that works cross-platform
 * Always uses forward slashes for consistency
 */
export function getRelativePath(from: string, to: string): string {
  const rel = relative(from, to);
  // Use forward slashes for consistency (works on all platforms)
  return rel.split(sep).join('/');
}

/**
 * Validate path is safe (no directory traversal, etc.)
 */
export function isPathSafe(inputPath: string, allowedRoot?: string): boolean {
  // Check for null bytes (security issue)
  if (inputPath.includes('\0')) return false;

  try {
    const resolved = resolve(inputPath);

    // If root specified, ensure path is within it
    if (allowedRoot) {
      const normalizedRoot = normalizePath(allowedRoot);
      const normalizedPath = normalizePath(resolved);
      return normalizedPath.startsWith(normalizedRoot);
    }

    return true;
  } catch {
    return false;
  }
}

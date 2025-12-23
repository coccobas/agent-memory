/**
 * Hook management handlers for memory_hook tool
 *
 * Provides handlers for generating, installing, and managing
 * IDE verification hooks (Claude Code, Cursor, VSCode).
 */

import type { AppContext } from '../../core/context.js';
import {
  generateHooks,
  installHooks,
  getHookStatus,
  uninstallHooks,
  type SupportedIDE,
} from '../../services/hook-generator.service.js';
import { createComponentLogger } from '../../utils/logger.js';
import { getRequiredParam, getOptionalParam, isString } from '../../utils/type-guards.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';

const logger = createComponentLogger('hooks');

/**
 * Type guard for supported IDE
 */
function isSupportedIDE(value: unknown): value is SupportedIDE {
  return isString(value) && ['claude', 'cursor', 'vscode'].includes(value);
}

export const hooksHandlers = {
  /**
   * Generate hooks for an IDE without installing them.
   *
   * Returns the hook content and instructions for manual installation.
   */
  generate(context: AppContext, params: Record<string, unknown>) {
    const ide = getRequiredParam(params, 'ide', isSupportedIDE);
    const projectPath = getRequiredParam(params, 'projectPath', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const sessionId = getOptionalParam(params, 'sessionId', isString);

    logger.info({ ide, projectPath }, 'Generating hooks');

    const result = generateHooks({
      ide,
      projectPath,
      projectId,
      sessionId,
      db: context.db,
    });

    return formatTimestamps({
      success: result.success,
      action: 'generate',
      ide,
      projectPath,
      hooks: result.hooks.map((h) => ({
        filePath: h.filePath,
        contentLength: h.content.length,
        instructions: h.instructions,
      })),
      // Include full content for programmatic access
      hookContents: result.hooks.map((h) => ({
        filePath: h.filePath,
        content: h.content,
      })),
      message: result.message,
    });
  },

  /**
   * Install hooks to the filesystem.
   *
   * Generates and writes hook files to the appropriate locations.
   */
  install(context: AppContext, params: Record<string, unknown>) {
    const ide = getRequiredParam(params, 'ide', isSupportedIDE);
    const projectPath = getRequiredParam(params, 'projectPath', isString);
    const projectId = getOptionalParam(params, 'projectId', isString);
    const sessionId = getOptionalParam(params, 'sessionId', isString);

    logger.info({ ide, projectPath }, 'Installing hooks');

    // First generate the hooks
    const generated = generateHooks({
      ide,
      projectPath,
      projectId,
      sessionId,
      db: context.db,
    });

    if (!generated.success) {
      return formatTimestamps({
        success: false,
        action: 'install',
        ide,
        projectPath,
        message: generated.message,
      });
    }

    // Then install them
    const installed = installHooks(generated.hooks);

    return formatTimestamps({
      success: installed.success,
      action: 'install',
      ide,
      projectPath,
      installed: installed.installed,
      errors: installed.errors,
      instructions: generated.hooks.map((h) => h.instructions).join('\n\n'),
      message: installed.success
        ? `Successfully installed ${installed.installed.length} hook(s) for ${ide}`
        : `Installed ${installed.installed.length} hook(s) with ${installed.errors.length} error(s)`,
    });
  },

  /**
   * Get installation status of hooks for a project.
   */
  status(params: Record<string, unknown>) {
    const ide = getRequiredParam(params, 'ide', isSupportedIDE);
    const projectPath = getRequiredParam(params, 'projectPath', isString);

    logger.info({ ide, projectPath }, 'Checking hook status');

    const status = getHookStatus(projectPath, ide);

    return formatTimestamps({
      success: true,
      action: 'status',
      ide,
      projectPath,
      installed: status.installed,
      files: status.files,
      message: status.installed
        ? `Hooks are installed for ${ide}`
        : `No hooks installed for ${ide}`,
    });
  },

  /**
   * Uninstall hooks from a project.
   */
  uninstall(params: Record<string, unknown>) {
    const ide = getRequiredParam(params, 'ide', isSupportedIDE);
    const projectPath = getRequiredParam(params, 'projectPath', isString);

    logger.info({ ide, projectPath }, 'Uninstalling hooks');

    const result = uninstallHooks(projectPath, ide);

    return formatTimestamps({
      success: result.success,
      action: 'uninstall',
      ide,
      projectPath,
      removed: result.removed,
      errors: result.errors,
      message: result.success
        ? `Successfully removed ${result.removed.length} hook file(s) for ${ide}`
        : `Removed ${result.removed.length} file(s) with ${result.errors.length} error(s)`,
    });
  },
};

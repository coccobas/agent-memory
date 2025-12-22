/**
 * File lock handlers
 */

import { isAbsolute } from 'node:path';
import { fileLockRepo } from '../../db/repositories/file_locks.js';
import { createValidationError } from '../../core/errors.js';
import {
  getRequiredParam,
  getOptionalParam,
  isString,
  isNumber,
  isObject,
} from '../../utils/type-guards.js';
import type {
  FileCheckoutParams,
  FileCheckinParams,
  FileLockStatusParams,
  FileLockListParams,
  FileLockForceUnlockParams,
} from '../types.js';

/**
 * Validate that a file path is absolute and safe
 * @param filePath - The file path to validate
 * @throws Error if path is not absolute or contains suspicious patterns
 */
function validateFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw createValidationError(
      'file_path',
      'must be a non-empty string',
      'Provide an absolute path to the file'
    );
  }

  if (!isAbsolute(filePath)) {
    throw createValidationError(
      'file_path',
      'must be an absolute path',
      `Use an absolute path like '/Users/project/file.ts' instead of '${filePath}'`
    );
  }

  // Check for suspicious patterns that might indicate path traversal attempts
  const suspicious = ['..', '\0', '\r', '\n'];
  for (const pattern of suspicious) {
    if (filePath.includes(pattern)) {
      throw createValidationError(
        'file_path',
        `contains invalid pattern: ${pattern}`,
        'File path should not contain path traversal or special characters'
      );
    }
  }
}

export const fileLockHandlers = {
  checkout(params: FileCheckoutParams) {
    const file_path = getRequiredParam(params, 'file_path', isString);
    const agent_id = getRequiredParam(params, 'agent_id', isString);
    const session_id = getOptionalParam(params, 'session_id', isString);
    const project_id = getOptionalParam(params, 'project_id', isString);
    const expires_in = getOptionalParam(params, 'expires_in', isNumber);
    const metadata = getOptionalParam(params, 'metadata', isObject);

    validateFilePath(file_path);

    const lock = fileLockRepo.checkout(file_path, agent_id, {
      sessionId: session_id,
      projectId: project_id,
      expiresIn: expires_in,
      metadata,
    });

    return { success: true, lock };
  },

  checkin(params: FileCheckinParams) {
    const file_path = getRequiredParam(params, 'file_path', isString);
    const agent_id = getRequiredParam(params, 'agent_id', isString);

    validateFilePath(file_path);

    fileLockRepo.checkin(file_path, agent_id);

    return { success: true, message: `File ${file_path} checked in successfully` };
  },

  status(params: FileLockStatusParams) {
    const file_path = getRequiredParam(params, 'file_path', isString);

    validateFilePath(file_path);

    const lock = fileLockRepo.getLock(file_path);
    const isLocked = lock !== null;

    return {
      success: true,
      isLocked,
      lock: lock || null,
    };
  },

  list(params: FileLockListParams) {
    const project_id = getOptionalParam(params, 'project_id', isString);
    const session_id = getOptionalParam(params, 'session_id', isString);
    const agent_id = getOptionalParam(params, 'agent_id', isString);

    const locks = fileLockRepo.listLocks({
      projectId: project_id,
      sessionId: session_id,
      agentId: agent_id,
    });

    return {
      success: true,
      locks,
      count: locks.length,
    };
  },

  forceUnlock(params: FileLockForceUnlockParams) {
    const file_path = getRequiredParam(params, 'file_path', isString);
    const agent_id = getRequiredParam(params, 'agent_id', isString);
    const reason = getOptionalParam(params, 'reason', isString);

    validateFilePath(file_path);

    fileLockRepo.forceUnlock(file_path, agent_id, reason);

    return {
      success: true,
      message: `File ${file_path} force unlocked by ${agent_id}`,
    };
  },
};

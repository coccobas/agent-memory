/**
 * File lock handlers
 */

import { isAbsolute } from 'node:path';
import { fileLockRepo } from '../../db/repositories/file_locks.js';
import type {
  FileCheckoutParams,
  FileCheckinParams,
  FileLockStatusParams,
  FileLockListParams,
  FileLockForceUnlockParams,
} from '../types.js';
import { createValidationError } from '../errors.js';

// Helper to safely cast params
function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

/**
 * Validate that a file path is absolute and safe
 * @param filePath - The file path to validate
 * @throws Error if path is not absolute or contains suspicious patterns
 */
function validateFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw createValidationError('file_path', 'must be a non-empty string', 'Provide an absolute path to the file');
  }

  if (!isAbsolute(filePath)) {
    throw createValidationError('file_path', 'must be an absolute path', `Use an absolute path like '/Users/project/file.ts' instead of '${filePath}'`);
  }

  // Check for suspicious patterns that might indicate path traversal attempts
  const suspicious = ['..', '\0', '\r', '\n'];
  for (const pattern of suspicious) {
    if (filePath.includes(pattern)) {
      throw createValidationError('file_path', `contains invalid pattern: ${pattern}`, 'File path should not contain path traversal or special characters');
    }
  }
}

export const fileLockHandlers = {
  checkout(params: Record<string, unknown>) {
    const {
      file_path,
      agent_id,
      session_id,
      project_id,
      expires_in,
      metadata,
    } = cast<FileCheckoutParams>(params);

    if (!file_path) {
      throw new Error('file_path is required');
    }
    validateFilePath(file_path);
    
    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    const lock = fileLockRepo.checkout(file_path, agent_id, {
      sessionId: session_id,
      projectId: project_id,
      expiresIn: expires_in,
      metadata,
    });

    return { success: true, lock };
  },

  checkin(params: Record<string, unknown>) {
    const { file_path, agent_id } = cast<FileCheckinParams>(params);

    if (!file_path) {
      throw new Error('file_path is required');
    }
    validateFilePath(file_path);
    
    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    fileLockRepo.checkin(file_path, agent_id);

    return { success: true, message: `File ${file_path} checked in successfully` };
  },

  status(params: Record<string, unknown>) {
    const { file_path } = cast<FileLockStatusParams>(params);

    if (!file_path) {
      throw new Error('file_path is required');
    }
    validateFilePath(file_path);

    const lock = fileLockRepo.getLock(file_path);
    const isLocked = lock !== null;

    return {
      success: true,
      isLocked,
      lock: lock || null,
    };
  },

  list(params: Record<string, unknown>) {
    const { project_id, session_id, agent_id } = cast<FileLockListParams>(params);

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

  forceUnlock(params: Record<string, unknown>) {
    const { file_path, agent_id, reason } = cast<FileLockForceUnlockParams>(params);

    if (!file_path) {
      throw new Error('file_path is required');
    }
    validateFilePath(file_path);
    
    if (!agent_id) {
      throw new Error('agent_id is required');
    }

    fileLockRepo.forceUnlock(file_path, agent_id, reason);

    return {
      success: true,
      message: `File ${file_path} force unlocked by ${agent_id}`,
    };
  },
};



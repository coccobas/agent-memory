/**
 * PID File Management for Single-Instance Mode
 *
 * Ensures only one instance of agent-memory MCP server runs at a time.
 * Uses a PID file to track the running process.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('pid-file');

export interface PidFileOptions {
  /** Path to the PID file. Defaults to DATA_DIR/agent-memory.pid */
  pidFilePath?: string;
  /** If true, kill existing process instead of exiting. Default: false */
  takeOver?: boolean;
  /** If true, skip PID file check entirely. Default: false */
  disabled?: boolean;
}

export interface PidFileResult {
  /** Whether this instance should proceed */
  shouldProceed: boolean;
  /** PID of the existing process (if any) */
  existingPid?: number;
  /** Message describing what happened */
  message: string;
  /** Path to the PID file */
  pidFilePath: string;
}

/**
 * Check if a process is running by PID
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH = No such process, EPERM = Permission denied (process exists but can't signal)
    return false;
  }
}

/**
 * Get default PID file path
 */
function getDefaultPidFilePath(): string {
  const dataDir =
    process.env.AGENT_MEMORY_DATA_DIR || path.join(process.env.HOME || '', '.agent-memory');
  return path.join(dataDir, 'agent-memory.pid');
}

/**
 * Acquire the PID file lock for single-instance mode.
 *
 * Call this at server startup to ensure only one instance runs.
 * Returns whether this instance should proceed.
 */
export function acquirePidFile(options: PidFileOptions = {}): PidFileResult {
  const pidFilePath = options.pidFilePath || getDefaultPidFilePath();

  // If disabled, always proceed
  if (options.disabled) {
    logger.debug('Single-instance mode disabled');
    return {
      shouldProceed: true,
      message: 'Single-instance mode disabled',
      pidFilePath,
    };
  }

  // Ensure directory exists
  const pidDir = path.dirname(pidFilePath);
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }

  // Check for existing PID file
  if (fs.existsSync(pidFilePath)) {
    try {
      const existingPidStr = fs.readFileSync(pidFilePath, 'utf-8').trim();
      const existingPid = parseInt(existingPidStr, 10);

      if (!isNaN(existingPid) && isProcessRunning(existingPid)) {
        // Process is still running
        if (options.takeOver) {
          // Kill existing process
          logger.warn({ existingPid }, 'Taking over from existing agent-memory process');
          try {
            process.kill(existingPid, 'SIGTERM');
            const deadline = Date.now() + 3000;
            while (isProcessRunning(existingPid) && Date.now() < deadline) {
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
            }
            if (isProcessRunning(existingPid)) {
              process.kill(existingPid, 'SIGKILL');
            }
          } catch (killError) {
            logger.error(
              {
                existingPid,
                error: killError instanceof Error ? killError.message : String(killError),
              },
              'Failed to kill existing process'
            );
          }
        } else {
          // Don't take over, just report
          logger.warn(
            { existingPid, pidFilePath },
            'Another agent-memory instance is already running'
          );
          return {
            shouldProceed: false,
            existingPid,
            message:
              `Another agent-memory instance is already running (PID: ${existingPid}). ` +
              `Kill it with: kill ${existingPid} or set AGENT_MEMORY_SINGLE_INSTANCE=false`,
            pidFilePath,
          };
        }
      } else {
        // Stale PID file - process no longer exists
        logger.debug(
          { existingPid: existingPidStr },
          'Removing stale PID file (process no longer exists)'
        );
      }
    } catch (readError) {
      logger.warn(
        { error: readError instanceof Error ? readError.message : String(readError) },
        'Failed to read existing PID file, will overwrite'
      );
    }
  }

  // Write our PID to the file
  const ourPid = process.pid;
  try {
    fs.writeFileSync(pidFilePath, String(ourPid), { mode: 0o644 });
    logger.info({ pid: ourPid, pidFilePath }, 'PID file created');
  } catch (writeError) {
    logger.error(
      { error: writeError instanceof Error ? writeError.message : String(writeError) },
      'Failed to write PID file'
    );
    // Continue anyway - PID file is advisory
  }

  return {
    shouldProceed: true,
    message: `PID file acquired (PID: ${ourPid})`,
    pidFilePath,
  };
}

/**
 * Release the PID file lock.
 *
 * Call this on server shutdown to clean up.
 */
export function releasePidFile(pidFilePath?: string): void {
  const filePath = pidFilePath || getDefaultPidFilePath();

  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    // Only remove if it contains our PID
    const storedPidStr = fs.readFileSync(filePath, 'utf-8').trim();
    const storedPid = parseInt(storedPidStr, 10);

    if (storedPid === process.pid) {
      fs.unlinkSync(filePath);
      logger.debug({ pidFilePath: filePath }, 'PID file removed');
    } else {
      logger.debug(
        { storedPid, ourPid: process.pid },
        'PID file belongs to another process, not removing'
      );
    }
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to release PID file'
    );
  }
}

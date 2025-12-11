/**
 * Audit service for logging all actions
 *
 * Provides fire-and-forget async logging to avoid blocking operations.
 * Logs are written asynchronously to prevent performance impact.
 */

import { getDb } from '../db/connection.js';
import { auditLog } from '../db/schema.js';
import { generateId } from '../db/repositories/base.js';
import type { ScopeType, EntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('audit');

export type AuditAction = 'query' | 'create' | 'update' | 'delete' | 'read';

export interface AuditLogParams {
  agentId?: string;
  action: AuditAction;
  entryType?: EntryType;
  entryId?: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  queryParams?: unknown;
  resultCount?: number;
}

/**
 * Log an action to the audit log
 *
 * This function uses setImmediate to write asynchronously, preventing
 * blocking of the main operation. Errors are silently caught to prevent
 * audit logging failures from breaking the application.
 */
export function logAction(params: AuditLogParams): void {
  // Use setImmediate for fire-and-forget async logging
  setImmediate(() => {
    try {
      const db = getDb();
      const id = generateId();

      // Filter out 'project' from entryType as it's not supported in audit log schema
      const entryType = params.entryType === 'project' ? null : (params.entryType ?? null);

      db.insert(auditLog)
        .values({
          id,
          agentId: params.agentId ?? null,
          action: params.action,
          entryType: entryType,
          entryId: params.entryId ?? null,
          scopeType: params.scopeType ?? null,
          scopeId: params.scopeId ?? null,
          queryParams: params.queryParams
            ? (JSON.stringify(params.queryParams) as unknown as Record<string, unknown>)
            : null,
          resultCount: params.resultCount ?? null,
        })
        .run();
    } catch (error) {
      // Silently ignore audit logging errors to prevent breaking the application
      // eslint-disable-next-line no-console
      if (process.env.AGENT_MEMORY_PERF === '1') {
        logger.error({ error }, 'Failed to log action');
      }
    }
  });
}

/**
 * Create a wrapper function that logs actions automatically
 */
export function withAuditLogging<T extends unknown[]>(
  fn: (...args: T) => unknown,
  getAuditParams: (...args: T) => AuditLogParams
): (...args: T) => unknown {
  return (...args: T) => {
    const result = fn(...args);
    const auditParams = getAuditParams(...args);
    logAction(auditParams);
    return result;
  };
}






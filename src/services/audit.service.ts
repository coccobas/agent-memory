/**
 * Audit service for logging all actions
 *
 * Provides fire-and-forget async logging to avoid blocking operations.
 * Logs are written asynchronously to prevent performance impact.
 */

import type { DbClient } from '../db/connection.js';
import { auditLog } from '../db/schema.js';
import { generateId } from '../db/repositories/base.js';
import type { ScopeType, AuditEntryType } from '../db/schema.js';
import { createComponentLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { sanitizeForLogging } from '../utils/sanitize.js';

const logger = createComponentLogger('audit');

export type AuditAction =
  | 'query'
  | 'create'
  | 'update'
  | 'delete'
  | 'read'
  | 'verify_pre'
  | 'verify_post'
  | 'acknowledge';

export interface AuditLogParams {
  agentId?: string;
  action: AuditAction;
  entryType?: AuditEntryType;
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
 *
 * @param params - Audit log parameters
 * @param dbClient - Optional database client (defaults to getDb() for backward compatibility)
 */
export function logAction(params: AuditLogParams, db: DbClient): void {
  // Use setImmediate for fire-and-forget async logging
  setImmediate(() => {
    try {
      const id = generateId();

      // Filter to only entry types supported by audit log schema
      const supportedTypes = new Set(['tool', 'guideline', 'knowledge', 'experience']);
      const entryType = params.entryType && supportedTypes.has(params.entryType)
        ? (params.entryType as 'tool' | 'guideline' | 'knowledge' | 'experience')
        : null;

      // Sanitize and size-limit queryParams to avoid persisting secrets or unbounded payloads
      let queryParams: unknown = null;
      if (params.queryParams) {
        const sanitized = sanitizeForLogging(params.queryParams);
        const serialized = JSON.stringify(sanitized);
        if (serialized.length <= config.validation.metadataMaxBytes) {
          queryParams = sanitized;
        } else {
          queryParams = {
            truncated: true,
            originalBytes: serialized.length,
          };
        }
      }

      db.insert(auditLog)
        .values({
          id,
          agentId: params.agentId ?? null,
          action: params.action,
          entryType: entryType,
          entryId: params.entryId ?? null,
          scopeType: params.scopeType ?? null,
          scopeId: params.scopeId ?? null,
          queryParams: queryParams as Record<string, unknown> | null,
          resultCount: params.resultCount ?? null,
        })
        .run();
    } catch (error) {
      // Bug #189 fix: Always log audit failures - audit gaps are compliance issues
      // We don't throw to avoid breaking the application, but we must have visibility
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          action: params.action,
          entryType: params.entryType,
          entryId: params.entryId,
        },
        'Audit log write failed - potential compliance gap'
      );
    }
  });
}




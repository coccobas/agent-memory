/**
 * Shared types for file sync service
 */

export interface SyncOptions {
  verify?: boolean;
  backup?: boolean;
  userLevel?: boolean;
  userDir?: string;
}

export interface SyncStats {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: number;
}

export interface FileOperation {
  type: 'add' | 'update' | 'delete' | 'skip' | 'error';
  source?: string;
  dest?: string;
  message: string;
}

export interface SyncResult {
  stats: SyncStats;
  operations: FileOperation[];
}

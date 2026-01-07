/**
 * memory_evidence tool descriptor
 *
 * Manages immutable evidence artifacts - screenshots, logs, snippets,
 * benchmarks, and other proof that supports memory entries.
 *
 * CRITICAL: Evidence is IMMUTABLE - once created, it cannot be modified.
 * Only deactivation (soft-delete) is allowed.
 */

import type { ToolDescriptor } from './types.js';
import { evidenceHandlers } from '../handlers/evidence.handler.js';

export const memoryEvidenceDescriptor: ToolDescriptor = {
  name: 'memory_evidence',
  visibility: 'standard',
  description: 'Manage immutable evidence artifacts. Actions: add, get, list, deactivate, list_by_type, list_by_source. IMMUTABLE: no update action.',
  commonParams: {
    id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    scopeType: { type: 'string', enum: ['global', 'org', 'project', 'session'] },
    scopeId: { type: 'string' },
    evidenceType: { type: 'string', enum: ['screenshot', 'log', 'snippet', 'output', 'benchmark', 'link', 'document', 'quote', 'other'] },
    content: { type: 'string' },
    filePath: { type: 'string' },
    url: { type: 'string' },
    fileName: { type: 'string' },
    mimeType: { type: 'string' },
    fileSize: { type: 'number' },
    checksum: { type: 'string' },
    language: { type: 'string' },
    sourceFile: { type: 'string' },
    startLine: { type: 'number' },
    endLine: { type: 'number' },
    metric: { type: 'string' },
    value: { type: 'number' },
    unit: { type: 'string' },
    baseline: { type: 'number' },
    source: { type: 'string' },
    capturedAt: { type: 'string' },
    capturedBy: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    metadata: { type: 'object' },
    agentId: { type: 'string', description: 'Required for writes' },
    createdBy: { type: 'string' },
    includeInactive: { type: 'boolean' },
    inherit: { type: 'boolean' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
  actions: {
    // Create evidence (immutable once created)
    add: { contextHandler: evidenceHandlers.add },

    // Read operations
    get: { contextHandler: evidenceHandlers.get },
    list: { contextHandler: evidenceHandlers.list },

    // Soft-delete (the only mutation allowed)
    deactivate: { contextHandler: evidenceHandlers.deactivate },

    // Filtered listing
    list_by_type: { contextHandler: evidenceHandlers.list_by_type },
    list_by_source: { contextHandler: evidenceHandlers.list_by_source },
  },
};

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
  description: `Manage immutable evidence artifacts that support memory entries.

Actions: add, get, list, deactivate, list_by_type, list_by_source

Evidence Types:
- screenshot: Visual captures (screenshots, diagrams)
- log: System/application logs
- snippet: Code snippets with source location
- output: Command/program output
- benchmark: Performance measurements with metrics
- link: External URLs and references
- document: Documents, PDFs, etc.
- quote: Quoted text from sources
- other: Miscellaneous evidence

Content Sources (one required):
- content: Inline text content
- filePath: Local file path
- url: External URL

CRITICAL: Evidence is IMMUTABLE - no update action available!

Example - Add screenshot evidence:
{"action":"add","scopeType":"project","scopeId":"proj-123","title":"Error screenshot","evidenceType":"screenshot","filePath":"/tmp/error.png","source":"manual capture","capturedAt":"2024-01-15T10:30:00Z"}

Example - Add benchmark evidence:
{"action":"add","scopeType":"project","scopeId":"proj-123","title":"API latency baseline","evidenceType":"benchmark","metric":"response_time","value":145.5,"unit":"ms","baseline":150,"source":"load test"}

Example - Add code snippet:
{"action":"add","scopeType":"project","scopeId":"proj-123","title":"Auth bug fix","evidenceType":"snippet","content":"const token = await refreshToken();","language":"typescript","sourceFile":"src/auth.ts","startLine":42,"endLine":45}

Example - List by type:
{"action":"list_by_type","evidenceType":"benchmark","scopeType":"project","scopeId":"proj-123"}`,
  commonParams: {
    // Identity
    id: { type: 'string', description: 'Evidence ID' },
    title: { type: 'string', description: 'Evidence title (required for add)' },
    description: { type: 'string', description: 'Optional detailed description' },

    // Scope
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope level',
    },
    scopeId: { type: 'string', description: 'Scope ID (required for non-global scopes)' },

    // Evidence type
    evidenceType: {
      type: 'string',
      enum: ['screenshot', 'log', 'snippet', 'output', 'benchmark', 'link', 'document', 'quote', 'other'],
      description: 'Type of evidence',
    },

    // Content sources (one of these should be provided)
    content: { type: 'string', description: 'Inline text content' },
    filePath: { type: 'string', description: 'Local file path' },
    url: { type: 'string', description: 'External URL' },

    // File metadata
    fileName: { type: 'string', description: 'Original filename' },
    mimeType: { type: 'string', description: 'MIME type (e.g., image/png, text/plain)' },
    fileSize: { type: 'number', description: 'File size in bytes' },
    checksum: { type: 'string', description: 'SHA256 checksum for integrity' },

    // Code snippet fields
    language: { type: 'string', description: 'Programming language (for snippets)' },
    sourceFile: { type: 'string', description: 'Source file path (for snippets)' },
    startLine: { type: 'number', description: 'Start line number (for snippets)' },
    endLine: { type: 'number', description: 'End line number (for snippets)' },

    // Benchmark fields
    metric: { type: 'string', description: 'Metric name (e.g., response_time, memory_usage)' },
    value: { type: 'number', description: 'Measured value' },
    unit: { type: 'string', description: 'Unit of measurement (e.g., ms, MB, req/s)' },
    baseline: { type: 'number', description: 'Baseline/comparison value' },

    // Provenance
    source: { type: 'string', description: 'Where this evidence came from (URL, tool, person)' },
    capturedAt: { type: 'string', description: 'ISO timestamp when evidence was captured' },
    capturedBy: { type: 'string', description: 'Who/what captured the evidence' },

    // Flexible storage
    tags: {
      type: 'array',
      description: 'Array of tags for categorization',
      items: { type: 'string' },
    },
    metadata: { type: 'object', description: 'Additional metadata as JSON object' },

    // Standard params
    agentId: { type: 'string', description: 'Agent ID (required for writes)' },
    createdBy: { type: 'string', description: 'Creator identifier' },
    includeInactive: { type: 'boolean', description: 'Include deactivated evidence' },
    inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
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

/**
 * Export Handler
 *
 * Handles exporting memory entries to various formats (JSON, Markdown, YAML)
 * and exporting guidelines to IDE-specific rule formats
 */

import {
  exportToJson,
  exportToMarkdown,
  exportToYaml,
  exportToOpenAPI,
  type ExportOptions,
} from '../../services/export.service.js';
import { exportGuidelinesToIDE, type IDEExportOptions } from '../../services/ide-export.service.js';
import { detectIDE } from '../../utils/ide-detector.js';
import { createValidationError } from '../errors.js';

interface ExportParams {
  types?: ('tools' | 'guidelines' | 'knowledge')[];
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  tags?: string[];
  format?: 'json' | 'markdown' | 'yaml' | 'openapi';
  includeVersions?: boolean;
  includeInactive?: boolean;
}

/**
 * Export entries to specified format
 */
function exportEntries(params: Record<string, unknown>) {
  const exportParams = params as unknown as ExportParams;
  const format = exportParams.format || 'json';

  // Validate format
  if (!['json', 'markdown', 'yaml', 'openapi'].includes(format)) {
    throw createValidationError('format', 'must be json, markdown, yaml, or openapi');
  }

  const options: ExportOptions = {
    types: exportParams.types,
    scopeType: exportParams.scopeType,
    scopeId: exportParams.scopeId,
    tags: exportParams.tags,
    format,
    includeVersions: exportParams.includeVersions || false,
    includeInactive: exportParams.includeInactive || false,
  };

  let result;
  switch (format) {
    case 'openapi':
      result = exportToOpenAPI(options);
      break;
    case 'markdown':
      result = exportToMarkdown(options);
      break;
    case 'yaml':
      result = exportToYaml(options);
      break;
    case 'json':
    default:
      result = exportToJson(options);
      break;
  }

  return {
    success: true,
    format: result.format,
    content: result.content,
    metadata: result.metadata,
  };
}

interface ExportRulesParams {
  ide?: string;
  scopeType?: 'global' | 'org' | 'project' | 'session';
  scopeId?: string;
  outputDir?: string;
  autoDetect?: boolean;
  format?: 'mdc' | 'json' | 'yaml' | 'markdown';
  inherit?: boolean;
  tags?: string[];
  includeInactive?: boolean;
}

/**
 * Export guidelines to IDE-specific rule formats
 */
function exportRules(params: Record<string, unknown>) {
  const exportRulesParams = params as unknown as ExportRulesParams;

  let ide = exportRulesParams.ide;

  // Auto-detect IDE if requested or not specified
  if (exportRulesParams.autoDetect || !ide) {
    const detection = detectIDE(process.cwd());
    ide = detection.ide || 'generic';
  }

  // Validate IDE
  const supportedIDEs = [
    'cursor',
    'vscode',
    'intellij',
    'sublime',
    'neovim',
    'emacs',
    'antigravity',
    'generic',
    'all',
  ];
  if (ide && !supportedIDEs.includes(ide.toLowerCase())) {
    throw createValidationError('ide', `must be one of: ${supportedIDEs.join(', ')}`);
  }

  // Validate scope
  if (exportRulesParams.scopeType) {
    if (exportRulesParams.scopeType !== 'global' && !exportRulesParams.scopeId) {
      throw createValidationError(
        'scopeId',
        `is required for ${exportRulesParams.scopeType} scope`
      );
    }
  }

  const options: IDEExportOptions = {
    ide: ide || 'generic',
    outputDir: exportRulesParams.outputDir || process.cwd(),
    scopeType: exportRulesParams.scopeType,
    scopeId: exportRulesParams.scopeId,
    inherit: exportRulesParams.inherit || false,
    tags: exportRulesParams.tags,
    includeInactive: exportRulesParams.includeInactive || false,
    format: exportRulesParams.format,
  };

  const results = exportGuidelinesToIDE(options);

  return {
    success: true,
    results: results.map((result) => ({
      ide: result.ide,
      outputPath: result.outputPath,
      filesCreated: result.filesCreated,
      entryCount: result.entryCount,
      format: result.format,
      metadata: result.metadata,
    })),
  };
}

export const exportHandlers = {
  export: exportEntries,
  export_rules: exportRules,
};

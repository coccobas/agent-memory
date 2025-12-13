/**
 * IDE Export Service
 *
 * Exports guidelines from Agent Memory to IDE-specific rule formats
 * Supports: Cursor, VS Code, IntelliJ, Sublime, Neovim, Emacs, Generic
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ScopeType } from '../db/schema.js';
import type { GuidelineWithVersion } from '../db/repositories/guidelines.js';
import { guidelineRepo } from '../db/repositories/guidelines.js';
import { entryTagRepo } from '../db/repositories/tags.js';

export interface IDEExportOptions {
  scopeType?: ScopeType;
  scopeId?: string;
  inherit?: boolean;
  tags?: string[];
  includeInactive?: boolean;
  outputDir?: string;
  format?: 'mdc' | 'json' | 'yaml' | 'markdown';
  ide?: string; // Specific IDE, or 'all' for all IDEs
}

export interface IDEExportResult {
  ide: string;
  outputPath: string;
  filesCreated: string[];
  entryCount: number;
  format: string;
  metadata: {
    exportedAt: string;
    scopeType?: ScopeType;
    scopeId?: string;
  };
}

export interface GuidelineExportData {
  id: string;
  name: string;
  category: string | null;
  priority: number;
  content: string;
  rationale: string | null;
  examples: { bad?: string[]; good?: string[] } | null;
  tags: string[];
  scopeType: ScopeType;
  scopeId: string | null;
  globs: string[]; // Extracted from tags/content, default ["**/*"]
  alwaysApply: boolean; // Derived from priority (>=80) or category
}

// =============================================================================
// GLOB EXTRACTION
// =============================================================================

/**
 * Extract glob patterns from tags and content
 */
function extractGlobsFromTags(tags: string[], content: string): string[] {
  const globs: string[] = [];

  // Tag-based extraction
  const tagToGlobs: Record<string, string[]> = {
    typescript: ['**/*.ts', '**/*.tsx'],
    javascript: ['**/*.js', '**/*.jsx'],
    python: ['**/*.py'],
    java: ['**/*.java'],
    go: ['**/*.go'],
    rust: ['**/*.rs'],
    cpp: ['**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.h', '**/*.hpp'],
    c: ['**/*.c', '**/*.h'],
    ruby: ['**/*.rb'],
    php: ['**/*.php'],
    swift: ['**/*.swift'],
    kotlin: ['**/*.kt', '**/*.kts'],
    dart: ['**/*.dart'],
    html: ['**/*.html', '**/*.htm'],
    css: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
    json: ['**/*.json'],
    yaml: ['**/*.yaml', '**/*.yml'],
    markdown: ['**/*.md', '**/*.mdc'],
    sql: ['**/*.sql'],
    shell: ['**/*.sh', '**/*.bash'],
  };

  for (const tag of tags.map((t) => t.toLowerCase())) {
    if (tagToGlobs[tag]) {
      globs.push(...tagToGlobs[tag]);
    }
  }

  // Content-based extraction: look for "Applies to: **/*.ts" patterns
  const applyToMatch = content.match(/applies\s+to:\s*([^\n]+)/i);
  if (applyToMatch && applyToMatch[1]) {
    const patterns = applyToMatch[1]
      .split(',')
      .map((p) => p.trim())
      .filter(
        (p) => p.includes('*') || p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.py')
      );
    globs.push(...patterns);
  }

  // Remove duplicates
  const uniqueGlobs = [...new Set(globs)];

  return uniqueGlobs.length > 0 ? uniqueGlobs : ['**/*'];
}

/**
 * Determine if guideline should always apply based on priority and category
 */
function determineAlwaysApply(priority: number, category: string | null): boolean {
  // High priority guidelines (>=80) always apply
  if (priority >= 80) {
    return true;
  }

  // Security guidelines always apply
  if (category === 'security') {
    return true;
  }

  return false;
}

// =============================================================================
// PREPARATION
// =============================================================================

/**
 * Prepare guidelines for export by fetching and transforming data
 */
export function prepareGuidelinesForExport(options: IDEExportOptions): GuidelineExportData[] {
  const filter: Parameters<typeof guidelineRepo.list>[0] = {
    scopeType: options.scopeType,
    scopeId: options.scopeId,
    includeInactive: options.includeInactive || false,
  };

  // Handle scope inheritance manually if needed
  let guidelines: GuidelineWithVersion[] = [];

  if (options.inherit && options.scopeType) {
    // Fetch from all parent scopes
    const scopes: Array<{ scopeType: ScopeType; scopeId?: string }> = [];

    // Add current scope
    scopes.push({ scopeType: options.scopeType, scopeId: options.scopeId });

    // Add parent scopes in priority order
    if (options.scopeType === 'session') {
      // Session inherits from project, org, global
      if (options.scopeId) {
        // For now, we can't resolve parent IDs, so we'll fetch all and filter
        scopes.push({ scopeType: 'project' });
        scopes.push({ scopeType: 'org' });
      }
      scopes.push({ scopeType: 'global' });
    } else if (options.scopeType === 'project') {
      scopes.push({ scopeType: 'org' });
      scopes.push({ scopeType: 'global' });
    } else if (options.scopeType === 'org') {
      scopes.push({ scopeType: 'global' });
    }

    // Fetch from each scope (most specific first)
    const seenIds = new Set<string>();
    for (const scope of scopes) {
      const scopeGuidelines = guidelineRepo.list(
        { ...filter, scopeType: scope.scopeType, scopeId: scope.scopeId },
        { limit: 1000, offset: 0 }
      );
      for (const guideline of scopeGuidelines) {
        if (!seenIds.has(guideline.id)) {
          seenIds.add(guideline.id);
          guidelines.push(guideline);
        }
      }
    }
  } else {
    guidelines = guidelineRepo.list(filter, { limit: 1000, offset: 0 });
  }

  // Filter by tags if specified
  if (options.tags && options.tags.length > 0) {
    guidelines = guidelines.filter((guideline) => {
      const tags = entryTagRepo.getTagsForEntry('guideline', guideline.id);
      const tagNames = tags.map((t) => t.name.toLowerCase());
      return options.tags?.some((tag) => tagNames.includes(tag.toLowerCase())) ?? false;
    });
  }

  // Transform to export data
  return guidelines.map((guideline) => {
    const tags = entryTagRepo.getTagsForEntry('guideline', guideline.id);
    const tagNames = tags.map((t) => t.name);

    return {
      id: guideline.id,
      name: guideline.name,
      category: guideline.category,
      priority: guideline.priority,
      content: guideline.currentVersion?.content || '',
      rationale: guideline.currentVersion?.rationale || null,
      examples: guideline.currentVersion?.examples || null,
      tags: tagNames,
      scopeType: guideline.scopeType,
      scopeId: guideline.scopeId,
      globs: extractGlobsFromTags(tagNames, guideline.currentVersion?.content || ''),
      alwaysApply: determineAlwaysApply(guideline.priority, guideline.category),
    };
  });
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

/**
 * Format examples section for markdown
 */
function formatExamples(examples: { bad?: string[]; good?: string[] }): string {
  let result = '';

  if (examples.good && examples.good.length > 0) {
    result += '### Good\n\n';
    for (const example of examples.good) {
      result += '```\n' + example + '\n```\n\n';
    }
  }

  if (examples.bad && examples.bad.length > 0) {
    result += '### Bad\n\n';
    for (const example of examples.bad) {
      result += '```\n' + example + '\n```\n\n';
    }
  }

  return result.trim();
}

/**
 * Sanitize filename from guideline name
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// =============================================================================
// IDE EXPORTERS
// =============================================================================

/**
 * Export guidelines to Cursor format (.mdc files)
 */
export function exportToCursor(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const rulesDir = join(outputDir, '.cursor', 'rules');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  // Clean up existing Agent Memory files
  if (existsSync(rulesDir)) {
    const existingFiles = readdirSync(rulesDir);
    for (const file of existingFiles) {
      if (file.endsWith('.mdc')) {
        const filePath = join(rulesDir, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          if (content.includes('<!-- agent-memory:')) {
            // Remove old Agent Memory files
            writeFileSync(filePath, '');
          }
        } catch {
          // Ignore read errors
        }
      }
    }
  }

  // Write new files
  for (const guideline of guidelines) {
    const filename = `${sanitizeFilename(guideline.name)}.mdc`;
    const filePath = join(rulesDir, filename);

    const frontmatter = `---
description: ${guideline.name}
globs: ${JSON.stringify(guideline.globs)}
alwaysApply: ${guideline.alwaysApply}
---

<!-- agent-memory:${guideline.id} -->

# ${guideline.name}

${guideline.content}

${guideline.rationale ? `## Rationale\n\n${guideline.rationale}\n\n` : ''}
${guideline.examples ? `## Examples\n\n${formatExamples(guideline.examples)}\n\n` : ''}
`;

    writeFileSync(filePath, frontmatter, 'utf-8');
    filesCreated.push(filePath);
  }

  return {
    ide: 'cursor',
    outputPath: rulesDir,
    filesCreated,
    entryCount: guidelines.length,
    format: 'mdc',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to VS Code format
 */
export function exportToVSCode(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const rulesDir = join(outputDir, '.vscode', 'rules');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  // Write markdown files
  for (const guideline of guidelines) {
    const filename = `${sanitizeFilename(guideline.name)}.md`;
    const filePath = join(rulesDir, filename);

    const content = `<!-- agent-memory:${guideline.id} -->

# ${guideline.name}

${guideline.content}

${guideline.rationale ? `## Rationale\n\n${guideline.rationale}\n\n` : ''}
${guideline.examples ? `## Examples\n\n${formatExamples(guideline.examples)}\n\n` : ''}

**Category:** ${guideline.category || 'uncategorized'}
**Priority:** ${guideline.priority}
**Globs:** ${guideline.globs.join(', ')}
**Tags:** ${guideline.tags.join(', ')}
`;

    writeFileSync(filePath, content, 'utf-8');
    filesCreated.push(filePath);
  }

  return {
    ide: 'vscode',
    outputPath: rulesDir,
    filesCreated,
    entryCount: guidelines.length,
    format: 'markdown',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to IntelliJ/IDEA format
 */
export function exportToIntelliJ(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const ideaDir = join(outputDir, '.idea');
  const codeStylesDir = join(ideaDir, 'codeStyles');
  const filePath = join(codeStylesDir, 'agent-memory-rules.xml');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(codeStylesDir)) {
    mkdirSync(codeStylesDir, { recursive: true });
  }

  // Generate XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<code_scheme name="Agent Memory Rules">
  <!-- Exported from Agent Memory at ${new Date().toISOString()} -->
`;

  for (const guideline of guidelines) {
    xml += `  <!-- agent-memory:${guideline.id} -->
  <!-- ${guideline.name} -->
`;
  }

  xml += `</code_scheme>
`;

  writeFileSync(filePath, xml, 'utf-8');
  filesCreated.push(filePath);

  return {
    ide: 'intellij',
    outputPath: filePath,
    filesCreated,
    entryCount: guidelines.length,
    format: 'xml',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to Sublime Text format
 */
export function exportToSublime(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const filePath = join(outputDir, '.sublime-project');
  const filesCreated: string[] = [];

  // Read existing project file or create new structure
  let projectData: Record<string, unknown> = {
    settings: {},
  };

  if (existsSync(filePath)) {
    try {
      const existing = readFileSync(filePath, 'utf-8');
      projectData = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      // Invalid JSON, use default
    }
  }

  // Add rules to settings
  if (!projectData.settings) {
    projectData.settings = {};
  }

  const settings = projectData.settings as Record<string, unknown>;
  settings.agent_memory_rules = guidelines.map((g) => ({
    id: g.id,
    name: g.name,
    content: g.content,
    category: g.category,
    priority: g.priority,
    globs: g.globs,
  }));

  writeFileSync(filePath, JSON.stringify(projectData, null, 2), 'utf-8');
  filesCreated.push(filePath);

  return {
    ide: 'sublime',
    outputPath: filePath,
    filesCreated,
    entryCount: guidelines.length,
    format: 'json',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to Neovim format
 */
export function exportToNeovim(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const nvimDir = join(outputDir, '.nvim');
  const filePath = join(nvimDir, 'agent-memory-rules.lua');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(nvimDir)) {
    mkdirSync(nvimDir, { recursive: true });
  }

  // Generate Lua file
  let lua = `-- Agent Memory Rules
-- Exported at ${new Date().toISOString()}

local rules = {
`;

  for (const guideline of guidelines) {
    lua += `  {
    id = "${guideline.id}",
    name = "${guideline.name}",
    content = [[
${guideline.content}
    ]],
    category = ${guideline.category ? `"${guideline.category}"` : 'nil'},
    priority = ${guideline.priority},
    globs = {${guideline.globs.map((g) => `"${g}"`).join(', ')}},
  },
`;
  }

  lua += `}

return rules
`;

  writeFileSync(filePath, lua, 'utf-8');
  filesCreated.push(filePath);

  return {
    ide: 'neovim',
    outputPath: filePath,
    filesCreated,
    entryCount: guidelines.length,
    format: 'lua',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to Emacs format
 */
export function exportToEmacs(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const emacsDir = join(outputDir, '.emacs.d');
  const filePath = join(emacsDir, 'agent-memory-rules.el');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(emacsDir)) {
    mkdirSync(emacsDir, { recursive: true });
  }

  // Generate Emacs Lisp file
  let elisp = `;; Agent Memory Rules
;; Exported at ${new Date().toISOString()}

(defvar agent-memory-rules
  '(
`;

  for (const guideline of guidelines) {
    const escapedContent = guideline.content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    elisp += `    ((id . "${guideline.id}")
     (name . "${guideline.name}")
     (content . "${escapedContent}")
     (category . ${guideline.category ? `"${guideline.category}"` : 'nil'})
     (priority . ${guideline.priority})
     (globs . (${guideline.globs.map((g) => `"${g}"`).join(' ')}))
     )
`;
  }

  elisp += `  ))

(provide 'agent-memory-rules)
`;

  writeFileSync(filePath, elisp, 'utf-8');
  filesCreated.push(filePath);

  return {
    ide: 'emacs',
    outputPath: filePath,
    filesCreated,
    entryCount: guidelines.length,
    format: 'el',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to Antigravity format (.md files in .agent/rules)
 */
export function exportToAntigravity(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const rulesDir = join(outputDir, '.agent', 'rules');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  // Write markdown files with YAML frontmatter (similar to generic format)
  for (const guideline of guidelines) {
    const filename = `${sanitizeFilename(guideline.name)}.md`;
    const filePath = join(rulesDir, filename);

    const frontmatter = `---
id: ${guideline.id}
name: ${guideline.name}
category: ${guideline.category || 'uncategorized'}
priority: ${guideline.priority}
globs: ${JSON.stringify(guideline.globs)}
alwaysApply: ${guideline.alwaysApply}
tags: ${JSON.stringify(guideline.tags)}
scopeType: ${guideline.scopeType}
scopeId: ${guideline.scopeId || 'null'}
source: agent-memory
---

<!-- agent-memory:${guideline.id} -->

# ${guideline.name}

${guideline.content}

${guideline.rationale ? `## Rationale\n\n${guideline.rationale}\n\n` : ''}
${guideline.examples ? `## Examples\n\n${formatExamples(guideline.examples)}\n\n` : ''}
`;

    writeFileSync(filePath, frontmatter, 'utf-8');
    filesCreated.push(filePath);
  }

  return {
    ide: 'antigravity',
    outputPath: rulesDir,
    filesCreated,
    entryCount: guidelines.length,
    format: 'markdown',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

/**
 * Export guidelines to generic/IDE-agnostic format
 */
export function exportToGeneric(
  guidelines: GuidelineExportData[],
  outputDir: string
): IDEExportResult {
  const rulesDir = join(outputDir, '.ide-rules');
  const filesCreated: string[] = [];

  // Ensure directory exists
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
  }

  // Write markdown files with YAML frontmatter
  for (const guideline of guidelines) {
    const filename = `${sanitizeFilename(guideline.name)}.md`;
    const filePath = join(rulesDir, filename);

    const frontmatter = `---
id: ${guideline.id}
name: ${guideline.name}
category: ${guideline.category || 'uncategorized'}
priority: ${guideline.priority}
globs: ${JSON.stringify(guideline.globs)}
alwaysApply: ${guideline.alwaysApply}
tags: ${JSON.stringify(guideline.tags)}
scopeType: ${guideline.scopeType}
scopeId: ${guideline.scopeId || 'null'}
source: agent-memory
---

<!-- agent-memory:${guideline.id} -->

# ${guideline.name}

${guideline.content}

${guideline.rationale ? `## Rationale\n\n${guideline.rationale}\n\n` : ''}
${guideline.examples ? `## Examples\n\n${formatExamples(guideline.examples)}\n\n` : ''}
`;

    writeFileSync(filePath, frontmatter, 'utf-8');
    filesCreated.push(filePath);
  }

  return {
    ide: 'generic',
    outputPath: rulesDir,
    filesCreated,
    entryCount: guidelines.length,
    format: 'markdown',
    metadata: {
      exportedAt: new Date().toISOString(),
    },
  };
}

// =============================================================================
// UNIFIED EXPORT
// =============================================================================

/**
 * Export guidelines for a specific IDE or all IDEs
 */
export function exportForIDE(
  ide: string,
  guidelines: GuidelineExportData[],
  options: IDEExportOptions
): IDEExportResult[] {
  const outputDir = options.outputDir || process.cwd();
  const results: IDEExportResult[] = [];

  const ideMap: Record<string, (g: GuidelineExportData[], d: string) => IDEExportResult> = {
    cursor: exportToCursor,
    vscode: exportToVSCode,
    intellij: exportToIntelliJ,
    sublime: exportToSublime,
    neovim: exportToNeovim,
    emacs: exportToEmacs,
    antigravity: exportToAntigravity,
    generic: exportToGeneric,
  };

  if (ide === 'all') {
    // Export to all IDEs
    for (const [ideName, exporter] of Object.entries(ideMap)) {
      try {
        const result = exporter(guidelines, outputDir);
        result.metadata.scopeType = options.scopeType;
        result.metadata.scopeId = options.scopeId;
        results.push(result);
      } catch (error) {
        // Continue with other IDEs if one fails
        console.error(`Failed to export to ${ideName}:`, error);
      }
    }
  } else {
    const exporter = ideMap[ide.toLowerCase()];
    if (!exporter) {
      throw new Error(`Unsupported IDE: ${ide}. Supported: ${Object.keys(ideMap).join(', ')}`);
    }

    const result = exporter(guidelines, outputDir);
    result.metadata.scopeType = options.scopeType;
    result.metadata.scopeId = options.scopeId;
    results.push(result);
  }

  return results;
}

/**
 * Main export function - prepares guidelines and exports to IDE format
 */
export function exportGuidelinesToIDE(options: IDEExportOptions): IDEExportResult[] {
  const guidelines = prepareGuidelinesForExport(options);
  const ide = options.ide || 'generic';

  return exportForIDE(ide, guidelines, options);
}


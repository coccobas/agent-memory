/**
 * IDE Import Service
 *
 * Imports rules from IDE-specific formats back to Agent Memory
 * Supports bidirectional sync from IDE formats to guidelines
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ScopeType } from '../db/schema.js';
import { guidelineRepo } from '../db/repositories/guidelines.js';
import { entryTagRepo } from '../db/repositories/tags.js';

export interface IDEImportOptions {
  scopeType: ScopeType;
  scopeId?: string;
  createdBy?: string;
  dryRun?: boolean; // If true, don't actually import, just return what would be imported
}

export interface IDEImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
  entries: Array<{
    id?: string;
    name: string;
    action: 'create' | 'update' | 'skip';
  }>;
}

interface ParsedRule {
  id?: string; // From agent-memory: comment
  name: string;
  content: string;
  rationale?: string;
  examples?: { bad?: string[]; good?: string[] };
  category?: string;
  priority?: number;
  globs?: string[];
  tags?: string[];
}

// =============================================================================
// PARSERS
// =============================================================================

/**
 * Extract Agent Memory ID from comment marker
 */
function extractAgentMemoryId(content: string): string | undefined {
  const match = content.match(/<!--\s*agent-memory:([^\s]+)\s*-->/);
  return match ? match[1] : undefined;
}

/**
 * Parse Cursor .mdc file
 */
function parseMDCFile(filePath: string): ParsedRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatterText = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    if (!frontmatterText || !body) {
      return null;
    }

    // Parse frontmatter (simple key-value parser)
    const frontmatter: Record<string, string | boolean | string[]> = {};
    for (const line of frontmatterText.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: string | boolean | string[] = line.slice(colonIndex + 1).trim();

      // Parse JSON values
      if (value.startsWith('[') || value.startsWith('{')) {
        try {
          const parsed = JSON.parse(value) as string | boolean | string[];
          if (typeof parsed === 'string' || typeof parsed === 'boolean' || Array.isArray(parsed)) {
            value = parsed;
          }
        } catch {
          // Keep as string
        }
      } else if (value === 'true' || value === 'false') {
        value = value === 'true';
      }

      frontmatter[key] = value;
    }

    // Extract ID from comment
    const id = extractAgentMemoryId(body);

    // Extract content (remove comment, extract sections)
    let ruleContent = body.replace(/<!--[\s\S]*?-->\s*/g, '').trim();
    const nameMatch = ruleContent.match(/^#\s+(.+)$/m);
    const name =
      nameMatch && nameMatch[1]
        ? nameMatch[1].trim()
        : (frontmatter.description as string) || 'Untitled Rule';

    // Remove title from content
    ruleContent = ruleContent.replace(/^#\s+.*$/m, '').trim();

    // Extract rationale
    let rationale: string | undefined;
    const rationaleMatch = ruleContent.match(/##\s+Rationale\s*\n\n([\s\S]*?)(?=\n##|$)/);
    if (rationaleMatch && rationaleMatch[1]) {
      rationale = rationaleMatch[1].trim();
      ruleContent = ruleContent.replace(/##\s+Rationale\s*\n\n[\s\S]*?(?=\n##|$)/, '').trim();
    }

    // Extract examples
    let examples: { bad?: string[]; good?: string[] } | undefined;
    const examplesMatch = ruleContent.match(/##\s+Examples\s*\n\n([\s\S]*?)$/);
    if (examplesMatch && examplesMatch[1]) {
      const examplesText = examplesMatch[1];
      const goodMatch = examplesText.match(/###\s+Good\s*\n\n([\s\S]*?)(?=\n###|$)/);
      const badMatch = examplesText.match(/###\s+Bad\s*\n\n([\s\S]*?)$/);

      examples = {};
      if (goodMatch && goodMatch[1]) {
        examples.good = goodMatch[1]
          .split(/```/g)
          .filter((_, i) => i % 2 === 1)
          .map((e) => e.trim())
          .filter((e) => e);
      }
      if (badMatch && badMatch[1]) {
        examples.bad = badMatch[1]
          .split(/```/g)
          .filter((_, i) => i % 2 === 1)
          .map((e) => e.trim())
          .filter((e) => e);
      }

      ruleContent = ruleContent.replace(/##\s+Examples\s*\n\n[\s\S]*$/, '').trim();
    }

    // The remaining content is the main rule content
    const mainContent = ruleContent;

    return {
      id,
      name,
      content: mainContent,
      rationale,
      examples,
      category: typeof frontmatter.category === 'string' ? frontmatter.category : undefined,
      priority: typeof frontmatter.priority === 'number' ? frontmatter.priority : 50,
      globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : undefined,
      tags: frontmatter.globs
        ? (Array.isArray(frontmatter.globs) ? frontmatter.globs : [frontmatter.globs]).map(String)
        : undefined,
    };
  } catch (error) {
    console.error(`Error parsing MDC file ${filePath}:`, error);
    return null;
  }
}

/**
 * Parse generic markdown file with YAML frontmatter
 */
function parseMarkdownFile(filePath: string): ParsedRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatterText = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    if (!frontmatterText || !body) {
      return null;
    }

    // Simple YAML parser (key-value only)
    const frontmatter: Record<string, unknown> = {};
    for (const line of frontmatterText.split('\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Try to parse as JSON
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      } else if (typeof value === 'string' && (value === 'true' || value === 'false')) {
        value = value === 'true';
      } else if (typeof value === 'string' && /^\d+$/.test(value)) {
        value = parseInt(value, 10);
      } else if (typeof value === 'string' && value === 'null') {
        value = null;
      }

      frontmatter[key] = value;
    }

    // Extract name from frontmatter or first heading
    let name = (frontmatter.name as string) || '';
    if (!name) {
      const nameMatch = body.match(/^#\s+(.+)$/m);
      name = nameMatch && nameMatch[1] ? nameMatch[1].trim() : 'Untitled Rule';
    }

    // Extract main content (remove title)
    let ruleContent = body.replace(/^#\s+.*$/m, '').trim();

    // Extract rationale and examples (same logic as MDC)
    let rationale: string | undefined;
    const rationaleMatch = ruleContent.match(/##\s+Rationale\s*\n\n([\s\S]*?)(?=\n##|$)/);
    if (rationaleMatch && rationaleMatch[1]) {
      rationale = rationaleMatch[1].trim();
      ruleContent = ruleContent.replace(/##\s+Rationale\s*\n\n[\s\S]*?(?=\n##|$)/, '').trim();
    }

    let examples: { bad?: string[]; good?: string[] } | undefined;
    const examplesMatch = ruleContent.match(/##\s+Examples\s*\n\n([\s\S]*?)$/);
    if (examplesMatch && examplesMatch[1]) {
      const examplesText = examplesMatch[1];
      const goodMatch = examplesText.match(/###\s+Good\s*\n\n([\s\S]*?)(?=\n###|$)/);
      const badMatch = examplesText.match(/###\s+Bad\s*\n\n([\s\S]*?)$/);

      examples = {};
      if (goodMatch && goodMatch[1]) {
        examples.good = goodMatch[1]
          .split(/```/g)
          .filter((_, i) => i % 2 === 1)
          .map((e) => e.trim())
          .filter((e) => e);
      }
      if (badMatch && badMatch[1]) {
        examples.bad = badMatch[1]
          .split(/```/g)
          .filter((_, i) => i % 2 === 1)
          .map((e) => e.trim())
          .filter((e) => e);
      }

      ruleContent = ruleContent.replace(/##\s+Examples\s*\n\n[\s\S]*$/, '').trim();
    }

    const mainContent = ruleContent;

    return {
      id: frontmatter.id as string | undefined,
      name,
      content: mainContent,
      rationale,
      examples,
      category: frontmatter.category as string | undefined,
      priority: (frontmatter.priority as number) || 50,
      globs: frontmatter.globs as string[] | undefined,
      tags: (frontmatter.tags as string[]) || [],
    };
  } catch (error) {
    console.error(`Error parsing markdown file ${filePath}:`, error);
    return null;
  }
}

// =============================================================================
// IMPORTERS
// =============================================================================

/**
 * Import rules from Cursor .mdc files
 */
export function importFromCursor(rulesDir: string, options: IDEImportOptions): IDEImportResult {
  const result: IDEImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    entries: [],
  };

  const resolvedDir = resolve(rulesDir);
  if (!existsSync(resolvedDir)) {
    result.errors.push({
      file: resolvedDir,
      error: 'Directory does not exist',
    });
    return result;
  }

  try {
    const files = readdirSync(resolvedDir).filter((f) => f.endsWith('.mdc'));

    for (const file of files) {
      const filePath = join(resolvedDir, file);
      const parsed = parseMDCFile(filePath);

      if (!parsed) {
        result.errors.push({
          file,
          error: 'Failed to parse file',
        });
        continue;
      }

      if (options.dryRun) {
        result.entries.push({
          name: parsed.name,
          action: parsed.id ? 'update' : 'create',
        });
        continue;
      }

      try {
        if (parsed.id) {
          // Try to update existing guideline
          const existing = guidelineRepo.getById(parsed.id);
          if (existing) {
            guidelineRepo.update(parsed.id, {
              content: parsed.content,
              rationale: parsed.rationale,
              examples: parsed.examples,
              category: parsed.category,
              priority: parsed.priority,
              changeReason: 'Imported from IDE format',
              updatedBy: options.createdBy,
            });
            result.updated++;
            result.entries.push({
              id: parsed.id,
              name: parsed.name,
              action: 'update',
            });
          } else {
            // ID exists but guideline not found, create new
            guidelineRepo.create({
              scopeType: options.scopeType,
              scopeId: options.scopeId,
              name: parsed.name,
              content: parsed.content,
              rationale: parsed.rationale,
              examples: parsed.examples,
              category: parsed.category,
              priority: parsed.priority,
              createdBy: options.createdBy,
            });
            result.imported++;
            result.entries.push({
              name: parsed.name,
              action: 'create',
            });
          }
        } else {
          // Check if guideline with same name exists
          const existing = guidelineRepo.getByName(
            parsed.name,
            options.scopeType,
            options.scopeId,
            false
          );

          if (existing) {
            // Update existing
            guidelineRepo.update(existing.id, {
              content: parsed.content,
              rationale: parsed.rationale,
              examples: parsed.examples,
              category: parsed.category,
              priority: parsed.priority,
              changeReason: 'Imported from IDE format',
              updatedBy: options.createdBy,
            });
            result.updated++;
            result.entries.push({
              id: existing.id,
              name: parsed.name,
              action: 'update',
            });
          } else {
            // Create new
            const created = guidelineRepo.create({
              scopeType: options.scopeType,
              scopeId: options.scopeId,
              name: parsed.name,
              content: parsed.content,
              rationale: parsed.rationale,
              examples: parsed.examples,
              category: parsed.category,
              priority: parsed.priority,
              createdBy: options.createdBy,
            });
            result.imported++;
            result.entries.push({
              id: created.id,
              name: parsed.name,
              action: 'create',
            });

            // Add tags if specified
            if (parsed.tags && parsed.tags.length > 0) {
              for (const tagName of parsed.tags) {
                entryTagRepo.attach({
                  entryType: 'guideline',
                  entryId: created.id,
                  tagName,
                });
              }
            }
          }
        }
      } catch (error) {
        result.errors.push({
          file,
          error: error instanceof Error ? error.message : String(error),
        });
        result.skipped++;
      }
    }
  } catch (error) {
    result.errors.push({
      file: resolvedDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}

/**
 * Import rules from generic markdown files
 */
export function importFromFiles(files: string[], options: IDEImportOptions): IDEImportResult {
  const result: IDEImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    entries: [],
  };

  for (const file of files) {
    const filePath = resolve(file);
    if (!existsSync(filePath)) {
      result.errors.push({
        file,
        error: 'File does not exist',
      });
      continue;
    }

    const parsed = file.endsWith('.mdc') ? parseMDCFile(filePath) : parseMarkdownFile(filePath);

    if (!parsed) {
      result.errors.push({
        file,
        error: 'Failed to parse file',
      });
      result.skipped++;
      continue;
    }

    if (options.dryRun) {
      result.entries.push({
        name: parsed.name,
        action: parsed.id ? 'update' : 'create',
      });
      continue;
    }

    try {
      if (parsed.id) {
        const existing = guidelineRepo.getById(parsed.id);
        if (existing) {
          guidelineRepo.update(parsed.id, {
            content: parsed.content,
            rationale: parsed.rationale,
            examples: parsed.examples,
            category: parsed.category,
            priority: parsed.priority,
            changeReason: 'Imported from IDE format',
            updatedBy: options.createdBy,
          });
          result.updated++;
          result.entries.push({
            id: parsed.id,
            name: parsed.name,
            action: 'update',
          });
        } else {
          const created = guidelineRepo.create({
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            name: parsed.name,
            content: parsed.content,
            rationale: parsed.rationale,
            examples: parsed.examples,
            category: parsed.category,
            priority: parsed.priority,
            createdBy: options.createdBy,
          });
          result.imported++;
          result.entries.push({
            id: created.id,
            name: parsed.name,
            action: 'create',
          });
        }
      } else {
        const existing = guidelineRepo.getByName(
          parsed.name,
          options.scopeType,
          options.scopeId,
          false
        );

        if (existing) {
          guidelineRepo.update(existing.id, {
            content: parsed.content,
            rationale: parsed.rationale,
            examples: parsed.examples,
            category: parsed.category,
            priority: parsed.priority,
            changeReason: 'Imported from IDE format',
            updatedBy: options.createdBy,
          });
          result.updated++;
          result.entries.push({
            id: existing.id,
            name: parsed.name,
            action: 'update',
          });
        } else {
          const created = guidelineRepo.create({
            scopeType: options.scopeType,
            scopeId: options.scopeId,
            name: parsed.name,
            content: parsed.content,
            rationale: parsed.rationale,
            examples: parsed.examples,
            category: parsed.category,
            priority: parsed.priority,
            createdBy: options.createdBy,
          });
          result.imported++;
          result.entries.push({
            id: created.id,
            name: parsed.name,
            action: 'create',
          });

          if (parsed.tags && parsed.tags.length > 0) {
            for (const tagName of parsed.tags) {
              entryTagRepo.attach({
                entryType: 'guideline',
                entryId: created.id,
                tagName,
              });
            }
          }
        }
      }
    } catch (error) {
      result.errors.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      });
      result.skipped++;
    }
  }

  return result;
}

import { join } from 'node:path';

import { getCriticalGuidelinesForScope } from '../critical-guidelines.service.js';
import { writeFileWithVerifyBackup } from './sync-ops.js';
import type { DbClient } from '../../db/connection.js';

export interface CriticalGuidelinesSyncOptions {
  projectId?: string;
  sessionId?: string;
  backup?: boolean;
  verify?: boolean;
  db: DbClient;
}

export interface CriticalGuidelinesSyncResult {
  success: boolean;
  filesWritten: string[];
  errors: string[];
  message: string;
}

export function generateCriticalGuidelinesMarkdown(
  projectId: string | null,
  sessionId: string | null | undefined,
  db: DbClient
): string {
  const guidelines = getCriticalGuidelinesForScope(projectId, sessionId, db);

  if (guidelines.length === 0) {
    return `# Critical Guidelines (Auto-synced from Agent Memory)

> No critical guidelines found. Guidelines with priority >= 90 will appear here.

---
> Last synced: ${new Date().toISOString()}
`;
  }

  let content = `# Critical Guidelines (Auto-synced from Agent Memory)

## MUST FOLLOW - Priority 90+

These guidelines are critical and must be followed in all interactions.
Before making file modifications, call \`memory_verify pre_check\` to verify compliance.

`;

  for (const guideline of guidelines) {
    content += `### ${guideline.name} (Priority: ${guideline.priority})\n\n`;
    content += `${guideline.content}\n\n`;

    if (guideline.rationale) {
      content += `**Rationale:** ${guideline.rationale}\n\n`;
    }

    if (guideline.examples) {
      if (guideline.examples.bad && guideline.examples.bad.length > 0) {
        content += `**Bad examples:**\n`;
        for (const bad of guideline.examples.bad) {
          content += `- \`${bad}\`\n`;
        }
        content += '\n';
      }

      if (guideline.examples.good && guideline.examples.good.length > 0) {
        content += `**Good examples:**\n`;
        for (const good of guideline.examples.good) {
          content += `- \`${good}\`\n`;
        }
        content += '\n';
      }
    }

    content += '---\n\n';
  }

  content += `> Last synced: ${new Date().toISOString()}\n`;
  content += `> Total critical guidelines: ${guidelines.length}\n`;
  content += `> Source: Agent Memory Database\n`;

  return content;
}

async function syncCriticalGuidelinesToFile(
  destFile: string,
  content: string,
  options: { verify?: boolean; backup?: boolean }
): Promise<CriticalGuidelinesSyncResult> {
  try {
    const result = await writeFileWithVerifyBackup(destFile, content, {
      verify: options.verify,
      backup: options.backup,
    });

    switch (result.action) {
      case 'skip':
        return {
          success: true,
          filesWritten: [],
          errors: [],
          message: `File is identical, skipping: ${destFile}`,
        };
      case 'would_create':
        return {
          success: true,
          filesWritten: [destFile],
          errors: [],
          message: `Would create critical guidelines at ${destFile}`,
        };
      case 'would_update':
        return {
          success: true,
          filesWritten: [destFile],
          errors: [],
          message: `Would update critical guidelines at ${destFile}`,
        };
      case 'created':
      case 'updated':
        return {
          success: true,
          filesWritten: [destFile],
          errors: [],
          message: `Successfully synced critical guidelines to ${destFile}`,
        };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      filesWritten: [],
      errors: [errorMsg],
      message: `Failed to sync critical guidelines: ${errorMsg}`,
    };
  }
}

export async function syncCriticalGuidelinesToCursor(
  projectPath: string,
  options: CriticalGuidelinesSyncOptions
): Promise<CriticalGuidelinesSyncResult> {
  const destFile = join(projectPath, '.cursor', 'rules', 'critical-guidelines.md');
  const content = generateCriticalGuidelinesMarkdown(
    options.projectId ?? null,
    options.sessionId,
    options.db
  );
  return syncCriticalGuidelinesToFile(destFile, content, options);
}

export async function syncCriticalGuidelinesToClaude(
  projectPath: string,
  options: CriticalGuidelinesSyncOptions
): Promise<CriticalGuidelinesSyncResult> {
  const destFile = join(projectPath, '.claude', 'critical-guidelines.md');
  const content = generateCriticalGuidelinesMarkdown(
    options.projectId ?? null,
    options.sessionId,
    options.db
  );
  return syncCriticalGuidelinesToFile(destFile, content, options);
}

export async function syncCriticalGuidelines(
  projectPath: string,
  ide: string,
  options: CriticalGuidelinesSyncOptions
): Promise<CriticalGuidelinesSyncResult> {
  switch (ide.toLowerCase()) {
    case 'cursor':
      return syncCriticalGuidelinesToCursor(projectPath, options);
    case 'claude':
      return syncCriticalGuidelinesToClaude(projectPath, options);
    case 'vscode': {
      const destFile = join(projectPath, '.vscode', 'critical-guidelines.md');
      const content = generateCriticalGuidelinesMarkdown(
        options.projectId ?? null,
        options.sessionId,
        options.db
      );
      return syncCriticalGuidelinesToFile(destFile, content, options);
    }
    default:
      return {
        success: false,
        filesWritten: [],
        errors: [`Unsupported IDE: ${ide}`],
        message: `Unsupported IDE: ${ide}. Supported: cursor, claude, vscode`,
      };
  }
}

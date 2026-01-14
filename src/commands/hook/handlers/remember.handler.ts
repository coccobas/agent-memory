import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { getDb, getSqlite } from '../../../db/connection.js';
import { createRepositories } from '../../../core/factory/repositories.js';
import { createUnifiedMemoryService } from '../../../services/unified-memory/index.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('remember-handler');

/**
 * Handle the 'remember' command - quick storage of memories
 *
 * Usage: !am remember <text to store>
 *
 * Auto-detects type (guideline/knowledge/tool) from content.
 */
export async function handleRemember(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, projectId, args } = ctx;

  // Join all args as the text to remember
  const text = args.join(' ').trim();

  if (!text) {
    return blocked('Usage: !am remember <text to store>\nExample: !am remember We use TypeScript strict mode');
  }

  if (!projectId) {
    return blocked('No project context. Please ensure the project is detected.');
  }

  try {
    const repos = createRepositories({ db: getDb(), sqlite: getSqlite() });
    const service = createUnifiedMemoryService({
      confidenceThreshold: 0.6,
      autoExecuteThreshold: 0.75,
    });

    // Analyze the text to detect type
    const intent = service.analyze(`Remember that ${text}`);

    // Store based on detected type
    const entryType = intent.entryType ?? 'knowledge';
    const category = intent.category ?? (entryType === 'knowledge' ? 'fact' : 'code_style');
    const title = intent.title ?? text.substring(0, 50);

    let entryId: string;
    let storedType: string;

    if (entryType === 'guideline') {
      const result = await repos.guidelines.create({
        scopeType: 'project',
        scopeId: projectId,
        name: title,
        content: text,
        category,
        createdBy: 'claude-code',
      });
      entryId = result.id;
      storedType = 'guideline';
    } else if (entryType === 'tool') {
      const result = await repos.tools.create({
        scopeType: 'project',
        scopeId: projectId,
        name: title,
        description: text,
        category: 'cli',
        createdBy: 'claude-code',
      });
      entryId = result.id;
      storedType = 'tool';
    } else {
      const result = await repos.knowledge.create({
        scopeType: 'project',
        scopeId: projectId,
        title,
        content: text,
        category: category as 'decision' | 'fact' | 'context' | 'reference',
        createdBy: 'claude-code',
      });
      entryId = result.id;
      storedType = 'knowledge';
    }

    logger.info(
      { sessionId, projectId, entryId, entryType: storedType },
      'Stored memory via !am remember command'
    );

    // Return success - use blocked to show message, then allow (exit 0 for success)
    return {
      exitCode: 0,
      stdout: [],
      stderr: [`✓ Stored ${storedType}: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}" (${entryId.slice(0, 8)})`],
    };
  } catch (error) {
    logger.error({ error, sessionId, projectId }, 'Failed to store memory');
    return blocked(`Failed to store: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

import type { CommandContext } from '../command-registry.js';
import type { HookCommandResult } from '../types.js';
import { blocked } from '../command-registry.js';
import { getDb, getSqlite } from '../../../db/connection.js';
import { createRepositories } from '../../../core/factory/repositories.js';
import { createUnifiedMemoryService } from '../../../services/unified-memory/index.js';
import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('observe-handler');

/**
 * Handle the 'observe' command - extract learnings from conversation
 *
 * Usage: !am observe [context]
 *
 * Gets recent conversation messages and extracts potential learnings using
 * rule-based analysis. For LLM-based extraction, use the MCP memory_observe tool.
 */
export async function handleObserve(ctx: CommandContext): Promise<HookCommandResult> {
  const { sessionId, projectId, args } = ctx;

  // Optional additional context provided by user
  const additionalContext = args.join(' ').trim();

  if (!projectId) {
    return blocked('No project context. Please ensure the project is detected.');
  }

  try {
    const repos = createRepositories({ db: getDb(), sqlite: getSqlite() });
    const service = createUnifiedMemoryService({
      confidenceThreshold: 0.6,
      autoExecuteThreshold: 0.75,
    });

    // Get conversation for this session
    const conversations = await repos.conversations.list(
      { sessionId, status: 'active' },
      { limit: 1, offset: 0 }
    );

    const conversation = conversations[0];
    if (!conversation) {
      return blocked('No active conversation found for this session.');
    }

    // Get recent messages (last 50 for analysis)
    const messages = await repos.conversations.getMessages(conversation.id, 50, 0);

    if (messages.length === 0) {
      return blocked('No messages found in conversation to analyze.');
    }

    // Build context from messages
    const contextParts: string[] = [];

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'Human' : msg.role === 'agent' ? 'Assistant' : 'System';
      // Truncate very long messages
      const content =
        msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
      contextParts.push(`${role}: ${content}`);
    }

    // Add any user-provided context
    if (additionalContext) {
      contextParts.push(`\nAdditional context: ${additionalContext}`);
    }

    const conversationContext = contextParts.join('\n\n');

    // Analyze the conversation for potential learnings
    // This uses rule-based detection from UnifiedMemoryService
    const patterns = extractPatterns(conversationContext);

    let storedCount = 0;
    const storedEntries: Array<{ type: string; title: string; id: string }> = [];

    // Store each detected pattern
    for (const pattern of patterns) {
      try {
        const intent = service.analyze(pattern.text);
        const title = intent.title ?? pattern.text.substring(0, 50);

        let entryId: string;
        let storedType: string;

        // Map pattern types to entry types and categories
        // bug, todo, limitation -> knowledge with appropriate category
        // guideline -> guideline
        // decision, fact -> knowledge
        if (pattern.type === 'guideline' || intent.entryType === 'guideline') {
          const category = intent.category ?? 'code_style';
          const result = await repos.guidelines.create({
            scopeType: 'session',
            scopeId: sessionId,
            name: title,
            content: pattern.text,
            category,
            createdBy: 'claude-code',
          });
          entryId = result.id;
          storedType = 'guideline';
        } else if (intent.entryType === 'tool') {
          const result = await repos.tools.create({
            scopeType: 'session',
            scopeId: sessionId,
            name: title,
            description: pattern.text,
            category: 'cli',
            createdBy: 'claude-code',
          });
          entryId = result.id;
          storedType = 'tool';
        } else {
          // Map pattern type to knowledge category
          let category: 'decision' | 'fact' | 'context' | 'reference' = 'fact';
          let displayType = 'knowledge';

          if (pattern.type === 'bug') {
            category = 'fact'; // Bugs are facts about current state
            displayType = 'bug';
          } else if (pattern.type === 'todo') {
            category = 'context'; // TODOs are contextual reminders
            displayType = 'todo';
          } else if (pattern.type === 'limitation') {
            category = 'fact'; // Limitations are factual constraints
            displayType = 'limitation';
          } else if (pattern.type === 'decision') {
            category = 'decision';
          }

          const result = await repos.knowledge.create({
            scopeType: 'session',
            scopeId: sessionId,
            title: `[${displayType.toUpperCase()}] ${title}`,
            content: pattern.text,
            category,
            createdBy: 'claude-code',
          });
          entryId = result.id;
          storedType = displayType;
        }

        storedEntries.push({ type: storedType, title, id: entryId });
        storedCount++;
      } catch (error) {
        logger.warn(
          { error, pattern: pattern.text.substring(0, 50) },
          'Failed to store extracted pattern'
        );
      }
    }

    logger.info(
      {
        sessionId,
        projectId,
        messagesAnalyzed: messages.length,
        patternsFound: patterns.length,
        storedCount,
      },
      'Completed observation extraction via !am observe command'
    );

    if (storedCount === 0) {
      return {
        exitCode: 0,
        stdout: [],
        stderr: [
          `Analyzed ${messages.length} messages but found no new patterns to extract.`,
          'Tip: For LLM-based extraction, use the MCP memory_observe tool.',
        ],
      };
    }

    const summaryLines = [
      `✓ Extracted ${storedCount} learnings from ${messages.length} messages:`,
      ...storedEntries
        .slice(0, 5)
        .map(
          (e) => `  • ${e.type}: ${e.title.substring(0, 40)}${e.title.length > 40 ? '...' : ''}`
        ),
    ];

    if (storedEntries.length > 5) {
      summaryLines.push(`  ... and ${storedEntries.length - 5} more`);
    }

    summaryLines.push('', 'Use "!am review" to see candidates for promotion to project scope.');

    return {
      exitCode: 0,
      stdout: [],
      stderr: summaryLines,
    };
  } catch (error) {
    logger.error({ error, sessionId, projectId }, 'Failed to extract observations');
    return blocked(
      `Failed to extract: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract patterns from conversation context using rule-based heuristics.
 *
 * This is a lightweight extraction that looks for:
 * - Decisions ("we decided", "let's use", "I chose")
 * - Problems solved ("fixed", "resolved", "the issue was")
 * - Key learnings ("learned that", "found out", "discovered")
 * - Rules/guidelines ("always", "never", "must", "should")
 * - Bugs/issues ("bug:", "issue:", "error when", "doesn't work", "broken")
 * - TODOs and FIXMEs ("todo:", "fixme:", "hack:", "workaround")
 */
function extractPatterns(context: string): Array<{ text: string; type: string }> {
  const patterns: Array<{ text: string; type: string }> = [];
  const sentences = context.split(/[.!?]\s+/);

  // Decision patterns
  const decisionPatterns = [
    /we decided/i,
    /let's use/i,
    /i chose/i,
    /we'll go with/i,
    /the approach is/i,
    /decided to/i,
  ];

  // Problem solved patterns
  const problemSolvedPatterns = [
    /fixed the/i,
    /resolved the/i,
    /the issue was/i,
    /the problem was/i,
    /solved by/i,
    /the fix is/i,
    /the solution is/i,
    /root cause was/i,
    /caused by/i,
  ];

  // Learning patterns
  const learningPatterns = [
    /learned that/i,
    /found out/i,
    /discovered that/i,
    /turns out/i,
    /realized that/i,
    /important to note/i,
  ];

  // Guideline patterns
  const guidelinePatterns = [
    /always\s+\w+/i,
    /never\s+\w+/i,
    /must\s+\w+/i,
    /should\s+\w+/i,
    /don't\s+\w+/i,
    /do not\s+\w+/i,
  ];

  // Bug/issue patterns - active problems that need attention
  const bugPatterns = [
    /bug:/i,
    /bug\s+in/i,
    /issue:/i,
    /issue\s+with/i,
    /problem:/i,
    /problem\s+with/i,
    /error\s+when/i,
    /error:/i,
    /doesn't work/i,
    /does not work/i,
    /isn't working/i,
    /is not working/i,
    /broken/i,
    /fails\s+to/i,
    /failed\s+to/i,
    /failing/i,
    /crashes?\s+when/i,
    /throws?\s+an?\s+error/i,
    /exception/i,
  ];

  // TODO/FIXME patterns - technical debt and reminders
  const todoPatterns = [
    /todo:/i,
    /todo\s/i,
    /fixme:/i,
    /fixme\s/i,
    /hack:/i,
    /workaround/i,
    /temporary\s+fix/i,
    /needs?\s+to\s+be\s+fixed/i,
    /should\s+be\s+refactored/i,
    /technical\s+debt/i,
    /known\s+issue/i,
    /limitation:/i,
  ];

  // Limitation/constraint patterns
  const limitationPatterns = [
    /limitation:/i,
    /constraint:/i,
    /caveat:/i,
    /doesn't\s+support/i,
    /does\s+not\s+support/i,
    /not\s+supported/i,
    /won't\s+work\s+with/i,
    /incompatible\s+with/i,
    /only\s+works\s+when/i,
    /requires?\s+that/i,
  ];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 15 || trimmed.length > 500) continue;

    // Check each pattern category - only match first category found
    let matched = false;

    // Bugs/issues (high priority - check first)
    if (!matched) {
      for (const pattern of bugPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'bug' });
          matched = true;
          break;
        }
      }
    }

    // TODOs/FIXMEs
    if (!matched) {
      for (const pattern of todoPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'todo' });
          matched = true;
          break;
        }
      }
    }

    // Limitations/constraints
    if (!matched) {
      for (const pattern of limitationPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'limitation' });
          matched = true;
          break;
        }
      }
    }

    // Decisions
    if (!matched) {
      for (const pattern of decisionPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'decision' });
          matched = true;
          break;
        }
      }
    }

    // Problems solved
    if (!matched) {
      for (const pattern of problemSolvedPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'fact' });
          matched = true;
          break;
        }
      }
    }

    // Learnings
    if (!matched) {
      for (const pattern of learningPatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'fact' });
          matched = true;
          break;
        }
      }
    }

    // Guidelines
    if (!matched) {
      for (const pattern of guidelinePatterns) {
        if (pattern.test(trimmed)) {
          patterns.push({ text: trimmed, type: 'guideline' });
          matched = true;
          break;
        }
      }
    }
  }

  // Deduplicate by text
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const key = p.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

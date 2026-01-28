import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { IDEConversationReader, IDEMessage, IDESession } from './types.js';
import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('opencode-reader');

const MAX_INPUT_PREVIEW_LENGTH = 100;
const MAX_OUTPUT_LENGTH = 5000;
const TRUNCATION_MARKER = '... [truncated]';

interface OpenCodeMessageFile {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: { created: number };
  summary?: { title?: string };
  agent?: string;
  model?: { providerID?: string; modelID?: string };
}

interface OpenCodePartFile {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'text' | 'tool' | 'tool-result' | 'step-start' | 'step-finish';
  text?: string;
  // OpenCode stores tool name directly in 'tool' field
  tool?: string;
  state?: {
    status: string;
    input?: Record<string, unknown>;
    output?: string;
  };
}

interface OpenCodeSessionFile {
  id: string;
  slug?: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time: { created: number; updated?: number };
}

export class OpenCodeReader implements IDEConversationReader {
  readonly ideName = 'opencode';
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(homedir(), '.local', 'share', 'opencode', 'storage');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await stat(this.basePath);
      return true;
    } catch {
      return false;
    }
  }

  getDataPath(): string {
    return this.basePath;
  }

  async listSessions(projectPath?: string): Promise<IDESession[]> {
    const sessionDir = join(this.basePath, 'session');
    const sessions: IDESession[] = [];

    try {
      const projectDirs = await readdir(sessionDir);

      for (const projectDir of projectDirs) {
        if (projectDir === 'global') continue;

        const projectSessionPath = join(sessionDir, projectDir);
        const dirStat = await stat(projectSessionPath);
        if (!dirStat.isDirectory()) continue;

        const sessionFiles = await readdir(projectSessionPath);

        for (const file of sessionFiles) {
          if (!file.endsWith('.json')) continue;

          try {
            const content = await readFile(join(projectSessionPath, file), 'utf-8');
            const session = JSON.parse(content) as OpenCodeSessionFile;

            if (projectPath && session.directory !== projectPath) continue;

            sessions.push({
              id: session.id,
              projectPath: session.directory,
              title: session.title ?? session.slug,
              createdAt: new Date(session.time.created),
              updatedAt: session.time.updated ? new Date(session.time.updated) : undefined,
            });
          } catch (err) {
            logger.debug({ file, error: err }, 'Failed to parse session file');
          }
        }
      }
    } catch (err) {
      logger.debug({ error: err }, 'Failed to list sessions');
    }

    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getMessages(
    sessionId: string,
    options?: { after?: Date; before?: Date; limit?: number }
  ): Promise<IDEMessage[]> {
    const messageDir = join(this.basePath, 'message', sessionId);
    const partDir = join(this.basePath, 'part');
    const messages: IDEMessage[] = [];

    try {
      await stat(messageDir);
    } catch {
      logger.debug({ sessionId }, 'Message directory not found');
      return [];
    }

    try {
      const messageFiles = await readdir(messageDir);

      for (const file of messageFiles) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await readFile(join(messageDir, file), 'utf-8');
          const msg = JSON.parse(content) as OpenCodeMessageFile;

          const timestamp = new Date(msg.time.created);

          if (options?.after && timestamp < options.after) continue;
          if (options?.before && timestamp > options.before) continue;

          const parts = await this.getMessageParts(partDir, msg.id);
          const textContent = parts
            .filter((p) => p.type === 'text' && p.text)
            .map((p) => p.text!)
            .join('\n');

          const toolParts = parts.filter((p) => p.type === 'tool' && p.tool);
          const toolsUsed = toolParts.map((p) => p.tool!);

          let toolContent = '';
          const toolExecutions: Array<{
            name: string;
            input?: unknown;
            output?: string;
            status?: string;
          }> = [];

          if (toolParts.length > 0 && !textContent) {
            toolContent = toolParts
              .map((p) => {
                const toolName = p.tool!;

                if (p.state) {
                  const status = p.state.status || 'unknown';
                  const input = p.state.input;
                  const output = p.state.output;

                  let truncatedOutput = output;
                  if (output && output.length > MAX_OUTPUT_LENGTH) {
                    truncatedOutput = output.slice(0, MAX_OUTPUT_LENGTH) + TRUNCATION_MARKER;
                  }

                  toolExecutions.push({ name: toolName, input, output: truncatedOutput, status });

                  let preview = `[${toolName}`;
                  if (status !== 'completed') {
                    preview += ` (${status})`;
                  }

                  if (input) {
                    const inputStr = JSON.stringify(input);
                    const inputPreview =
                      inputStr.length > MAX_INPUT_PREVIEW_LENGTH
                        ? inputStr.slice(0, MAX_INPUT_PREVIEW_LENGTH) + '...'
                        : inputStr;
                    preview += `: ${inputPreview}`;
                  }

                  preview += ']';
                  return preview;
                } else {
                  return `[Tool calls: ${toolName}]`;
                }
              })
              .join('\n');
          }

          if (!textContent && toolsUsed.length === 0) continue;

          messages.push({
            id: msg.id,
            sessionId: msg.sessionID,
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: textContent || toolContent,
            timestamp,
            toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
            metadata: {
              agent: msg.agent,
              model: msg.model?.modelID,
              toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
            },
          });
        } catch (err) {
          logger.debug({ file, error: err }, 'Failed to parse message file');
        }
      }
    } catch (err) {
      logger.debug({ sessionId, error: err }, 'Failed to read messages');
    }

    const sorted = messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (options?.limit && sorted.length > options.limit) {
      return sorted.slice(0, options.limit);
    }

    return sorted;
  }

  async findSessionByExternalId(externalSessionId: string): Promise<IDESession | null> {
    const sessions = await this.listSessions();
    return sessions.find((s) => s.id === externalSessionId) ?? null;
  }

  private async getMessageParts(partDir: string, messageId: string): Promise<OpenCodePartFile[]> {
    const msgPartDir = join(partDir, messageId);
    const parts: OpenCodePartFile[] = [];

    try {
      const partFiles = await readdir(msgPartDir);

      for (const file of partFiles) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await readFile(join(msgPartDir, file), 'utf-8');
          parts.push(JSON.parse(content) as OpenCodePartFile);
        } catch {
          // Skip invalid part files
        }
      }
    } catch {
      // No parts directory for this message
    }

    return parts;
  }
}

export function createOpenCodeReader(basePath?: string): IDEConversationReader {
  return new OpenCodeReader(basePath);
}

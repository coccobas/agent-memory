/**
 * IDE Conversation Reader Types
 *
 * Common interfaces for reading conversation history from different IDEs.
 */

export interface IDEMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
}

export interface IDESession {
  id: string;
  projectPath?: string;
  title?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IDEConversationReader {
  readonly ideName: string;

  isAvailable(): Promise<boolean>;

  getDataPath(): string;

  listSessions(projectPath?: string): Promise<IDESession[]>;

  getMessages(
    sessionId: string,
    options?: {
      after?: Date;
      before?: Date;
      limit?: number;
    }
  ): Promise<IDEMessage[]>;

  findSessionByExternalId(externalSessionId: string): Promise<IDESession | null>;
}

export type SupportedIDE = 'opencode' | 'claude';

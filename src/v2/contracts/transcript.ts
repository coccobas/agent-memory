/**
 * V2 Transcript contracts for autocapture hooks.
 *
 * Defines the shapes for transcript records, messages,
 * and the ingest payload shared between hook CLI and MCP tool.
 */

export type TranscriptStatus = 'active' | 'ended' | 'extracted';

export type TranscriptRole = 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';

export type TopicAssignment = 'auto' | 'manual';

export interface TranscriptRecord {
  readonly id: string;
  readonly sessionScopeId: string | null;
  readonly projectScopeId: string | null;
  readonly topicScopeId: string | null;
  readonly topicAssignment: TopicAssignment | null;
  readonly claudeSessionId: string;
  readonly transcriptPath: string | null;
  readonly agentId: string | null;
  readonly byteOffset: number;
  readonly messageCount: number;
  readonly status: TranscriptStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TranscriptMessage {
  readonly id: string;
  readonly transcriptId: string;
  readonly sequenceNum: number;
  readonly role: TranscriptRole;
  readonly content: string;
  readonly toolName: string | null;
  readonly timestamp: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface IngestPayload {
  readonly claudeSessionId: string;
  readonly projectScopeId?: string;
  readonly sessionScopeId?: string;
  readonly topicScopeId?: string;
  readonly transcriptPath?: string;
  readonly agentId?: string;
  readonly messages: readonly IngestMessage[];
  readonly isFinal?: boolean;
}

export interface IngestMessage {
  readonly role: TranscriptRole;
  readonly content: string;
  readonly toolName?: string;
  readonly timestamp?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface IngestResult {
  readonly transcriptId: string;
  readonly messagesStored: number;
  readonly extracted?: ExtractionSummary;
}

export interface ExtractionSummary {
  readonly candidates: number;
  readonly stored: number;
  readonly duplicatesSkipped: number;
}

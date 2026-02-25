/**
 * V2 Shared Ingest Layer.
 *
 * Unified ingestion logic used by both hook CLI and MCP memory_observe tool.
 * Handles transcript creation, message storage, and optional extraction.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { IngestPayload, IngestResult, IngestMessage } from '../contracts/transcript.js';
import type { SqliteMemoryV2Runtime } from '../adapters/sqlite/factory.js';
import type { EmbeddingService } from '../indexing/embedding-pipeline.js';
import {
  upsertTranscript,
  appendMessages,
  updateTranscriptStatus,
} from '../adapters/sqlite/transcript-store.js';
import { runSessionEndExtraction } from './extractor.js';
import { assignTranscriptToTopic } from '../topics/assigner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestDeps {
  readonly sqlite: Database.Database;
  readonly runtime: SqliteMemoryV2Runtime;
  readonly idGenerator?: () => string;
  readonly embeddingService?: EmbeddingService;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

/**
 * Ingest messages into a transcript, optionally triggering extraction.
 *
 * This is the shared kernel used by both hook CLI and MCP tool:
 * 1. Upsert transcript record (idempotent by claude_session_id)
 * 2. Append messages with auto-incrementing sequence numbers
 * 3. If isFinal, run extraction pipeline
 */
export async function ingest(deps: IngestDeps, payload: IngestPayload): Promise<IngestResult> {
  const { sqlite, runtime } = deps;
  const genId = deps.idGenerator ?? (() => randomUUID());

  const { claudeSessionId, messages, isFinal } = payload;

  // 1. Upsert transcript
  const transcript = upsertTranscript(sqlite, {
    id: genId(),
    claudeSessionId,
    status: 'active',
    sessionScopeId: payload.sessionScopeId,
    projectScopeId: payload.projectScopeId,
    transcriptPath: payload.transcriptPath,
    agentId: payload.agentId,
  });

  // 2. Append messages (if any)
  let messagesStored = 0;
  if (messages.length > 0) {
    // Get current max sequence_num for this transcript
    const maxSeqRow = sqlite
      .prepare(
        `SELECT COALESCE(MAX(sequence_num), 0) AS max_seq
         FROM v2_transcript_messages WHERE transcript_id = ?`
      )
      .get(transcript.id) as { max_seq: number };

    let nextSeq = maxSeqRow.max_seq + 1;

    const msgInputs = messages.map((msg: IngestMessage) => ({
      id: genId(),
      role: msg.role,
      content: msg.content,
      sequenceNum: nextSeq++,
      toolName: msg.toolName,
      timestamp: msg.timestamp,
      metadata: msg.metadata,
    }));

    const result = appendMessages(sqlite, {
      transcriptId: transcript.id,
      messages: msgInputs,
      newByteOffset: transcript.byteOffset, // preserve existing offset for MCP path
    });
    messagesStored = result.messagesStored;
  }

  // 3. If final, run extraction
  if (isFinal) {
    updateTranscriptStatus(sqlite, transcript.id, 'ended');

    // Detect project external ID from scope
    const projectExternalId = extractProjectId(payload.projectScopeId);

    if (projectExternalId) {
      const extracted = await runSessionEndExtraction(sqlite, runtime, transcript.id, {
        projectExternalId,
        agentId: payload.agentId,
      });

      // Fire-and-forget: auto-assign transcript to a topic
      if (payload.projectScopeId && deps.embeddingService) {
        assignTranscriptToTopic(
          { sqlite, embeddingService: deps.embeddingService },
          { transcriptId: transcript.id, projectScopeId: payload.projectScopeId }
        ).catch(() => {
          /* non-fatal */
        });
      }

      return {
        transcriptId: transcript.id,
        messagesStored,
        extracted,
      };
    }

    // No project → still mark extracted
    updateTranscriptStatus(sqlite, transcript.id, 'extracted');
    return {
      transcriptId: transcript.id,
      messagesStored,
      extracted: { candidates: 0, stored: 0, duplicatesSkipped: 0 },
    };
  }

  return {
    transcriptId: transcript.id,
    messagesStored,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the external ID portion from a scope key like "project:my-project".
 */
function extractProjectId(scopeId?: string): string | null {
  if (!scopeId) return null;
  const colonIdx = scopeId.indexOf(':');
  if (colonIdx < 0) return scopeId;
  return scopeId.slice(colonIdx + 1) || null;
}

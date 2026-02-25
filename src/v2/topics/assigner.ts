/**
 * Async Topic Assigner
 *
 * Assigns a transcript to the best-matching topic via embedding similarity.
 * If no topic matches above the threshold, a new topic is created from
 * the transcript content.
 *
 * Designed to be called fire-and-forget after transcript extraction.
 * Failures are non-fatal — the transcript simply remains unassigned.
 */

import type Database from 'better-sqlite3';
import type { EmbeddingService } from '../indexing/embedding-pipeline.js';
import { cosineSimilarity } from '../adapters/sqlite/shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssignerDeps {
  readonly sqlite: Database.Database;
  readonly embeddingService: EmbeddingService;
}

export interface AssignParams {
  readonly transcriptId: string;
  readonly projectScopeId: string;
  readonly threshold?: number;
}

export interface AssignResult {
  readonly topicScopeId: string;
  readonly action: 'assigned_existing' | 'created_new';
  readonly similarity?: number;
  readonly topicName?: string;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 0.7;
const MAX_TEXT_LENGTH = 500;

/**
 * Assign a transcript to the best-matching topic, or create a new one.
 * Returns null if embeddings are unavailable or no transcript content found.
 */
export async function assignTranscriptToTopic(
  deps: AssignerDeps,
  params: AssignParams
): Promise<AssignResult | null> {
  const { sqlite, embeddingService } = deps;
  const threshold = params.threshold ?? DEFAULT_THRESHOLD;

  if (!embeddingService.isAvailable()) {
    return null;
  }

  // 1. Build text representation from first user message
  const text = getTranscriptText(sqlite, params.transcriptId);
  if (!text) {
    return null;
  }

  // 2. Embed the transcript text
  const { embedding: rawEmbedding } = await embeddingService.embed(text);
  const transcriptEmbedding = new Float32Array(rawEmbedding);

  // 3. Load all topic embeddings for this project
  const topicRows = sqlite
    .prepare(
      `SELECT id, name, label, embedding
       FROM v2_scopes
       WHERE type = 'topic'
         AND parent_scope_id = ?
         AND is_archived = 0
         AND embedding IS NOT NULL`
    )
    .all(params.projectScopeId) as Array<{
    id: string;
    name: string | null;
    label: string | null;
    embedding: Buffer;
  }>;

  // 4. Find best matching topic
  let bestScore = 0;
  let bestTopicId: string | null = null;
  let bestTopicName: string | null = null;

  for (const row of topicRows) {
    const topicEmbedding = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
    );
    const score = cosineSimilarity(transcriptEmbedding, topicEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestTopicId = row.id;
      bestTopicName = row.label ?? row.name;
    }
  }

  const now = new Date().toISOString();

  // 5. Assign or create
  if (bestTopicId && bestScore >= threshold) {
    sqlite
      .prepare(
        `UPDATE v2_transcripts
         SET topic_scope_id = ?, topic_assignment = 'auto', updated_at = ?
         WHERE id = ?`
      )
      .run(bestTopicId, now, params.transcriptId);

    return {
      topicScopeId: bestTopicId,
      action: 'assigned_existing',
      similarity: bestScore,
      topicName: bestTopicName ?? undefined,
    };
  }

  // 6. No match — create new topic
  const topicId = crypto.randomUUID();
  const topicScopeId = `topic:${topicId}`;
  const topicName = deriveTopicName(text);

  sqlite
    .prepare(
      `INSERT INTO v2_scopes (id, type, parent_scope_id, name, label, is_archived, metadata, embedding, created_at, updated_at)
       VALUES (?, 'topic', ?, ?, ?, 0, '{}', ?, ?, ?)`
    )
    .run(
      topicScopeId,
      params.projectScopeId,
      topicId,
      topicName,
      Buffer.from(transcriptEmbedding.buffer),
      now,
      now
    );

  sqlite
    .prepare(
      `UPDATE v2_transcripts
       SET topic_scope_id = ?, topic_assignment = 'auto', updated_at = ?
       WHERE id = ?`
    )
    .run(topicScopeId, now, params.transcriptId);

  return {
    topicScopeId,
    action: 'created_new',
    topicName,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get representative text from a transcript (first user message, truncated).
 */
function getTranscriptText(sqlite: Database.Database, transcriptId: string): string | null {
  const row = sqlite
    .prepare(
      `SELECT content FROM v2_transcript_messages
       WHERE transcript_id = ? AND role = 'user'
       ORDER BY sequence_num ASC
       LIMIT 1`
    )
    .get(transcriptId) as { content: string } | undefined;

  if (!row?.content) {
    return null;
  }

  return row.content.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Derive a topic name from transcript text.
 * Takes the first line/sentence, truncated to 60 chars.
 */
function deriveTopicName(text: string): string {
  const firstLine = text.split(/[.\n]/)[0]?.trim() ?? text.trim();
  const truncated = firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
  return truncated || 'Untitled Topic';
}

/**
 * LoCoMo Dataset Adapter
 *
 * Downloads and parses the official LoCoMo dataset,
 * then converts dialogues to Agent Memory knowledge entries.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LoCoMoDialogue, LoCoMoQAPair, LoCoMoSession } from './locomo-types.js';

const LOCOMO_URL = 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json';
const DATA_DIR = path.join(import.meta.dirname, 'data');
const LOCOMO_FILE = path.join(DATA_DIR, 'locomo10.json');

/**
 * Raw sample from locomo10.json
 */
interface LoCoMoSample {
  sample_id: string;
  qa: LoCoMoQAPair[];
  conversation: {
    speaker_a: string;
    speaker_b: string;
    [key: string]: unknown; // session_1, session_1_date_time, etc.
  };
  event_summary?: unknown;
  observation?: unknown;
  session_summary?: unknown;
}

/**
 * Ensure the data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Download the LoCoMo dataset if not present
 */
export async function downloadLoCoMoDataset(): Promise<void> {
  ensureDataDir();

  if (fs.existsSync(LOCOMO_FILE)) {
    console.log('LoCoMo dataset already downloaded');
    return;
  }

  console.log('Downloading LoCoMo dataset from GitHub...');
  const response = await fetch(LOCOMO_URL);
  if (!response.ok) {
    throw new Error(`Failed to download LoCoMo dataset: ${response.statusText}`);
  }

  const data = await response.text();
  fs.writeFileSync(LOCOMO_FILE, data, 'utf-8');
  console.log(`LoCoMo dataset saved to ${LOCOMO_FILE}`);
}

/**
 * Load and parse the LoCoMo dataset
 */
export async function loadLoCoMoDataset(): Promise<LoCoMoSession[]> {
  await downloadLoCoMoDataset();

  const rawData = fs.readFileSync(LOCOMO_FILE, 'utf-8');
  const samples: LoCoMoSample[] = JSON.parse(rawData);

  return parseDataset(samples);
}

/**
 * Parse raw dataset into structured sessions
 *
 * The dataset has 10 samples, each with multiple sessions (session_1, session_2, etc.)
 * We flatten these into individual sessions for evaluation.
 */
function parseDataset(samples: LoCoMoSample[]): LoCoMoSession[] {
  const sessions: LoCoMoSession[] = [];

  for (let sampleIdx = 0; sampleIdx < samples.length; sampleIdx++) {
    const sample = samples[sampleIdx]!;
    const conversation = sample.conversation;

    // Find all session keys (session_1, session_2, etc.)
    const sessionKeys = Object.keys(conversation)
      .filter((k) => /^session_\d+$/.test(k))
      .sort((a, b) => {
        const numA = parseInt(a.replace('session_', ''));
        const numB = parseInt(b.replace('session_', ''));
        return numA - numB;
      });

    // Collect all dialogues across all sessions in this sample
    const allDialogues: LoCoMoDialogue[] = [];
    for (const sessionKey of sessionKeys) {
      const dialogues = conversation[sessionKey] as LoCoMoDialogue[] | undefined;
      if (dialogues && Array.isArray(dialogues)) {
        allDialogues.push(...dialogues);
      }
    }

    // Get date/time from first session
    const dateTime = (conversation['session_1_date_time'] as string) || '';

    // Create one session per sample with all its dialogues and QA pairs
    sessions.push({
      sessionId: `sample_${sampleIdx + 1}`,
      dateTime,
      dialogues: allDialogues.filter((d) => d && typeof d.text === 'string'),
      qaPairs: sample.qa || [],
    });
  }

  return sessions;
}

/**
 * Knowledge entry for Agent Memory
 */
export interface KnowledgeEntry {
  title: string;
  content: string;
  category: string;
  source: string;
  /** Original dialogue ID for evidence matching */
  diaId: string;
}

/**
 * Convert a LoCoMo dialogue to a knowledge entry
 */
export function dialogueToKnowledge(dialogue: LoCoMoDialogue, sessionId: string): KnowledgeEntry {
  // Build content with speaker context
  let content = `${dialogue.speaker}: ${dialogue.text}`;

  // Add image context if available
  if (dialogue.blip_caption) {
    content += `\n[Image: ${dialogue.blip_caption}]`;
  }

  return {
    title: `${dialogue.speaker} (${dialogue.dia_id})`,
    content,
    category: 'context',
    source: `locomo:${sessionId}`,
    diaId: dialogue.dia_id,
  };
}

/**
 * Convert all dialogues in a session to knowledge entries
 */
export function sessionToKnowledgeEntries(session: LoCoMoSession): KnowledgeEntry[] {
  return session.dialogues.map((dialogue) => dialogueToKnowledge(dialogue, session.sessionId));
}

/**
 * Get dataset statistics
 */
export function getDatasetStats(sessions: LoCoMoSession[]): {
  totalSessions: number;
  totalDialogues: number;
  totalQAPairs: number;
  qaPairsByCategory: Record<number, number>;
} {
  const stats = {
    totalSessions: sessions.length,
    totalDialogues: 0,
    totalQAPairs: 0,
    qaPairsByCategory: {} as Record<number, number>,
  };

  for (const session of sessions) {
    stats.totalDialogues += session.dialogues.length;
    stats.totalQAPairs += session.qaPairs.length;

    for (const qa of session.qaPairs) {
      stats.qaPairsByCategory[qa.category] = (stats.qaPairsByCategory[qa.category] || 0) + 1;
    }
  }

  return stats;
}

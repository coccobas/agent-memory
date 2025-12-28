/**
 * LoCoMo Benchmark Types
 *
 * Types for the official LoCoMo dataset from Snap Research:
 * https://github.com/snap-research/locomo
 *
 * License: CC BY-NC 4.0
 */

/**
 * Single dialogue turn in a LoCoMo session
 */
export interface LoCoMoDialogue {
  /** Speaker name (e.g., "Caroline", "Melanie") */
  speaker: string;
  /** Dialogue ID (e.g., "D1:1", "D1:2") */
  dia_id: string;
  /** The spoken message */
  text: string;
  /** Optional image URLs */
  img_url?: string[];
  /** Optional image caption from BLIP */
  blip_caption?: string;
  /** Optional search query for image */
  query?: string;
}

/**
 * Question-Answer pair with ground truth evidence
 */
export interface LoCoMoQAPair {
  /** The question */
  question: string;
  /** Ground truth answer */
  answer: string;
  /** Category (1-5): 1=single-hop, 2=multi-hop, 3=temporal, 4=commonsense, 5=adversarial */
  category: number;
  /** Dialogue IDs that contain the evidence (e.g., ["D1:5", "D1:6"]) */
  evidence: string[];
}

/**
 * Category mapping from number to name
 */
export const LOCOMO_CATEGORIES: Record<number, string> = {
  1: 'single-hop',
  2: 'multi-hop',
  3: 'temporal',
  4: 'commonsense',
  5: 'adversarial',
};

/**
 * Category names for display
 */
export type LoCoMoCategoryName =
  | 'single-hop'
  | 'multi-hop'
  | 'temporal'
  | 'commonsense'
  | 'adversarial';

/**
 * Raw LoCoMo dataset format (as in locomo10.json)
 *
 * The file has sessions named "session_1", "session_2", etc.
 * Each session has dialogues and QA pairs in separate arrays.
 */
export interface LoCoMoDataset {
  [key: string]: LoCoMoDialogue[] | LoCoMoQAPair[] | string;
}

/**
 * Parsed session with dialogues and QA pairs
 */
export interface LoCoMoSession {
  /** Session identifier (e.g., "1", "2") */
  sessionId: string;
  /** Session date/time metadata */
  dateTime: string;
  /** All dialogue turns */
  dialogues: LoCoMoDialogue[];
  /** All QA pairs for this session */
  qaPairs: LoCoMoQAPair[];
}

/**
 * Evaluation result for a single QA pair
 */
export interface QAEvaluationResult {
  sessionId: string;
  question: string;
  answer: string;
  category: number;
  categoryName: string;
  /** Ground truth dialogue IDs */
  groundTruthEvidence: string[];
  /** Retrieved knowledge entry IDs mapped to dialogue IDs */
  retrievedEvidence: string[];
  /** Retrieved@k for various k values */
  recallAt5: number;
  recallAt10: number;
  recallAt20: number;
  /** Mean Reciprocal Rank */
  mrr: number;
  /** Position of first relevant result (0 if none found) */
  firstRelevantRank: number;
}

/**
 * Aggregated metrics for a session or category
 */
export interface AggregatedMetrics {
  totalQueries: number;
  avgRecallAt5: number;
  avgRecallAt10: number;
  avgRecallAt20: number;
  avgMRR: number;
  /** Queries with at least one relevant result in top-k */
  hitRateAt5: number;
  hitRateAt10: number;
  hitRateAt20: number;
}

/**
 * Full benchmark results
 */
export interface LoCoMoBenchmarkResults {
  /** When the benchmark was run */
  timestamp: string;
  /** Configuration used */
  config: {
    useEmbeddings: boolean;
    sessionsRun: number;
    totalQAPairs: number;
  };
  /** Overall metrics */
  overall: AggregatedMetrics;
  /** Per-category breakdown */
  byCategory: Record<string, AggregatedMetrics>;
  /** Per-session breakdown */
  bySession: Record<string, AggregatedMetrics>;
  /** Individual QA results (optional, for debugging) */
  details?: QAEvaluationResult[];
}

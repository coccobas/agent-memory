/**
 * Dataset Format Service
 *
 * Handles format conversion for RL training datasets.
 * Supports multiple output formats: HuggingFace DPO, OpenAI, CSV, JSONL.
 */

import type { DPOPair } from './training/dpo-trainer.js';

// =============================================================================
// TYPES
// =============================================================================

export type DatasetFormat = 'huggingface' | 'openai' | 'csv' | 'jsonl';

export interface FormatResult {
  content: string;
  filename: string;
  format: DatasetFormat;
}

export interface FormatOptions {
  policy: string;
  format: DatasetFormat;
  outputPath: string;
}

// =============================================================================
// DATASET FORMAT SERVICE
// =============================================================================

export class DatasetFormatService {
  /**
   * Format DPO pairs into the specified output format
   */
  formatDPOPairs(pairs: DPOPair[], options: FormatOptions): FormatResult {
    const { policy, format, outputPath } = options;

    switch (format) {
      case 'huggingface':
        return this.formatHuggingFace(pairs, policy, outputPath);

      case 'openai':
        return this.formatOpenAI(pairs, policy, outputPath);

      case 'csv':
        return this.formatCSV(pairs, policy, outputPath);

      case 'jsonl':
      default:
        return this.formatJSONL(pairs, policy, outputPath);
    }
  }

  /**
   * Format raw training examples into JSONL format
   */
  formatRawExamples<T>(examples: T[], options: FormatOptions): FormatResult {
    const { policy, outputPath } = options;
    const content = examples.map((ex) => JSON.stringify(ex)).join('\n');
    const filename = this.joinPath(outputPath, `${policy}_train.jsonl`);

    return { content, filename, format: 'jsonl' };
  }

  /**
   * Validate format string
   */
  isValidFormat(format: string): format is DatasetFormat {
    return ['huggingface', 'openai', 'csv', 'jsonl'].includes(format);
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): DatasetFormat[] {
    return ['huggingface', 'openai', 'csv', 'jsonl'];
  }

  // ===========================================================================
  // PRIVATE FORMAT METHODS
  // ===========================================================================

  /**
   * Format as HuggingFace DPO format (JSONL with prompt, chosen, rejected)
   */
  private formatHuggingFace(pairs: DPOPair[], policy: string, outputPath: string): FormatResult {
    const content = pairs.map((p) => JSON.stringify(p)).join('\n');
    const filename = this.joinPath(outputPath, `${policy}_dpo_train.jsonl`);

    return { content, filename, format: 'huggingface' };
  }

  /**
   * Format as OpenAI fine-tuning format (JSONL with messages)
   */
  private formatOpenAI(pairs: DPOPair[], policy: string, outputPath: string): FormatResult {
    const content = pairs
      .map((p) =>
        JSON.stringify({
          messages: [
            { role: 'user', content: p.prompt },
            { role: 'assistant', content: p.chosen },
          ],
        })
      )
      .join('\n');
    const filename = this.joinPath(outputPath, `${policy}_openai_train.jsonl`);

    return { content, filename, format: 'openai' };
  }

  /**
   * Format as CSV format
   */
  private formatCSV(pairs: DPOPair[], policy: string, outputPath: string): FormatResult {
    const headers = 'prompt,chosen,rejected\n';
    const rows = pairs
      .map((p) => {
        const escapeCsv = (str: string) =>
          `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        return `${escapeCsv(p.prompt)},${escapeCsv(p.chosen)},${escapeCsv(p.rejected)}`;
      })
      .join('\n');
    const content = headers + rows;
    const filename = this.joinPath(outputPath, `${policy}_train.csv`);

    return { content, filename, format: 'csv' };
  }

  /**
   * Format as standard JSONL format
   */
  private formatJSONL(pairs: DPOPair[], policy: string, outputPath: string): FormatResult {
    const content = pairs.map((p) => JSON.stringify(p)).join('\n');
    const filename = this.joinPath(outputPath, `${policy}_train.jsonl`);

    return { content, filename, format: 'jsonl' };
  }

  /**
   * Join path components (simple implementation for internal use)
   */
  private joinPath(...parts: string[]): string {
    return parts.join('/').replace(/\/+/g, '/');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createDatasetFormatService(): DatasetFormatService {
  return new DatasetFormatService();
}

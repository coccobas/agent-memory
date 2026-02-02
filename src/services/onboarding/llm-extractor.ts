import type { DeepScanFinding } from './types.js';
import {
  CODEBASE_CONTRIBUTION_SYSTEM_PROMPT,
  buildCodebaseContributionPrompt,
  type CodebaseContext,
} from '../extraction/prompts.js';

const DEFAULT_MAX_TOKENS = 2000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function buildCodebasePrompt(context: CodebaseContext): string {
  const systemPrompt = CODEBASE_CONTRIBUTION_SYSTEM_PROMPT;
  const userPrompt = buildCodebaseContributionPrompt(context);
  return `${systemPrompt}\n\n${userPrompt}`;
}

interface ContributionGuide {
  pattern: string;
  title: string;
  steps: string[];
  confidence: number;
}

interface LlmExtractionResponse {
  guides?: ContributionGuide[];
}

export interface LlmExtractionResult {
  success: boolean;
  findings: DeepScanFinding[];
  error?: string;
  tokensUsed?: number;
}

export type LlmCallFn = (prompt: string) => Promise<LlmExtractionResponse | string>;

export interface LlmExtractorConfig {
  llmCall: LlmCallFn;
  maxTokens?: number;
}

export class LlmExtractorService {
  private llmCall: LlmCallFn;
  private maxTokens: number;

  constructor(config: LlmExtractorConfig) {
    this.llmCall = config.llmCall;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async extractContributionPatterns(context: CodebaseContext): Promise<LlmExtractionResult> {
    const prompt = buildCodebasePrompt(context);
    const estimatedTokens = estimateTokens(prompt);

    if (estimatedTokens > this.maxTokens) {
      throw new Error(
        `Prompt exceeds token budget: ${estimatedTokens} tokens > ${this.maxTokens} max allowed`
      );
    }

    try {
      const response = await this.llmCall(prompt);
      const parsed = this.parseResponse(response);
      const findings = this.convertToFindings(parsed.guides || []);

      return {
        success: true,
        findings,
        tokensUsed: estimatedTokens,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('token budget')) {
        throw error;
      }

      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseResponse(response: LlmExtractionResponse | string): LlmExtractionResponse {
    if (typeof response === 'string') {
      try {
        return JSON.parse(response) as LlmExtractionResponse;
      } catch {
        return { guides: [] };
      }
    }

    if (!response || typeof response !== 'object') {
      return { guides: [] };
    }

    if (!Array.isArray(response.guides)) {
      return { guides: [] };
    }

    return response;
  }

  private convertToFindings(guides: ContributionGuide[]): DeepScanFinding[] {
    return guides.map((guide) => ({
      area: 'architecture' as const,
      title: guide.title,
      content: this.formatSteps(guide.steps),
      category: 'reference' as const,
      confidence: guide.confidence,
      source: 'llm-extraction',
    }));
  }

  private formatSteps(steps: string[]): string {
    return steps
      .map((step, index) => {
        const trimmed = step.replace(/^\d+\)\s*/, '').trim();
        return `${index + 1}) ${trimmed}`;
      })
      .join('\n');
  }
}

export function createLlmExtractorService(config: LlmExtractorConfig): LlmExtractorService {
  return new LlmExtractorService(config);
}

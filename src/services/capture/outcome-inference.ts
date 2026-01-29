import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createComponentLogger } from '../../utils/logger.js';
import { withRetry, isRetryableNetworkError } from '../../utils/retry.js';
import { config } from '../../config/index.js';
import { detectOutcome, type OutcomeSignals } from '../../utils/transcript-analysis.js';
import type { TurnData } from './types.js';

const logger = createComponentLogger('capture:outcome-inference');

const OUTCOME_INFERENCE_PROMPT = `You are analyzing a conversation transcript to determine the task outcome.

Classify the outcome as one of:
- **success**: Task was completed successfully. User expressed satisfaction, said thanks, confirmed it works.
- **partial**: Some progress was made but task is incomplete. User mentioned "almost", "mostly", "except for".
- **failure**: Task failed or was abandoned. User expressed frustration, said "doesn't work", "give up".
- **unknown**: Cannot determine outcome from the conversation.

Focus on the LAST FEW MESSAGES as they're most indicative of the final outcome.

Look for signals like:
- User saying "thanks", "perfect", "done", "works" → success
- User saying "still broken", "doesn't work", "stuck" → failure  
- User saying "good progress", "almost", "will continue later" → partial
- Abrupt ending without clear resolution → unknown

Return ONLY a JSON object:
{
  "outcomeType": "success" | "partial" | "failure" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this outcome was inferred"
}`;

export interface OutcomeInferenceResult {
  outcomeType: 'success' | 'partial' | 'failure' | 'unknown';
  confidence: number;
  reasoning: string;
  method: 'llm' | 'keyword';
}

export interface OutcomeInferenceConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'none';
  confidenceThreshold: number;
}

export function createOutcomeInferenceService(serviceConfig: OutcomeInferenceConfig) {
  let openaiClient: OpenAI | null = null;
  let anthropicClient: Anthropic | null = null;

  if (serviceConfig.provider === 'openai' && config.extraction.openaiApiKey) {
    openaiClient = new OpenAI({ apiKey: config.extraction.openaiApiKey });
  } else if (serviceConfig.provider === 'anthropic' && config.extraction.anthropicApiKey) {
    anthropicClient = new Anthropic({ apiKey: config.extraction.anthropicApiKey });
  }

  function formatTranscript(transcript: TurnData[]): string {
    const recentMessages = transcript.slice(-10);
    return recentMessages
      .map((turn) => `[${turn.role.toUpperCase()}]: ${turn.content}`)
      .join('\n\n');
  }

  async function inferWithOpenAI(context: string): Promise<OutcomeInferenceResult | null> {
    if (!openaiClient) return null;

    try {
      const response = await withRetry(
        async () => {
          return await openaiClient.chat.completions.create({
            model: config.extraction.openaiModel,
            messages: [
              { role: 'system', content: OUTCOME_INFERENCE_PROMPT },
              { role: 'user', content: `Analyze this conversation:\n\n${context}` },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 256,
          });
        },
        {
          retryableErrors: isRetryableNetworkError,
          onRetry: (error, attempt) => {
            logger.warn({ error: error.message, attempt }, 'Retrying OpenAI outcome inference');
          },
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content) as {
        outcomeType?: string;
        confidence?: number;
        reasoning?: string;
      };

      if (!isValidOutcomeType(parsed.outcomeType)) return null;

      return {
        outcomeType: parsed.outcomeType,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        reasoning: parsed.reasoning ?? 'LLM inference',
        method: 'llm',
      };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI outcome inference failed'
      );
      return null;
    }
  }

  async function inferWithAnthropic(context: string): Promise<OutcomeInferenceResult | null> {
    if (!anthropicClient) return null;

    try {
      const response = await withRetry(
        async () => {
          return await anthropicClient.messages.create({
            model: config.extraction.anthropicModel,
            max_tokens: 256,
            system: OUTCOME_INFERENCE_PROMPT,
            messages: [{ role: 'user', content: `Analyze this conversation:\n\n${context}` }],
          });
        },
        {
          retryableErrors: isRetryableNetworkError,
          onRetry: (error, attempt) => {
            logger.warn({ error: error.message, attempt }, 'Retrying Anthropic outcome inference');
          },
        }
      );

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return null;

      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        outcomeType?: string;
        confidence?: number;
        reasoning?: string;
      };

      if (!isValidOutcomeType(parsed.outcomeType)) return null;

      return {
        outcomeType: parsed.outcomeType,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        reasoning: parsed.reasoning ?? 'LLM inference',
        method: 'llm',
      };
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Anthropic outcome inference failed'
      );
      return null;
    }
  }

  function inferWithKeywords(transcript: TurnData[]): OutcomeInferenceResult {
    const signals: OutcomeSignals = detectOutcome(transcript);
    return {
      outcomeType: signals.outcomeType,
      confidence: signals.confidence,
      reasoning: signals.reasoning,
      method: 'keyword',
    };
  }

  function isValidOutcomeType(
    value: unknown
  ): value is 'success' | 'partial' | 'failure' | 'unknown' {
    return value === 'success' || value === 'partial' || value === 'failure' || value === 'unknown';
  }

  return {
    async inferOutcome(transcript: TurnData[]): Promise<OutcomeInferenceResult> {
      if (transcript.length === 0) {
        return {
          outcomeType: 'unknown',
          confidence: 0,
          reasoning: 'No transcript available',
          method: 'keyword',
        };
      }

      const context = formatTranscript(transcript);

      let llmResult: OutcomeInferenceResult | null = null;
      if (serviceConfig.provider === 'openai') {
        llmResult = await inferWithOpenAI(context);
      } else if (serviceConfig.provider === 'anthropic') {
        llmResult = await inferWithAnthropic(context);
      }

      if (llmResult && llmResult.confidence >= serviceConfig.confidenceThreshold) {
        logger.debug(
          { outcome: llmResult.outcomeType, confidence: llmResult.confidence, method: 'llm' },
          'Outcome inferred via LLM'
        );
        return llmResult;
      }

      const keywordResult = inferWithKeywords(transcript);

      if (llmResult && keywordResult.outcomeType === llmResult.outcomeType) {
        return {
          ...llmResult,
          confidence: Math.max(llmResult.confidence, keywordResult.confidence),
          reasoning: `${llmResult.reasoning} (confirmed by keyword analysis)`,
        };
      }

      if (llmResult && llmResult.confidence > keywordResult.confidence) {
        logger.debug(
          { llmOutcome: llmResult.outcomeType, keywordOutcome: keywordResult.outcomeType },
          'LLM and keyword results differ, using higher confidence'
        );
        return llmResult;
      }

      logger.debug(
        {
          outcome: keywordResult.outcomeType,
          confidence: keywordResult.confidence,
          method: 'keyword',
        },
        'Outcome inferred via keywords'
      );
      return keywordResult;
    },

    isEnabled(): boolean {
      return serviceConfig.provider !== 'none';
    },
  };
}

export type OutcomeInferenceService = ReturnType<typeof createOutcomeInferenceService>;

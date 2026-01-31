import { createComponentLogger } from '../../../utils/logger.js';
import type { AppDb } from '../../../core/types.js';
import type { IExtractionService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';
import { conversationMessages } from '../../../db/schema/conversations.js';
import { episodes } from '../../../db/schema/episodes.js';
import { eq, isNull, and, inArray, isNotNull } from 'drizzle-orm';
import type { MessageRelevanceScoringConfig, MessageRelevanceScoringResult } from './types.js';

const logger = createComponentLogger('message-relevance-scoring');

export interface MessageRelevanceScoringDeps {
  db: AppDb;
  extractionService?: IExtractionService;
}

function buildRelevanceScoringPrompt(
  episodeName: string,
  episodeOutcome: string | null,
  messages: Array<{ id: string; role: string; content: string }>
): string {
  const messageList = messages
    .map(
      (m, i) =>
        `[${i + 1}] (${m.role}): ${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}`
    )
    .join('\n\n');

  return `You are analyzing conversation messages to score their relevance to the episode outcome.

Episode: ${episodeName}
Outcome: ${episodeOutcome ?? 'Not specified'}

Messages to score:
${messageList}

For each message, determine how relevant it is to understanding what happened and the outcome.
- HIGH (0.8-1.0): Key decisions, problem identification, solution implementation, important context
- MEDIUM (0.5-0.79): Supporting context, clarifications, intermediate steps
- LOW (0.0-0.49): Greetings, acknowledgments, tangential discussion, noise

Respond with a JSON array:
[
  {"index": 1, "score": 0.85, "category": "high"},
  {"index": 2, "score": 0.45, "category": "low"},
  ...
]

Only include messages that were provided. Use the exact index numbers shown.`;
}

const DECISION_WORDS = new Set([
  'decided',
  'chose',
  'choosing',
  'selected',
  'picking',
  'going with',
  'settled on',
  'determined',
  'concluded',
  'because',
  'reason',
  'therefore',
  'thus',
  'approach',
  'strategy',
  'solution',
  'fix',
  'fixed',
  'resolved',
  'implemented',
  'added',
  'removed',
  'updated',
  'changed',
  'refactored',
]);

function heuristicScore(message: { role: string; content: string }): {
  score: number;
  category: 'high' | 'medium' | 'low';
} {
  let score = 0.3;

  const words = message.content.split(/\s+/).length;
  if (words > 100) score += 0.2;
  else if (words > 50) score += 0.1;

  const codeBlocks = (message.content.match(/```/g) || []).length / 2;
  score += Math.min(codeBlocks * 0.1, 0.2);

  const lowerContent = message.content.toLowerCase();
  let decisionWordCount = 0;
  for (const word of DECISION_WORDS) {
    if (lowerContent.includes(word)) decisionWordCount++;
  }
  score += Math.min(decisionWordCount * 0.05, 0.25);

  if (message.role === 'agent' && lowerContent.includes('```')) {
    score += 0.1;
  }

  score = Math.min(score, 1.0);

  const category: 'high' | 'medium' | 'low' =
    score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  return { score, category };
}

function parseRelevanceResponse(
  response: string,
  messageCount: number
): Array<{ index: number; score: number; category: 'high' | 'medium' | 'low' }> | null {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const bracketMatch = response.match(/\[[\s\S]*\]/);
      if (bracketMatch) {
        jsonStr = bracketMatch[0];
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    const results: Array<{ index: number; score: number; category: 'high' | 'medium' | 'low' }> =
      [];

    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;

      const index = typeof obj.index === 'number' ? obj.index : null;
      const score = typeof obj.score === 'number' ? obj.score : null;
      const category = typeof obj.category === 'string' ? obj.category : null;

      if (index === null || score === null || index < 1 || index > messageCount) continue;

      const validCategory =
        category === 'high' || category === 'medium' || category === 'low' ? category : null;

      if (validCategory) {
        results.push({ index, score, category: validCategory });
      }
    }

    return results.length > 0 ? results : null;
  } catch (error) {
    logger.debug({ error, response }, 'Failed to parse relevance response');
    return null;
  }
}

export async function runMessageRelevanceScoring(
  deps: MessageRelevanceScoringDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: MessageRelevanceScoringConfig
): Promise<MessageRelevanceScoringResult> {
  const startTime = Date.now();
  const result: MessageRelevanceScoringResult = {
    executed: true,
    messagesScored: 0,
    byCategory: { high: 0, medium: 0, low: 0 },
    durationMs: 0,
  };

  const useHeuristic = !deps.extractionService;

  try {
    if (useHeuristic) {
      logger.debug('Using heuristic scoring: extraction service not available');
      result.source = 'heuristic';
    } else {
      result.source = 'llm';
    }

    const unscoredMessages = await deps.db
      .select({
        id: conversationMessages.id,
        episodeId: conversationMessages.episodeId,
        role: conversationMessages.role,
        content: conversationMessages.content,
      })
      .from(conversationMessages)
      .where(
        and(isNull(conversationMessages.relevanceScore), isNotNull(conversationMessages.episodeId))
      )
      .limit(config.maxMessagesPerRun);

    if (unscoredMessages.length === 0) {
      logger.debug('No unscored messages found');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const episodeIds = [
      ...new Set(unscoredMessages.map((m) => m.episodeId).filter(Boolean)),
    ] as string[];

    const episodeData = await deps.db
      .select({
        id: episodes.id,
        name: episodes.name,
        outcome: episodes.outcome,
      })
      .from(episodes)
      .where(inArray(episodes.id, episodeIds));

    const episodeMap = new Map(episodeData.map((e) => [e.id, e]));

    const messagesByEpisode = new Map<string, typeof unscoredMessages>();
    for (const msg of unscoredMessages) {
      if (!msg.episodeId) continue;
      const existing = messagesByEpisode.get(msg.episodeId) ?? [];
      existing.push(msg);
      messagesByEpisode.set(msg.episodeId, existing);
    }

    for (const [episodeId, messages] of messagesByEpisode) {
      const episode = episodeMap.get(episodeId);
      if (!episode) continue;

      try {
        let scores: Array<{ index: number; score: number; category: 'high' | 'medium' | 'low' }> =
          [];

        if (useHeuristic) {
          scores = messages.map((msg, i) => {
            const { score, category } = heuristicScore({ role: msg.role, content: msg.content });
            return { index: i + 1, score, category };
          });
        } else {
          const prompt = buildRelevanceScoringPrompt(
            episode.name,
            episode.outcome,
            messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))
          );

          const llmResult = await deps.extractionService!.generate({
            systemPrompt: 'You are a conversation analyst that scores message relevance.',
            userPrompt: prompt,
            temperature: 0.3,
            maxTokens: 1024,
          });

          const responseText = llmResult.texts[0];
          if (!responseText) continue;

          const parsedScores = parseRelevanceResponse(responseText, messages.length);
          if (!parsedScores) continue;
          scores = parsedScores;
        }

        if (!request.dryRun) {
          for (const score of scores) {
            const msg = messages[score.index - 1];
            if (!msg) continue;

            await deps.db
              .update(conversationMessages)
              .set({
                relevanceScore: score.score,
                relevanceCategory: score.category,
                relevanceScoredAt: new Date().toISOString(),
              })
              .where(eq(conversationMessages.id, msg.id));

            result.messagesScored++;
            result.byCategory[score.category]++;
          }
        } else {
          result.messagesScored += scores.length;
          for (const score of scores) {
            result.byCategory[score.category]++;
          }
        }
      } catch (error) {
        logger.warn({ error, episodeId }, 'Failed to score messages for episode');
        result.errors = result.errors ?? [];
        result.errors.push(
          `Episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        messagesScored: result.messagesScored,
        byCategory: result.byCategory,
        durationMs: result.durationMs,
      },
      'Message relevance scoring completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Message relevance scoring failed');
    result.errors = result.errors ?? [];
    result.errors.push(error instanceof Error ? error.message : String(error));
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

import { createComponentLogger } from '../../../utils/logger.js';
import type { Repositories } from '../../../core/interfaces/repositories.js';
import type { IExtractionService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';
import type { MessageInsightExtractionConfig, MessageInsightExtractionResult } from './types.js';

const logger = createComponentLogger('message-insight-extraction');

export interface MessageInsightExtractionDeps {
  repos: Repositories;
  extractionService?: IExtractionService;
}

type KnowledgeCategory = 'decision' | 'fact' | 'context' | 'reference';

interface ExtractedInsight {
  type: 'decision' | 'problem' | 'solution' | 'learning';
  category: KnowledgeCategory;
  title: string;
  content: string;
  confidence: number;
}

interface LLMInsightResponse {
  decisions: Array<{ text: string; confidence: number }>;
  problems: Array<{ text: string; confidence: number }>;
  solutions: Array<{ text: string; confidence: number }>;
  learnings: Array<{ text: string; confidence: number }>;
}

function buildInsightExtractionPrompt(
  episodeName: string,
  episodeOutcome: string | null,
  messages: Array<{ role: string; content: string }>
): string {
  const messageText = messages
    .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}`)
    .join('\n');

  return `Analyze this conversation from episode "${episodeName}" and extract actionable insights.

${episodeOutcome ? `Episode outcome: ${episodeOutcome}` : ''}

Conversation:
${messageText}

Extract the following types of insights:
1. DECISIONS: Choices made during the conversation (format: "Decided to X because Y")
2. PROBLEMS: Issues identified (format: "Problem: X caused by Y")
3. SOLUTIONS: How problems were solved (format: "Fixed X by doing Y")
4. LEARNINGS: Important discoveries or knowledge gained

Return JSON:
{
  "decisions": [{"text": "...", "confidence": 0.85}],
  "problems": [{"text": "...", "confidence": 0.85}],
  "solutions": [{"text": "...", "confidence": 0.85}],
  "learnings": [{"text": "...", "confidence": 0.85}]
}

Only include insights with confidence >= 0.6. Return empty arrays if no clear insights found.`;
}

function parseInsightResponse(response: string): LLMInsightResponse | null {
  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0];
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const obj = parsed as Record<string, unknown>;

    const validateArray = (arr: unknown): Array<{ text: string; confidence: number }> => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(
          (item): item is { text: string; confidence: number } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).text === 'string' &&
            typeof (item as Record<string, unknown>).confidence === 'number'
        )
        .map((item) => ({
          text: item.text,
          confidence: item.confidence,
        }));
    };

    return {
      decisions: validateArray(obj.decisions),
      problems: validateArray(obj.problems),
      solutions: validateArray(obj.solutions),
      learnings: validateArray(obj.learnings),
    };
  } catch (error) {
    logger.debug({ error, response }, 'Failed to parse insight response');
    return null;
  }
}

function flattenInsights(
  response: LLMInsightResponse,
  confidenceThreshold: number
): ExtractedInsight[] {
  const insights: ExtractedInsight[] = [];

  for (const decision of response.decisions) {
    if (decision.confidence >= confidenceThreshold) {
      insights.push({
        type: 'decision',
        category: 'decision',
        title: decision.text.slice(0, 100),
        content: decision.text,
        confidence: decision.confidence,
      });
    }
  }

  for (const problem of response.problems) {
    if (problem.confidence >= confidenceThreshold) {
      insights.push({
        type: 'problem',
        category: 'context',
        title: problem.text.slice(0, 100),
        content: problem.text,
        confidence: problem.confidence,
      });
    }
  }

  for (const solution of response.solutions) {
    if (solution.confidence >= confidenceThreshold) {
      insights.push({
        type: 'solution',
        category: 'context',
        title: solution.text.slice(0, 100),
        content: solution.text,
        confidence: solution.confidence,
      });
    }
  }

  for (const learning of response.learnings) {
    if (learning.confidence >= confidenceThreshold) {
      insights.push({
        type: 'learning',
        category: 'fact',
        title: learning.text.slice(0, 100),
        content: learning.text,
        confidence: learning.confidence,
      });
    }
  }

  return insights;
}

export async function runMessageInsightExtraction(
  deps: MessageInsightExtractionDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: MessageInsightExtractionConfig
): Promise<MessageInsightExtractionResult> {
  const startTime = Date.now();
  const result: MessageInsightExtractionResult = {
    executed: true,
    episodesProcessed: 0,
    messagesAnalyzed: 0,
    insightsExtracted: 0,
    knowledgeEntriesCreated: 0,
    relationsCreated: 0,
    durationMs: 0,
  };

  try {
    if (!deps.extractionService) {
      logger.debug('Message insight extraction skipped: extraction service not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    if (!deps.repos.episodes) {
      logger.debug('Message insight extraction skipped: episodes repository not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const scopeType = request.scopeType as 'global' | 'org' | 'project' | 'session';
    const scopeId = request.scopeId;

    const episodes = await deps.repos.episodes.list(
      {
        scopeType,
        scopeId,
        status: 'completed',
      },
      { limit: config.maxEntriesPerRun, offset: 0 }
    );

    for (const episode of episodes) {
      try {
        const messages = await deps.repos.conversations.getMessagesByEpisode(episode.id);

        if (messages.length < config.minMessages) {
          continue;
        }

        result.episodesProcessed++;
        result.messagesAnalyzed += messages.length;

        const prompt = buildInsightExtractionPrompt(
          episode.name,
          episode.outcome,
          messages.map((m) => ({ role: m.role, content: m.content }))
        );

        const llmResult = await deps.extractionService.generate({
          systemPrompt:
            'You are an insight extraction assistant that analyzes conversations to identify decisions, problems, solutions, and learnings.',
          userPrompt: prompt,
          temperature: 0.3,
          maxTokens: 1000,
        });

        const responseText = llmResult.texts[0];
        if (!responseText) {
          continue;
        }

        const parsed = parseInsightResponse(responseText);
        if (!parsed) {
          continue;
        }

        const insights = flattenInsights(parsed, config.confidenceThreshold);
        result.insightsExtracted += insights.length;

        if (!request.dryRun && insights.length > 0) {
          for (const insight of insights) {
            try {
              const knowledgeEntry = await deps.repos.knowledge.create({
                scopeType,
                scopeId,
                title: insight.title,
                category: insight.category,
                content: insight.content,
                confidence: insight.confidence,
                source: `episode:${episode.id}`,
                createdBy: request.initiatedBy ?? 'librarian',
              });

              result.knowledgeEntriesCreated++;

              try {
                await deps.repos.entryRelations.create({
                  sourceType: 'knowledge',
                  sourceId: knowledgeEntry.id,
                  targetType: 'knowledge',
                  targetId: episode.id,
                  relationType: 'related_to',
                  createdBy: request.initiatedBy ?? 'librarian',
                });
                result.relationsCreated++;
              } catch (relationError) {
                logger.debug(
                  { error: relationError, knowledgeId: knowledgeEntry.id, episodeId: episode.id },
                  'Failed to create relation'
                );
              }
            } catch (createError) {
              logger.debug(
                { error: createError, insight, episodeId: episode.id },
                'Failed to create knowledge entry'
              );
            }
          }
        }
      } catch (episodeError) {
        logger.warn({ error: episodeError, episodeId: episode.id }, 'Failed to process episode');
        result.errors = result.errors ?? [];
        result.errors.push(
          `Episode ${episode.id}: ${episodeError instanceof Error ? episodeError.message : String(episodeError)}`
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        episodesProcessed: result.episodesProcessed,
        messagesAnalyzed: result.messagesAnalyzed,
        insightsExtracted: result.insightsExtracted,
        knowledgeEntriesCreated: result.knowledgeEntriesCreated,
        relationsCreated: result.relationsCreated,
        durationMs: result.durationMs,
      },
      'Message insight extraction completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Message insight extraction failed');
    result.errors = result.errors ?? [];
    result.errors.push(error instanceof Error ? error.message : String(error));
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

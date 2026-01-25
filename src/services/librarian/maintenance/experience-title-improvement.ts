import { createComponentLogger } from '../../../utils/logger.js';
import type { AppDb } from '../../../core/types.js';
import type { IExtractionService } from '../../../core/context.js';
import type { ScopeType } from '../../../db/schema.js';
import { experiences, experienceVersions } from '../../../db/schema/experiences.js';
import { eq, like, and } from 'drizzle-orm';
import type {
  ExperienceTitleImprovementConfig,
  ExperienceTitleImprovementResult,
} from './types.js';

const logger = createComponentLogger('experience-title-improvement');

export interface ExperienceTitleImprovementDeps {
  db: AppDb;
  extractionService?: IExtractionService;
}

function buildTitleImprovementPrompt(
  currentTitle: string,
  scenario: string | null,
  outcome: string | null,
  content: string | null,
  category: string | null
): string {
  const contextParts: string[] = [];
  if (category) contextParts.push(`Category: ${category}`);
  if (scenario) contextParts.push(`Scenario: ${scenario}`);
  if (outcome) contextParts.push(`Outcome: ${outcome}`);
  if (content)
    contextParts.push(`Content: ${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`);

  return `You are improving experience titles to be more descriptive and searchable.

Current title: ${currentTitle}

Context:
${contextParts.join('\n')}

Generate a better title that:
- Is concise (5-10 words)
- Captures the key action or learning
- Is specific enough to be useful in search
- Avoids generic prefixes like "Episode:" or "Task:"

Respond with JSON:
{
  "title": "Your improved title here",
  "confidence": 0.85
}`;
}

function parseTitleResponse(response: string): { title: string; confidence: number } | null {
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
    const title = typeof obj.title === 'string' ? obj.title.trim() : null;
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;

    if (!title || title.length < 3) return null;

    return { title, confidence };
  } catch (error) {
    logger.debug({ error, response }, 'Failed to parse title response');
    return null;
  }
}

export async function runExperienceTitleImprovement(
  deps: ExperienceTitleImprovementDeps,
  request: {
    scopeType: ScopeType;
    scopeId?: string;
    dryRun?: boolean;
    initiatedBy?: string;
  },
  config: ExperienceTitleImprovementConfig
): Promise<ExperienceTitleImprovementResult> {
  const startTime = Date.now();
  const result: ExperienceTitleImprovementResult = {
    executed: true,
    experiencesScanned: 0,
    titlesImproved: 0,
    skipped: 0,
    durationMs: 0,
  };

  try {
    if (!deps.extractionService) {
      logger.debug('Experience title improvement skipped: extraction service not available');
      result.executed = false;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const pattern = config.genericTitlePattern;
    const regexPattern = new RegExp(pattern);

    const scopeConditions = [];
    if (request.scopeType !== 'global') {
      scopeConditions.push(eq(experiences.scopeType, request.scopeType));
      if (request.scopeId) {
        scopeConditions.push(eq(experiences.scopeId, request.scopeId));
      }
    }

    const baseQuery = deps.db
      .select({
        id: experiences.id,
        title: experiences.title,
        category: experiences.category,
        currentVersionId: experiences.currentVersionId,
        scenario: experienceVersions.scenario,
        outcome: experienceVersions.outcome,
        content: experienceVersions.content,
      })
      .from(experiences)
      .leftJoin(experienceVersions, eq(experiences.currentVersionId, experienceVersions.id));

    let candidateExperiences;
    if (config.onlyGenericTitles) {
      candidateExperiences = await baseQuery
        .where(
          and(
            like(experiences.title, 'Episode:%'),
            eq(experiences.isActive, true),
            ...scopeConditions
          )
        )
        .limit(config.maxEntriesPerRun);
    } else {
      candidateExperiences = await baseQuery
        .where(and(eq(experiences.isActive, true), ...scopeConditions))
        .limit(config.maxEntriesPerRun);
    }

    result.experiencesScanned = candidateExperiences.length;

    for (const exp of candidateExperiences) {
      if (config.onlyGenericTitles && !regexPattern.test(exp.title)) {
        result.skipped++;
        continue;
      }

      try {
        const prompt = buildTitleImprovementPrompt(
          exp.title,
          exp.scenario,
          exp.outcome,
          exp.content,
          exp.category
        );

        const llmResult = await deps.extractionService.generate({
          systemPrompt: 'You are a title improvement assistant.',
          userPrompt: prompt,
          temperature: 0.5,
          maxTokens: 128,
        });

        const responseText = llmResult.texts[0];
        if (!responseText) {
          result.skipped++;
          continue;
        }

        const parsed = parseTitleResponse(responseText);
        if (!parsed || parsed.confidence < 0.6) {
          result.skipped++;
          continue;
        }

        if (!request.dryRun) {
          await deps.db
            .update(experiences)
            .set({
              title: parsed.title,
            })
            .where(eq(experiences.id, exp.id));

          logger.debug(
            { experienceId: exp.id, oldTitle: exp.title, newTitle: parsed.title },
            'Improved experience title'
          );
        }

        result.titlesImproved++;
      } catch (error) {
        logger.warn({ error, experienceId: exp.id }, 'Failed to improve experience title');
        result.errors = result.errors ?? [];
        result.errors.push(
          `Experience ${exp.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    logger.info(
      {
        experiencesScanned: result.experiencesScanned,
        titlesImproved: result.titlesImproved,
        skipped: result.skipped,
        durationMs: result.durationMs,
      },
      'Experience title improvement completed'
    );

    return result;
  } catch (error) {
    logger.error({ error }, 'Experience title improvement failed');
    result.errors = result.errors ?? [];
    result.errors.push(error instanceof Error ? error.message : String(error));
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

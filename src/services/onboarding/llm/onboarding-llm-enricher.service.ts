import { createComponentLogger } from '../../../utils/logger.js';
import type { DeepScanFinding, LlmEnrichmentConfig, LlmCallFunction } from '../types.js';
import { DEFAULT_LLM_BUDGETS } from '../types.js';
import { buildEvidencePack, formatEvidencePackStats, type EvidencePack } from './evidence-pack.js';
import {
  CODE_ANALYSIS_SYSTEM_PROMPT,
  buildCodeAnalysisPrompt,
  DOCS_ANALYSIS_SYSTEM_PROMPT,
  buildDocsAnalysisPrompt,
  ADR_ANALYSIS_SYSTEM_PROMPT,
  buildAdrAnalysisPrompt,
} from './prompts/index.js';
import {
  parseCodeAnalysisResponse,
  parseDocsAnalysisResponse,
  parseAdrAnalysisResponse,
  type CodeAnalysisResult,
  type DocsAnalysisResult,
  type AdrAnalysisResult,
} from './parse-json.js';

const logger = createComponentLogger('onboarding-llm-enricher');

export interface LlmEnricherOptions {
  cwd: string;
  projectName?: string;
  detectedPatterns?: string[];
  config: LlmEnrichmentConfig;
  llmCallFn: LlmCallFunction;
}

export interface LlmEnrichmentResult {
  success: boolean;
  findings: DeepScanFinding[];
  stats: {
    callsMade: number;
    callsSucceeded: number;
    callsFailed: number;
    durationMs: number;
  };
  errors: string[];
}

interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

type LaneType = 'code' | 'docs' | 'adr';

interface LaneTask {
  type: LaneType;
  messages: LlmMessage[];
  parse: (response: string) => DeepScanFinding[];
}

export class OnboardingLlmEnricherService {
  async enrich(options: LlmEnricherOptions): Promise<LlmEnrichmentResult> {
    const startTime = Date.now();
    const { cwd, projectName, detectedPatterns, config, llmCallFn } = options;
    const budgets = { ...DEFAULT_LLM_BUDGETS, ...config.budgets };
    const areas = config.areas ?? { code: true, docs: true, adr: true };

    const findings: DeepScanFinding[] = [];
    const errors: string[] = [];
    let callsMade = 0;
    let callsSucceeded = 0;
    let callsFailed = 0;

    const evidencePack = buildEvidencePack(cwd, detectedPatterns ?? []);
    logger.debug({ stats: formatEvidencePackStats(evidencePack) }, 'Built evidence pack');

    const tasks = this.buildTasks(evidencePack, areas, projectName, detectedPatterns);

    if (tasks.length === 0) {
      logger.debug('No LLM tasks to run - evidence pack may be empty');
      return {
        success: true,
        findings: [],
        stats: {
          callsMade: 0,
          callsSucceeded: 0,
          callsFailed: 0,
          durationMs: Date.now() - startTime,
        },
        errors: [],
      };
    }

    const tasksToRun = tasks.slice(0, budgets.maxCalls);
    const results = await this.runTasksWithConcurrency(
      tasksToRun,
      llmCallFn,
      budgets.maxConcurrent,
      budgets.perCallTimeoutMs,
      budgets.overallTimeoutMs,
      startTime
    );

    for (const result of results) {
      callsMade++;
      if (result.success && result.findings) {
        callsSucceeded++;
        findings.push(...result.findings);
      } else {
        callsFailed++;
        if (result.error) {
          errors.push(`${result.type}: ${result.error}`);
        }
      }
    }

    return {
      success: callsFailed === 0,
      findings: this.deduplicateFindings(findings),
      stats: {
        callsMade,
        callsSucceeded,
        callsFailed,
        durationMs: Date.now() - startTime,
      },
      errors,
    };
  }

  private buildTasks(
    pack: EvidencePack,
    areas: { code?: boolean; docs?: boolean; adr?: boolean },
    projectName?: string,
    detectedPatterns?: string[]
  ): LaneTask[] {
    const tasks: LaneTask[] = [];

    if (areas.code && pack.code.length > 0) {
      tasks.push({
        type: 'code',
        messages: [
          { role: 'system', content: CODE_ANALYSIS_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildCodeAnalysisPrompt({
              projectName,
              codeSnippets: pack.code,
              detectedPatterns,
            }),
          },
        ],
        parse: (response) => this.parseCodeResults(response),
      });
    }

    if (areas.docs && pack.docs.length > 0) {
      tasks.push({
        type: 'docs',
        messages: [
          { role: 'system', content: DOCS_ANALYSIS_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildDocsAnalysisPrompt({
              projectName,
              docSnippets: pack.docs,
            }),
          },
        ],
        parse: (response) => this.parseDocsResults(response),
      });
    }

    if (areas.adr && pack.adrs.length > 0) {
      tasks.push({
        type: 'adr',
        messages: [
          { role: 'system', content: ADR_ANALYSIS_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildAdrAnalysisPrompt({
              projectName,
              adrSnippets: pack.adrs,
            }),
          },
        ],
        parse: (response) => this.parseAdrResults(response),
      });
    }

    return tasks;
  }

  private async runTasksWithConcurrency(
    tasks: LaneTask[],
    llmCallFn: LlmCallFunction,
    maxConcurrent: number,
    perCallTimeoutMs: number,
    overallTimeoutMs: number,
    startTime: number
  ): Promise<
    Array<{ type: LaneType; success: boolean; findings?: DeepScanFinding[]; error?: string }>
  > {
    const results: Array<{
      type: LaneType;
      success: boolean;
      findings?: DeepScanFinding[];
      error?: string;
    }> = [];

    const chunks: LaneTask[][] = [];
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      chunks.push(tasks.slice(i, i + maxConcurrent));
    }

    for (const chunk of chunks) {
      if (Date.now() - startTime > overallTimeoutMs) {
        for (const task of chunk) {
          results.push({ type: task.type, success: false, error: 'Overall timeout exceeded' });
        }
        continue;
      }

      const chunkResults = await Promise.allSettled(
        chunk.map((task) => this.runSingleTask(task, llmCallFn, perCallTimeoutMs))
      );

      for (let i = 0; i < chunkResults.length; i++) {
        const result = chunkResults[i];
        const task = chunk[i];
        if (!task) continue;

        if (result?.status === 'fulfilled') {
          results.push(result.value);
        } else if (result?.status === 'rejected') {
          results.push({
            type: task.type,
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    }

    return results;
  }

  private async runSingleTask(
    task: LaneTask,
    llmCallFn: LlmCallFunction,
    timeoutMs: number
  ): Promise<{ type: LaneType; success: boolean; findings?: DeepScanFinding[]; error?: string }> {
    try {
      const prompt = task.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');

      const responsePromise = llmCallFn(prompt);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM call timeout')), timeoutMs)
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      if (typeof response !== 'string') {
        return { type: task.type, success: false, error: 'LLM returned non-string response' };
      }

      const findings = task.parse(response);
      logger.debug({ type: task.type, findingsCount: findings.length }, 'Parsed LLM response');

      return { type: task.type, success: true, findings };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug({ type: task.type, error: message }, 'LLM task failed');
      return { type: task.type, success: false, error: message };
    }
  }

  private parseCodeResults(response: string): DeepScanFinding[] {
    const findings: DeepScanFinding[] = [];
    const parsed: CodeAnalysisResult | null = parseCodeAnalysisResponse(response);
    if (!parsed) return findings;

    for (const pattern of parsed.patterns) {
      if (pattern.confidence < 0.7) continue;
      const steps = pattern.howToAdd.map((s, i) => `${i + 1}) ${s}`).join('\n');
      findings.push({
        area: 'architecture',
        title: `How to add ${pattern.name}`,
        content: `${pattern.description}\n\nSteps:\n${steps}`,
        category: 'reference',
        confidence: pattern.confidence,
        source: 'LLM code analysis',
      });
    }

    for (const knowledge of parsed.knowledge) {
      if (knowledge.confidence < 0.7) continue;
      findings.push({
        area: 'architecture',
        title: knowledge.title,
        content: knowledge.content,
        category: knowledge.category === 'decision' ? 'decision' : 'fact',
        confidence: knowledge.confidence,
        source: knowledge.source ?? 'LLM code analysis',
      });
    }

    for (const guideline of parsed.guidelines) {
      if (guideline.confidence < 0.7) continue;
      findings.push({
        area: 'architecture',
        title: guideline.name,
        content: guideline.content,
        category: 'decision',
        confidence: guideline.confidence,
        source: 'LLM code analysis',
      });
    }

    return findings;
  }

  private parseDocsResults(response: string): DeepScanFinding[] {
    const findings: DeepScanFinding[] = [];
    const parsed: DocsAnalysisResult | null = parseDocsAnalysisResponse(response);
    if (!parsed) return findings;

    for (const knowledge of parsed.knowledge) {
      if (knowledge.confidence < 0.7) continue;
      findings.push({
        area: 'documentation',
        title: knowledge.title,
        content: knowledge.content,
        category: knowledge.category === 'decision' ? 'decision' : 'fact',
        confidence: knowledge.confidence,
        source: knowledge.source ?? 'LLM docs analysis',
      });
    }

    for (const guideline of parsed.guidelines) {
      if (guideline.confidence < 0.7) continue;
      findings.push({
        area: 'documentation',
        title: guideline.name,
        content: guideline.content,
        category: 'decision',
        confidence: guideline.confidence,
        source: 'LLM docs analysis',
      });
    }

    for (const tool of parsed.tools) {
      if (tool.confidence < 0.7) continue;
      findings.push({
        area: 'documentation',
        title: tool.name,
        content: tool.description,
        category: 'tool',
        confidence: tool.confidence,
        command: tool.command,
        source: 'LLM docs analysis',
      });
    }

    return findings;
  }

  private parseAdrResults(response: string): DeepScanFinding[] {
    const findings: DeepScanFinding[] = [];
    const parsed: AdrAnalysisResult | null = parseAdrAnalysisResponse(response);
    if (!parsed) return findings;

    for (const decision of parsed.decisions) {
      if (decision.confidence < 0.7) continue;

      let content = decision.summary;
      if (decision.rationale) {
        content += `\n\nRationale: ${decision.rationale}`;
      }
      if (decision.consequences) {
        content += `\n\nConsequences: ${decision.consequences}`;
      }

      findings.push({
        area: 'documentation',
        title: `ADR: ${decision.title}`,
        content,
        category: 'decision',
        confidence: decision.confidence,
        source: 'LLM ADR analysis',
      });
    }

    for (const knowledge of parsed.knowledge) {
      if (knowledge.confidence < 0.7) continue;
      findings.push({
        area: 'documentation',
        title: knowledge.title,
        content: knowledge.content,
        category: knowledge.category === 'decision' ? 'decision' : 'fact',
        confidence: knowledge.confidence,
        source: knowledge.source ?? 'LLM ADR analysis',
      });
    }

    return findings;
  }

  private deduplicateFindings(findings: DeepScanFinding[]): DeepScanFinding[] {
    const seen = new Set<string>();
    const unique: DeepScanFinding[] = [];

    for (const finding of findings) {
      const key = `${finding.area}:${finding.title}:${finding.content.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(finding);
      }
    }

    return unique;
  }
}

export function createOnboardingLlmEnricherService(): OnboardingLlmEnricherService {
  return new OnboardingLlmEnricherService();
}

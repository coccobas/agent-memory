import { createComponentLogger } from '../../../utils/logger.js';

const logger = createComponentLogger('llm-parse-json');

export function extractJsonFromResponse(response: string): unknown {
  try {
    let jsonStr = response.trim();

    const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch?.[1]) {
      jsonStr = fencedMatch[1].trim();
    } else {
      const braceMatch = response.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0];
      }
    }

    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed;
  } catch (error) {
    logger.debug({ err: error }, 'Failed to parse JSON from LLM response');
    return null;
  }
}

export interface ExtractedKnowledge {
  title: string;
  content: string;
  category: 'decision' | 'fact' | 'context' | 'reference';
  confidence: number;
  source?: string;
}

export interface ExtractedGuideline {
  name: string;
  content: string;
  category: string;
  priority: number;
  confidence: number;
}

export interface ExtractedTool {
  name: string;
  description: string;
  command?: string;
  confidence: number;
}

export interface CodeAnalysisResult {
  knowledge: ExtractedKnowledge[];
  guidelines: ExtractedGuideline[];
  patterns: Array<{
    name: string;
    description: string;
    howToAdd: string[];
    confidence: number;
  }>;
}

export interface DocsAnalysisResult {
  knowledge: ExtractedKnowledge[];
  guidelines: ExtractedGuideline[];
  tools: ExtractedTool[];
}

export interface AdrAnalysisResult {
  decisions: Array<{
    title: string;
    status: string;
    summary: string;
    rationale: string;
    consequences: string;
    confidence: number;
  }>;
  knowledge: ExtractedKnowledge[];
}

export function parseCodeAnalysisResponse(response: string): CodeAnalysisResult | null {
  const parsed = extractJsonFromResponse(response);
  if (!parsed) return null;

  const obj = parsed as Record<string, unknown>;

  return {
    knowledge: validateKnowledgeArray(obj.knowledge),
    guidelines: validateGuidelineArray(obj.guidelines),
    patterns: validatePatternArray(obj.patterns),
  };
}

export function parseDocsAnalysisResponse(response: string): DocsAnalysisResult | null {
  const parsed = extractJsonFromResponse(response);
  if (!parsed) return null;

  const obj = parsed as Record<string, unknown>;

  return {
    knowledge: validateKnowledgeArray(obj.knowledge),
    guidelines: validateGuidelineArray(obj.guidelines),
    tools: validateToolArray(obj.tools),
  };
}

export function parseAdrAnalysisResponse(response: string): AdrAnalysisResult | null {
  const parsed = extractJsonFromResponse(response);
  if (!parsed) return null;

  const obj = parsed as Record<string, unknown>;

  return {
    decisions: validateDecisionArray(obj.decisions),
    knowledge: validateKnowledgeArray(obj.knowledge),
  };
}

function validateKnowledgeArray(arr: unknown): ExtractedKnowledge[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidKnowledge).map((item) => ({
    title: String(item.title),
    content: String(item.content),
    category: normalizeKnowledgeCategory(item.category),
    confidence: Number(item.confidence) || 0.7,
    source: item.source ? String(item.source) : undefined,
  }));
}

function validateGuidelineArray(arr: unknown): ExtractedGuideline[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidGuideline).map((item) => ({
    name: String(item.name),
    content: String(item.content),
    category: String(item.category || 'general'),
    priority: Number(item.priority) || 50,
    confidence: Number(item.confidence) || 0.7,
  }));
}

function validateToolArray(arr: unknown): ExtractedTool[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidTool).map((item) => ({
    name: String(item.name),
    description: String(item.description),
    command: item.command ? String(item.command) : undefined,
    confidence: Number(item.confidence) || 0.7,
  }));
}

function validatePatternArray(
  arr: unknown
): Array<{ name: string; description: string; howToAdd: string[]; confidence: number }> {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidPattern).map((item) => ({
    name: String(item.name),
    description: String(item.description || ''),
    howToAdd: Array.isArray(item.howToAdd) ? item.howToAdd.map(String) : [],
    confidence: Number(item.confidence) || 0.7,
  }));
}

function validateDecisionArray(arr: unknown): Array<{
  title: string;
  status: string;
  summary: string;
  rationale: string;
  consequences: string;
  confidence: number;
}> {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isValidDecision).map((item) => ({
    title: String(item.title),
    status: String(item.status || 'accepted'),
    summary: String(item.summary || item.decision || ''),
    rationale: String(item.rationale || ''),
    consequences: String(item.consequences || ''),
    confidence: Number(item.confidence) || 0.8,
  }));
}

function isValidKnowledge(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.title === 'string' && typeof obj.content === 'string';
}

function isValidGuideline(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.content === 'string';
}

function isValidTool(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.description === 'string';
}

function isValidPattern(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.name === 'string';
}

function isValidDecision(item: unknown): item is Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.title === 'string';
}

function normalizeKnowledgeCategory(
  category: unknown
): 'decision' | 'fact' | 'context' | 'reference' {
  const str = String(category || 'fact').toLowerCase();
  if (str === 'decision') return 'decision';
  if (str === 'context') return 'context';
  if (str === 'reference') return 'reference';
  return 'fact';
}

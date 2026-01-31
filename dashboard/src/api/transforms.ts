import type {
  GuidelineWithVersion,
  KnowledgeWithVersion,
  ToolWithVersion,
  ExperienceWithVersion,
  Guideline,
  Knowledge,
  Tool,
  Experience,
} from './types';

export function flattenGuideline(g: GuidelineWithVersion): Guideline {
  return {
    id: g.id,
    name: g.name,
    content: g.currentVersion.content,
    category: g.currentVersion.category,
    priority: g.currentVersion.priority,
    rationale: g.currentVersion.rationale,
    isActive: g.isActive,
    scopeType: g.scopeType,
    scopeId: g.scopeId,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export function flattenKnowledge(k: KnowledgeWithVersion): Knowledge {
  return {
    id: k.id,
    title: k.currentVersion.title,
    content: k.currentVersion.content,
    category: k.currentVersion.category,
    confidence: k.currentVersion.confidence,
    source: k.currentVersion.source,
    isActive: k.isActive,
    scopeType: k.scopeType,
    scopeId: k.scopeId,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  };
}

export function flattenTool(t: ToolWithVersion): Tool {
  return {
    id: t.id,
    name: t.name,
    description: t.currentVersion.description,
    category: t.category, // category is at top-level, not in currentVersion
    parameters: t.currentVersion.parameters,
    constraints: t.currentVersion.constraints,
    isActive: t.isActive,
    scopeType: t.scopeType,
    scopeId: t.scopeId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function flattenExperience(e: ExperienceWithVersion): Experience {
  return {
    id: e.id,
    title: e.currentVersion.title,
    content: e.currentVersion.content,
    scenario: e.currentVersion.scenario,
    outcome: e.currentVersion.outcome,
    level: e.currentVersion.level,
    confidence: e.currentVersion.confidence,
    isActive: e.isActive,
    scopeType: e.scopeType,
    scopeId: e.scopeId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

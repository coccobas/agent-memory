/**
 * Level-Aware Prompts for Hierarchical Summarization
 *
 * Different prompts for each hierarchy level to ensure appropriate
 * granularity and context preservation.
 */

import type { HierarchyLevel, LevelPromptConfig, PromptVariables } from './types.js';

// =============================================================================
// LEVEL 0: CHUNK - Summarize Individual Entries
// =============================================================================

const LEVEL_0_SYSTEM_PROMPT = `You are a precision memory summarizer. Your task is to create concise summaries of individual memory entries while preserving all critical technical details and context.

Guidelines:
- Preserve exact technical terms, version numbers, and identifiers
- Keep action items and decisions explicit
- Maintain code snippets or commands if present
- Extract 2-5 key terms that represent core concepts
- Be precise but concise (3-5 sentences maximum)`;

const LEVEL_0_USER_TEMPLATE = `Summarize the following memory entry:

{{#if scopeContext}}
Project Context: {{scopeContext}}
{{/if}}

Entry Type: {{items.0.type}}
Title: {{items.0.title}}

Content:
"""
{{items.0.content}}
"""

{{#if focusAreas}}
Focus on: {{focusAreas}}
{{/if}}

Provide a JSON response with this structure:
{
  "title": "Brief descriptive title (max 80 chars)",
  "content": "Concise summary preserving technical details (3-5 sentences)",
  "keyTerms": ["term1", "term2", "term3"],
  "confidence": 0.95
}`;

const LEVEL_0_CONFIG: LevelPromptConfig = {
  systemPrompt: LEVEL_0_SYSTEM_PROMPT,
  userPromptTemplate: LEVEL_0_USER_TEMPLATE,
  focusInstructions: 'Preserve all technical details and action items',
  outputFormat: 'JSON with title, content, keyTerms, confidence',
};

// =============================================================================
// LEVEL 1: TOPIC - Summarize Related Topics into Themes
// =============================================================================

const LEVEL_1_SYSTEM_PROMPT = `You are a thematic memory organizer. Your task is to identify common themes across related memory entries and create a coherent thematic summary.

Guidelines:
- Identify the common thread connecting the entries
- Synthesize patterns and recurring concepts
- Preserve critical technical decisions and rationale
- Extract 5-8 key terms representing the theme
- Create a narrative that shows relationships between entries
- Length: 1-2 paragraphs`;

const LEVEL_1_USER_TEMPLATE = `Analyze and summarize the following related memory entries into a thematic summary:

{{#if scopeContext}}
Project Context: {{scopeContext}}
{{/if}}

{{#if parentSummary}}
Parent Context:
{{parentSummary}}
{{/if}}

Entries ({{itemCount}} total):
{{#each items}}
---
Type: {{this.type}}
Title: {{this.title}}
Content: {{this.content}}
{{#if this.metadata.tags}}
Tags: {{this.metadata.tags}}
{{/if}}
{{/each}}
---

{{#if focusAreas}}
Focus Areas: {{focusAreas}}
{{/if}}

Identify the unifying theme and provide a JSON response:
{
  "title": "Theme title (e.g., 'Database Migration Strategy', 'API Authentication Pattern')",
  "content": "Thematic summary showing how entries relate (1-2 paragraphs)",
  "keyTerms": ["term1", "term2", "term3", "term4", "term5"],
  "confidence": 0.85
}`;

const LEVEL_1_CONFIG: LevelPromptConfig = {
  systemPrompt: LEVEL_1_SYSTEM_PROMPT,
  userPromptTemplate: LEVEL_1_USER_TEMPLATE,
  focusInstructions: 'Identify common patterns and create thematic narrative',
  outputFormat: 'JSON with theme title, synthesized content, key terms, confidence',
};

// =============================================================================
// LEVEL 2: DOMAIN - Summarize Themes into Domain Knowledge
// =============================================================================

const LEVEL_2_SYSTEM_PROMPT = `You are a domain knowledge architect. Your task is to synthesize multiple themes into comprehensive domain-level knowledge that captures architectural decisions, patterns, and technical direction.

Guidelines:
- Create a high-level overview of the domain area
- Highlight architectural patterns and design decisions
- Show how different themes interconnect
- Extract 8-12 key terms representing domain concepts
- Include actionable insights and principles
- Identify potential areas of concern or optimization
- Length: 2-3 paragraphs`;

const LEVEL_2_USER_TEMPLATE = `Synthesize the following themes into a comprehensive domain summary:

{{#if scopeContext}}
Project Context: {{scopeContext}}
{{/if}}

{{#if parentSummary}}
Overall Context:
{{parentSummary}}
{{/if}}

Themes ({{itemCount}} total):
{{#each items}}
---
Theme: {{this.title}}
Summary: {{this.content}}
Key Terms: {{this.metadata.keyTerms}}
{{/each}}
---

{{#if focusAreas}}
Focus on: {{focusAreas}}
{{/if}}

Provide a domain-level synthesis as JSON:
{
  "title": "Domain area (e.g., 'Backend Architecture', 'Data Management Strategy')",
  "content": "Comprehensive domain summary with architectural insights (2-3 paragraphs)",
  "keyTerms": ["architecture", "pattern1", "pattern2", "technology1", "principle1", ...],
  "confidence": 0.80
}`;

const LEVEL_2_CONFIG: LevelPromptConfig = {
  systemPrompt: LEVEL_2_SYSTEM_PROMPT,
  userPromptTemplate: LEVEL_2_USER_TEMPLATE,
  focusInstructions:
    'Synthesize architectural patterns and create actionable domain knowledge',
  outputFormat: 'JSON with domain title, comprehensive summary, key concepts, confidence',
};

// =============================================================================
// LEVEL 3: GLOBAL - Create Executive Summary
// =============================================================================

const LEVEL_3_SYSTEM_PROMPT = `You are an executive knowledge synthesizer. Your task is to create a high-level strategic summary that captures the most critical insights across all domain areas.

Guidelines:
- Provide a strategic overview of the entire project/system
- Highlight key architectural decisions and their rationale
- Identify cross-domain patterns and principles
- Surface critical risks or technical debt
- Extract 10-15 key terms representing the entire knowledge base
- Focus on actionable insights for decision-making
- Length: 3-4 paragraphs
- Structure: Overview, Key Decisions, Patterns & Principles, Areas of Focus`;

const LEVEL_3_USER_TEMPLATE = `Create an executive summary from the following domain summaries:

{{#if scopeContext}}
Project: {{scopeContext}}
{{/if}}

Domain Summaries ({{itemCount}} areas):
{{#each items}}
---
Domain: {{this.title}}
Summary: {{this.content}}
Key Concepts: {{this.metadata.keyTerms}}
{{/each}}
---

{{#if focusAreas}}
Executive Focus: {{focusAreas}}
{{/if}}

Provide an executive-level synthesis as JSON:
{
  "title": "Executive Summary: {{scopeContext}}",
  "content": "Strategic overview with sections:\n1. Overview\n2. Key Architectural Decisions\n3. Technical Patterns & Principles\n4. Priority Areas & Recommendations\n(3-4 paragraphs total)",
  "keyTerms": ["strategic-term1", "architecture1", "pattern1", "decision1", "priority1", ...],
  "confidence": 0.75
}`;

const LEVEL_3_CONFIG: LevelPromptConfig = {
  systemPrompt: LEVEL_3_SYSTEM_PROMPT,
  userPromptTemplate: LEVEL_3_USER_TEMPLATE,
  focusInstructions: 'Create strategic overview with actionable insights',
  outputFormat: 'JSON with executive title, structured summary, strategic terms, confidence',
};

// =============================================================================
// PROMPT CONFIGURATION MAP
// =============================================================================

/**
 * Map of hierarchy levels to their prompt configurations
 */
export const LEVEL_PROMPTS: Record<HierarchyLevel, LevelPromptConfig> = {
  0: LEVEL_0_CONFIG,
  1: LEVEL_1_CONFIG,
  2: LEVEL_2_CONFIG,
  3: LEVEL_3_CONFIG,
};

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build prompts for a given hierarchy level
 *
 * @param level - Hierarchy level
 * @param variables - Template variables
 * @returns System and user prompts
 */
export function buildPrompts(
  level: HierarchyLevel,
  variables: PromptVariables
): { systemPrompt: string; userPrompt: string } {
  const config = LEVEL_PROMPTS[level];

  // For now, use simple template replacement (in production, use Handlebars or similar)
  let userPrompt = config.userPromptTemplate;

  // Replace variables
  userPrompt = userPrompt.replace(/\{\{scopeContext\}\}/g, variables.scopeContext || '');
  userPrompt = userPrompt.replace(/\{\{parentSummary\}\}/g, variables.parentSummary || '');
  userPrompt = userPrompt.replace(/\{\{itemCount\}\}/g, String(variables.itemCount));
  userPrompt = userPrompt.replace(/\{\{levelName\}\}/g, variables.levelName);

  // Handle focus areas
  if (variables.focusAreas && variables.focusAreas.length > 0) {
    userPrompt = userPrompt.replace(/\{\{focusAreas\}\}/g, variables.focusAreas.join(', '));
  }

  // Handle conditionals (simple if blocks)
  userPrompt = handleConditionals(userPrompt, variables);

  // Handle item iteration for levels > 0
  if (level > 0) {
    userPrompt = handleItemIteration(userPrompt, variables.items);
  }

  return {
    systemPrompt: config.systemPrompt,
    userPrompt,
  };
}

/**
 * Handle conditional blocks in templates
 */
function handleConditionals(template: string, variables: PromptVariables): string {
  let result = template;

  // Handle {{#if scopeContext}}...{{/if}}
  if (variables.scopeContext) {
    result = result.replace(/\{\{#if scopeContext\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if scopeContext\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  // Handle {{#if parentSummary}}...{{/if}}
  if (variables.parentSummary) {
    result = result.replace(/\{\{#if parentSummary\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if parentSummary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  // Handle {{#if focusAreas}}...{{/if}}
  if (variables.focusAreas && variables.focusAreas.length > 0) {
    result = result.replace(/\{\{#if focusAreas\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if focusAreas\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  return result;
}

/**
 * Handle item iteration in templates
 */
function handleItemIteration(template: string, items: PromptVariables['items']): string {
  let result = template;

  // Extract the {{#each items}}...{{/each}} block
  const eachMatch = template.match(/\{\{#each items\}\}([\s\S]*?)\{\{\/each\}\}/);
  if (!eachMatch) {
    return result;
  }

  const itemTemplate = eachMatch[1];
  const itemsText = items
    .map((item) => {
      let itemText = itemTemplate;
      itemText = itemText.replace(/\{\{this\.type\}\}/g, item.type);
      itemText = itemText.replace(/\{\{this\.title\}\}/g, item.title);
      itemText = itemText.replace(/\{\{this\.content\}\}/g, item.content);

      // Handle metadata
      if (item.metadata?.tags) {
        itemText = itemText.replace(/\{\{this\.metadata\.tags\}\}/g, item.metadata.tags.join(', '));
        itemText = itemText.replace(/\{\{#if this\.metadata\.tags\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
      } else {
        itemText = itemText.replace(/\{\{#if this\.metadata\.tags\}\}[\s\S]*?\{\{\/if\}\}/g, '');
      }

      if (item.metadata?.keyTerms) {
        itemText = itemText.replace(
          /\{\{this\.metadata\.keyTerms\}\}/g,
          item.metadata.keyTerms.join(', ')
        );
      } else {
        // Replace with empty string if no key terms
        itemText = itemText.replace(/Key Terms: \{\{this\.metadata\.keyTerms\}\}\n?/g, '');
      }

      return itemText;
    })
    .join('\n');

  result = result.replace(/\{\{#each items\}\}[\s\S]*?\{\{\/each\}\}/, itemsText);

  return result;
}

/**
 * Get fallback summary when LLM is not available
 *
 * Extracts key sentences and creates a simple summary
 *
 * @param items - Items to summarize
 * @param level - Hierarchy level
 * @returns Fallback summary
 */
export function getFallbackSummary(
  items: PromptVariables['items'],
  level: HierarchyLevel
): {
  title: string;
  content: string;
  keyTerms: string[];
} {
  if (items.length === 0) {
    return {
      title: 'Empty Summary',
      content: 'No items to summarize.',
      keyTerms: [],
    };
  }

  // Extract title
  const title =
    items.length === 1
      ? items[0].title
      : `Summary of ${items.length} ${items[0].type || 'item'}s`;

  // Extract key sentences (first sentence from each item)
  const sentences = items
    .map((item) => {
      const firstSentence = item.content.split(/[.!?]\s/)[0];
      return firstSentence ? firstSentence + '.' : item.content.substring(0, 100);
    })
    .filter(Boolean);

  const content =
    sentences.length <= 3 ? sentences.join(' ') : sentences.slice(0, 3).join(' ') + '...';

  // Extract key terms (simple word frequency)
  const words = items
    .flatMap((item) => [item.title, item.content])
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 4); // Only words > 4 chars

  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  const keyTerms = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return { title, content, keyTerms };
}

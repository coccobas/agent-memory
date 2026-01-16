/**
 * Extraction prompts for LLM-based memory extraction
 */

import type { ExtractionInput } from './providers/types.js';

// =============================================================================
// EXTRACTION SYSTEM PROMPT
// =============================================================================

export const EXTRACTION_SYSTEM_PROMPT = `You are an AI memory extraction assistant. Your job is to analyze conversation or code context and extract structured memory entries, entities, and relationships.

Extract the following types:

1. **Guidelines** - Rules, standards, or patterns that should be followed. These can be:
   - **Explicit**: Direct commands using "always", "never", "must", "should" (e.g., "always use TypeScript strict mode", "never commit secrets")
   - **Implicit**: Standards implied by descriptions of how things work:
     - "We follow [methodology/pattern]" → Extract as guideline to follow that methodology
     - "Our [code/API/service] follows [standard/convention]" → Extract as guideline to conform to that standard
     - "The codebase is organized as [pattern]" → Extract as guideline to maintain that organization
     - "We use [approach] for [purpose]" → Extract as guideline to continue using that approach
     - "[Team] decided to [approach]" → Extract as guideline if it establishes ongoing practice

2. **Knowledge** - Facts, decisions, or context worth remembering (e.g., "We chose PostgreSQL because...", "The API uses REST not GraphQL")

3. **Tools** - Commands, scripts, or tool patterns that could be reused (e.g., "npm run build", "docker compose up")

4. **Entities** - Named things referenced in the context:
   - **technology**: libraries, frameworks, databases, APIs, languages (e.g., PostgreSQL, React, REST)
   - **component**: services, modules, classes, functions (e.g., UserService, AuthMiddleware)
   - **person**: team members, authors if relevant to the project
   - **organization**: companies, teams, departments
   - **concept**: patterns, architectures, methodologies (e.g., microservices, event-driven)

5. **Relationships** - How extracted items relate to each other:
   - **depends_on**: X requires/uses Y (e.g., "UserService depends_on PostgreSQL")
   - **related_to**: X is associated with Y
   - **applies_to**: guideline/rule X applies to entity/tool Y
   - **conflicts_with**: X contradicts Y

For each extraction:
- Assign a confidence score (0-1) based on how clearly the information was stated
- Use kebab-case for names/identifiers
- Be specific and actionable
- Include rationale when the "why" is mentioned

Only extract genuinely useful information. Skip:
- Temporary debugging steps
- One-off commands that won't be reused
- Information already commonly known
- Vague or ambiguous statements
- Generic entities (e.g., "the database" without a specific name)

## CRITICAL: Noise Resistance

Do NOT extract the following types of content:

1. **Status Updates & Progress Reports** - "I'm working on X", "Just finished Y", "Almost done with Z"
   These are transient status indicators, not permanent knowledge worth storing.

2. **Personal Preferences Without Team Mandate** - "I prefer X", "I like using Y"
   Only extract preferences that are explicitly stated as team standards or project requirements.

3. **Dismissed or Rejected Technologies** - "We don't use X", "We tried Y but it didn't work"
   Negative decisions about what NOT to use are generally not actionable guidelines unless they include specific rationale worth preserving.

4. **Transient Code Review Feedback** - "Can you move this here?", "Please rename this variable"
   One-off review comments that apply only to a specific change are not reusable knowledge.

5. **Questions and Requests** - "Can you help me with X?", "What do you think about Y?"
   Questions themselves are not extractable knowledge - only answers and decisions are.

6. **Casual Conversation & Off-Topic Content** - Greetings, thanks, unrelated discussions
   Social content has no long-term knowledge value.

## CRITICAL: Atomicity Requirement

Each extracted entry MUST be atomic - containing exactly ONE concept, rule, decision, or fact.

### What is Atomic?
- ONE guideline = ONE rule or constraint
- ONE knowledge = ONE fact or ONE decision
- ONE tool = ONE command or function

### Examples of NON-ATOMIC (BAD):
- Guideline: "Always use TypeScript strict mode and never use any type" (TWO rules)
- Knowledge: "We chose PostgreSQL for persistence and Redis for caching" (TWO decisions)
- Tool: "Use prettier for formatting; use eslint for linting" (TWO tools)

### Examples of ATOMIC (GOOD):
- Guideline: "Always use TypeScript strict mode" (ONE rule)
- Guideline: "Never use the any type in TypeScript" (ONE rule)
- Knowledge: "We chose PostgreSQL for database persistence" (ONE decision)
- Knowledge: "We use Redis for caching" (ONE decision)
- Tool: "Use prettier for code formatting" (ONE tool)

### Splitting Guidance:
If you identify compound information, extract it as MULTIPLE SEPARATE entries:
- Each entry gets its own name/title
- Each entry maintains appropriate confidence
- Related entries can share tags

DO NOT combine multiple rules, facts, or tools into single entries. When in doubt, split.

Return your response as a JSON object with this exact structure:
{
  "guidelines": [
    {
      "name": "string (kebab-case identifier)",
      "content": "string (the guideline rule text)",
      "category": "string (one of: code_style, security, architecture, workflow, testing)",
      "priority": "number (0-100, where 100 is critical)",
      "rationale": "string (why this guideline exists, if mentioned)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ],
  "knowledge": [
    {
      "title": "string (descriptive title)",
      "content": "string (the knowledge content)",
      "category": "string (one of: decision, fact, context, reference)",
      "confidence": "number (0-1)",
      "source": "string (where this knowledge came from)",
      "suggestedTags": ["string"]
    }
  ],
  "tools": [
    {
      "name": "string (tool/command name)",
      "description": "string (what the tool does)",
      "category": "string (one of: cli, function, api, mcp)",
      "confidence": "number (0-1)",
      "suggestedTags": ["string"]
    }
  ],
  "entities": [
    {
      "name": "string (the entity name, e.g., PostgreSQL, UserService)",
      "entityType": "string (one of: person, technology, component, concept, organization)",
      "description": "string (brief description of what this entity is)",
      "confidence": "number (0-1)"
    }
  ],
  "relationships": [
    {
      "sourceRef": "string (name of source entry/entity)",
      "sourceType": "string (one of: guideline, knowledge, tool, entity)",
      "targetRef": "string (name of target entry/entity)",
      "targetType": "string (one of: guideline, knowledge, tool, entity)",
      "relationType": "string (one of: depends_on, related_to, applies_to, conflicts_with)",
      "confidence": "number (0-1)"
    }
  ]
}`;

/**
 * Build user prompt from extraction input
 */
export function buildUserPrompt(input: ExtractionInput): string {
  const parts: string[] = [];

  parts.push(
    `Analyze the following ${input.contextType || 'mixed'} context and extract memory entries.`
  );
  parts.push('');

  if (input.scopeHint?.projectName) {
    parts.push(`Project: ${input.scopeHint.projectName}`);
  }
  if (input.scopeHint?.language) {
    parts.push(`Language: ${input.scopeHint.language}`);
  }
  if (input.scopeHint?.domain) {
    parts.push(`Domain: ${input.scopeHint.domain}`);
  }
  if (input.focusAreas?.length) {
    parts.push(`Focus on extracting: ${input.focusAreas.join(', ')}`);
  }
  if (input.existingSummary) {
    parts.push('');
    parts.push('Previous context summary:');
    parts.push(input.existingSummary);
  }

  parts.push('');
  parts.push('Context to analyze:');
  parts.push('"""');
  parts.push(input.context);
  parts.push('"""');
  parts.push('');
  parts.push(
    'Return a JSON object with arrays for "guidelines", "knowledge", "tools", "entities", and "relationships".'
  );
  parts.push('If no entries of a particular type are found, return an empty array for that type.');

  return parts.join('\n');
}

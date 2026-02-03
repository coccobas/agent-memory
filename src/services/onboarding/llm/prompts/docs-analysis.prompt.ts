import type { DocSnippet } from '../evidence-pack.js';

export const DOCS_ANALYSIS_SYSTEM_PROMPT = `You are analyzing project documentation to extract reusable knowledge.

## YOUR TASK

Analyze README, ARCHITECTURE, and CONTRIBUTING docs to extract:

1. **Knowledge** - Facts and decisions
   - Architecture decisions and their rationale
   - Technology choices and why they were made
   - Configuration and setup information
   - Important constraints or limitations

2. **Guidelines** - Team rules and standards
   - Coding standards mentioned in docs
   - Contribution guidelines
   - Review requirements
   - Testing requirements

3. **Tools** - Commands and scripts
   - Build commands
   - Test commands
   - Deployment commands
   - Development workflows

## OUTPUT FORMAT

Return a JSON object:
{
  "knowledge": [
    {
      "title": "Descriptive title",
      "content": "The fact or decision",
      "category": "decision|fact|context|reference",
      "confidence": 0.85,
      "source": "README.md"
    }
  ],
  "guidelines": [
    {
      "name": "kebab-case-name",
      "content": "The rule or standard",
      "category": "code_style|workflow|testing|security",
      "priority": 60,
      "confidence": 0.8
    }
  ],
  "tools": [
    {
      "name": "tool-name",
      "description": "What this command does",
      "command": "npm run test",
      "confidence": 0.9
    }
  ]
}

## RULES

1. Only extract with confidence >= 0.7
2. Prefer explicit statements over inferences
3. Commands must be exact (copy-pasteable)
4. Don't extract TODO items or future plans as facts
5. Return ONLY valid JSON`;

export interface DocsAnalysisInput {
  projectName?: string;
  docSnippets: DocSnippet[];
}

export function buildDocsAnalysisPrompt(input: DocsAnalysisInput): string {
  const parts: string[] = [];

  parts.push('Analyze these documentation files from a project.');
  parts.push('');

  if (input.projectName) {
    parts.push(`Project: ${input.projectName}`);
  }

  parts.push('');
  parts.push('=== DOCUMENTATION ===');
  parts.push('');

  for (const doc of input.docSnippets) {
    parts.push(`--- ${doc.filename} (${doc.type}) ---`);
    if (doc.truncated) {
      parts.push('[Note: Document truncated]');
    }
    parts.push(doc.content);
    parts.push('');
  }

  parts.push('=== END DOCUMENTATION ===');
  parts.push('');
  parts.push('Extract knowledge, guidelines, and tools as JSON.');
  parts.push('Focus on permanent facts and reusable commands.');

  return parts.join('\n');
}

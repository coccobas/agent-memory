/**
 * Code Analysis Prompt for LLM-enhanced onboarding
 *
 * Analyzes code snippets to extract:
 * - Architecture patterns and their extension points
 * - "How to add X" guides for common operations
 * - Implicit guidelines from code conventions
 */

import type { CodeSnippet } from '../evidence-pack.js';

export const CODE_ANALYSIS_SYSTEM_PROMPT = `You are a senior engineer analyzing a codebase to help new developers understand it.

## YOUR TASK

Analyze the provided code snippets to extract:

1. **Architecture Patterns** - How the code is organized
   - What patterns are used (Repository, Service, Factory, Handler, etc.)
   - How modules communicate
   - What are the extension points

2. **"How to Add" Guides** - Step-by-step guides for common tasks
   - How to add a new API endpoint
   - How to add a new service
   - How to add a new database table/model
   - Any other common contribution patterns you detect

3. **Implicit Guidelines** - Rules inferred from consistent code patterns
   - Naming conventions
   - Error handling patterns
   - Dependency injection patterns
   - File organization conventions

## OUTPUT FORMAT

Return a JSON object with this structure:
{
  "patterns": [
    {
      "name": "Pattern Name (e.g., 'Repository Pattern')",
      "description": "Brief description of how it's implemented",
      "howToAdd": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
      "confidence": 0.85
    }
  ],
  "knowledge": [
    {
      "title": "Descriptive title",
      "content": "The fact or architectural insight",
      "category": "fact|decision|context",
      "confidence": 0.8,
      "source": "inferred from code"
    }
  ],
  "guidelines": [
    {
      "name": "kebab-case-name",
      "content": "The rule or convention",
      "category": "code_style|architecture|naming",
      "priority": 60,
      "confidence": 0.75
    }
  ]
}

## RULES

1. Only extract patterns with confidence >= 0.7
2. "howToAdd" steps should be concrete and actionable (mention file paths)
3. Don't guess - if uncertain, set lower confidence or skip
4. Focus on what helps NEW developers contribute
5. If code is truncated, work with what you have
6. Return ONLY valid JSON, no explanations outside it`;

export interface CodeAnalysisInput {
  projectName?: string;
  codeSnippets: CodeSnippet[];
  detectedPatterns?: string[];
}

export function buildCodeAnalysisPrompt(input: CodeAnalysisInput): string {
  const parts: string[] = [];

  parts.push('Analyze these code snippets from a project.');
  parts.push('');

  if (input.projectName) {
    parts.push(`Project: ${input.projectName}`);
  }

  if (input.detectedPatterns?.length) {
    parts.push(`Previously detected patterns: ${input.detectedPatterns.join(', ')}`);
    parts.push('(Verify and expand on these)');
  }

  parts.push('');
  parts.push('=== CODE SNIPPETS ===');
  parts.push('');

  for (const snippet of input.codeSnippets) {
    parts.push(`--- ${snippet.relativePath} (${snippet.purpose}) ---`);
    if (snippet.truncated) {
      parts.push('[Note: File truncated]');
    }
    parts.push('```');
    parts.push(snippet.content);
    parts.push('```');
    parts.push('');
  }

  parts.push('=== END CODE SNIPPETS ===');
  parts.push('');
  parts.push('Extract patterns, knowledge, and guidelines as JSON.');
  parts.push('Focus on actionable "How to Add" guides for new developers.');

  return parts.join('\n');
}

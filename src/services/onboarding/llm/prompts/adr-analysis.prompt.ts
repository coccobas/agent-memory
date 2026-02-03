import type { AdrSnippet } from '../evidence-pack.js';

export const ADR_ANALYSIS_SYSTEM_PROMPT = `You are analyzing Architecture Decision Records (ADRs) to extract key decisions and their context.

## YOUR TASK

ADRs document important architectural decisions. Extract:

1. **Decisions** - The core architectural choices
   - What was decided
   - Current status (accepted, deprecated, superseded)
   - Why this option was chosen over alternatives
   - What are the consequences/tradeoffs

2. **Knowledge** - Supporting facts
   - Technical constraints that influenced decisions
   - Integration requirements
   - Performance or security considerations

## OUTPUT FORMAT

Return a JSON object:
{
  "decisions": [
    {
      "title": "Decision title (from ADR)",
      "status": "accepted|deprecated|superseded|proposed",
      "summary": "What was decided (1-2 sentences)",
      "rationale": "Why this was chosen over alternatives",
      "consequences": "Positive and negative tradeoffs",
      "confidence": 0.9
    }
  ],
  "knowledge": [
    {
      "title": "Supporting fact title",
      "content": "The technical fact or constraint",
      "category": "decision|fact|context",
      "confidence": 0.85,
      "source": "ADR filename"
    }
  ]
}

## RULES

1. Each ADR typically contains ONE major decision - extract it
2. Preserve the original decision's intent
3. Include the rationale (why) - this is valuable context
4. Note if ADR is deprecated or superseded
5. Confidence should reflect ADR clarity (well-written = 0.9+)
6. Return ONLY valid JSON`;

export interface AdrAnalysisInput {
  projectName?: string;
  adrSnippets: AdrSnippet[];
}

export function buildAdrAnalysisPrompt(input: AdrAnalysisInput): string {
  const parts: string[] = [];

  parts.push('Analyze these Architecture Decision Records (ADRs).');
  parts.push('');

  if (input.projectName) {
    parts.push(`Project: ${input.projectName}`);
  }

  parts.push('');
  parts.push('=== ADRs ===');
  parts.push('');

  for (const adr of input.adrSnippets) {
    parts.push(`--- ${adr.filename}: ${adr.title} ---`);
    if (adr.truncated) {
      parts.push('[Note: ADR truncated]');
    }
    parts.push(adr.content);
    parts.push('');
  }

  parts.push('=== END ADRs ===');
  parts.push('');
  parts.push('Extract decisions and supporting knowledge as JSON.');
  parts.push('Focus on the core decision and its rationale for each ADR.');

  return parts.join('\n');
}

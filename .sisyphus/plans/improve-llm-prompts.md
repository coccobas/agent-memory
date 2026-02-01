# Improve LLM Prompts

## TL;DR

> **Quick Summary**: Rewrite all LLM prompts to be more concise, add few-shot examples, and improve extraction accuracy.
>
> **Deliverables**:
>
> - Improved extraction prompt (~60% shorter, with examples)
> - Improved summarization prompts (all 4 levels)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (each prompt builds on learnings)
> **Critical Path**: Extraction prompt -> Level 0 -> Level 1 -> Level 2 -> Level 3 -> Tests

---

## Context

### Original Request

User asked to evaluate and improve all LLM prompts in the codebase.

### Analysis Summary

Current prompts rated 7-8/10. Key issues:

- No few-shot examples
- Too verbose (token expensive)
- Missing chain-of-thought guidance
- No error handling guidance

---

## Work Objectives

### Core Objective

Improve LLM prompt quality for better extraction accuracy and token efficiency.

### Concrete Deliverables

- `src/services/extraction/prompts.ts` - Rewritten extraction prompt
- `src/services/summarization/summarizer/prompts.ts` - Rewritten summarization prompts

### Definition of Done

- [ ] All prompts have 2+ few-shot examples
- [ ] Prompts are 30%+ shorter
- [ ] Tests still pass
- [ ] Manual verification with sample inputs

### Must Have

- Few-shot examples for each prompt
- Clear output schema
- Noise filtering guidance
- Atomic entry requirement

### Must NOT Have (Guardrails)

- No hardcoded API keys or secrets
- No breaking changes to output schema (backwards compatible)
- No removal of required fields

---

## TODOs

- [ ] 1. Replace extraction prompt

  **What to do**:
  Replace the content of `EXTRACTION_SYSTEM_PROMPT` in `src/services/extraction/prompts.ts` with:

  ```typescript
  export const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Extract structured entries from context.
  ```

## EXTRACTION TYPES

**Guidelines** - Rules to follow (explicit: "always/never/must" or implicit: "we use X for Y")
**Knowledge** - Facts and decisions worth remembering
**Tools** - Reusable commands or scripts
**Entities** - Named technologies, components, people, concepts
**Relationships** - How items connect (depends_on, related_to, applies_to, conflicts_with)

## PROCESS

1. Read the context carefully
2. Identify extractable information (skip noise - see below)
3. Split compound statements into atomic entries
4. Assign confidence based on clarity (explicit=0.9+, implied=0.6-0.8, uncertain=skip)
5. Output valid JSON

## SKIP (Noise)

- Status updates ("I'm working on...", "almost done")
- Personal preferences without team mandate
- Questions and requests
- One-off review comments
- Casual conversation

## ATOMIC RULE

Each entry = exactly ONE concept.

BAD: "Use TypeScript strict mode and never use any" → TWO rules
GOOD: Split into two separate guidelines

## EXAMPLES

Input: "We always use Zod for validation. The API runs on port 3000."

Output:
{
"guidelines": [{
"name": "use-zod-for-validation",
"content": "Always use Zod for validation",
"category": "code_style",
"priority": 70,
"rationale": null,
"confidence": 0.95,
"suggestedTags": ["validation", "zod"]
}],
"knowledge": [{
"title": "API runs on port 3000",
"content": "The API server runs on port 3000",
"category": "fact",
"confidence": 0.9,
"source": "conversation",
"suggestedTags": ["api", "configuration"]
}],
"tools": [],
"entities": [{
"name": "Zod",
"entityType": "technology",
"description": "TypeScript-first schema validation library",
"confidence": 0.95
}],
"relationships": [{
"sourceRef": "use-zod-for-validation",
"sourceType": "guideline",
"targetRef": "Zod",
"targetType": "entity",
"relationType": "applies_to",
"confidence": 0.9
}]
}

Input: "Can you help me debug this? I'm stuck on the auth flow."

Output:
{
"guidelines": [],
"knowledge": [],
"tools": [],
"entities": [],
"relationships": []
}
(Questions and status updates are noise - skip them)

## OUTPUT SCHEMA

{
"guidelines": [{ "name": "kebab-case", "content": "rule text", "category": "code_style|security|architecture|workflow|testing", "priority": 0-100, "rationale": "why or null", "confidence": 0-1, "suggestedTags": [] }],
"knowledge": [{ "title": "descriptive", "content": "fact", "category": "decision|fact|context|reference", "confidence": 0-1, "source": "origin", "suggestedTags": [] }],
"tools": [{ "name": "tool-name", "description": "what it does", "category": "cli|function|api|mcp", "confidence": 0-1, "suggestedTags": [] }],
"entities": [{ "name": "Name", "entityType": "person|technology|component|concept|organization", "description": "brief", "confidence": 0-1 }],
"relationships": [{ "sourceRef": "name", "sourceType": "guideline|knowledge|tool|entity", "targetRef": "name", "targetType": "guideline|knowledge|tool|entity", "relationType": "depends_on|related_to|applies_to|conflicts_with", "confidence": 0-1 }]
}

When uncertain, skip rather than guess. Empty arrays are valid.`;

````

**Improvements made**:
- ~60% shorter (155 lines -> ~60 lines)
- Added 2 few-shot examples (positive + negative case)
- Added explicit PROCESS steps (chain-of-thought)
- Condensed noise filtering
- Clearer confidence guidance

**References**:
- `src/services/extraction/prompts.ts:11-155`

**Acceptance Criteria**:
- [ ] Prompt compiles without syntax errors
- [ ] `npm run build` passes
- [ ] Manual test: `memory_observe` with sample context returns valid JSON

**Commit**: YES
- Message: `refactor(extraction): improve extraction prompt with examples and conciseness`
- Files: `src/services/extraction/prompts.ts`

---

- [ ] 2. Replace Level 0 (Chunk) summarization prompt

**What to do**:
Replace `LEVEL_0_SYSTEM_PROMPT` in `src/services/summarization/summarizer/prompts.ts` with:

```typescript
const LEVEL_0_SYSTEM_PROMPT = `Summarize individual memory entries. Preserve technical precision.

RULES:
- Keep exact terms, versions, identifiers
- 3-5 sentences maximum
- Extract 2-5 key terms
- Preserve code snippets if present

EXAMPLE:

Input:
Type: knowledge
Title: Database Migration Strategy
Content: "We migrated from MySQL 5.7 to PostgreSQL 14 in Q3 2024. Used pgloader for the migration. Key challenge was converting stored procedures to PL/pgSQL."

Output:
{
"title": "MySQL to PostgreSQL 14 Migration",
"content": "Migrated from MySQL 5.7 to PostgreSQL 14 in Q3 2024 using pgloader. Main challenge was converting stored procedures to PL/pgSQL syntax.",
"keyTerms": ["postgresql-14", "mysql", "pgloader", "migration"],
"confidence": 0.95
}`;
````

**References**:

- `src/services/summarization/summarizer/prompts.ts:14-21`

**Acceptance Criteria**:

- [ ] Prompt compiles
- [ ] Unit tests pass: `npm test -- summarizer-prompts`

**Commit**: YES (groups with 3, 4, 5)

- Message: `refactor(summarization): improve level 0-3 prompts with examples`

---

- [ ] 3. Replace Level 1 (Topic) summarization prompt

  **What to do**:
  Replace `LEVEL_1_SYSTEM_PROMPT` with:

  ```typescript
  const LEVEL_1_SYSTEM_PROMPT = `Synthesize related entries into thematic summaries.
  ```

RULES:

- Identify the common thread
- Show relationships between entries
- 1-2 paragraphs
- Extract 5-8 key terms

EXAMPLE:

Input (3 entries about API design):

1. "REST endpoints use /api/v1 prefix"
2. "All responses include request_id header"
3. "Error responses follow RFC 7807 format"

Output:
{
"title": "API Design Standards",
"content": "The API follows REST conventions with a /api/v1 prefix for all endpoints. Response handling is standardized: every response includes a request_id header for tracing, and errors conform to RFC 7807 Problem Details format for consistent client handling.",
"keyTerms": ["rest", "api-v1", "request-id", "rfc-7807", "error-handling"],
"confidence": 0.9
}`;

````

**References**:
- `src/services/summarization/summarizer/prompts.ts:60-68`

**Acceptance Criteria**:
- [ ] Unit tests pass

---

- [ ] 4. Replace Level 2 (Domain) summarization prompt

**What to do**:
Replace `LEVEL_2_SYSTEM_PROMPT` with:

```typescript
const LEVEL_2_SYSTEM_PROMPT = `Synthesize themes into domain-level architectural knowledge.

RULES:
- High-level overview of the domain
- Highlight architectural patterns and decisions
- Show how themes interconnect
- 2-3 paragraphs
- Extract 8-12 key terms
- Include actionable insights

EXAMPLE:

Input (themes: "API Design Standards", "Authentication Flow", "Rate Limiting"):

Output:
{
"title": "Backend API Architecture",
"content": "The backend follows a RESTful architecture with versioned endpoints (/api/v1) and standardized error handling via RFC 7807. Authentication uses JWT tokens with a 15-minute access/7-day refresh pattern, validated through middleware on all protected routes.\n\nRate limiting is implemented at the gateway level using a token bucket algorithm (100 req/min for authenticated users, 20 req/min for anonymous). All three systems integrate through consistent request_id propagation for end-to-end tracing.",
"keyTerms": ["rest", "jwt", "rate-limiting", "token-bucket", "middleware", "api-gateway", "rfc-7807", "request-tracing"],
"confidence": 0.85
}`;
````

**References**:

- `src/services/summarization/summarizer/prompts.ts:116-125`

**Acceptance Criteria**:

- [ ] Unit tests pass

---

- [ ] 5. Replace Level 3 (Global) summarization prompt

  **What to do**:
  Replace `LEVEL_3_SYSTEM_PROMPT` with:

  ```typescript
  const LEVEL_3_SYSTEM_PROMPT = `Create executive-level strategic summary across all domains.
  ```

RULES:

- Strategic overview of entire system
- Key architectural decisions with rationale
- Cross-domain patterns
- Surface risks and technical debt
- 3-4 paragraphs with structure:
  1. Overview
  2. Key Decisions
  3. Patterns & Principles
  4. Priority Areas
- Extract 10-15 key terms

EXAMPLE:

Input (domains: "Backend API", "Data Layer", "Frontend Architecture"):

Output:
{
"title": "System Architecture Overview",
"content": "**Overview**: The system follows a modern three-tier architecture with a React frontend, Node.js API layer, and PostgreSQL persistence. Key design principles include API-first development, infrastructure-as-code, and comprehensive observability.\n\n**Key Decisions**: JWT-based authentication was chosen over sessions for stateless scaling. PostgreSQL was selected for ACID compliance; Redis handles caching and rate limiting. The frontend uses React Query for server state management.\n\n**Patterns**: Consistent patterns include repository pattern for data access, middleware chains for cross-cutting concerns, and feature-flag driven releases. All services emit structured logs with correlation IDs.\n\n**Priority Areas**: Technical debt exists in the legacy user service (needs TypeScript migration). Rate limiting should be enhanced with per-endpoint configuration. Consider adding read replicas as query volume grows.",
"keyTerms": ["three-tier", "jwt", "postgresql", "redis", "react-query", "repository-pattern", "feature-flags", "observability", "correlation-id", "technical-debt"],
"confidence": 0.8
}`;

````

**References**:
- `src/services/summarization/summarizer/prompts.ts:170-180`

**Acceptance Criteria**:
- [ ] Unit tests pass

---

- [ ] 6. Run full test suite

**What to do**:
```bash
npm test
````

**Acceptance Criteria**:

- [ ] All tests pass
- [ ] No regressions in extraction or summarization

**Commit**: NO (verification only)

---

- [ ] 7. Manual verification with real extraction

  **What to do**:
  Test the improved extraction prompt with real context:

  ```bash
  # Use memory_observe to test
  ```

  Test cases:
  1. Context with clear guidelines -> should extract
  2. Context with noise (questions, status) -> should return empty
  3. Compound statement -> should split into multiple entries

  **Acceptance Criteria**:
  - [ ] Extraction returns valid JSON
  - [ ] Noise is correctly filtered
  - [ ] Compound statements are split

---

## Commit Strategy

| After Task | Message                                                            | Files      |
| ---------- | ------------------------------------------------------------------ | ---------- |
| 1          | `refactor(extraction): improve extraction prompt with examples`    | prompts.ts |
| 2-5        | `refactor(summarization): improve level 0-3 prompts with examples` | prompts.ts |

---

## Success Criteria

### Verification Commands

```bash
npm test -- --grep "prompt"
npm run build
```

### Final Checklist

- [ ] All prompts have few-shot examples
- [ ] Prompts are significantly shorter
- [ ] All tests pass
- [ ] Manual extraction test succeeds

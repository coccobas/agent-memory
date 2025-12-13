---
description: Agent Memory usage examples and common workflows
globs: ["**/*"]
alwaysApply: false
related_docs: [
  ".cursor/rules/auto-memory-core.mdc",
  ".cursor/rules/auto-memory-advanced.mdc",
  ".cursor/rules/auto-memory-reference.mdc"
]
---

@context {
    "type": "examples",
    "purpose": "cursor_rules",
    "format_version": "1.0.0",
    "supported_content_types": [
        "examples",
        "workflows"
    ]
}

@structure {
    "required_sections": [
        "frontmatter",
        "title",
        "examples",
        "triggers",
        "setup"
    ]
}

# Agent Memory Examples

Practical examples of using Agent Memory tools. See `auto-memory-core.mdc` for the core workflow.

## Memory Population Triggers

**Extract Guidelines:** "We always/never do X", "Our standard is...", "The convention is...", code style/architecture patterns.

**Extract Knowledge:** "We chose X because...", "The reason we...", "We decided to...", architecture decisions, trade-offs.

**Extract Tools:** "We have a script/command for...", "Use this tool...", CLI commands, build scripts.

**From code:** Repeated patterns → guideline, architecture decisions → knowledge, utilities → tool.

## Project Setup

1. Check initialization: `memory_init` with `action: "status"`. If not initialized, use `action: "init"`.
2. Create organization (optional): `memory_org` with `action: "create"`.
3. Smart project detection: Query existing projects → Check workspace path/name → Auto-create if context clear → Prompt if ambiguous.
4. Verify: `memory_health` to check everything works.

## Examples

**Example 1:** Starting feature → Query context → Start session → Query related guidelines → Implement → Store patterns → End session.

**Example 2:** User: "We always use try-catch" → Store as guideline → Tag with "error_handling", "async".

**Example 3:** Discover PostgreSQL → Query if documented → Store as knowledge (decision) if new.

**Example 4:** Conflict detected → Ask user which to keep → Update or create new → Store resolution.

**Example 5:** Semantic conflict → Detect contradiction → Ask user to update or create new entry.

**Example 6:** Check analytics → Promote high-usage guidelines → Review low-usage ones.

**Example 7:** "This guideline applies to all API endpoints" → Store → Query API tools → Create `applies_to` relations.

**Example 8:** Working on `/src/api/users.ts` → Infer tags → Query automatically → Use results.

**Example 9:** "I think we might use Redis" → Store with confidence 0.6 → Update to 0.95 when confirmed.

**Example 10:** "Implement authentication" → Decompose into subtasks → Track completion → Link with relations.

**Example 11:** Complete workflow: Health → Context → Session/Conversation → File lock → Query → Implement → Store → Relations → End.

**Example 12:** New workspace → Detect context → Check existing → Auto-create if clear → Prompt if ambiguous.

**Example 13:** User explains architecture → Extract as knowledge (decision) → Extract pattern as guideline → Link to conversation → Tag.

**Example 14:** Notice repeated pattern → Extract as guideline with examples → Create relations → Tag.

### Example 15: Knowledge vs Guideline Classification

**Guideline (behavioral rule):** "I use Fusion 360" → Store as guideline: "Do not create CAD files. User creates CAD files using Fusion 360."

**Knowledge (fact):** "The system uses a 9733 blower" → Store as knowledge: "The system uses a 9733 blower" (category: fact)

### Example 16: Tagging Workflow

Store guideline → Tag with language (`typescript`), domain (`api`), category (`error_handling`), task (`backend`). Use 2-3 tags minimum.

### Example 17: Creating Relations

After storing related entries, use `memory_relation` with `relationType: "related_to"` to link them. Query first to find related entries, then create bidirectional relations.

### Example 18: Scope Selection

**Universal:** "Always validate user input" → Store at `global` scope (security best practice)

**Project-specific:** "This project uses PostgreSQL" → Store at `project` scope (project decision)

@version "1.1.0"
@last_updated "2025-01-13"

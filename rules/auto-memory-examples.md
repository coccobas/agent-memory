---
description: Agent Memory usage examples - consult for workflow patterns
globs: []
alwaysApply: false
---

# Agent Memory Examples

## Triggers for Storing

| User Says | Store As | Example Entry |
|-----------|----------|---------------|
| "We always/never do X" | Guideline | `{name: "no-any-types", content: "Never use any type"}` |
| "Our standard is..." | Guideline | `{name: "naming-convention", content: "Use camelCase"}` |
| "We chose X because..." | Knowledge | `{title: "DB choice", category: "decision"}` |
| "The system uses..." | Knowledge | `{title: "Auth method", category: "fact"}` |
| "Run this command..." | Tool | `{name: "build-docker", category: "cli"}` |

## Common Workflows

### Starting a Feature
1. Query context → 2. Start session → 3. Query related guidelines → 4. Implement → 5. Store patterns → 6. End session

### Storing User Preference
User: "We always use try-catch" → Store guideline → Tag: `error_handling`, `typescript`

### Discovering Architecture
Notice PostgreSQL → Query if documented → If new: store as knowledge (decision)

### Handling Conflicts
Similar entry found → Ask user which to keep → Update existing OR create new → Store resolution as knowledge

### Creating Relations
Store guideline → Query related tools → Create `applies_to` relations with `memory_relation`

## Classification Guide

| Question | If Yes → |
|----------|----------|
| Does it tell agent HOW to work? | Guideline |
| Does it describe WHAT exists? | Knowledge |
| Is it a command/script? | Tool |

**Examples:**
- "Don't create CAD files" → Guideline (behavioral instruction)
- "System uses PostgreSQL" → Knowledge (architecture fact)
- "Build with `npm run build`" → Tool (CLI command)

## Scope Selection

| Content Type | Scope |
|--------------|-------|
| Security best practices | `global` |
| Universal coding standards | `global` |
| Project decisions | `project` |
| Team conventions | `org` |
| Experimental ideas | `session` |

## Tagging Strategy

Always tag with 2-3 tags from different categories:
- **Language:** typescript, python, go
- **Domain:** api, frontend, database
- **Category:** security, workflow, code_style

Example: API error handling guideline → `typescript`, `api`, `error_handling`

## Bulk Operations

### When to Use bulk_add

Use `bulk_add` when storing **3+ related entries** at once:
- Importing multiple coding standards
- Storing a set of related decisions
- Adding multiple CLI commands

### Bulk Add Workflow

1. Prepare entries array with `scopeType` and `scopeId` in each entry
2. Call `bulk_add` with the entries array
3. Tag each returned entry by ID

```
User: "Our API standards: always validate input, use camelCase, return JSON errors"

→ memory_guideline bulk_add:
{"action": "bulk_add", "entries": [
  {"scopeType": "project", "scopeId": "proj-123", "name": "validate-input", "content": "Always validate API input", "category": "security"},
  {"scopeType": "project", "scopeId": "proj-123", "name": "camelcase-api", "content": "Use camelCase for API fields", "category": "code_style"},
  {"scopeType": "project", "scopeId": "proj-123", "name": "json-errors", "content": "Return errors in JSON format", "category": "api"}
]}

→ Response: {entries: [{id: "g-1", ...}, {id: "g-2", ...}, {id: "g-3", ...}], count: 3}

→ Tag each: memory_tag attach for g-1, g-2, g-3 with "api", "typescript"
```

### Single vs Bulk

| Scenario | Use |
|----------|-----|
| 1-2 entries | Individual `add` |
| 3+ related entries | `bulk_add` |
| Entries need different scopes | Either works (bulk supports mixed scopes) |

@version "1.0.0"
@last_updated "2025-12-18"

# MCP Tool Architecture Review

## Overview

Review all 50+ MCP tool calls in the Agent Memory codebase using an architecture-focused approach with representative samples.

## Objectives

- Evaluate the descriptor-driven architecture pattern
- Deep-dive into 10 representative tools across categories
- Identify issues by priority (P0-P3)
- Generate findings report

## Tasks

### Phase 1: Architecture Pattern Assessment

- [x] Review `src/mcp/descriptors/types.ts` - Core type system
- [x] Review `src/mcp/descriptors/index.ts` - Central registry
- [x] Review `src/mcp/tool-runner.ts` - Tool execution engine
- [x] Review `src/mcp/handlers/factory.ts` - CRUD handler factory

### Phase 2: Representative Tool Deep-Dives

- [x] Review `memory_quickstart` - UX/Composite (highest complexity)
- [x] Review `memory_guideline` - Core Memory (canonical CRUD)
- [x] Review `memory_query` - Query/Search (complex actions)
- [x] Review `memory_experience` - Experiential (custom handlers)
- [x] Review `memory_permission` - Governance (security patterns)
- [x] Review `graph_edge` - Knowledge Graph (traversal)
- [x] Review `memory_episode` - Temporal (state machine)
- [x] Review `memory_remember` - Natural Language (auto-classification)
- [x] Review `memory_consolidate` - Data Ops (batch operations)
- [x] Review `memory_librarian` - Multi-Agent (async patterns)

### Phase 3: Findings Compilation

- [x] Categorize issues by priority (P0-P3)
- [x] Identify cross-cutting patterns
- [x] Generate findings report

## Results Summary

**Completed: 2026-01-23**

| Metric               | Value  |
| -------------------- | ------ |
| Tools Reviewed       | 10/50+ |
| Critical Issues (P0) | 0      |
| High Issues (P1)     | 2      |
| Medium Issues (P2)   | 6      |
| Low Issues (P3)      | 4      |

**Overall Assessment: GOOD**

### Key Findings

**P1 (High):**

1. `memory_permission` - Missing documentation that `admin_key` is required for grant/revoke
2. `memory_consolidate` - `dryRun` defaults to false (destructive) without clear warning

**P2 (Medium):** 3. `memory_guideline` - Description too terse 4. `memory_query` - Doesn't explain search vs context difference 5. `memory_permission` - Uses snake_case params inconsistent with rest of codebase 6. `memory_quickstart` - 895 lines, handler should be in separate file 7. `graph_edge` - Missing `agentId` param for audit trail 8. `memory_consolidate` - Uses `consolidatedBy` instead of standard `agentId`

**Recommendations:**

1. Document `admin_key` requirement in `memory_permission`
2. Add safety warning to `memory_consolidate` about `dryRun` default
3. Standardize param naming across all tools
4. Extract large handlers to separate files

## Review Checklist Per Tool

**Descriptor:**

- Description is clear and LLM-friendly
- Visibility level appropriate
- All params have descriptions
- Required params marked correctly
- Enum values complete
- Param types match JSON Schema

**Handler:**

- Uses contextHandler (not legacy handler)
- Proper parameter extraction with type guards
- Errors use standard error creators
- Permission checks before writes
- Audit logging for state changes
- Result format consistent

## Priority Levels

| Priority | Criteria                      |
| -------- | ----------------------------- |
| P0       | Security risk, data loss risk |
| P1       | Incorrect behavior, crashes   |
| P2       | Poor UX, confusing docs       |
| P3       | Style, minor improvements     |

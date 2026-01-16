# Extraction Functionality Deep Dive Review

**Date**: 2025-12-30
**Status**: Review Complete
**Reviewer**: Claude Code (Opus 4.5)

---

## Executive Summary

The Agent Memory extraction system implements a sophisticated multi-layered architecture for automatically capturing knowledge from agent conversations. It combines LLM-based semantic extraction, trigger detection for opportunistic capture, incremental windowed processing, and comprehensive deduplication.

**Overall Assessment**: Production-ready with identified improvements needed.

---

## 1. Architecture Overview

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Handlers Layer                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ memory_observe tool                                       │   │
│  │ ├── extract.handler.ts (LLM extraction)                  │   │
│  │ ├── commit.handler.ts (store client entries)             │   │
│  │ ├── draft.handler.ts (generate schemas)                  │   │
│  │ └── status.handler.ts (track state)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Services Layer                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ExtractionService (extraction.service.ts)                │   │
│  │ ├── OpenAI provider (gpt-4o-mini default)                │   │
│  │ ├── Anthropic provider (claude-3-5-sonnet default)       │   │
│  │ ├── Ollama provider (local LLM)                          │   │
│  │ └── Disabled (no-op mode)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Trigger Detection Pipeline                               │   │
│  │ ├── TriggerDetector (phrase/pattern matching)            │   │
│  │ ├── TriggerOrchestrator (cooldown, filtering)            │   │
│  │ └── IncrementalMemoryObserver (extraction integration)   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Incremental Extraction                                   │   │
│  │ ├── IncrementalExtractor (sliding window)                │   │
│  │ └── CaptureStateManager (session state)                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Repository Layer                             │
│  ├── Guidelines, Knowledge, Tools repositories                  │
│  ├── Graph nodes/edges for entities & relationships             │
│  └── SQLite via Drizzle ORM                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

| Component            | File                                              | Purpose              |
| -------------------- | ------------------------------------------------- | -------------------- |
| ExtractionService    | `src/services/extraction.service.ts`              | LLM-based extraction |
| Extract Handler      | `src/mcp/handlers/observe/extract.handler.ts`     | MCP entry point      |
| Commit Handler       | `src/mcp/handlers/observe/commit.handler.ts`      | Entry storage        |
| TriggerDetector      | `src/services/extraction/trigger-detector.ts`     | Pattern detection    |
| TriggerOrchestrator  | `src/services/extraction/trigger-orchestrator.ts` | Trigger coordination |
| IncrementalExtractor | `src/services/extraction/incremental.ts`          | Sliding window       |
| IncrementalObserver  | `src/services/extraction/incremental-observer.ts` | Observer pattern     |
| CaptureStateManager  | `src/services/capture/state.ts`                   | Session state        |
| Config               | `src/config/registry/sections/extraction.ts`      | Configuration        |

---

## 2. Core Extraction Flow

### 2.1 MCP Actions

| Action    | Purpose                       | Input                           | Output                           |
| --------- | ----------------------------- | ------------------------------- | -------------------------------- |
| `extract` | LLM-based extraction          | context, scopeType, focusAreas  | entries, entities, relationships |
| `commit`  | Store pre-extracted entries   | entries[], sessionId, projectId | stored IDs                       |
| `draft`   | Generate extraction schemas   | -                               | JSON schema + prompts            |
| `status`  | Check extraction availability | -                               | provider, available, configured  |

### 2.2 Extraction Pipeline

```
Context (conversation/code)
    ↓
[Validation] → scopeId, context length, entry types
    ↓
[ExtractionService.extract()]
    ↓
[LLM API Call] → OpenAI/Anthropic/Ollama
    ↓
[Response Parsing] → JSON → ExtractedEntry[]
    ↓
[Duplicate Detection] → FTS + hash-based
    ↓
[Auto-Store] (if enabled) → repositories
    ↓
Return structured result
```

### 2.3 Provider Configuration

| Provider  | Model Default     | API Key Env                    | Notes                         |
| --------- | ----------------- | ------------------------------ | ----------------------------- |
| OpenAI    | gpt-4o-mini       | AGENT_MEMORY_OPENAI_API_KEY    | Custom base URL support       |
| Anthropic | claude-3-5-sonnet | AGENT_MEMORY_ANTHROPIC_API_KEY | Native JSON mode              |
| Ollama    | llama3.2          | -                              | Local, http://localhost:11434 |
| Disabled  | -                 | -                              | No-op mode                    |

**Auto-Detection Priority**: Anthropic → OpenAI → Ollama → Disabled

---

## 3. Trigger Detection System

### 3.1 Trigger Types

| Type               | Detection                      | Focus Areas      |
| ------------------ | ------------------------------ | ---------------- |
| `USER_CORRECTION`  | "no", "actually", "undo", etc. | rules            |
| `ERROR_RECOVERY`   | Error → success pattern        | tools, decisions |
| `ENTHUSIASM`       | "perfect", "love it", etc.     | facts, decisions |
| `REPEATED_REQUEST` | Jaccard similarity ≥0.8        | rules, tools     |
| `SURPRISE_MOMENT`  | **Not implemented**            | facts, decisions |

### 3.2 Confidence Scoring

```
USER_CORRECTION:
  Base: 0.6
  + Strong phrase: +0.15
  + Early position (<10 chars): +0.1
  + Short message: +0.05
  Threshold: 0.6

ENTHUSIASM:
  Base: 0.5
  + Strong phrase: +0.2
  + Position weight (end): +0.15 * 1.5
  + Exclamation marks: +0.03/mark (max 0.1)
  + Multiple phrases: +0.1
  Threshold: 0.6
```

### 3.3 Orchestration

- **Cooldown**: 30 seconds between extractions (configurable)
- **Filtering**: Only triggers above confidence threshold proceed
- **Statistics**: Tracks detection counts, avg confidence, cooldown filtered

---

## 4. Incremental Extraction

### 4.1 Configuration

| Parameter       | Default | Purpose                        |
| --------------- | ------- | ------------------------------ |
| windowSize      | 10      | Max turns per window           |
| windowOverlap   | 3       | Overlap for context continuity |
| minWindowTokens | 500     | Minimum to trigger extraction  |
| maxWindowTokens | 4000    | Hard limit per window          |
| minNewTurns     | 2       | Require N new turns            |

### 4.2 Sliding Window Algorithm

1. Calculate overlap start: `max(0, lastExtractionTurnIndex - windowOverlap)`
2. Check new turns: `newTurnCount >= minNewTurns`
3. Accumulate turns until token budget exhausted
4. Check minimum token threshold
5. Run extraction if all thresholds met
6. Generate summary for next window's context

### 4.3 Deduplication

```typescript
// Content hash for deduplication
normalized = content
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[^\w\s]/g, '');
hash = sha256(normalized);
```

- Session-level hash tracking
- Global hash map (cross-session)
- FTS-based similarity detection

---

## 5. Entity & Relationship Extraction

### 5.1 Entity Types

- `person` - Team members, authors
- `technology` - Libraries, frameworks, databases
- `component` - Services, modules, classes
- `concept` - Patterns, architectures
- `organization` - Companies, teams

### 5.2 Relationship Types

- `depends_on` - X requires/uses Y
- `related_to` - X associated with Y
- `applies_to` - Guideline applies to entity
- `conflicts_with` - X contradicts Y

### 5.3 Storage

- Entities stored as knowledge entries with metadata
- Relationships stored via graph edge repository
- Name-to-ID resolution for cross-referencing

---

## 6. Security Measures

### 6.1 SSRF Protection

```typescript
// Blocked patterns
IPv4: 127.*, 10.*, 172.16-31.*, 192.168.*, 169.254.*
IPv6: ::1, fe80::, fc00::/7, fd00::/8, ff00::/8
Integer IPs: Decimal (2130706433), Hex (0x7f000001)
```

- Localhost only allowed in non-production
- Custom base URL validation for OpenAI-compatible endpoints

### 6.2 Input Validation

| Check          | Limit                                                |
| -------------- | ---------------------------------------------------- |
| Context length | 100KB max                                            |
| Model name     | Alphanumeric, hyphens, underscores, dots (100 chars) |
| Response body  | Configurable max size                                |
| Timeout        | 30 seconds                                           |

### 6.3 API Key Protection

- Marked as `sensitive: true` in config
- Never logged or returned in responses

---

## 7. Test Coverage

### 7.1 Existing Tests

| Test File                                        | Coverage                                 |
| ------------------------------------------------ | ---------------------------------------- |
| `tests/unit/extraction/trigger-detector.test.ts` | Correction detection, negation filtering |
| `tests/unit/extraction/triggers.test.ts`         | Type validation, config loading          |
| `tests/integration/observe.extract.test.ts`      | Duplicate detection, auto-storage        |
| `tests/integration/observe.commit.test.ts`       | Entry normalization, auto-promotion      |
| `tests/e2e/observe-protocol.test.ts`             | MCP protocol compliance                  |

### 7.2 Coverage Gaps

- Surprise Moment detection (not implemented)
- Graph storage integration
- Ollama provider
- Incremental window edge cases
- Concurrent extraction scenarios
- Large context handling
- RL integration
- CaptureStateManager deduplication

---

## 8. Issues Found

### 8.1 Critical (P0)

#### Issue: Incomplete Surprise Moment Detection

**Location**: `src/services/extraction/trigger-detector.ts`
**Problem**: SURPRISE_MOMENT trigger type defined but never detected
**Impact**: Feature doesn't work
**Fix**: Implement detection or remove from enum

#### Issue: Global Hash Map Memory Growth

**Location**: `src/services/capture/state.ts`
**Problem**: `globalHashes` Map grows indefinitely
**Impact**: Memory leak over time
**Fix**: Add automatic cleanup on interval + LRU eviction

### 8.2 High (P1)

#### Issue: Scattered Deduplication Logic

**Locations**:

- `CaptureStateManager.isDuplicate()`
- `IncrementalExtractor.deduplicateEntries()`
- `helpers.ts storeEntry()`
- `ObserveCommitService`

**Problem**: Same logic duplicated across modules
**Fix**: Create `IDeduplicationService` interface

#### Issue: Missing Extraction Metrics

**Problem**: No observability into extraction quality
**Fix**: Implement comprehensive metrics:

```typescript
interface ExtractionMetrics {
  totalExtractions: number;
  entriesByType: Record<string, number>;
  duplicatesFiltered: number;
  avgConfidence: number;
  avgLatencyMs: number;
}
```

### 8.3 Medium (P2)

#### Issue: Performance - String Similarity O(N²)

**Location**: `src/services/extraction/trigger-detector.ts:122-134`
**Problem**: Jaccard coefficient on all message pairs
**Impact**: Slow with large message histories
**Fix**: Use embeddings for similarity, limit search window

#### Issue: Token Estimation Accuracy

**Location**: `src/services/extraction/incremental.ts:420-424`
**Problem**: 4-chars-per-token approximation varies by model
**Fix**: Provider-specific estimation factors

### 8.4 Low (P3)

- Magic numbers throughout (should be named constants)
- Mixed error handling patterns (throw vs return null)
- TriggerDetector has multiple responsibilities
- Singleton pattern in CaptureService (deprecated but exists)

---

## 9. Recommendations

### Priority Order

| Priority | Issue                              | Effort | Impact |
| -------- | ---------------------------------- | ------ | ------ |
| P0       | Fix global hash map memory leak    | Low    | High   |
| P0       | Implement/remove Surprise Moment   | Low    | Medium |
| P1       | Consolidate deduplication service  | Medium | High   |
| P1       | Add extraction metrics             | Medium | High   |
| P1       | Improve similarity performance     | High   | Medium |
| P2       | Remove CaptureService singleton    | Low    | Low    |
| P2       | Expand test coverage               | High   | Medium |
| P3       | Document design decisions (ADRs)   | Medium | Medium |
| P3       | Refactor TriggerDetector           | Medium | Low    |
| P3       | Extract magic numbers to constants | Low    | Low    |

### Suggested ADRs to Create

1. **ADR: Extraction Trigger Types** - Why these 5 types? Rationale and research
2. **ADR: Confidence Score Calibration** - How scores were determined
3. **ADR: Incremental Window Parameters** - Why 10 turns, 3 overlap, 4000 tokens
4. **ADR: Deduplication Strategy** - Hash + FTS + similarity approach

---

## 10. Verification Results

### Functional Testing (2025-12-30)

| Test                     | Result  | Notes                                     |
| ------------------------ | ------- | ----------------------------------------- |
| `memory_observe` status  | ✅ Pass | provider=openai, available=true           |
| `memory_observe` extract | ✅ Pass | Extracted guidelines, knowledge, entities |
| `memory_observe` commit  | ✅ Pass | Stored with auto-promote                  |
| Entity extraction        | ✅ Pass | PostgreSQL, MongoDB detected              |
| Relationship extraction  | ✅ Pass | depends_on, conflicts_with                |
| Duplicate detection      | ✅ Pass | Similar entries filtered                  |

### Sample Extraction Output

**Input**: 4-turn conversation about TypeScript strict mode and PostgreSQL choice

**Output**:

- 1 guideline: `typescript-strict-mode` (priority 100)
- 2 knowledge: `database choice`, `PostgreSQL features`
- 2 entities: PostgreSQL (technology), MongoDB (technology)
- 3 relationships: related_to, conflicts_with

**Performance**: 14.3 seconds, 1570 tokens

---

## 11. Strengths

1. **Multi-layered extraction** - LLM + triggers + incremental
2. **Comprehensive deduplication** - Hash + similarity + FTS
3. **Security-focused** - SSRF protection, validation, limits
4. **Flexible configuration** - Environment-based with defaults
5. **Provider flexibility** - OpenAI, Anthropic, Ollama, disabled
6. **Incremental processing** - Reduces API costs
7. **Strong typing** - TypeScript throughout

---

## 12. Conclusion

The extraction functionality is **production-ready** with the core flows working correctly. The main concerns are:

1. **Memory leak** in global hash map (must fix before scaling)
2. **Incomplete feature** (Surprise Moment trigger)
3. **Code duplication** in deduplication logic
4. **Missing observability** for extraction quality

Recommended to address P0 issues before deploying to high-volume workloads.

---

## Appendix: Configuration Reference

### Environment Variables

```bash
# Provider selection
AGENT_MEMORY_EXTRACTION_PROVIDER=openai  # openai|anthropic|ollama|disabled

# OpenAI
AGENT_MEMORY_OPENAI_API_KEY=sk-...
AGENT_MEMORY_EXTRACTION_OPENAI_MODEL=gpt-4o-mini
AGENT_MEMORY_OPENAI_BASE_URL=  # Optional, for custom endpoints

# Anthropic
AGENT_MEMORY_ANTHROPIC_API_KEY=sk-ant-...
AGENT_MEMORY_EXTRACTION_ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Ollama
AGENT_MEMORY_OLLAMA_BASE_URL=http://localhost:11434
AGENT_MEMORY_EXTRACTION_OLLAMA_MODEL=llama3.2

# Limits
AGENT_MEMORY_EXTRACTION_MAX_TOKENS=4096
AGENT_MEMORY_EXTRACTION_TEMPERATURE=0.2
```

### Confidence Thresholds

```typescript
{
  guideline: 0.75,
  knowledge: 0.70,
  tool: 0.65,
  entity: 0.70,
  relationship: 0.75,
}
```

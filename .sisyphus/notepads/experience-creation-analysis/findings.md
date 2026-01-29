# Experience Creation Code Paths Analysis

## Overview

Experiences are created through multiple code paths in the Agent Memory system. This document maps all locations where experiences are added, what triggers them, and what data is passed.

---

## 1. MANUAL EXPERIENCE CREATION (User-Initiated)

### 1.1 `memory_experience` action: `learn`

**File:** `src/mcp/handlers/experiences.handler.ts` (lines 797-888)

**Trigger:** User calls `memory_experience` with `action: 'learn'` and natural language text

**Flow:**

```
User input: "Fixed API timeout by increasing buffer size"
    ↓
learnHandler() parses text
    ↓
parseExperienceTextWithLLM() extracts components
    ↓
recordCase() creates experience
```

**Data Passed:**

- `text` (required): Natural language description
- `category` (optional): Auto-inferred from content (debugging, refactoring, api-design, etc.)
- `confidence` (optional): Defaults to 0.8
- `projectId`: Auto-detected from working directory
- `sessionId`: From context
- `agentId`: Defaults to 'claude-code'

**Parsing Patterns:**

- "Fixed X by doing Y" → scenario: X, outcome: success - Y
- "Learned that X when Y" → scenario: Y, outcome: X
- "Discovered X" → scenario: investigation, outcome: X
- "Figured out X by Y" → scenario: needed to figure out X, outcome: X - achieved by Y
- "X: Y" (colon format) → scenario: X, outcome: Y
- Fallback: first sentence as title, whole text as content

**Output:**

```json
{
  "success": true,
  "experience": {
    "id": "exp-123",
    "title": "Fixed API timeout",
    "category": "performance",
    "scenario": "API timeout issue",
    "outcome": "success - increased buffer size"
  },
  "parsed": {
    "title": "Fixed API timeout",
    "scenario": "API timeout issue",
    "outcome": "success - increased buffer size"
  }
}
```

---

### 1.2 `memory_experience` action: `record_case`

**File:** `src/mcp/handlers/experiences.handler.ts` (lines 400-487)

**Trigger:** User explicitly calls `memory_experience` with `action: 'record_case'`

**Data Passed:**

- `title` (required): Experience title
- `scenario` (required): Context/situation
- `outcome` (required): Result
- `content` (optional): Detailed description
- `category` (optional): Experience category
- `confidence` (optional): 0-1 confidence score
- `source` (optional): 'user' or 'observation'
- `trajectory` (optional): Array of steps taken
- `projectId`, `sessionId`, `agentId` (optional)

**Output:** Same as learn action

---

### 1.3 `memory_experience` action: `capture_from_transcript`

**File:** `src/mcp/handlers/experiences.handler.ts` (lines 489-604)

**Trigger:** User provides conversation transcript for experience extraction

**Data Passed:**

- `transcript` (required): Array of turn objects with role, content, timestamp, toolCalls
- `scopeType` (optional): Defaults to 'project'
- `scopeId` (optional): Project/scope ID
- `projectId`, `sessionId`, `agentId` (optional)
- `autoStore` (optional): Auto-store extracted experiences (default: true)
- `confidenceThreshold` (optional): Minimum confidence to store

**Flow:**

1. Builds metrics from transcript (turn count, token count, tool calls, errors)
2. Creates ExperienceCaptureModule
3. Calls `capture()` to extract experiences using LLM
4. Filters by confidence threshold
5. Skips duplicates

---

## 2. AUTOMATIC EXPERIENCE CREATION (System-Triggered)

### 2.1 Episode Completion

**File:** `src/services/capture/index.ts` (lines 1007-1121)

**Trigger:** Episode completes (success, failure, partial, abandoned)

**Called From:**

- `src/mcp/handlers/episodes.handler.ts` (lines 502, 628)
- When episode status changes to completed/failed/cancelled

**Data Generated:**

```typescript
{
  title: `Episode: ${episode.name}`,
  scenario: episode.description ?? 'Task execution',  // ← GENERIC FALLBACK HERE
  outcome: outcomeText,  // success/failure/partial/abandoned
  content: contentParts.join('\n'),  // outcome type, duration, conversation summary
  trajectory: steps,  // extracted from episode events
  category: 'episode-completion',
  confidence: episode.outcomeType === 'success' ? 0.85 : 0.7,
  source: 'observation',
}
```

**Key Issue:** When `episode.description` is null/undefined, defaults to generic "Task execution" scenario

**Content Includes:**

- Outcome type and duration
- Conversation summary (LLM-generated if available)
- Last 5 messages from conversation
- Trajectory steps from episode events

---

### 2.2 Tool Failure Pattern Detection

**File:** `src/services/learning/hook-learning.service.ts` (lines 319-446)

**Trigger:** Same tool fails consecutively (minFailuresForExperience times, default: 2)

**Called From:**

- `src/commands/hook/posttooluse-command.ts` (line 292)
- PostToolUse hook when tool execution fails

**Data Generated:**

```typescript
{
  title: `Tool failure pattern: ${toolName} (${errorTypes.join(', ')})`,
  scenario: `Tool "${toolName}" failed ${failures.length} times in quick succession`,
  outcome: `Failures with error types: ${errorTypes.join(', ')}`,
  content: buildToolFailureContent(),  // error types, sample messages, potential causes
  category: 'tool-failure',
  confidence: defaultConfidence (0.6),
  source: 'observation',
  createdBy: 'hook-learning',
  steps: failures.map(f => ({
    action: `Attempted to use ${toolName}`,
    observation: f.errorMessage ?? `Failed with ${f.errorType}`,
    success: false,
    timestamp: f.timestamp,
  })),
}
```

---

### 2.3 Subagent Completion

**File:** `src/services/learning/hook-learning.service.ts` (lines 500-598)

**Trigger:** Subagent completes (success or failure)

**Called From:**

- `src/commands/hook/subagent-stop-command.ts` (line 331)
- SubagentStop hook when delegated work completes

**Conditions:**

- Only creates experience if:
  - Subagent failed, OR
  - Subagent succeeded with significant results (>200 chars)

**Data Generated:**

```typescript
{
  title: event.success
    ? `Subagent insight: ${subagentType}`
    : `Subagent failure: ${subagentType}`,
  scenario: `Delegated work to ${subagentType} subagent`,
  outcome: event.success
    ? `Subagent completed successfully in ${durationMs}ms`
    : `Subagent failed to complete the task`,
  content: buildSubagentContent(),  // success/failure details, result summary, duration
  category: `subagent-${outcomeType}`,  // subagent-success or subagent-failure
  confidence: event.success ? 0.6 : 0.5,
  source: 'observation',
  createdBy: 'hook-learning',
  steps: [{
    action: `Delegated to ${subagentType} subagent`,
    observation: resultSummary,
    success: event.success,
    timestamp: event.timestamp,
    durationMs: event.durationMs,
  }],
}
```

---

### 2.4 Error Pattern Detection

**File:** `src/services/learning/hook-learning.service.ts` (lines 646-750)

**Trigger:** Error count in time window exceeds threshold (default: 3 errors in 5 minutes)

**Called From:**

- `src/commands/hook/notification-command.ts` (line 269)
- Notification hook when errors are reported

**Data Generated:**

```typescript
{
  title: `Error pattern: ${errorType}`,
  scenario: `Multiple errors of type "${errorType}" detected`,
  outcome: `${errorCount} errors in ${timeWindowMs}ms`,
  content: buildErrorPatternContent(),  // error types, sample messages, frequency
  category: 'error-pattern',
  confidence: 0.6,
  source: 'observation',
  createdBy: 'hook-learning',
  steps: errors.map(e => ({
    action: `Error occurred: ${e.type}`,
    observation: e.message,
    success: false,
    timestamp: e.timestamp,
  })),
}
```

---

### 2.5 Tool Success Knowledge Extraction

**File:** `src/services/learning/hook-learning.service.ts` (lines 800+)

**Trigger:** Tool succeeds and output contains knowledge-worthy patterns

**Called From:**

- `src/commands/hook/posttooluse-command.ts` (line 332)
- PostToolUse hook when tool succeeds

**Conditions:**

- Tool is in knowledgeExtractionTools list (Read, Grep, Glob, Bash, WebFetch)
- Output length > minOutputLengthForKnowledge (50 chars)
- Patterns detected: config, version, file structure, test results, architecture, API, database

**Creates Knowledge Entries** (not experiences, but related):

- Category: 'fact', 'context', or 'reference'
- Extracted from tool output using regex patterns

---

## 3. SESSION-END EXPERIENCE CAPTURE

### 3.1 Librarian Session End Handler

**File:** `src/services/librarian/session-lifecycle.ts` (lines 181+)

**Trigger:** Session ends (via `session_end` command or hook)

**Flow:**

1. Calls `captureService.onSessionEnd()`
2. Extracts experiences from conversation transcript
3. Generates proactive recommendations
4. Runs maintenance operations

**Data Generated:**

- Experiences extracted from full session transcript
- Proactive recommendations for guidelines, knowledge, experiences
- Patterns detected: "always", "never", error recovery, decisions, learning

---

## 4. GENERIC "Task execution" SCENARIO ISSUE

### Root Cause

**Location:** `src/services/capture/index.ts` line 1098

```typescript
scenario: episode.description ?? 'Task execution',
```

When an episode completes without a description, the scenario defaults to the generic string "Task execution".

### When This Happens

1. Episode created without explicit description
2. Episode completes
3. Experience captured from episode
4. Scenario field gets generic fallback value

### Impact

- Experiences from episodes lack context about what was actually being done
- Makes it harder to understand the scenario when reviewing experiences later
- Reduces usefulness of the experience for pattern matching

### Solution Approaches

1. **Require description on episode creation** - Enforce non-null description
2. **Generate description from episode name** - Use episode name as fallback
3. **Extract from conversation** - Summarize first user message or episode events
4. **Use episode type/category** - Infer from episode metadata
5. **Combine multiple sources** - Name + first message + event types

---

## 5. EXPERIENCE CREATION SUMMARY TABLE

| Trigger                        | Location                 | Data Source         | Scenario                                    | Confidence    | Category           |
| ------------------------------ | ------------------------ | ------------------- | ------------------------------------------- | ------------- | ------------------ |
| User `learn`                   | experiences.handler.ts   | Natural language    | Parsed from text                            | 0.8           | Auto-inferred      |
| User `record_case`             | experiences.handler.ts   | Explicit params     | User-provided                               | User-provided | User-provided      |
| User `capture_from_transcript` | experiences.handler.ts   | Transcript          | LLM-extracted                               | LLM-extracted | LLM-extracted      |
| Episode complete               | capture/index.ts         | Episode data        | episode.description or **"Task execution"** | 0.85/0.7      | episode-completion |
| Tool failure pattern           | hook-learning.service.ts | Tool failures       | Tool name + failure count                   | 0.6           | tool-failure       |
| Subagent complete              | hook-learning.service.ts | Subagent result     | Subagent type                               | 0.6/0.5       | subagent-\*        |
| Error pattern                  | hook-learning.service.ts | Error notifications | Error type                                  | 0.6           | error-pattern      |

---

## 6. KEY FINDINGS

### Generic Content Issues

1. **Episode scenario fallback** - "Task execution" is too generic
2. **Tool failure scenario** - Repeats tool name without context
3. **Error pattern scenario** - Just error type, no context

### Data Enrichment Opportunities

1. **Episode completion** - Could use episode name, first message, or event types
2. **Tool failures** - Could include what the tool was trying to do
3. **Error patterns** - Could include what operation triggered errors
4. **Subagent work** - Could include parent task context

### Confidence Scoring

- Manual entries: 0.8 (learn), user-provided (record_case)
- Automatic entries: 0.6-0.85 depending on type
- Success experiences: Higher confidence (0.85)
- Failure experiences: Lower confidence (0.5-0.7)

### Source Attribution

- User-initiated: `source: 'user'`
- System-captured: `source: 'observation'`
- Created by: `createdBy: 'hook-learning'` or `createdBy: 'claude-code'`

---

## 7. RECOMMENDATIONS FOR ENRICHMENT

### Immediate Fixes

1. **Episode scenario** - Use episode name as fallback instead of "Task execution"
2. **Tool failure scenario** - Include what operation was being attempted
3. **Error pattern scenario** - Include context about what triggered errors

### Medium-term Improvements

1. **Conversation summarization** - Extract key points from episode messages
2. **Event-based scenario generation** - Build scenario from episode events
3. **Trajectory enrichment** - Capture more detailed step information

### Long-term Enhancements

1. **LLM-based scenario generation** - Use Claude to generate rich scenarios
2. **Multi-source scenario building** - Combine name, events, messages
3. **Confidence calibration** - Learn optimal confidence scores from outcomes

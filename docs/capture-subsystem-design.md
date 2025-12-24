# Capture Subsystem Design: Automating Memory Extraction

## Overview

The Capture Subsystem is responsible for bridging the gap between raw conversation data and structured memory. It transforms ephemeral conversation logs into permanent memory artifacts.

We employ a **Hybrid Capture Strategy**:
1.  **Experiences:** Captured at **Session End**. These require the full context of the session to understand the "arc" of the problem, the strategy used, and the final outcome.
2.  **Knowledge:** Captured **Incrementally**. Facts and decisions are atomic and should be available immediately (e.g., if I set a variable in Turn 1, I expect the agent to "know" it in Turn 5).

## Objective

Automatically extract value from conversation turns by analyzing content and tool usage in real-time, without requiring manual user input or session termination.

---

## 1. The Triggers (Hooks)

### A. Incremental Hook (Knowledge)
- **Location:** `src/mcp/handlers/conversations.handler.ts` within `addMessage`.
- **Event:** `turn:completed`
- **Target:** Extracts atomic facts, context, and decisions.
- **Frequency:** Configurable via `memory.knowledgeCaptureFrequency` setting:
    - `'every_turn'`: (Default for Local LLMs) precise, real-time memory.
    - `'buffered'`: (Default for API LLMs) Analyzes every N turns or upon "significant" tool usage to save costs.
    - `'none'`: Disables incremental capture.

### B. Session Hook (Experience)
- **Location:** `src/mcp/handlers/scopes.handler.ts` within `sessionEnd`.
- **Event:** `session:ending`
- **Target:** Extracts the overall experience, strategy, and outcome.

---

## 2. The Processor (`SessionAnalysisService`)

A dedicated service (`src/services/session-analysis.service.ts`) manages the ingestion and unified analysis pipeline.

### Method: `analyzeTurn(conversationId, lastMessages)`
*Run incrementally.*
- **Input:** Sliding window of recent messages.
- **Prompt Focus:** "What *new* facts or decisions were introduced in these messages?"
- **Output:** `KnowledgeItem[]` (Fact, Decision, Context).

### Method: `analyzeSession(sessionId)`
*Run at session end.*
- **Input:** Full session transcript.
- **Prompt Focus:** "What was the user's goal? Did they succeed? What steps (trajectory) did they take?"
- **Output:** `Experience` entity (Outcome, Strategy, Trajectory).

---

## 3. Output & Storage Layers

### A. Experience Layer
Creates entries in the `experiences` table.
- **Focus:** Actions, Workflows, Outcomes.
- **Structure:** `title` (Goal), `content` (Strategy), `trajectory` (Steps).
- **Default Level:** `'case'` (anecdotal).

### B. Knowledge Layer
Creates entries in the `knowledge` table.
- **Focus:** Facts, Decisions.
- **Categories:** `fact`, `decision`, `context`, `reference`.
- **Confidence:** Assigned based on explicit user confirmation in chat or strength of evidence.
- **De-duplication:** Checks for existing knowledge with similar embedding vectors to avoid clutter.

### C. Session Enrichment
Updates `sessions.metadata` with a summary of what was captured.
- **Fields:** `capturedExperienceId`, `capturedKnowledgeIds[]`, `analysisSummary`.

---

## 4. The Handoff (Librarian Integration)

Captured artifacts serve as the input queue for the Librarian Agent.

- **Event Emission:** Emit `memory:captured` with types `experience` and `knowledge`.
- **Refinement:** The Librarian reviews these auto-generated entries to:
    - Promote frequent "Case Experiences" into "Skills".
    - Merge duplicate "Knowledge Facts" into consolidated truth.

---

## 5. Implementation Roadmap

1.  **Scaffold Service:** Create `src/services/session-analysis.service.ts` with `analyzeTurn` and `analyzeSession` methods.
2.  **Configuration:** Add `knowledgeCaptureFrequency` to the config registry.
3.  **Hook Integration (Knowledge):** Modify `conversationHandlers.addMessage` to call `analyzeTurn`.
4.  **Hook Integration (Experience):** Modify `scopeHandlers.sessionEnd` to call `analyzeSession`.
5.  **LLM Prompts:** Design distinct prompts for "Fact Extraction" (incremental) vs "Strategy Synthesis" (holistic).
6.  **Repository Dispatch:** Implement logic to write to both `ExperienceRepository` and `KnowledgeRepository`.

## Related Documents
- [Experiential Memory, Skills & Librarian Agent Plan](./experiential-memory-skills-librarian-plan.md)

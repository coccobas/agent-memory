# Intent Detection Reference

The Agent Memory system uses a pattern-based intent detection engine to route natural language requests to the appropriate memory operations. This allows agents to interact with memory using intuitive commands without needing to know specific tool schemas for every operation.

## Overview

Intent detection is the first stage of the **Unified Memory Dispatcher**. It parses user input, identifies the intended action (e.g., storing a fact, searching for a guideline), extracts relevant parameters, and calculates a confidence score.

- **Deterministic**: Uses optimized regular expressions for speed and reliability.
- **Unified Taxonomy**: Combines action-oriented intents (routing) with query-oriented intents (search optimization).
- **Confidence-Aware**: Thresholds ensure high-precision routing while allowing for clarification on ambiguous requests.

---

## Intent Types

The system uses a unified taxonomy of intents, categorized into **Action Intents** (for routing) and **Query Intents** (for search optimization).

### Action Intents (Routing)

| Intent             | Description                                   | Handler Action     |
| :----------------- | :-------------------------------------------- | :----------------- |
| `store`            | Save new guidelines, knowledge, or tools      | `store`            |
| `retrieve`         | Search for existing memory entries            | `retrieve`         |
| `session_start`    | Initialize a new working session              | `session_start`    |
| `session_end`      | Terminate the current session                 | `session_end`      |
| `episode_begin`    | Start tracking a specific task/episode        | `episode_begin`    |
| `episode_log`      | Record a checkpoint or decision in an episode | `episode_log`      |
| `episode_complete` | Mark an episode as finished with an outcome   | `episode_complete` |
| `episode_query`    | Query what happened during an episode         | `episode_query`    |
| `learn_experience` | Record a learned pattern or "case"            | `learn_experience` |
| `list`             | List entries of a specific type               | `list`             |
| `list_episodes`    | Show recent task history                      | `list_episodes`    |
| `list_sessions`    | Show recent session history                   | `list_sessions`    |
| `status`           | Show current project/session dashboard        | `status`           |
| `forget`           | Identify entries for removal/deactivation     | `forget`           |
| `update`           | Identify entries for modification             | `update`           |

### Query Intents (Search Optimization)

These intents are used internally to weight search results based on the nature of the query.

| Intent      | Purpose                              | Priority Types        |
| :---------- | :----------------------------------- | :-------------------- |
| `lookup`    | Finding specific facts or references | Knowledge, Guideline  |
| `how_to`    | Finding instructions or standards    | Guideline, Experience |
| `debug`     | Troubleshooting or post-mortem       | Experience, Knowledge |
| `explore`   | General discovery or overview        | Knowledge, Guideline  |
| `compare`   | Evaluating options or differences    | Knowledge, Experience |
| `configure` | Setup or environment rules           | Guideline, Tool       |

---

## Intent→Action Matrix

When an intent is detected, the Dispatcher routes it to specific repository or service calls:

| Intent             | Target Service / Repository                             | Parameters Extracted                        |
| :----------------- | :------------------------------------------------------ | :------------------------------------------ |
| `store`            | `repos.guidelines`, `repos.knowledge`, or `repos.tools` | `content`, `entryType`, `category`, `title` |
| `retrieve`         | `executeQueryPipeline`                                  | `query`, `tagFilter`, `entryType`           |
| `session_start`    | `repos.sessions.create`                                 | `sessionName`                               |
| `episode_begin`    | `services.episode.create` + `start`                     | `name`                                      |
| `episode_log`      | `services.episode.addEvent`                             | `message`, `eventType`                      |
| `episode_complete` | `services.episode.complete`                             | `outcome`, `outcomeType`                    |
| `episode_query`    | `services.episode.whatHappened` or `getTimeline`        | `ref` (ID or name)                          |
| `learn_experience` | `repos.experiences.create`                              | `text`                                      |
| `list`             | `repos.[type].list`                                     | `entryType`                                 |

---

## Confidence Scoring

Every detection result includes a confidence score between `0.0` and `1.0`.

### Threshold Meanings

| Level       | Threshold | System Behavior                                                          |
| :---------- | :-------- | :----------------------------------------------------------------------- |
| **Low**     | `< 0.5`   | Flagged as ambiguous. User is prompted for clarification.                |
| **Default** | `0.7`     | Standard threshold for most pattern matches.                             |
| **High**    | `0.85`    | High-precision match (e.g., explicit prefixes like `learn experience:`). |

### Calculation Logic

- **Base Score**: A single pattern match typically starts at `0.6`.
- **Boost**: Each additional matching pattern adds `+0.15` to the score (capped at `1.0`).
- **Fallback**: Generic question indicators (e.g., starting with "How do I...") without specific keywords default to `0.5`.

---

## Pattern Examples

### Storage & Retrieval

- **`store`**
  - "Remember that we use TypeScript strict mode"
  - "Guideline: Always run tests before committing"
- **`retrieve`**
  - "What do we know about the auth system?"
  - "Find guidelines tagged with security"

### Session & Episode Management

- **`session_start`**
  - "Start working on the Notion backup system"
  - "Begin a new session for bug fixing"
- **`episode_begin`**
  - "Task: Implement the login handler"
  - "Starting work on fixing the timeout error"
- **`episode_log`**
  - "Log: Found the root cause in the connection pool"
  - "Decision: Using Redis for the L2 cache"
- **`episode_complete`**
  - "Success: Fixed the memory leak"
  - "Finished task: Implemented the search API"

### Specialized Operations

- **`learn_experience`**
  - "Learn experience: Increasing the timeout fixed the flaky API tests"
- **`status`**
  - "Show status"
  - "Memory overview"

---

## Troubleshooting

### Common Misclassifications

| Issue                         | Cause                                            | Fix                                                    |
| :---------------------------- | :----------------------------------------------- | :----------------------------------------------------- |
| **Question treated as Store** | Missing question mark or question word.          | End with `?` or start with "How", "What", etc.         |
| **Store treated as Retrieve** | Using "How" or "What" in a rule description.     | Use "Remember that..." or "Guideline: ..." prefix.     |
| **Low Confidence**            | Vague input like "The system uses Node"          | Be more explicit: "Remember that the system uses Node" |
| **Wrong Entry Type**          | Ambiguous keywords (e.g., "tool" used in a fact) | Use explicit prefixes: "Fact: This tool is deprecated" |

### How to Fix

If the system misclassifies your intent:

1. **Use explicit prefixes**: `Guideline:`, `Fact:`, `Task:`, `Log:`.
2. **Add punctuation**: Use `?` for queries.
3. **Be specific**: Include keywords like "always", "never", "standard" for guidelines.

---

## Migration Notes (from Intent Unification)

The intent system was unified in version 0.9.11 (see [ADR-001](../adr/ADR-001-intent-unification.md)).

### Breaking Changes

- **Unified Taxonomy**: `Intent` and `QueryIntent` are merged into `UnifiedIntent`.
- **Handler Routing**: All intents now route through the `UnifiedMemoryDispatcher`.
- **Search Optimization**: Search weights are now automatically derived from the action intent (e.g., `retrieve` automatically uses `lookup` weights).

### Deprecations

- `QueryIntent` type is deprecated; use `UnifiedIntent` or `QueryIntentType`.
- `getMemoryTypesForIntent()` is replaced by `getSearchContextForIntent()`.

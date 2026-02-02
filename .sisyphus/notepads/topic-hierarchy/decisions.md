# Decisions - Topic Hierarchy Implementation

_This file tracks architectural choices and design decisions._

---

## [2026-02-02T12:04:14.660Z] Session Start

### Architecture Decisions

**Three-Tier Hierarchy**

- Session = Date-based temporal container
- Topic = Work context (persists across sessions)
- Episode = Specific task within topic

**Topic Lifecycle**

- Topics use status: `active` / `inactive` (NOT completed)
- Topics are ongoing work contexts, not tasks
- Episodes complete, topics don't

**Backward Compatibility**

- Keep sessionId in episodes schema
- Make topicId nullable
- Existing workflows must continue working

**LLM Strategy**

- Extract topic/episode names via LLM
- Fallback to generic names ("Topic #N") if LLM fails
- Background enrichment to improve names later

**Auto-Resume**

- Use embedding-based similarity search
- Semantic matching for topic resumption
- Configurable threshold (default 0.8)

---

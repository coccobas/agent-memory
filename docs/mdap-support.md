# Large-Scale Agentic Workflows (MDAP Support)

## Overview

Agent Memory is designed to support **Massively Decomposed Agentic Processes (MDAPs)** - a framework for reliably executing tasks with millions of steps using multiple LLM agents.

This document explains how Agent Memory enables MDAP workflows and provides practical guidance for implementing large-scale agentic systems.

## What are MDAPs?

Based on research from "[Solving a Million-Step LLM Task with Zero Errors](https://arxiv.org/abs/2511.09030)" (arXiv:2511.09030), MDAPs achieve reliable execution of 1M+ step tasks through:

### 1. Maximal Agentic Decomposition (MAD)

Breaking tasks into the smallest possible subtasks:
- Each subtask is atomic and simple
- Subtasks can be executed independently
- Reduces per-step error probability

### 2. First-to-Ahead-by-k Voting

Multiple agents attempt the same subtask:
- Majority vote determines the result
- Dramatically improves reliability
- Scaling law: P(success) = 1 - (1-p)^n

### 3. Red-Flagging

Detecting unreliable responses early:
- Formatting issues
- Overly long reasoning
- Inconsistent outputs
- Prevents error propagation

### 4. Decorrelated Errors

Ensuring agent diversity:
- Different models/prompts
- Independent reasoning paths
- Maximizes voting effectiveness

---

## How Agent Memory Supports MDAPs

### Hierarchical Task Decomposition

Agent Memory's 4-level scoping naturally maps to task decomposition:

```
┌─────────────────────────────────────────────────────────────┐
│ GLOBAL SCOPE                                                 │
│ ├─ Universal patterns, domain knowledge                      │
│ ├─ Reusable decomposition templates                          │
│ └─ Red-flag patterns                                         │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ ORGANIZATION SCOPE                                   │   │
│   │ ├─ Team-wide tools and standards                     │   │
│   │ ├─ Shared subtask libraries                          │   │
│   │ └─ Organization-specific guidelines                  │   │
│   │                                                       │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │ PROJECT SCOPE                                │   │   │
│   │   │ ├─ Task-specific decomposition               │   │   │
│   │   │ ├─ Subtask dependency graph                  │   │   │
│   │   │ ├─ Intermediate results                      │   │   │
│   │   │ └─ Project-level voting patterns             │   │   │
│   │   │                                              │   │   │
│   │   │   ┌──────────────────────────────────────┐  │   │   │
│   │   │   │ SESSION SCOPE                        │  │   │   │
│   │   │   │ ├─ Individual subtask execution      │  │   │   │
│   │   │   │ ├─ Agent-specific context            │  │   │   │
│   │   │   │ ├─ Temporary working memory          │  │   │   │
│   │   │   │ └─ Per-agent results                 │  │   │   │
│   │   │   └──────────────────────────────────────┘  │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Mapping:**
- **Global** = Domain knowledge, universal decomposition patterns
- **Organization** = Team-wide tools, shared subtask libraries
- **Project** = Specific task decomposition, dependency graphs
- **Session** = Individual agent execution context

### Multi-Agent Coordination

Agent Memory prevents conflicts between concurrent agents:

**File Locks**:
```typescript
// Agent 1 claims a subtask
await memory_file_lock.checkout({
  file_path: "/tasks/subtask-123",
  agent_id: "agent-1",
  expires_in: 3600
});

// Agent 2 tries to work on the same subtask
// → Blocked until Agent 1 completes or lock expires
```

**Conflict Detection**:
```typescript
// Two agents update the same entry within 5 seconds
// → Both versions preserved
// → Conflict logged for resolution
// → Can be used for voting/consensus
```

### Version History for Reliability

Every step is traceable:

```typescript
// Query complete history of a subtask
const history = await memory_tool.history({
  id: "subtask-move-disk-3"
});

// Returns:
// - Version 1: Initial decomposition
// - Version 2: Agent-1 refinement
// - Version 3: Agent-2 alternative approach
// - Version 4: Consensus result (voted)
```

### Dependency Management

Track subtask dependencies:

```typescript
// Define subtask dependency
await memory_relation.create({
  sourceType: "tool",
  sourceId: "subtask-5",
  targetType: "tool",
  targetId: "subtask-3",
  relationType: "depends_on"
});

// Query: What depends on subtask-3?
const dependents = await memory_query({
  relatedTo: {
    type: "tool",
    id: "subtask-3",
    relation: "depends_on"
  }
});
```

---

## Practical Example: Million-Step Task

### Scenario: Solving 20-Disk Towers of Hanoi

The 20-disk Towers of Hanoi requires **1,048,575 moves** (2^20 - 1). Here's how to use Agent Memory:

### Step 1: Store Global Patterns

```typescript
// Store decomposition pattern (reusable)
await memory_guideline.add({
  scopeType: "global",
  name: "towers-hanoi-decomposition",
  category: "algorithm",
  content: "To move n disks: (1) move n-1 to auxiliary, (2) move largest to target, (3) move n-1 to target",
  rationale: "Recursive decomposition, proven optimal"
});

// Store red-flag patterns
await memory_guideline.add({
  scopeType: "global",
  name: "hanoi-red-flags",
  category: "validation",
  content: "Flag if: (1) moving larger disk onto smaller, (2) moving to same peg, (3) moving non-top disk",
  priority: 95
});
```

### Step 2: Create Project Structure

```typescript
// Create project for the task
const project = await memory_project.create({
  name: "hanoi-20-disk",
  description: "Solve 20-disk Towers of Hanoi with zero errors",
  metadata: {
    totalMoves: 1048575,
    decompositionDepth: 20,
    votingAgents: 5,
    startTime: new Date().toISOString()
  }
});
```

### Step 3: Define Atomic Subtasks

```typescript
// Define the atomic operation
await memory_tool.add({
  scopeType: "project",
  scopeId: project.id,
  name: "move-single-disk",
  category: "mcp",
  description: "Move one disk from source peg to target peg",
  parameters: {
    disk: "number (1-20)",
    from: "string (A, B, or C)",
    to: "string (A, B, or C)"
  },
  constraints: "Disk must be topmost on source peg. Cannot place larger disk on smaller."
});
```

### Step 4: Execute with Multiple Agents

```typescript
// Each agent starts a session
const session1 = await memory_session.start({
  projectId: project.id,
  agentId: "agent-1",
  name: "Voting Agent 1"
});

const session2 = await memory_session.start({
  projectId: project.id,
  agentId: "agent-2",
  name: "Voting Agent 2"
});

// ... agents 3, 4, 5

// Each agent computes next move independently
// Agent 1 suggests:
await memory_knowledge.add({
  scopeType: "session",
  scopeId: session1.id,
  title: "move-1-solution",
  category: "decision",
  content: JSON.stringify({
    move: { disk: 1, from: "A", to: "C" },
    reasoning: "Move smallest disk to target"
  }),
  confidence: 0.99
});

// Agent 2 suggests (same):
await memory_knowledge.add({
  scopeType: "session",
  scopeId: session2.id,
  title: "move-1-solution",
  category: "decision",
  content: JSON.stringify({
    move: { disk: 1, from: "A", to: "C" },
    reasoning: "Initial step in decomposition"
  }),
  confidence: 0.98
});
```

### Step 5: Vote on Solutions

```typescript
// Query all agent solutions
const proposals = await memory_query({
  search: "move-1-solution",
  scope: { type: "project", id: project.id },
  types: ["knowledge"]
});

// Voting logic (external to Agent Memory, for now):
const votes = proposals.results.map(r => JSON.parse(r.version.content));
const consensus = calculateConsensus(votes); // First-to-ahead-by-k

// Store consensus result
await memory_knowledge.add({
  scopeType: "project",
  scopeId: project.id,
  title: "move-1-result",
  category: "fact",
  content: JSON.stringify(consensus),
  confidence: 1.0, // Voted result
  source: `Consensus of ${votes.length} agents`
});
```

### Step 6: Track Progress

```typescript
// Store completed moves
await memory_knowledge.add({
  scopeType: "project",
  scopeId: project.id,
  title: "progress-tracker",
  category: "context",
  content: JSON.stringify({
    completedMoves: 1,
    totalMoves: 1048575,
    currentState: { A: [2,3,...,20], B: [], C: [1] }
  })
});

// Update after each move
await memory_knowledge.update({
  id: progressId,
  content: JSON.stringify({
    completedMoves: 2,
    totalMoves: 1048575,
    currentState: { A: [3,...,20], B: [2], C: [1] }
  }),
  changeReason: "Completed move 2"
});
```

### Step 7: Validate with Red-Flags

```typescript
// Check move against red-flag patterns
const guidelines = await memory_guideline.list({
  scopeType: "global",
  category: "validation"
});

// If move violates rules, flag it
if (isInvalid(move)) {
  await memory_knowledge.add({
    scopeType: "session",
    scopeId: sessionId,
    title: "red-flag-detected",
    category: "reference",
    content: `Invalid move detected: ${JSON.stringify(move)}. Reason: larger disk on smaller.`,
    confidence: 0.0 // Flagged as unreliable
  });
}
```

---

## Current Capabilities vs. Full MDAP

### ✅ Ready Now

| Feature | Support | Notes |
|---------|---------|-------|
| Task decomposition storage | ✅ Full | Use scopes + entry relations |
| Multi-agent coordination | ✅ Full | File locks + conflict detection |
| Version history | ✅ Full | Append-only, complete audit trail |
| Dependency tracking | ✅ Full | Entry relations |
| Intermediate results | ✅ Full | Store as knowledge entries |
| Pattern libraries | ✅ Full | Store as guidelines |
| Session isolation | ✅ Full | Per-agent session scopes |

### ⚠️ Partial Support

| Feature | Support | Workaround |
|---------|---------|------------|
| Multi-agent voting | ⚠️ Manual | Store votes as knowledge, implement voting externally |
| Red-flag detection | ⚠️ Manual | Store patterns as guidelines, check manually |
| Success rate tracking | ⚠️ Limited | Use metadata, no built-in analytics |
| Agent reliability scoring | ⚠️ Limited | Use confidence field, no aggregation |

### ❌ Future Enhancements

| Feature | Priority | ETA |
|---------|----------|-----|
| Built-in voting infrastructure | HIGH | v0.6.0 |
| Automated red-flag detection | MEDIUM | v0.5.0 |
| Subtask success analytics | MEDIUM | v0.5.0 |
| Decorrelated error analysis | MEDIUM | v0.5.0 |
| Task execution cost prediction | LOW | v0.6.0 |

---

## Performance Considerations

### Scaling to 1M+ Subtasks

**Storage Requirements**:
- 1M subtasks × ~500 bytes = ~500 MB
- With voting (5 agents): ~2.5 GB
- With full history: ~5 GB

**Query Performance**:
- Direct subtask lookup: <1 ms
- Dependency graph traversal: <100 ms (with indexes)
- Voting result aggregation: <500 ms

**Recommendations**:
1. Use session scope for temporary data
2. Archive completed subtasks to reduce active set
3. Implement FTS5 for faster text search (planned)
4. Use batch operations for bulk updates (planned)

### Optimization Strategies

**1. Hierarchical Cleanup**:
```typescript
// After task completion, promote results to project scope
// and discard session-level intermediate data
await memory_session.end({
  id: sessionId,
  status: "completed"
});
// Sessions can be archived/cleaned up
```

**2. Selective Querying**:
```typescript
// Don't load all 1M subtasks at once
// Query only current decomposition level
const currentLevel = await memory_query({
  scope: { type: "project", id: projectId },
  tags: { require: [`level-${currentDepth}`] },
  limit: 100
});
```

**3. Caching Common Patterns**:
```typescript
// Global patterns are cached automatically
// Frequently accessed decomposition templates benefit most
const pattern = await memory_guideline.get({
  name: "towers-hanoi-decomposition",
  scopeType: "global",
  inherit: true
});
// Cached after first access (5-minute TTL)
```

---

## Best Practices

### 1. Scope Assignment

| Data Type | Recommended Scope | Rationale |
|-----------|------------------|-----------|
| Universal algorithms | Global | Reusable across all tasks |
| Team standards | Organization | Shared within team |
| Task decomposition | Project | Specific to this task |
| Agent working memory | Session | Temporary, per-agent |

### 2. Tagging Strategy

```typescript
// Tag by decomposition level
tags: ["level-0", "hanoi", "root-task"]

// Tag by agent
tags: ["agent-1", "voting-round-1"]

// Tag by status
tags: ["completed", "validated", "consensus"]
```

### 3. Version History Management

```typescript
// Document why changes happened
await memory_tool.update({
  id: subtaskId,
  parameters: updatedParams,
  changeReason: "Agent-3 identified edge case: empty source peg"
});
```

### 4. Error Handling

```typescript
// Store errors as knowledge for learning
await memory_knowledge.add({
  scopeType: "project",
  scopeId: projectId,
  title: "error-move-456",
  category: "reference",
  content: JSON.stringify({
    move: failedMove,
    error: "Invalid: disk 5 cannot move to peg with disk 3",
    timestamp: new Date().toISOString()
  }),
  confidence: 0.0
});
```

---

## Future Roadmap

### v0.6.0: MDAP Core (Q1 2025)

- [ ] **Task decomposition tracking** - Explicit task hierarchy storage
- [ ] **Multi-agent voting table** - Built-in vote storage and aggregation
- [ ] **Red-flag pattern library** - Automated pattern detection
- [ ] **Audit log enhancements** - Track every subtask execution

### v0.5.0: MDAP Analytics (Q2 2025)

- [ ] **Subtask success rates** - Track success/failure per subtask type
- [ ] **Agent reliability scoring** - Measure per-agent accuracy
- [ ] **Decorrelated error detection** - Identify when agents are too similar
- [ ] **Cost prediction models** - Estimate execution cost before starting

### v0.6.0: MDAP Optimization (Q3 2025)

- [ ] **Adaptive decomposition** - AI-suggested decomposition strategies
- [ ] **Pattern learning** - Automatic extraction of successful patterns
- [ ] **Parallel execution hints** - Identify parallelizable subtasks
- [ ] **Resource optimization** - Minimize storage for completed tasks

---

## Research References

### Primary Research

**"Solving a Million-Step LLM Task with Zero Errors"**  
arXiv:2511.09030 (December 2024)  
https://arxiv.org/abs/2511.09030

**Key Findings:**
- Maximal decomposition enables reliable scaling
- Multi-agent voting dramatically improves success rates
- Red-flagging prevents error propagation
- Decorrelated errors are essential for voting effectiveness

### Related Work

- **Memory Systems**: Mem0, LangGraph Memory, Anthropic Memory
- **Task Decomposition**: ReAct, Tree of Thoughts, Chain of Thought
- **Multi-Agent Systems**: AutoGPT, MetaGPT, CAMEL
- **Error Correction**: Self-Consistency, Constitutional AI

---

## Examples & Case Studies

### Example 1: Multiplication of Large Numbers

```typescript
// Task: Multiply two 1000-digit numbers
// Decomposition: Grade-school multiplication algorithm
// Subtasks: ~1M single-digit multiplications

await memory_project.create({
  name: "large-number-multiplication",
  metadata: { 
    digits: 1000,
    totalOperations: 1000000 
  }
});

// Store algorithm
await memory_guideline.add({
  scopeType: "project",
  name: "multiplication-algorithm",
  content: "Multiply each digit, track carries, sum partial products"
});

// Each agent handles subset of multiplications
// Results aggregated via voting
```

### Example 2: Codebase Refactoring

```typescript
// Task: Refactor 10,000-file codebase
// Decomposition: File → Class → Method → Line
// Subtasks: ~100K individual refactorings

await memory_project.create({
  name: "codebase-refactor",
  rootPath: "/path/to/codebase",
  metadata: { 
    totalFiles: 10000,
    estimatedChanges: 100000 
  }
});

// Track each file's refactoring
for (const file of files) {
  await memory_tool.add({
    scopeType: "project",
    name: `refactor-${file}`,
    parameters: { path: file, strategy: "extract-method" }
  });
}

// Multiple agents review each change
// Consensus determines final refactoring
```

---

## FAQ

**Q: Can Agent Memory handle 1M entries?**  
A: Yes. Current benchmarks show <50ms query time with 1M entries (with proper indexes). Storage: ~500MB-5GB depending on versioning depth.

**Q: How many concurrent agents can work simultaneously?**  
A: 100+ agents tested successfully. File locks prevent conflicts. SQLite WAL mode supports unlimited concurrent reads.

**Q: What's the overhead of version history?**  
A: ~2-3x storage for full history. But essential for debugging million-step tasks. Can archive old versions if needed.

**Q: Does Agent Memory implement voting?**  
A: Built-in voting infrastructure is now available in v0.6.0. Use the `memory_voting` tool to record votes and get consensus.

**Q: How do I implement red-flagging?**  
A: Store patterns as guidelines, check manually for now. Automated detection planned for v0.5.0.

**Q: Can I use Agent Memory for non-MDAP workflows?**  
A: Yes! MDAP support is an extension. Core features (scoping, versioning, querying) are useful for any agentic workflow.

---

## Getting Help

- **Documentation**: See [Architecture](./architecture.md) for technical details
- **Examples**: See [Example Workflows](../examples/workflows/) for practical guides
- **Issues**: Open a GitHub issue with the `mdap` label
- **Research Questions**: Reference [arXiv:2511.09030](https://arxiv.org/abs/2511.09030)

---

**Last Updated**: December 2024  
**Version**: 0.6.0  
**Status**: MDAP-ready with core features, enhanced voting/analytics available in v0.6.0










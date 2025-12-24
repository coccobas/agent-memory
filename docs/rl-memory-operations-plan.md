# Reinforcement Learning for Memory Operations

> Implementation Plan for Agent Memory
> Generated: 2025-12-24
> Status: **IMPLEMENTED** (v0.10.0)

---

## Implementation Summary

All components have been implemented and are ready for use:

| Component | Status | Files |
|-----------|--------|-------|
| Feedback Schema | ✅ Complete | `src/db/migrations/0018_add_rl_feedback.sql`, `src/db/schema/feedback.ts` |
| Feedback Service | ✅ Complete | `src/services/feedback/` (11 files) |
| Query Pipeline Integration | ✅ Complete | `src/services/query/index.ts` |
| Session Outcome Recording | ✅ Complete | `src/mcp/handlers/scopes.handler.ts` |
| RL Config Section | ✅ Complete | `src/config/registry/sections/rl.ts` |
| Base Policy Interface | ✅ Complete | `src/services/rl/policies/base.policy.ts` |
| Extraction Policy | ✅ Complete | `src/services/rl/policies/extraction.policy.ts` |
| Retrieval Policy | ✅ Complete | `src/services/rl/policies/retrieval.policy.ts` |
| Consolidation Policy | ✅ Complete | `src/services/rl/policies/consolidation.policy.ts` |
| State Builders | ✅ Complete | `src/services/rl/state/` (3 files) |
| Reward Calculators | ✅ Complete | `src/services/rl/rewards/` (3 files) |
| Training Infrastructure | ✅ Complete | `src/services/rl/training/` (4 files) |
| Capture Service Integration | ✅ Complete | `src/services/capture/index.ts` |
| Librarian Integration | ✅ Complete | `src/services/librarian/index.ts` |
| MCP Handlers | ✅ Complete | `src/mcp/handlers/feedback.handler.ts`, `src/mcp/handlers/rl.handler.ts` |
| CLI Commands | ✅ Complete | `src/cli/commands/rl.ts` |

### Quick Start

```bash
# Check RL status
agent-memory rl status

# View feedback statistics
agent-memory rl feedback

# Train extraction policy
agent-memory rl train extraction --min-examples 1000

# Enable/disable policies
agent-memory rl enable extraction
agent-memory rl enable retrieval --disable
```

### Kill Switch

```bash
# Disable all RL policies (use threshold-based fallbacks)
export AGENT_MEMORY_RL_ENABLED=false

# Disable specific policy
export AGENT_MEMORY_RL_EXTRACTION_ENABLED=false
```

---

## Executive Summary

This plan implements three RL-optimized policies for memory operations:
1. **Extraction Policy** - What to store
2. **Retrieval Policy** - When to retrieve
3. **Consolidation Policy** - How to consolidate

The implementation extends the existing Librarian Agent pattern, reuses the capture service infrastructure, and introduces a new **Feedback Collection System** as the foundation for all RL training.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RL Memory System                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Extraction  │    │  Retrieval   │    │Consolidation │          │
│  │    Policy    │    │    Policy    │    │    Policy    │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │  Policy Trainer │                              │
│                    │  (Offline RL)   │                              │
│                    └────────┬────────┘                              │
│                             │                                       │
│                    ┌────────▼────────┐                              │
│                    │    Feedback     │                              │
│                    │   Collection    │                              │
│                    │     System      │                              │
│                    └────────┬────────┘                              │
│                             │                                       │
│         ┌───────────────────┼───────────────────┐                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Capture    │    │    Query     │    │  Librarian   │          │
│  │   Service    │    │   Pipeline   │    │    Agent     │          │
│  │  (existing)  │    │  (existing)  │    │  (existing)  │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Feedback Collection System

**Goal:** Build the data infrastructure required for all RL policies.

### 1.1 Database Schema

```sql
-- File: src/db/migrations/0018_add_rl_feedback.sql

-- Track every memory retrieval event
CREATE TABLE memory_retrievals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  query_text TEXT,
  query_embedding BLOB,
  entry_type TEXT NOT NULL,  -- tool|guideline|knowledge|experience
  entry_id TEXT NOT NULL,
  retrieval_rank INTEGER,     -- Position in results (1-based)
  retrieval_score REAL,       -- Score from query pipeline
  retrieved_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Track task outcomes linked to retrievals
CREATE TABLE task_outcomes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  conversation_id TEXT,
  outcome_type TEXT NOT NULL,  -- success|failure|partial|unknown
  outcome_signal TEXT,         -- How outcome was determined
  confidence REAL DEFAULT 1.0,
  outcome_at TEXT NOT NULL,
  metadata TEXT,               -- JSON: error messages, user feedback, etc.
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Link retrievals to outcomes (many-to-many)
CREATE TABLE retrieval_outcomes (
  id TEXT PRIMARY KEY,
  retrieval_id TEXT NOT NULL,
  outcome_id TEXT NOT NULL,
  contribution_score REAL,     -- Did this retrieval help? (-1 to 1)
  attribution_method TEXT,     -- How contribution was calculated
  created_at TEXT NOT NULL,
  FOREIGN KEY (retrieval_id) REFERENCES memory_retrievals(id),
  FOREIGN KEY (outcome_id) REFERENCES task_outcomes(id)
);

-- Track extraction decisions
CREATE TABLE extraction_decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_number INTEGER,
  decision TEXT NOT NULL,      -- store|skip|defer
  entry_type TEXT,             -- If stored: tool|guideline|knowledge|experience
  entry_id TEXT,               -- If stored: the created entry ID
  context_hash TEXT,           -- Hash of context used for decision
  confidence REAL,             -- Extraction confidence
  decided_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Track extraction outcomes (was stored entry ever useful?)
CREATE TABLE extraction_outcomes (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  retrieval_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  last_retrieved_at TEXT,
  outcome_score REAL,          -- Computed reward
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES extraction_decisions(id)
);

-- Track consolidation decisions
CREATE TABLE consolidation_decisions (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  action TEXT NOT NULL,        -- merge|dedupe|archive|keep
  source_entry_ids TEXT,       -- JSON array
  target_entry_id TEXT,        -- If merged: result entry
  similarity_score REAL,
  decided_at TEXT NOT NULL,
  decided_by TEXT              -- agent|librarian|user
);

-- Track consolidation outcomes
CREATE TABLE consolidation_outcomes (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  pre_retrieval_rate REAL,     -- Retrieval rate before consolidation
  post_retrieval_rate REAL,    -- Retrieval rate after
  pre_success_rate REAL,
  post_success_rate REAL,
  evaluation_window_days INTEGER,
  outcome_score REAL,          -- Computed reward
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES consolidation_decisions(id)
);

-- Indexes for efficient querying
CREATE INDEX idx_retrievals_session ON memory_retrievals(session_id);
CREATE INDEX idx_retrievals_entry ON memory_retrievals(entry_type, entry_id);
CREATE INDEX idx_outcomes_session ON task_outcomes(session_id);
CREATE INDEX idx_extraction_session ON extraction_decisions(session_id);
CREATE INDEX idx_extraction_entry ON extraction_decisions(entry_id);
```

### 1.2 Feedback Collection Service

```
src/services/feedback/
├── index.ts                    # FeedbackService coordinator
├── types.ts                    # Types and interfaces
├── collectors/
│   ├── retrieval.collector.ts  # Track query pipeline retrievals
│   ├── outcome.collector.ts    # Track task outcomes
│   └── extraction.collector.ts # Track extraction decisions
├── evaluators/
│   ├── attribution.ts          # Compute retrieval contribution
│   ├── extraction-reward.ts    # Compute extraction rewards
│   └── consolidation-reward.ts # Compute consolidation rewards
└── repositories/
    ├── retrieval.repository.ts
    ├── outcome.repository.ts
    └── decision.repository.ts
```

**FeedbackService Interface:**

```typescript
interface IFeedbackService {
  // Retrieval tracking
  recordRetrieval(params: RecordRetrievalParams): Promise<string>;
  recordRetrievalBatch(retrievals: RecordRetrievalParams[]): Promise<string[]>;

  // Outcome tracking
  recordOutcome(params: RecordOutcomeParams): Promise<string>;
  linkRetrievalsToOutcome(outcomeId: string, retrievalIds: string[]): Promise<void>;

  // Extraction tracking
  recordExtractionDecision(params: ExtractionDecisionParams): Promise<string>;
  evaluateExtractionOutcome(decisionId: string): Promise<ExtractionOutcomeResult>;

  // Consolidation tracking
  recordConsolidationDecision(params: ConsolidationDecisionParams): Promise<string>;
  evaluateConsolidationOutcome(decisionId: string, windowDays: number): Promise<ConsolidationOutcomeResult>;

  // Training data export
  exportTrainingData(params: ExportParams): Promise<TrainingDataset>;
}
```

### 1.3 Integration Points

**Query Pipeline Integration** (`src/services/query/pipeline.ts`):
```typescript
// After Stage 8 (FORMAT), add feedback recording
async function executePipeline(params: QueryParams): Promise<QueryResult> {
  const result = await runStages(params);

  // Record retrievals for RL feedback
  if (params.sessionId && result.results.length > 0) {
    await feedbackService.recordRetrievalBatch(
      result.results.map((r, idx) => ({
        sessionId: params.sessionId,
        queryText: params.search,
        entryType: r.type,
        entryId: r.id,
        retrievalRank: idx + 1,
        retrievalScore: r.score
      }))
    );
  }

  return result;
}
```

**Capture Service Integration** (`src/services/capture/index.ts`):
```typescript
// Record extraction decisions
async onTurnComplete(sessionId: string, turn: TurnInfo): Promise<CaptureResult> {
  const decision = await this.evaluateExtraction(turn);

  await feedbackService.recordExtractionDecision({
    sessionId,
    turnNumber: turn.number,
    decision: decision.action,  // 'store' | 'skip' | 'defer'
    entryType: decision.entryType,
    entryId: decision.entryId,
    confidence: decision.confidence
  });

  if (decision.action === 'store') {
    return this.executeExtraction(decision);
  }
  return null;
}
```

**Session End Hook** (`src/mcp/handlers/scopes.handler.ts`):
```typescript
// Infer outcome from session end state
async handleSessionEnd(sessionId: string, status: string): Promise<void> {
  const outcomeType = inferOutcomeFromStatus(status);

  await feedbackService.recordOutcome({
    sessionId,
    outcomeType,
    outcomeSignal: 'session_status',
    confidence: 0.7  // Lower confidence for inferred outcomes
  });

  // Link all retrievals from this session to the outcome
  const retrievals = await feedbackService.getSessionRetrievals(sessionId);
  await feedbackService.linkRetrievalsToOutcome(outcomeId, retrievals.map(r => r.id));
}
```

### 1.4 Outcome Signal Detection

Multiple signals for determining task success:

| Signal | Confidence | Detection Method |
|--------|------------|------------------|
| Explicit user feedback | 1.0 | User says "that worked" / "that's wrong" |
| Session status | 0.7 | `completed` vs `discarded` |
| Error absence | 0.6 | No tool errors in subsequent turns |
| Follow-up queries | 0.5 | User asks related questions (partial success) |
| Retry patterns | 0.3 | User retries same task (failure signal) |

**LLM-based outcome inference** (optional, high accuracy):
```typescript
async function inferOutcomeFromTranscript(
  transcript: Message[],
  retrievedEntries: RetrievalRecord[]
): Promise<OutcomeInference> {
  const prompt = `
    Given this conversation transcript and the memory entries that were retrieved,
    determine:
    1. Was the task completed successfully? (success/failure/partial/unknown)
    2. Which retrieved entries contributed positively? (list IDs)
    3. Which retrieved entries were irrelevant or harmful? (list IDs)
    4. Confidence in this assessment (0-1)

    Transcript: ${formatTranscript(transcript)}
    Retrieved entries: ${formatEntries(retrievedEntries)}
  `;

  return await llm.generate(prompt, OutcomeInferenceSchema);
}
```

---

## Phase 2: Extraction Policy

**Goal:** Learn what to store from conversations.

### 2.1 Policy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extraction Policy                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  State: [context_embedding, memory_state, turn_features]       │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────┐                   │
│  │           Policy Network                 │                   │
│  │  (Fine-tuned LLM or learned classifier) │                   │
│  └─────────────────────────────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│  Action: { decision: store|skip|defer,                         │
│            entryType: tool|guideline|knowledge|experience,     │
│            priority: 0-100,                                     │
│            confidence: 0-1 }                                    │
│                                                                 │
│  Reward: future_retrieval_success - storage_cost               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 State Representation

```typescript
interface ExtractionState {
  // Context features
  contextEmbedding: number[];        // Embedding of conversation context
  turnFeatures: {
    turnNumber: number;
    tokenCount: number;
    toolCallCount: number;
    hasError: boolean;
    topicShift: number;              // Cosine distance from previous turn
  };

  // Memory state features
  memoryState: {
    totalEntries: number;
    recentExtractions: number;       // Extractions in last N turns
    similarEntryExists: boolean;     // Embedding similarity > 0.9
    scopeCapacity: number;           // Entries / max capacity
  };

  // Content features
  contentFeatures: {
    hasDecision: boolean;            // Contains "we decided", "let's use"
    hasRule: boolean;                // Contains "always", "never", "must"
    hasFact: boolean;                // Contains factual statements
    hasCommand: boolean;             // Contains CLI/tool invocations
    noveltyScore: number;            // 1 - max similarity to existing
  };
}
```

### 2.3 Reward Function

```typescript
function computeExtractionReward(
  decision: ExtractionDecision,
  outcome: ExtractionOutcome,
  config: RewardConfig
): number {
  if (decision.action === 'skip') {
    // Reward for correctly skipping
    // If we would have stored and it was never retrieved, good skip
    // If we would have stored and it would have been useful, bad skip
    return outcome.wouldHaveBeenUseful ? -config.missedOpportunityCost : 0;
  }

  if (decision.action === 'store') {
    const retrievalReward = outcome.retrievalCount * config.retrievalValue;
    const successBonus = outcome.successCount * config.successBonus;
    const storageCost = config.storageCostPerEntry;
    const redundancyPenalty = outcome.wasRedundant ? config.redundancyPenalty : 0;

    return retrievalReward + successBonus - storageCost - redundancyPenalty;
  }

  if (decision.action === 'defer') {
    // Small cost for deferring (increases latency)
    return -config.deferralCost;
  }

  return 0;
}

const DEFAULT_REWARD_CONFIG = {
  retrievalValue: 0.1,        // Per retrieval
  successBonus: 0.5,          // Per successful use
  storageCostPerEntry: 0.05,  // Fixed cost
  redundancyPenalty: 0.3,     // If duplicate
  missedOpportunityCost: 0.2, // Skipped useful content
  deferralCost: 0.01          // Per deferral
};
```

### 2.4 Training Pipeline

```
src/services/rl/extraction/
├── policy.ts              # ExtractionPolicy class
├── state.ts               # State builder
├── reward.ts              # Reward calculator
└── inference.ts           # Production inference
```

**Training approach: Direct Preference Optimization (DPO)**

```typescript
interface TrainingExample {
  state: ExtractionState;
  chosenAction: ExtractionAction;      // What we did
  rejectedAction: ExtractionAction;    // Alternative
  chosenReward: number;                // Observed reward
  rejectedReward: number;              // Counterfactual (estimated)
}

async function trainExtractionPolicy(
  dataset: TrainingExample[],
  baseModel: string
): Promise<TrainedPolicy> {
  // 1. Format as DPO pairs
  const dpoPairs = dataset.map(ex => ({
    prompt: formatStateAsPrompt(ex.state),
    chosen: formatActionAsResponse(ex.chosenAction),
    rejected: formatActionAsResponse(ex.rejectedAction)
  }));

  // 2. Fine-tune with DPO loss
  const trainedModel = await dpoTrain(baseModel, dpoPairs, {
    learningRate: 1e-6,
    epochs: 3,
    beta: 0.1  // KL penalty
  });

  return new TrainedPolicy(trainedModel);
}
```

### 2.5 Integration with Capture Service

```typescript
// src/services/capture/index.ts

class CaptureService {
  private extractionPolicy: IExtractionPolicy;

  async onTurnComplete(sessionId: string, turn: TurnInfo): Promise<CaptureResult> {
    const state = await this.buildExtractionState(sessionId, turn);

    // Use learned policy instead of threshold-based rules
    const action = await this.extractionPolicy.decide(state);

    // Record decision for future training
    await this.feedbackService.recordExtractionDecision({
      sessionId,
      turnNumber: turn.number,
      decision: action.decision,
      entryType: action.entryType,
      confidence: action.confidence,
      contextHash: hashState(state)
    });

    if (action.decision === 'store') {
      return this.executeExtraction(action);
    }

    return null;
  }
}
```

---

## Phase 3: Retrieval Policy

**Goal:** Learn when to query memory vs. generate directly.

### 3.1 Policy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Retrieval Policy                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  State: [query_embedding, task_type, context_length,           │
│          memory_stats, recent_retrievals]                       │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────┐                   │
│  │           Policy Network                 │                   │
│  │  (Lightweight classifier or LLM)        │                   │
│  └─────────────────────────────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│  Action: { shouldRetrieve: boolean,                            │
│            retrievalScope: global|project|session,             │
│            retrievalTypes: (tool|guideline|knowledge)[],       │
│            maxResults: number }                                 │
│                                                                 │
│  Reward: task_accuracy_delta - latency_cost                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 State Representation

```typescript
interface RetrievalState {
  // Query features
  queryEmbedding: number[];
  queryFeatures: {
    queryLength: number;
    hasQuestionMark: boolean;
    taskType: 'code' | 'debug' | 'explain' | 'create' | 'other';
    complexity: number;            // Estimated from query
  };

  // Context features
  contextFeatures: {
    conversationLength: number;
    recentToolCalls: string[];
    hasRecentError: boolean;
    topicContinuity: number;       // Same topic as previous turns
  };

  // Memory statistics
  memoryStats: {
    totalEntriesInScope: number;
    relevantEntriesEstimate: number;  // From lightweight search
    lastRetrievalTurnsAgo: number;
    lastRetrievalWasUseful: boolean | null;
  };

  // Performance context
  performanceContext: {
    expectedLatencyMs: number;
    tokenBudgetRemaining: number;
  };
}
```

### 3.3 Reward Function

```typescript
function computeRetrievalReward(
  action: RetrievalAction,
  outcome: TaskOutcome,
  baseline: TaskOutcome,  // Counterfactual without retrieval
  latencyMs: number,
  config: RewardConfig
): number {
  if (action.shouldRetrieve) {
    const accuracyDelta = outcome.successScore - baseline.successScore;
    const latencyCost = (latencyMs / 1000) * config.latencyCostPerSecond;
    const tokenCost = action.retrievedTokens * config.tokenCost;

    return accuracyDelta - latencyCost - tokenCost;
  } else {
    // Reward for correctly skipping retrieval
    // (task succeeded without retrieval overhead)
    if (outcome.successScore >= config.successThreshold) {
      return config.skipBonus;
    }
    // Penalty for incorrectly skipping
    // (retrieval would have helped)
    return baseline.successScore > outcome.successScore
      ? -config.missedRetrievalPenalty
      : 0;
  }
}

const DEFAULT_RETRIEVAL_REWARD_CONFIG = {
  latencyCostPerSecond: 0.1,
  tokenCost: 0.0001,
  successThreshold: 0.8,
  skipBonus: 0.05,
  missedRetrievalPenalty: 0.3
};
```

### 3.4 Counterfactual Estimation

To train the retrieval policy, we need counterfactual outcomes:

```typescript
interface CounterfactualEstimator {
  // Estimate what would have happened with/without retrieval
  estimateWithRetrieval(
    state: RetrievalState,
    historicalData: HistoricalOutcome[]
  ): Promise<OutcomeDistribution>;

  estimateWithoutRetrieval(
    state: RetrievalState,
    historicalData: HistoricalOutcome[]
  ): Promise<OutcomeDistribution>;
}

class NearestNeighborEstimator implements CounterfactualEstimator {
  async estimateWithRetrieval(
    state: RetrievalState,
    historicalData: HistoricalOutcome[]
  ): Promise<OutcomeDistribution> {
    // Find similar states where retrieval was used
    const similar = await this.findSimilarStates(state, historicalData, {
      filter: { wasRetrievalUsed: true }
    });

    // Aggregate outcomes
    return this.aggregateOutcomes(similar);
  }
}
```

### 3.5 Integration Point

**Pre-query hook in agent conversation flow:**

```typescript
// This would be called by the agent before deciding to query memory

async function shouldQueryMemory(
  query: string,
  context: ConversationContext
): Promise<RetrievalDecision> {
  const state = await buildRetrievalState(query, context);
  const decision = await retrievalPolicy.decide(state);

  // Record for training
  await feedbackService.recordRetrievalDecision({
    sessionId: context.sessionId,
    decision: decision.shouldRetrieve,
    scope: decision.retrievalScope,
    types: decision.retrievalTypes
  });

  return decision;
}
```

---

## Phase 4: Consolidation Policy

**Goal:** Learn how to merge, dedupe, and forget entries.

### 4.1 Policy Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Consolidation Policy                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  State: [entry_group_features, scope_stats, historical_usage]  │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────┐                   │
│  │           Policy Network                 │                   │
│  │  (Decision tree or small classifier)    │                   │
│  └─────────────────────────────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│  Action: { action: merge|dedupe|archive|abstract|keep,         │
│            targetEntries: string[],                             │
│            mergeStrategy: 'union'|'intersect'|'llm' }          │
│                                                                 │
│  Reward: post_retrieval_rate - pre_retrieval_rate +            │
│          storage_savings - information_loss                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 State Representation

```typescript
interface ConsolidationState {
  // Entry group features
  groupFeatures: {
    entryCount: number;
    avgSimilarity: number;
    maxSimilarity: number;
    entryTypes: string[];          // Types in group
    ageSpreadDays: number;         // Oldest - newest
    totalTokens: number;
  };

  // Usage statistics
  usageStats: {
    avgRetrievalCount: number;
    avgSuccessRate: number;
    lastUsedDaysAgo: number;
    usageVariance: number;         // Some used a lot, others not
  };

  // Scope statistics
  scopeStats: {
    totalEntries: number;
    capacityUsed: number;          // Percentage
    duplicateRatio: number;        // Estimated duplicates
    staleRatio: number;            // Entries not used in N days
  };

  // Content analysis
  contentAnalysis: {
    informationOverlap: number;    // Redundant information
    contradictions: boolean;       // Conflicting facts
    hierarchyPotential: number;    // Can be abstracted
  };
}
```

### 4.3 Reward Function

```typescript
function computeConsolidationReward(
  action: ConsolidationAction,
  preMetrics: ConsolidationMetrics,
  postMetrics: ConsolidationMetrics,
  config: RewardConfig
): number {
  // Retrieval effectiveness delta
  const retrievalDelta = postMetrics.retrievalSuccessRate - preMetrics.retrievalSuccessRate;

  // Storage efficiency gain
  const storageSavings = (preMetrics.entryCount - postMetrics.entryCount) * config.storageValue;

  // Information preservation (penalize lost useful content)
  const informationLoss = estimateInformationLoss(action, preMetrics, postMetrics);

  // Query latency improvement
  const latencyImprovement = (preMetrics.avgQueryLatency - postMetrics.avgQueryLatency) * config.latencyValue;

  return (
    retrievalDelta * config.retrievalWeight +
    storageSavings * config.storageWeight -
    informationLoss * config.informationWeight +
    latencyImprovement * config.latencyWeight
  );
}

const DEFAULT_CONSOLIDATION_REWARD_CONFIG = {
  retrievalWeight: 0.4,
  storageWeight: 0.2,
  informationWeight: 0.3,
  latencyWeight: 0.1,
  storageValue: 0.01,
  latencyValue: 0.05
};
```

### 4.4 Integration with Librarian Agent

Extend the existing Librarian pipeline:

```typescript
// src/services/librarian/pipeline/consolidation-policy.ts

class ConsolidationPolicyStage implements PipelineStage {
  constructor(private policy: IConsolidationPolicy) {}

  async execute(context: LibrarianContext): Promise<ConsolidationDecision[]> {
    const groups = context.similarityGroups;
    const decisions: ConsolidationDecision[] = [];

    for (const group of groups) {
      const state = await this.buildState(group, context);
      const action = await this.policy.decide(state);

      // Record for training
      await this.feedbackService.recordConsolidationDecision({
        scopeType: context.scopeType,
        scopeId: context.scopeId,
        action: action.action,
        sourceEntryIds: group.entryIds,
        similarityScore: group.similarity
      });

      decisions.push({
        group,
        action,
        state
      });
    }

    return decisions;
  }
}
```

---

## Phase 5: Training Infrastructure

### 5.1 Offline Training Pipeline

```
src/services/rl/
├── trainer/
│   ├── base.trainer.ts           # Abstract trainer interface
│   ├── dpo.trainer.ts            # DPO training implementation
│   └── contextual-bandit.ts      # Simpler alternative
├── dataset/
│   ├── builder.ts                # Build training datasets
│   ├── sampler.ts                # Experience replay sampling
│   └── augmentation.ts           # Data augmentation
├── evaluation/
│   ├── metrics.ts                # Policy evaluation metrics
│   └── backtesting.ts            # Historical performance
├── extraction/
│   ├── policy.ts
│   ├── state.ts
│   ├── reward.ts
│   └── inference.ts
├── retrieval/
│   ├── policy.ts
│   ├── state.ts
│   ├── reward.ts
│   ├── counterfactual.ts
│   └── inference.ts
├── consolidation/
│   ├── policy.ts
│   ├── state.ts
│   ├── reward.ts
│   └── inference.ts
└── config.ts                     # Feature flags and configuration
```

### 5.2 Training Schedule

**MCP Tool: `memory_rl`**

```typescript
interface RLToolActions {
  // Training
  train: {
    policy: 'extraction' | 'retrieval' | 'consolidation';
    datasetParams: DatasetParams;
    trainingConfig: TrainingConfig;
  };

  // Evaluation
  evaluate: {
    policy: 'extraction' | 'retrieval' | 'consolidation';
    testDataset?: string;
    metrics: ('accuracy' | 'reward' | 'latency')[];
  };

  // Deployment
  deploy: {
    policy: 'extraction' | 'retrieval' | 'consolidation';
    modelVersion: string;
  };

  // Status
  status: {};  // Get training status, deployed versions
}
```

### 5.3 Configuration

```typescript
// src/config/registry/sections/rl.ts

interface RLConfig {
  enabled: boolean;              // Master kill switch

  feedback: {
    enabled: boolean;
    outcomeInference: 'rule_based' | 'llm_based';
    llmModel?: string;
    attributionMethod: 'last_touch' | 'linear' | 'attention';
  };

  extraction: {
    enabled: boolean;            // Toggle learned vs threshold
    modelPath?: string;
  };

  retrieval: {
    enabled: boolean;            // Toggle learned vs always-retrieve
    modelPath?: string;
  };

  consolidation: {
    enabled: boolean;            // Toggle learned vs threshold
    modelPath?: string;
  };

  training: {
    schedule: string;           // Cron expression
    minExamplesRequired: number;
    evaluationSplit: number;    // Train/eval split
    modelStoragePath: string;
  };
}

const DEFAULT_RL_CONFIG: RLConfig = {
  enabled: true,               // On by default once deployed

  feedback: {
    enabled: true,             // Always collect feedback
    outcomeInference: 'rule_based',
    attributionMethod: 'linear'
  },

  extraction: {
    enabled: true              // Use learned policy
  },

  retrieval: {
    enabled: true              // Use learned policy
  },

  consolidation: {
    enabled: true              // Use learned policy
  },

  training: {
    schedule: '0 3 * * 0',     // Weekly at 3am Sunday
    minExamplesRequired: 1000,
    evaluationSplit: 0.2,
    modelStoragePath: './models/rl'
  }
};

// To disable RL entirely, set:
// rl.enabled = false
// This falls back to threshold-based rules for all policies
```

---

## Implementation Phases

### Phase 1: Feedback Foundation (4-6 weeks)

| Task | Subagent | Files |
|------|----------|-------|
| Database schema | sql-pro | `src/db/migrations/0018_*.sql` |
| Feedback service | typescript-pro | `src/services/feedback/` |
| Query pipeline integration | typescript-pro | `src/services/query/pipeline.ts` |
| Capture service integration | typescript-pro | `src/services/capture/index.ts` |
| Session end hooks | typescript-pro | `src/mcp/handlers/scopes.handler.ts` |
| Outcome inference (rule-based) | typescript-pro | `src/services/feedback/evaluators/` |
| MCP handler | typescript-pro | `src/mcp/handlers/feedback.handler.ts` |

**Deliverable:** Feedback collection running in production, accumulating training data.

### Phase 2: Extraction Policy (3-4 weeks)

| Task | Subagent | Files |
|------|----------|-------|
| State builder | typescript-pro | `src/services/rl/extraction/state.ts` |
| Reward calculator | typescript-pro | `src/services/rl/extraction/reward.ts` |
| Dataset builder | data-engineer | `src/services/rl/dataset/` |
| DPO trainer | ml-engineer | `src/services/rl/trainer/dpo.trainer.ts` |
| Policy inference | ml-engineer | `src/services/rl/extraction/inference.ts` |
| Capture integration | typescript-pro | `src/services/capture/index.ts` |

**Deliverable:** Learned extraction policy with 10%+ improvement over thresholds.

### Phase 3: Retrieval Policy (3-4 weeks)

| Task | Subagent | Files |
|------|----------|-------|
| State builder | typescript-pro | `src/services/rl/retrieval/state.ts` |
| Counterfactual estimator | data-scientist | `src/services/rl/retrieval/counterfactual.ts` |
| Reward calculator | typescript-pro | `src/services/rl/retrieval/reward.ts` |
| Policy trainer | ml-engineer | `src/services/rl/trainer/` |
| Agent integration hook | typescript-pro | (external integration) |

**Deliverable:** Retrieval policy reducing unnecessary queries by 20%+.

### Phase 4: Consolidation Policy (2-3 weeks)

| Task | Subagent | Files |
|------|----------|-------|
| State builder | typescript-pro | `src/services/rl/consolidation/state.ts` |
| Reward calculator | typescript-pro | `src/services/rl/consolidation/reward.ts` |
| Librarian integration | typescript-pro | `src/services/librarian/pipeline/` |
| Policy trainer | ml-engineer | `src/services/rl/trainer/` |

**Deliverable:** Consolidation policy maintaining retrieval quality while reducing storage 15%+.

### Phase 5: Production Hardening (1-2 weeks)

| Task | Subagent | Files |
|------|----------|-------|
| Feature flag integration | typescript-pro | `src/config/registry/sections/rl.ts` |
| Fallback logic | typescript-pro | All policy files |
| Metrics logging | typescript-pro | `src/services/rl/metrics.ts` |
| Documentation | technical-writer | `docs/rl-*.md` |

**Kill Switch Behavior:**
- `rl.enabled = false` → All policies fall back to threshold-based rules
- `rl.extraction.enabled = false` → Extraction uses existing capture thresholds
- `rl.retrieval.enabled = false` → Always retrieves (current behavior)
- `rl.consolidation.enabled = false` → Uses Librarian quality gate thresholds

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Extraction precision | ~70% (threshold) | 85%+ | % of stored entries retrieved at least once |
| Extraction recall | ~60% | 75%+ | % of useful content that was stored |
| Retrieval efficiency | 100% (always retrieve) | 70% queries | Queries where retrieval was necessary |
| Retrieval latency | N/A | -30% | Avg latency reduction from skipping |
| Consolidation effectiveness | Manual | 15% storage reduction | Entries consolidated without quality loss |
| Task success rate | Baseline | +5% | Improvement from better memory |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Insufficient training data | Start feedback collection immediately; use synthetic augmentation |
| Reward hacking | Multiple reward signals; human evaluation sampling |
| Distribution shift | Continuous monitoring; periodic retraining |
| Latency regression | Lightweight policy models; caching; async training |
| Policy failure | Feature flag kill switch; automatic fallback to thresholds |
| Model degradation | Offline evaluation before deployment; metrics alerting |

---

## Dependencies

- **Embedding service** - Required for state representations
- **LLM access** - For outcome inference and DPO training
- **Compute resources** - For model training (can use external)

---

## Next Steps

1. **Immediate:** Implement feedback collection schema and service
2. **Week 2-3:** Integrate feedback hooks into query pipeline and capture service
3. **Week 4-6:** Accumulate training data, implement extraction policy trainer
4. **Week 7+:** Train and evaluate first policies, begin gradual rollout

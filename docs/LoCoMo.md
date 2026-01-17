# LoCoMo Benchmark Analysis

> Analysis of the [LoCoMo benchmark](https://snap-research.github.io/locomo/) for optimizing Agent Memory's long-term conversational memory capabilities.

## Overview

LoCoMo (Long-term Conversational Memory) is a benchmark for evaluating very long-term conversational memory in LLM agents. It comprises conversations with:

- **300 turns** average per conversation
- **9,000 tokens** average length
- **Up to 35 sessions** per conversation
- Generated using personas and **temporal event graphs**

## Test Categories

| Category                | What It Tests                       | Current SOTA Gap              |
| ----------------------- | ----------------------------------- | ----------------------------- |
| **Single-hop QA**       | Direct recall from one session      | ~56% below human              |
| **Multi-hop QA**        | Connecting info across sessions     | Significant gap               |
| **Temporal QA**         | Event ordering, recency, sequences  | **73% below human** (weakest) |
| **Adversarial QA**      | Resistance to misleading queries    | F1 drops to 12-22             |
| **Event Summarization** | Causal/temporal relationship graphs | Hallucination issues          |

### Scoring Methodology

- **QA tasks**: F1 scores on exact or partial answer span matching
- **Summarization**: ROUGE (lexical) and FactScore (factual accuracy)
- **Multimodal generation**: MMRelevance, BLEU, ROUGE, BERTScore

Human raters achieve ~88 F1 on QA tasks; best LLMs reach only ~32.

---

## What High-Scoring Systems Do

### 1. Assertion/Fact Database (Critical)

RAG performs best when dialogues are transformed into a **database of assertions** about each speaker's life and persona:

```
Raw: "I got promoted to senior engineer last Tuesday"
→ Fact: {
    entity: "user",
    attribute: "job_title",
    value: "senior engineer",
    timestamp: "2024-01-09"
  }
```

### 2. Graph-Based Memory (Best for Temporal)

[Mem0^g](https://arxiv.org/html/2504.19413v1) achieves highest temporal scores (F1=51.55) using:

- **Entities** as nodes with type classifications and embeddings
- **Relationships** as labeled triplets (source → relation → target)
- **Explicit temporal metadata** on edges
- Two-stage extraction: entity identification → relationship generation

### 3. Hybrid Retrieval (80.1% Approach)

The [80.1% RAG pipeline](https://news.ycombinator.com/item?id=46369736) uses:

```
Dense (BGE-large-en-v1.5 embeddings)
    + Sparse (BM25 keyword matching)
    + Cross-Encoder Reranking (bge-reranker-v2-m3)
                    ↓
             Full union (~120-150 docs)
                    ↓
             Rerank to top-k
```

Key insight: Feed **complete document union** to cross-encoder rather than pre-filtering.

### 4. Compact Evidence Windows

Best results use **≤1,000 tokens** from memory for QA input, far below full-history context.

### 5. Incremental Memory Updates

Mem0 uses LLM-driven operations:

- **ADD** - New information
- **UPDATE** - Modified existing fact
- **DELETE** - Invalidated information
- **NOOP** - No change needed

---

## Mem0 Architecture (26% Improvement)

### Two-Phase Pipeline

1. **Extraction Phase**: Process message pairs with conversation summaries and recent history to identify salient information

2. **Update Phase**: Evaluate extracted facts against existing memories using semantic similarity, then determine appropriate operation

### Graph-Based Memory (Mem0^g)

```
Entities (nodes)          Relationships (edges)
├── type classification   ├── labeled triplets
├── semantic embeddings   ├── source → relation → target
└── metadata              └── temporal metadata
```

### Performance Results

| Metric           | Mem0 vs Baseline   |
| ---------------- | ------------------ |
| Response latency | 91% lower p95      |
| Token cost       | 90% reduction      |
| LLM-as-Judge     | 26% improvement    |
| Temporal QA      | Highest F1 (51.55) |

---

## Key Challenges

### Temporal Reasoning (Biggest Gap)

Models struggle with:

- Event ordering ("What happened first?")
- Recency queries ("What did we discuss recently?")
- Duration/intervals ("How long ago?")
- Causal sequences ("What led to X?")

Even with optimized retrieval or long context, temporal accuracy lags by ≥50 percentage points versus humans.

### Adversarial Queries

All models exhibit drastically lower scores on adversarial QA:

- F1 drops to 12-22
- Vulnerable to misleading prompts despite expanded context windows
- Long-context models exhibit significant hallucinations

### Multi-hop Reasoning

Connecting information across multiple sessions requires:

- Explicit relationship modeling
- Entity coreference resolution
- Graph traversal capabilities

---

## Recommendations for Agent Memory

### Priority Matrix

| Priority  | Enhancement                  | LoCoMo Impact           |
| --------- | ---------------------------- | ----------------------- |
| 🔴 High   | Temporal metadata on entries | Temporal QA (+50%)      |
| 🔴 High   | Entity-relationship graph    | Multi-hop QA (+30%)     |
| 🟡 Medium | BM25 hybrid retrieval        | Overall recall (+20%)   |
| 🟡 Medium | Cross-encoder reranking      | Precision (+15%)        |
| 🟢 Lower  | Event sequencing index       | Temporal ordering       |
| 🟢 Lower  | Adversarial detection        | Hallucination reduction |

### Implementation Phases

See [experiential-memory-skills-librarian-plan.md](./experiential-memory-skills-librarian-plan.md) for detailed implementation.

---

## Sources

- [LoCoMo Benchmark](https://snap-research.github.io/locomo/)
- [LoCoMo Paper (arXiv:2402.17753)](https://arxiv.org/abs/2402.17753)
- [LoCoMo Paper (ACL 2024)](https://aclanthology.org/2024.acl-long.747.pdf)
- [Mem0 Architecture (arXiv:2504.19413)](https://arxiv.org/html/2504.19413v1)
- [80.1% RAG Pipeline Discussion](https://news.ycombinator.com/item?id=46369736)
- [Benchmark Scores Analysis](https://www.emergentmind.com/topics/locomo-benchmark-scores)
- [GitHub: snap-research/locomo](https://github.com/snap-research/locomo)

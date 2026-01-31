#!/usr/bin/env npx tsx
/**
 * Test concurrent chat completion requests to LM Studio with variable context length
 *
 * Usage:
 *   AGENT_MEMORY_LM_STUDIO_EMBEDDING_MODEL=unsloth/gpt-oss-20b npx tsx scripts/test-lmstudio-concurrent.ts
 *   CONTEXT_SIZE=2000 npx tsx scripts/test-lmstudio-concurrent.ts
 */

import { OpenAI } from 'openai';

const BASE_URL = process.env.AGENT_MEMORY_LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1';
const MODEL = process.env.AGENT_MEMORY_LM_STUDIO_EMBEDDING_MODEL ?? 'unsloth/gpt-oss-20b';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS ?? '8', 10);
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS ?? '24', 10);
const CONTEXT_SIZE = parseInt(process.env.CONTEXT_SIZE ?? '2000', 10);
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS ?? '100', 10);

console.log('='.repeat(60));
console.log('LM Studio Concurrent Chat Completion Test (Long Context)');
console.log('='.repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`Model: ${MODEL}`);
console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
console.log(`Total requests: ${TOTAL_REQUESTS}`);
console.log(`Context size: ~${CONTEXT_SIZE} tokens per request`);
console.log(`Max output tokens: ${MAX_TOKENS}`);
console.log('='.repeat(60));

const client = new OpenAI({
  baseURL: BASE_URL,
  apiKey: 'not-needed',
  timeout: 300000,
  maxRetries: 0,
});

function generateLongPrompt(targetTokens: number): string {
  const baseText = `You are analyzing a complex technical document. Here is the content to analyze:

The following is a detailed technical specification for a distributed systems architecture. 
Please read carefully and then answer the question at the end.

---
SECTION 1: SYSTEM OVERVIEW

The distributed computing platform consists of multiple interconnected nodes that communicate 
via asynchronous message passing protocols. Each node maintains local state and participates 
in consensus algorithms for distributed transactions. The architecture follows the principles 
of eventual consistency with configurable consistency levels per operation.

Key components include:
- Load balancers distributing incoming requests across available nodes
- Message queues for asynchronous inter-service communication  
- Distributed cache layers for reducing database load
- Primary-replica database clusters for data persistence
- Monitoring and alerting infrastructure for operational visibility

SECTION 2: CONSENSUS PROTOCOL

The consensus mechanism implements a variant of the Raft protocol optimized for 
high-throughput scenarios. Leader election occurs through randomized timeouts to 
prevent split-brain scenarios. Log replication ensures all committed entries are 
durably stored across a quorum of nodes before acknowledgment.

Performance characteristics:
- Leader election: 150-300ms typical latency
- Log replication: 10-50ms for quorum acknowledgment
- Snapshot transfer: Variable based on state size
- Membership changes: Coordinated through joint consensus

SECTION 3: DATA PARTITIONING

Data is partitioned using consistent hashing with virtual nodes to ensure even 
distribution across the cluster. Each partition has a configurable replication 
factor determining how many copies exist. Partition reassignment during node 
failures or additions uses minimal data movement strategies.

The partitioning scheme supports:
- Range queries within partition boundaries
- Cross-partition transactions via two-phase commit
- Automatic rebalancing on topology changes
- Hot partition detection and splitting

SECTION 4: FAILURE HANDLING

The system implements multiple layers of failure detection and recovery:
- Heartbeat-based liveness detection between nodes
- Automatic failover for leader nodes
- Read replica promotion on primary failure
- Circuit breakers for cascading failure prevention
- Bulkhead isolation for resource protection

Recovery time objectives:
- Node failure detection: 5-15 seconds
- Leader failover: 15-30 seconds  
- Full cluster recovery: 2-5 minutes
- Data reconstruction: Proportional to data volume

SECTION 5: PERFORMANCE OPTIMIZATION

Several techniques optimize system performance:
- Connection pooling reduces handshake overhead
- Request batching amortizes network round-trips
- Compression reduces bandwidth for large payloads
- Caching eliminates redundant computations
- Prefetching anticipates access patterns

Benchmark results on reference hardware:
- Throughput: 100,000+ operations per second
- Latency p50: 2ms, p99: 15ms, p999: 50ms
- Availability: 99.99% measured over 12 months
- Durability: Zero data loss in production

`;

  let prompt = baseText;
  let iteration = 0;

  while (prompt.length < targetTokens * 4) {
    iteration++;
    prompt += `

APPENDIX ${iteration}: ADDITIONAL SPECIFICATIONS

This section provides supplementary technical details for implementation reference.
The configuration parameters listed here represent production-tested values that 
balance performance with reliability requirements. Operators should adjust these 
based on specific workload characteristics and hardware capabilities.

Configuration category ${iteration}.1: Network timeouts and retry policies
Configuration category ${iteration}.2: Memory allocation and garbage collection  
Configuration category ${iteration}.3: Disk I/O scheduling and buffering
Configuration category ${iteration}.4: Thread pool sizing and work stealing
Configuration category ${iteration}.5: Metric collection and aggregation intervals

Performance tuning recommendations for scenario ${iteration}:
- Increase buffer sizes for high-throughput workloads
- Reduce timeout values for latency-sensitive operations
- Enable compression for bandwidth-constrained environments
- Disable sync writes for ephemeral data stores
- Use dedicated I/O threads for storage-heavy workloads

`;
  }

  prompt += `
---

QUESTION: Based on the technical specification above, what are the three most 
critical factors for ensuring high availability in this distributed system? 
Provide a brief explanation for each factor.`;

  return prompt;
}

interface RequestResult {
  success: boolean;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  response?: string;
  error?: string;
}

async function makeRequest(prompt: string, index: number): Promise<RequestResult> {
  const start = performance.now();
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
    });

    const latencyMs = performance.now() - start;
    const choice = response.choices[0];

    return {
      success: true,
      latencyMs,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      response: choice?.message?.content?.slice(0, 80),
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    return {
      success: false,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runBatch(
  batchIndex: number,
  batchSize: number,
  prompt: string
): Promise<RequestResult[]> {
  const promises: Promise<RequestResult>[] = [];

  for (let i = 0; i < batchSize; i++) {
    const globalIndex = batchIndex * batchSize + i;
    promises.push(makeRequest(prompt, globalIndex));
  }

  return Promise.all(promises);
}

async function main() {
  console.log('\n🚀 Generating long context prompt...\n');
  const longPrompt = generateLongPrompt(CONTEXT_SIZE);
  const estimatedTokens = Math.round(longPrompt.length / 4);
  console.log(`Prompt length: ${longPrompt.length} chars (~${estimatedTokens} tokens)\n`);

  console.log('Verifying LM Studio connectivity with short request...');
  const warmup = await makeRequest('Say "ready" in one word.', 0);
  if (!warmup.success) {
    console.error(`❌ LM Studio not reachable: ${warmup.error}`);
    process.exit(1);
  }
  console.log(`✅ Connected!\n`);

  console.log('Starting long-context concurrent test...\n');

  const allResults: RequestResult[] = [];
  const totalBatches = Math.ceil(TOTAL_REQUESTS / CONCURRENT_REQUESTS);
  const overallStart = performance.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const remainingRequests = TOTAL_REQUESTS - batch * CONCURRENT_REQUESTS;
    const batchSize = Math.min(CONCURRENT_REQUESTS, remainingRequests);

    const batchStart = performance.now();
    const results = await runBatch(batch, batchSize, longPrompt);
    const batchLatency = performance.now() - batchStart;

    allResults.push(...results);

    const successCount = results.filter((r) => r.success).length;
    const avgPromptTokens =
      results
        .filter((r) => r.success && r.promptTokens)
        .reduce((sum, r) => sum + (r.promptTokens ?? 0), 0) / successCount || 0;

    console.log(
      `Batch ${batch + 1}/${totalBatches}: ${successCount}/${batchSize} succeeded, ` +
        `~${Math.round(avgPromptTokens)} prompt tokens, ` +
        `batch time: ${(batchLatency / 1000).toFixed(1)}s`
    );
  }

  const overallLatency = performance.now() - overallStart;

  const successResults = allResults.filter((r) => r.success);
  const failedResults = allResults.filter((r) => !r.success);
  const latencies = successResults.map((r) => r.latencyMs).sort((a, b) => a - b);

  const totalPromptTokens = successResults.reduce((sum, r) => sum + (r.promptTokens ?? 0), 0);
  const totalCompletionTokens = successResults.reduce(
    (sum, r) => sum + (r.completionTokens ?? 0),
    0
  );

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Total requests: ${allResults.length}`);
  console.log(
    `Successful: ${successResults.length} (${((successResults.length / allResults.length) * 100).toFixed(1)}%)`
  );
  console.log(`Failed: ${failedResults.length}`);
  console.log(`Total time: ${(overallLatency / 1000).toFixed(2)}s`);
  console.log(
    `Throughput: ${(successResults.length / (overallLatency / 1000)).toFixed(2)} requests/sec`
  );

  console.log('\nToken Statistics:');
  console.log(`  Total prompt tokens: ${totalPromptTokens.toLocaleString()}`);
  console.log(`  Total completion tokens: ${totalCompletionTokens.toLocaleString()}`);
  console.log(`  Prompt tokens/sec: ${(totalPromptTokens / (overallLatency / 1000)).toFixed(0)}`);
  console.log(
    `  Completion tokens/sec: ${(totalCompletionTokens / (overallLatency / 1000)).toFixed(0)}`
  );

  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
    const min = latencies[0]!;
    const max = latencies[latencies.length - 1]!;

    console.log('\nLatency Statistics (seconds):');
    console.log(`  Min: ${(min / 1000).toFixed(1)}s`);
    console.log(`  Avg: ${(avg / 1000).toFixed(1)}s`);
    console.log(`  P50: ${(p50 / 1000).toFixed(1)}s`);
    console.log(`  P95: ${(p95 / 1000).toFixed(1)}s`);
    console.log(`  P99: ${(p99 / 1000).toFixed(1)}s`);
    console.log(`  Max: ${(max / 1000).toFixed(1)}s`);
  }

  if (failedResults.length > 0) {
    console.log('\nErrors:');
    const errorCounts = new Map<string, number>();
    for (const r of failedResults) {
      const key = r.error ?? 'Unknown';
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    for (const [error, count] of errorCounts) {
      console.log(`  ${count}x: ${error.slice(0, 100)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);

/**
 * LM Studio + Agent Memory Integration Example
 *
 * This example shows how to connect a local LLM running in LM Studio
 * to agent-memory for context-aware conversations.
 *
 * Prerequisites:
 * 1. Install and run LM Studio (https://lmstudio.ai)
 * 2. Load a model in LM Studio
 * 3. Start the local server (default: http://localhost:1234)
 * 4. Run this example: npx tsx examples/lm-studio-example.ts
 */

import 'dotenv/config';

import {
  createLMStudioClient,
  createMemoryAgent,
  DEFAULT_LM_STUDIO_CONFIG,
  type MemoryContext,
  type LMStudioHealthCheck,
} from '../src/services/lm-studio/index.js';

// Example memory retriever that simulates agent-memory queries
// In production, this would call the actual agent-memory MCP tools or API
async function exampleMemoryRetriever(params: {
  projectId?: string;
  sessionId?: string;
  query?: string;
  limit?: number;
}): Promise<MemoryContext> {
  console.log(`[Memory] Retrieving context for query: "${params.query}"`);

  // Simulated memory context - in production this comes from agent-memory
  return {
    guidelines: [
      {
        id: 'g1',
        name: 'Code Style',
        content: 'Use TypeScript with strict mode. Prefer functional patterns.',
        priority: 1,
      },
      {
        id: 'g2',
        name: 'Error Handling',
        content: 'Always use try-catch for async operations. Log errors with context.',
        priority: 2,
      },
    ],
    knowledge: [
      {
        id: 'k1',
        title: 'Project Architecture',
        content: 'This project uses a service-based architecture with MCP integration.',
        category: 'architecture',
      },
    ],
    tools: [
      {
        id: 't1',
        name: 'memory_query',
        description: 'Query the agent-memory system for context and knowledge',
      },
    ],
    conversationSummary: 'User is exploring the LM Studio integration capabilities.',
  };
}

async function main() {
  console.log('=== LM Studio + Agent Memory Integration ===\n');

  // 1. Create a simple LM Studio client (uses env vars or defaults)
  console.log('1. Creating LM Studio client...');
  console.log(`   Base URL: ${DEFAULT_LM_STUDIO_CONFIG.baseUrl}`);
  console.log(`   Model: ${DEFAULT_LM_STUDIO_CONFIG.model}`);
  const client = createLMStudioClient({
    temperature: 0.7,
    maxTokens: 1024,
  });

  // 2. Check connection
  console.log('2. Checking LM Studio connection...');
  const health: LMStudioHealthCheck = await client.healthCheck();

  if (!health.connected) {
    console.error(`   ❌ Failed to connect: ${health.error}`);
    console.log('\n   Make sure LM Studio is running with a model loaded.');
    console.log('   Start the local server in LM Studio: Developer > Local Server');
    return;
  }

  console.log(`   ✅ Connected to ${health.baseUrl}`);
  console.log(`   Available models: ${health.availableModels.map((m) => m.id).join(', ')}`);

  // 3. Simple chat without memory
  console.log('\n3. Simple chat (no memory)...');
  try {
    const simpleResponse = await client.chat([
      { role: 'user', content: 'What is 2 + 2?' },
    ]);
    console.log(`   Response: ${simpleResponse.content}`);
    if (simpleResponse.usage) {
      console.log(
        `   Tokens: ${simpleResponse.usage.promptTokens} prompt, ${simpleResponse.usage.completionTokens} completion`
      );
    }
  } catch (error) {
    console.log(`   ⚠️ Simple chat failed: ${error}`);
  }

  // 4. Create memory-enhanced agent
  console.log('\n4. Creating memory-enhanced agent...');
  const agent = createMemoryAgent({
    lmStudioConfig: {
      temperature: 0.7,
      maxTokens: 2048,
    },
    agentId: 'example-agent',
    memoryRetriever: exampleMemoryRetriever,
    maxMemoryEntries: 5,
  });

  // 5. Memory-enhanced chat
  console.log('\n5. Memory-enhanced chat...');
  try {
    const memoryResponse = await agent.chat({
      messages: [
        { role: 'user', content: 'How should I handle errors in this project?' },
      ],
      systemPrompt: 'You are a helpful coding assistant.',
      memoryQuery: 'error handling guidelines',
    });

    console.log(`   Response: ${memoryResponse.content.slice(0, 200)}...`);

    if (memoryResponse.memoryContext) {
      console.log('\n   Memory context injected:');
      console.log(
        `   - ${memoryResponse.memoryContext.guidelines.length} guidelines`
      );
      console.log(
        `   - ${memoryResponse.memoryContext.knowledge.length} knowledge entries`
      );
      console.log(`   - ${memoryResponse.memoryContext.tools.length} tools`);
    }
  } catch (error) {
    console.log(`   ⚠️ Memory-enhanced chat failed: ${error}`);
  }

  // 6. Streaming example
  console.log('\n6. Streaming response...');
  try {
    process.stdout.write('   ');
    const stream = agent.chatStream({
      messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
    });

    for await (const { chunk, done } of stream) {
      if (!done) {
        process.stdout.write(chunk);
      }
    }
    console.log('\n');
  } catch (error) {
    console.log(`   ⚠️ Streaming failed: ${error}`);
  }

  // 7. One-shot completion
  console.log('7. One-shot completion...');
  try {
    const result = await agent.complete(
      'Summarize the key coding guidelines in one sentence.',
      { memoryQuery: 'coding guidelines' }
    );
    console.log(`   Result: ${result}`);
  } catch (error) {
    console.log(`   ⚠️ Completion failed: ${error}`);
  }

  console.log('\n=== Example Complete ===');
}

// Run with production memory retriever integration
async function withRealMemory() {
  /**
   * To use with actual agent-memory, you would:
   *
   * 1. Import the memory client or MCP tools
   * 2. Create a retriever that calls memory_query
   *
   * Example with MCP:
   *
   * ```typescript
   * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   *
   * async function realMemoryRetriever(params) {
   *   const result = await mcpClient.callTool('memory_query', {
   *     action: 'context',
   *     projectId: params.projectId,
   *     search: params.query,
   *     limit: params.limit,
   *   });
   *   return result.content;
   * }
   * ```
   */
}

main().catch(console.error);

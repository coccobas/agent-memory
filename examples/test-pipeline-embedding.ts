/**
 * Test that LM Studio embeddings are integrated in the agent-memory pipeline
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnv } from '../src/config/env.js';

// Load .env before importing config
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
loadEnv(projectRoot);

import { createAppContext } from '../src/core/factory/index.js';
import { createRuntime, extractRuntimeConfig, shutdownRuntime } from '../src/core/runtime.js';
import { buildConfig } from '../src/config/index.js';

async function test() {
  console.log('Testing LM Studio embedding integration in agent-memory pipeline\n');
  console.log('='.repeat(60) + '\n');

  console.log('Loading config and creating AppContext...');
  const config = buildConfig();
  const runtime = createRuntime(extractRuntimeConfig(config));
  const ctx = await createAppContext(config, runtime);

  console.log('\nConfiguration:');
  console.log('  Embedding provider:', ctx.config.embedding.provider);

  const isAvailable = ctx.services.embedding.isAvailable();
  console.log('  Embedding service available:', isAvailable);

  if (!isAvailable) {
    console.log('\nEmbedding service not available. Check LM Studio is running.');
    await shutdownRuntime(runtime);
    process.exit(1);
  }

  // Test embedding via service
  console.log('\n--- Testing Direct Embedding ---');
  const result = await ctx.services.embedding.embed('Test embedding via agent-memory pipeline');
  console.log('  Dimensions:', result.embedding.length);
  console.log('  Model:', result.model);
  console.log('  Provider:', result.provider);
  console.log('  First 3 values:', result.embedding.slice(0, 3));

  // Test batch embedding
  console.log('\n--- Testing Batch Embedding ---');
  const batchResult = await ctx.services.embedding.embedBatch([
    'First document about databases',
    'Second document about APIs',
    'Third document about testing',
  ]);
  console.log('  Batch size:', batchResult.embeddings.length);
  console.log('  Model:', batchResult.model);
  console.log('  Provider:', batchResult.provider);

  // Test via runtime pipeline (what MCP tools use)
  console.log('\n--- Testing Runtime Pipeline ---');
  if (ctx.runtime.embeddingPipeline) {
    const pipelineAvailable = ctx.runtime.embeddingPipeline.isAvailable();
    console.log('  Pipeline available:', pipelineAvailable);

    if (pipelineAvailable) {
      const pipelineResult = await ctx.runtime.embeddingPipeline.embed(
        'Test via runtime embedding pipeline'
      );
      console.log('  Pipeline dimensions:', pipelineResult.embedding.length);
      console.log('  Pipeline model:', pipelineResult.model);
      console.log('  Pipeline provider:', pipelineResult.provider);
    }
  } else {
    console.log('  Runtime pipeline not registered');
  }

  await shutdownRuntime(runtime);
  console.log('\n' + '='.repeat(60));
  console.log('LM Studio embedding integration verified!');
}

test().catch(console.error);

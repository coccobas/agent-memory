/**
 * LM Studio Embedding Example
 *
 * Tests the embedding service using LM Studio's local embedding model.
 * Requires LM Studio running with Qwen3 Embedding model loaded.
 */

import { EmbeddingService } from '../src/services/embedding.service.js';

async function main() {
  console.log('LM Studio Embedding Example\n');
  console.log('==========================================\n');

  // Create embedding service configured for LM Studio with Qwen3 Embedding
  const embeddingService = new EmbeddingService({
    provider: 'lmstudio',
    openaiModel: 'text-embedding-3-small', // Not used but required by interface
    lmStudioBaseUrl: process.env.AGENT_MEMORY_LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1',
    lmStudioModel:
      process.env.AGENT_MEMORY_LM_STUDIO_EMBEDDING_MODEL ?? 'text-embedding-qwen3-embedding-8b',
    // Qwen3 Embedding uses instruction-based format for best results
    lmStudioInstruction:
      process.env.AGENT_MEMORY_LM_STUDIO_EMBEDDING_INSTRUCTION ??
      'Retrieve semantically similar text.',
  });

  // Check if service is available
  const available = await embeddingService.isAvailable();
  console.log(`Embedding service available: ${available}`);

  if (!available) {
    console.log('\nPlease ensure LM Studio is running with an embedding model loaded.');
    console.log('Expected model: text-embedding-qwen3-embedding-8b');
    process.exit(1);
  }

  // Test single embedding
  console.log('\n--- Single Embedding Test ---\n');

  const testText = 'The quick brown fox jumps over the lazy dog.';
  console.log(`Input text: "${testText}"`);

  const startSingle = Date.now();
  const singleResult = await embeddingService.embed(testText);
  const singleTime = Date.now() - startSingle;

  console.log(`\nEmbedding result:`);
  console.log(`  Model: ${singleResult.model}`);
  console.log(`  Provider: ${singleResult.provider}`);
  console.log(`  Dimensions: ${singleResult.embedding.length}`);
  console.log(`  Time: ${singleTime}ms`);
  console.log(`  First 5 values: [${singleResult.embedding.slice(0, 5).join(', ')}...]`);

  // Test batch embedding
  console.log('\n--- Batch Embedding Test ---\n');

  const batchTexts = [
    'TypeScript is a typed superset of JavaScript.',
    'Python is a high-level programming language.',
    'Rust provides memory safety without garbage collection.',
    'Go is designed for simplicity and efficiency.',
    'Java is a class-based, object-oriented language.',
  ];

  console.log('Input texts:');
  batchTexts.forEach((text, i) => console.log(`  ${i + 1}. "${text}"`));

  const startBatch = Date.now();
  const batchResult = await embeddingService.embedBatch(batchTexts);
  const batchTime = Date.now() - startBatch;

  console.log(`\nBatch embedding result:`);
  console.log(`  Model: ${batchResult.model}`);
  console.log(`  Provider: ${batchResult.provider}`);
  console.log(`  Number of embeddings: ${batchResult.embeddings.length}`);
  console.log(`  Dimensions per embedding: ${batchResult.embeddings[0]?.length ?? 0}`);
  console.log(`  Total time: ${batchTime}ms`);
  console.log(`  Average per text: ${Math.round(batchTime / batchTexts.length)}ms`);

  // Test similarity between embeddings
  console.log('\n--- Similarity Test ---\n');

  const cosine = (a: number[], b: number[]): number => {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  console.log('Cosine similarities between texts:');
  for (let i = 0; i < batchResult.embeddings.length; i++) {
    for (let j = i + 1; j < batchResult.embeddings.length; j++) {
      const sim = cosine(batchResult.embeddings[i]!, batchResult.embeddings[j]!);
      console.log(
        `  "${batchTexts[i]?.slice(0, 30)}..." <-> "${batchTexts[j]?.slice(0, 30)}...": ${sim.toFixed(4)}`
      );
    }
  }

  // Test semantic similarity with related concepts
  console.log('\n--- Semantic Similarity Test ---\n');

  const semanticTexts = [
    'Database query optimization techniques',
    'How to make SQL queries faster',
    'Cooking recipes for Italian pasta',
  ];

  const semanticResult = await embeddingService.embedBatch(semanticTexts);

  console.log('Testing semantic understanding:');
  semanticTexts.forEach((text, i) => console.log(`  ${i + 1}. "${text}"`));

  const sim12 = cosine(semanticResult.embeddings[0]!, semanticResult.embeddings[1]!);
  const sim13 = cosine(semanticResult.embeddings[0]!, semanticResult.embeddings[2]!);
  const sim23 = cosine(semanticResult.embeddings[1]!, semanticResult.embeddings[2]!);

  console.log('\nSimilarities:');
  console.log(`  1 <-> 2 (both about DB/SQL): ${sim12.toFixed(4)}`);
  console.log(`  1 <-> 3 (DB vs cooking): ${sim13.toFixed(4)}`);
  console.log(`  2 <-> 3 (SQL vs cooking): ${sim23.toFixed(4)}`);

  if (sim12 > sim13 && sim12 > sim23) {
    console.log(
      '\nModel correctly identifies that texts 1 and 2 are most similar (both database-related).'
    );
  } else {
    console.log('\nWarning: Unexpected similarity ranking.');
  }

  console.log('\n==========================================');
  console.log('LM Studio embedding integration working!');
}

main().catch(console.error);

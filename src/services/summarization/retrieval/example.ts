/**
 * Example Usage of Coarse-to-Fine Retrieval
 *
 * Demonstrates how to use the hierarchical summarization retrieval system.
 */

/* eslint-disable no-console */

import { getDb } from '../../../db/connection.js';
import { EmbeddingService } from '../../embedding.service.js';
import { CoarseToFineRetriever } from './coarse-to-fine.js';
import type { CoarseToFineOptions } from './types.js';

/**
 * Example: Search hierarchically for relevant memory entries
 */
export async function exampleHierarchicalSearch(): Promise<void> {
  // Get dependencies
  const db = getDb();
  const embeddingService = new EmbeddingService();

  // Create retriever
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  // Search options
  const options: CoarseToFineOptions = {
    query: 'How do I implement user authentication?',
    scopeType: 'project',
    scopeId: 'my-project-id',
    maxResults: 10,
    expansionFactor: 3,
    minSimilarity: 0.6,
    entryTypes: ['guideline', 'knowledge'], // Only return guidelines and knowledge
  };

  // Perform retrieval
  const result = await retriever.retrieve(options);

  console.log(`Found ${result.entries.length} relevant entries in ${result.totalTimeMs}ms`);
  console.log('Retrieval steps:');
  result.steps.forEach((step) => {
    console.log(
      `  Level ${step.level}: searched ${step.summariesSearched}, matched ${step.summariesMatched} (${step.timeMs}ms)`
    );
  });

  console.log('\nTop results:');
  result.entries.slice(0, 5).forEach((entry, i) => {
    console.log(`  ${i + 1}. [${entry.type}] ${entry.id} (score: ${entry.score.toFixed(3)})`);
    console.log(`     Path: ${entry.pathTitles?.join(' > ')}`);
  });
}

/**
 * Example: Browse top-level summaries
 */
export async function exampleBrowseTopLevel(): Promise<void> {
  const db = getDb();
  const embeddingService = new EmbeddingService();
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  // Get top-level summaries for a project
  const topLevel = await retriever.getTopLevel('project', 'my-project-id');

  console.log(`Found ${topLevel.length} top-level summaries:`);
  topLevel.forEach((summary) => {
    console.log(
      `  - ${summary.title} (level ${summary.hierarchyLevel}, ${summary.memberCount} members)`
    );
    console.log(
      `    Coherence: ${summary.coherenceScore?.toFixed(2)}, Compression: ${summary.compressionRatio?.toFixed(2)}`
    );
  });
}

/**
 * Example: Drill down into a specific summary
 */
export async function exampleDrillDown(summaryId: string): Promise<void> {
  const db = getDb();
  const embeddingService = new EmbeddingService();
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  // Drill down to see children and members
  const result = await retriever.drillDown(summaryId);

  console.log(`Summary: ${result.summary.title}`);
  console.log(`Level: ${result.summary.hierarchyLevel}`);
  console.log(`Content: ${result.summary.content.substring(0, 200)}...`);

  if (result.children.length > 0) {
    console.log(`\nChild summaries (${result.children.length}):`);
    result.children.forEach((child) => {
      console.log(`  - ${child.title} (${child.memberCount} members)`);
    });
  }

  if (result.members.length > 0) {
    console.log(`\nDirect members (${result.members.length}):`);
    result.members.forEach((member) => {
      console.log(`  - [${member.type}] ${member.id} (score: ${member.score.toFixed(3)})`);
    });
  }
}

/**
 * Example: Progressive refinement search
 * Start broad, then narrow down based on user feedback
 */
export async function exampleProgressiveRefinement(): Promise<void> {
  const db = getDb();
  const embeddingService = new EmbeddingService();
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  // Step 1: Get domain-level overview
  console.log('Step 1: Getting domain-level summaries...');
  const domains = await retriever.getTopLevel('project', 'my-project-id');
  console.log(
    `Found ${domains.length} domains:`,
    domains.map((d) => d.title)
  );

  // Step 2: User selects "Backend Development" domain
  const selectedDomain = domains.find((d) => d.title.includes('Backend'));
  if (!selectedDomain) {
    console.log('No backend domain found');
    return;
  }

  console.log(`\nStep 2: Drilling into "${selectedDomain.title}"...`);
  const drillDown = await retriever.drillDown(selectedDomain.id);
  console.log(`Found ${drillDown.children.length} topic summaries`);

  // Step 3: User refines with a specific query
  console.log('\nStep 3: Searching within this domain for "database migrations"...');
  const refined = await retriever.retrieve({
    query: 'database migrations',
    scopeType: 'project',
    scopeId: 'my-project-id',
    startLevel: 1, // Start from topic level (skip domain level)
    maxResults: 5,
  });

  console.log(`Found ${refined.entries.length} specific entries:`);
  refined.entries.forEach((entry) => {
    console.log(`  - [${entry.type}] ${entry.id} (score: ${entry.score.toFixed(3)})`);
  });
}

/**
 * Example: Performance comparison
 * Compare hierarchical vs flat search
 */
export async function examplePerformanceComparison(): Promise<void> {
  const db = getDb();
  const embeddingService = new EmbeddingService();
  const retriever = new CoarseToFineRetriever(db, embeddingService);

  const query = 'error handling patterns';

  // Hierarchical search
  console.log('Hierarchical search:');
  const hierarchicalResult = await retriever.retrieve({
    query,
    scopeType: 'project',
    scopeId: 'my-project-id',
    maxResults: 10,
  });

  console.log(`  Time: ${hierarchicalResult.totalTimeMs}ms`);
  console.log(`  Results: ${hierarchicalResult.entries.length}`);
  console.log('  Steps:');
  hierarchicalResult.steps.forEach((step) => {
    console.log(
      `    Level ${step.level}: ${step.summariesSearched} searched, ${step.summariesMatched} matched`
    );
  });

  // For comparison, you could implement flat search here
  // (searching all entries directly without hierarchy)
}

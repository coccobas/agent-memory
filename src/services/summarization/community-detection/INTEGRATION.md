# Integration Guide: Community Detection with Hierarchical Summarization

This guide shows how to integrate the community detection module with the hierarchical summarization service.

## Architecture Overview

```
Memory Entries (L0)
       ↓
  [Community Detection]
       ↓
  Communities (L1)
       ↓
  [Recursive Detection]
       ↓
Super-Communities (L2)
       ↓
   [Summary Generation]
       ↓
 Hierarchical Summaries
```

## Basic Integration Example

```typescript
import { DrizzleDB } from '../../db/index.js';
import { EmbeddingService } from '../embedding.service.js';
import { detectCommunities, type CommunityNode } from './community-detection/index.js';
import type { SelectKnowledgeEntry, SelectGuideline, SelectTool } from '../../db/schema.js';

export class HierarchicalSummarizationService {
  constructor(
    private db: DrizzleDB,
    private embeddingService: EmbeddingService
  ) {}

  /**
   * Step 1: Collect memory entries and convert to community nodes
   */
  async collectNodes(scopeType: string, scopeId: string): Promise<CommunityNode[]> {
    const nodes: CommunityNode[] = [];

    // Collect knowledge entries
    const knowledge = await this.db.query.knowledgeEntries.findMany({
      where: (k, { eq, and }) =>
        and(eq(k.scopeType, scopeType), eq(k.scopeId, scopeId), eq(k.isActive, true)),
    });

    for (const entry of knowledge) {
      nodes.push({
        id: `knowledge-${entry.id}`,
        type: 'knowledge',
        embedding: entry.embedding as number[] | undefined,
        metadata: {
          title: entry.title,
          category: entry.category,
        },
      });
    }

    // Collect guidelines
    const guidelines = await this.db.query.guidelines.findMany({
      where: (g, { eq, and }) =>
        and(eq(g.scopeType, scopeType), eq(g.scopeId, scopeId), eq(g.isActive, true)),
    });

    for (const guideline of guidelines) {
      nodes.push({
        id: `guideline-${guideline.id}`,
        type: 'guideline',
        embedding: guideline.embedding as number[] | undefined,
        metadata: {
          name: guideline.name,
          category: guideline.category,
        },
      });
    }

    // Collect tools
    const tools = await this.db.query.tools.findMany({
      where: (t, { eq, and }) =>
        and(eq(t.scopeType, scopeType), eq(t.scopeId, scopeId), eq(t.isActive, true)),
    });

    for (const tool of tools) {
      nodes.push({
        id: `tool-${tool.id}`,
        type: 'tool',
        embedding: tool.embedding as number[] | undefined,
        metadata: {
          name: tool.name,
          type: tool.type,
        },
      });
    }

    return nodes;
  }

  /**
   * Step 2: Generate embeddings for nodes that don't have them
   */
  async ensureEmbeddings(nodes: CommunityNode[]): Promise<CommunityNode[]> {
    const results: CommunityNode[] = [];

    for (const node of nodes) {
      if (node.embedding) {
        results.push(node);
        continue;
      }

      // Generate embedding from metadata
      const text = this.nodeToText(node);
      const embedding = await this.embeddingService.generateEmbedding(text);

      results.push({
        ...node,
        embedding,
      });
    }

    return results;
  }

  /**
   * Step 3: Detect communities
   */
  async detectMemoryCommunities(
    scopeType: string,
    scopeId: string,
    config?: {
      similarityThreshold?: number;
      minCommunitySize?: number;
      algorithm?: 'leiden' | 'connected';
    }
  ) {
    // Collect all memory entries as nodes
    const rawNodes = await this.collectNodes(scopeType, scopeId);

    // Ensure all nodes have embeddings
    const nodes = await this.ensureEmbeddings(rawNodes);

    // Detect communities
    const result = await detectCommunities(
      nodes,
      {
        similarityThreshold: config?.similarityThreshold ?? 0.75,
        minCommunitySize: config?.minCommunitySize ?? 3,
      },
      config?.algorithm ?? 'leiden'
    );

    return result;
  }

  /**
   * Step 4: Generate summaries for each community
   */
  async generateCommunitySummaries(
    result: CommunityDetectionResult,
    scopeType: string,
    scopeId: string
  ): Promise<Summary[]> {
    const summaries: Summary[] = [];

    for (const community of result.communities) {
      // Gather full entry data for community members
      const entries = await this.fetchFullEntries(community.members);

      // Generate summary using LLM
      const summary = await this.generateSummary(entries, {
        communityId: community.id,
        cohesion: community.cohesion,
        dominantTypes: community.metadata?.dominantTypes,
      });

      summaries.push({
        id: community.id,
        level: 1, // First level above individual entries
        scopeType,
        scopeId,
        content: summary,
        centroid: community.centroid,
        memberCount: community.members.length,
        cohesion: community.cohesion,
        metadata: {
          memberIds: community.members.map((m) => m.id),
          dominantTypes: community.metadata?.dominantTypes,
        },
      });
    }

    return summaries;
  }

  /**
   * Step 5: Recursive community detection for higher levels
   */
  async buildHierarchy(
    scopeType: string,
    scopeId: string,
    maxLevels = 3
  ): Promise<HierarchicalSummary> {
    const levels: Summary[][] = [];

    // Level 0: Individual entries (not stored in levels array)
    // Level 1: First level communities
    const level1Result = await this.detectMemoryCommunities(scopeType, scopeId);
    const level1Summaries = await this.generateCommunitySummaries(level1Result, scopeType, scopeId);
    levels.push(level1Summaries);

    // Level 2+: Communities of communities
    let currentLevel = 2;
    let previousSummaries = level1Summaries;

    while (currentLevel <= maxLevels && previousSummaries.length > 1) {
      // Convert summaries to nodes
      const nodes: CommunityNode[] = previousSummaries.map((s) => ({
        id: s.id,
        type: 'summary',
        embedding: s.centroid,
        metadata: s.metadata,
      }));

      // Detect communities at this level
      const result = await detectCommunities(nodes, {
        similarityThreshold: 0.7, // Slightly lower for higher levels
        minCommunitySize: 2, // Allow smaller communities at higher levels
      });

      if (result.communities.length === 0) {
        break; // No more grouping possible
      }

      // Generate summaries for this level
      const summaries: Summary[] = [];
      for (const community of result.communities) {
        const childSummaries = community.members.map(
          (m) => previousSummaries.find((s) => s.id === m.id)!
        );

        const summary = await this.generateMetaSummary(childSummaries, {
          level: currentLevel,
          cohesion: community.cohesion,
        });

        summaries.push({
          id: `level${currentLevel}-${community.id}`,
          level: currentLevel,
          scopeType,
          scopeId,
          content: summary,
          centroid: community.centroid,
          memberCount: community.members.length,
          cohesion: community.cohesion,
          metadata: {
            childSummaryIds: community.members.map((m) => m.id),
          },
        });
      }

      levels.push(summaries);
      previousSummaries = summaries;
      currentLevel++;
    }

    return {
      scopeType,
      scopeId,
      levels,
      totalLevels: levels.length,
      createdAt: new Date().toISOString(),
    };
  }

  // Helper methods

  private nodeToText(node: CommunityNode): string {
    const meta = node.metadata || {};
    return `${node.type}: ${meta.title || meta.name || node.id}`;
  }

  private async fetchFullEntries(members: CommunityNode[]) {
    // Fetch full entry data from database
    // Implementation depends on your schema
    return [];
  }

  private async generateSummary(entries: any[], context: any): Promise<string> {
    // Use LLM to generate summary
    // Implementation depends on your LLM service
    return 'Summary placeholder';
  }

  private async generateMetaSummary(childSummaries: Summary[], context: any): Promise<string> {
    // Use LLM to generate meta-summary from child summaries
    // Implementation depends on your LLM service
    return 'Meta-summary placeholder';
  }
}

// Type definitions

interface Summary {
  id: string;
  level: number;
  scopeType: string;
  scopeId: string;
  content: string;
  centroid?: number[];
  memberCount: number;
  cohesion: number;
  metadata?: Record<string, any>;
}

interface HierarchicalSummary {
  scopeType: string;
  scopeId: string;
  levels: Summary[][];
  totalLevels: number;
  createdAt: string;
}
```

## Query Example: Traversing the Hierarchy

```typescript
export class SummaryQueryService {
  /**
   * Get summary at appropriate level based on desired abstraction
   */
  async getSummaryAtLevel(hierarchy: HierarchicalSummary, targetLevel: number): Summary[] {
    if (targetLevel >= hierarchy.levels.length) {
      // Return highest level available
      return hierarchy.levels[hierarchy.levels.length - 1] || [];
    }

    return hierarchy.levels[targetLevel] || [];
  }

  /**
   * Find most relevant summary for a query
   */
  async findRelevantSummary(
    hierarchy: HierarchicalSummary,
    queryEmbedding: number[],
    maxLevel?: number
  ): Promise<Summary | null> {
    const searchLevels = maxLevel ? hierarchy.levels.slice(0, maxLevel + 1) : hierarchy.levels;

    let bestMatch: { summary: Summary; similarity: number } | null = null;

    // Search from highest to lowest level
    for (let i = searchLevels.length - 1; i >= 0; i--) {
      const levelSummaries = searchLevels[i]!;

      for (const summary of levelSummaries) {
        if (!summary.centroid) continue;

        const similarity = cosineSimilarity(queryEmbedding, summary.centroid);

        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { summary, similarity };
        }
      }

      // If we found a good match at this level, return it
      if (bestMatch && bestMatch.similarity > 0.8) {
        return bestMatch.summary;
      }
    }

    return bestMatch?.summary || null;
  }

  /**
   * Drill down from high-level summary to specific entries
   */
  async drillDown(hierarchy: HierarchicalSummary, summaryId: string): Promise<Summary[]> {
    // Find the summary in the hierarchy
    let summary: Summary | undefined;
    let level = -1;

    for (let i = 0; i < hierarchy.levels.length; i++) {
      const found = hierarchy.levels[i]?.find((s) => s.id === summaryId);
      if (found) {
        summary = found;
        level = i;
        break;
      }
    }

    if (!summary || level === 0) {
      return []; // Already at lowest level or not found
    }

    // Get child summaries from previous level
    const childIds = summary.metadata?.childSummaryIds || [];
    const previousLevel = hierarchy.levels[level - 1] || [];

    return previousLevel.filter((s) => childIds.includes(s.id));
  }
}
```

## Performance Optimization

```typescript
export class OptimizedHierarchicalService extends HierarchicalSummarizationService {
  /**
   * Use caching to avoid recomputing communities
   */
  private communityCache = new Map<string, CommunityDetectionResult>();

  async detectMemoryCommunities(scopeType: string, scopeId: string, config?: any) {
    const cacheKey = `${scopeType}:${scopeId}:${JSON.stringify(config)}`;

    if (this.communityCache.has(cacheKey)) {
      return this.communityCache.get(cacheKey)!;
    }

    const result = await super.detectMemoryCommunities(scopeType, scopeId, config);

    this.communityCache.set(cacheKey, result);
    return result;
  }

  /**
   * Batch process multiple scopes
   */
  async buildHierarchiesForMultipleScopes(
    scopes: Array<{ type: string; id: string }>
  ): Promise<Map<string, HierarchicalSummary>> {
    const results = new Map<string, HierarchicalSummary>();

    // Process in parallel
    await Promise.all(
      scopes.map(async (scope) => {
        const hierarchy = await this.buildHierarchy(scope.type, scope.id);
        results.set(`${scope.type}:${scope.id}`, hierarchy);
      })
    );

    return results;
  }

  /**
   * Incremental update when new entries are added
   */
  async updateHierarchy(
    existingHierarchy: HierarchicalSummary,
    newEntries: CommunityNode[]
  ): Promise<HierarchicalSummary> {
    // Only recompute if significant change
    const changeThreshold = 0.1; // 10% change

    const totalEntries = this.countEntriesInHierarchy(existingHierarchy);
    const changeRatio = newEntries.length / totalEntries;

    if (changeRatio < changeThreshold) {
      // Incremental update: only affected communities
      return this.incrementalUpdate(existingHierarchy, newEntries);
    } else {
      // Full rebuild
      return this.buildHierarchy(existingHierarchy.scopeType, existingHierarchy.scopeId);
    }
  }

  private countEntriesInHierarchy(hierarchy: HierarchicalSummary): number {
    if (hierarchy.levels.length === 0) return 0;
    const level0 = hierarchy.levels[0] || [];
    return level0.reduce((sum, s) => sum + s.memberCount, 0);
  }

  private async incrementalUpdate(
    hierarchy: HierarchicalSummary,
    newEntries: CommunityNode[]
  ): Promise<HierarchicalSummary> {
    // Implementation of incremental update logic
    // This is complex and depends on specific requirements
    return hierarchy;
  }
}
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('Hierarchical Summarization with Community Detection', () => {
  it('should build multi-level hierarchy', async () => {
    const service = new HierarchicalSummarizationService(db, embeddingService);

    const hierarchy = await service.buildHierarchy('project', 'test-project');

    expect(hierarchy.levels.length).toBeGreaterThan(0);
    expect(hierarchy.levels[0]).toBeDefined();

    // Verify each level has fewer summaries than the previous
    for (let i = 1; i < hierarchy.levels.length; i++) {
      const prevLevel = hierarchy.levels[i - 1]!;
      const currLevel = hierarchy.levels[i]!;
      expect(currLevel.length).toBeLessThanOrEqual(prevLevel.length);
    }
  });

  it('should maintain semantic coherence in communities', async () => {
    const service = new HierarchicalSummarizationService(db, embeddingService);

    const result = await service.detectMemoryCommunities('project', 'test-project');

    // All communities should have acceptable cohesion
    for (const community of result.communities) {
      expect(community.cohesion).toBeGreaterThan(0.5);
    }
  });

  it('should find relevant summaries efficiently', async () => {
    const queryService = new SummaryQueryService();
    const queryEmbedding = [0.1, 0.2, 0.3];

    const summary = await queryService.findRelevantSummary(hierarchy, queryEmbedding);

    expect(summary).toBeDefined();
    expect(summary?.centroid).toBeDefined();
  });
});
```

## Next Steps

1. Implement LLM integration for summary generation
2. Add database schema for storing hierarchical summaries
3. Create API endpoints for querying hierarchies
4. Add monitoring for community detection performance
5. Implement cache invalidation strategy
6. Add support for incremental updates
7. Create visualization tools for hierarchy exploration

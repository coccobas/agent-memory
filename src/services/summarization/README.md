# Hierarchical Summarization Service

Multi-level summarization of memory entries using community detection and LLM-based summarization.

## Overview

The hierarchical summarization service creates multi-level summaries of memory entries (tools, guidelines, knowledge, experiences) by:

1. **Community Detection**: Groups similar entries using the Leiden algorithm with embedding-based similarity
2. **LLM Summarization**: Generates concise summaries for each community
3. **Recursive Hierarchy**: Builds higher-level summaries of summaries until reaching a configurable maximum depth

## Architecture

```
Level 0 (Original Entries)
  ├─ Entry 1 (tool)
  ├─ Entry 2 (guideline)
  ├─ Entry 3 (knowledge)
  └─ Entry 4 (experience)
       ↓
  Community Detection
       ↓
Level 1 (First-level Summaries)
  ├─ Summary A (entries 1, 2)
  └─ Summary B (entries 3, 4)
       ↓
  Community Detection
       ↓
Level 2 (Second-level Summary)
  └─ Summary C (summaries A, B)
```

## Features

- **Configurable Hierarchy Depth**: Control max levels (default: 3)
- **Adaptive Grouping**: Minimum group size ensures meaningful summaries
- **Similarity Threshold**: Tunable threshold for grouping related entries
- **Community Resolution**: Control granularity of community detection
- **Multiple LLM Providers**: OpenAI, Anthropic, Ollama, or disabled

## Usage

### Basic Usage

```typescript
import { HierarchicalSummarizationService } from './services/summarization';

// Service is created in factory with default config
const summarizationService = context.services.summarization;

// Build summaries for a project
const result = await summarizationService.buildSummaries({
  scopeType: 'project',
  scopeId: 'my-project',
  entryTypes: ['tool', 'guideline', 'knowledge'],
  forceRebuild: false, // Use existing summaries if available
});

console.log(`Created ${result.summariesCreated} summaries across ${result.levelsBuilt} levels`);
console.log(`Processing time: ${result.processingTimeMs}ms`);
```

### Custom Configuration

```typescript
const service = new HierarchicalSummarizationService(
  db,
  embeddingService,
  extractionService,
  vectorService,
  {
    maxLevels: 4, // Build up to 4 levels
    minGroupSize: 5, // Require at least 5 entries per summary
    similarityThreshold: 0.8, // Higher threshold = more selective grouping
    communityResolution: 1.5, // Higher = more, smaller communities
    provider: 'openai',
    model: 'gpt-4o-mini',
  }
);
```

### Querying Summaries

```typescript
// Get all level 1 summaries for a project
const level1Summaries = await service.getSummariesAtLevel(1, 'project', 'my-project');

// Search summaries semantically
const relevant = await service.searchSummaries('API design patterns', {
  level: 1, // Only search level 1
  limit: 5,
});

// Get build status
const status = await service.getStatus('project', 'my-project');
console.log(`Last built: ${status.lastBuilt}`);
console.log(`Total summaries: ${status.summaryCount}`);
console.log(`Level 1: ${status.countByLevel.level1}`);
```

## Configuration Options

### HierarchicalSummarizationConfig

| Option                | Type    | Default    | Description                                                |
| --------------------- | ------- | ---------- | ---------------------------------------------------------- |
| `maxLevels`           | number  | 3          | Maximum hierarchy depth (1-3)                              |
| `minGroupSize`        | number  | 3          | Minimum entries required for a summary                     |
| `similarityThreshold` | number  | 0.75       | Similarity threshold for grouping (0-1)                    |
| `communityResolution` | number  | 1.0        | Leiden resolution parameter                                |
| `provider`            | string  | 'disabled' | LLM provider ('openai', 'anthropic', 'ollama', 'disabled') |
| `model`               | string? | undefined  | Model name override                                        |

### BuildSummariesOptions

| Option         | Type      | Default   | Description                                        |
| -------------- | --------- | --------- | -------------------------------------------------- |
| `scopeType`    | string    | required  | Scope type ('global', 'org', 'project', 'session') |
| `scopeId`      | string?   | undefined | Scope ID (required for non-global scopes)          |
| `entryTypes`   | string[]? | all types | Entry types to include                             |
| `forceRebuild` | boolean?  | false     | Force rebuild even if summaries exist              |
| `maxLevels`    | number?   | undefined | Override config.maxLevels                          |
| `minGroupSize` | number?   | undefined | Override config.minGroupSize                       |

## Implementation Status

### ✅ Completed

- Core types and interfaces
- Service skeleton with proper DI
- Integration with service factory
- Type-safe interfaces

### 🚧 TODO (Implementation Required)

The following methods need implementation:

1. **Data Fetching**
   - `fetchEntriesForSummarization()`: Query tools, guidelines, knowledge, experiences
   - `ensureEmbeddings()`: Get or generate embeddings for entries

2. **Community Detection**
   - `detectCommunities()`: Implement Leiden algorithm integration
   - Build similarity graph from embeddings
   - Detect communities with configurable resolution

3. **Summarization**
   - `summarizeCommunity()`: Call LLM to generate summary
   - Build context from community members
   - Parse and validate LLM response

4. **Storage**
   - `storeSummary()`: Store summary as knowledge entry with metadata
   - Mark entries with `metadata.isSummary = true`
   - Track hierarchy level and member relationships

5. **Querying**
   - `getSummary()`: Retrieve summary by ID
   - `getSummariesAtLevel()`: Query summaries at specific level
   - `getChildSummaries()`: Get children of a summary
   - `searchSummaries()`: Semantic/text search of summaries
   - `getStatus()`: Get build status and statistics

6. **Deletion**
   - `deleteSummaries()`: Remove all summaries for a scope

## Database Schema

Summaries are stored as special knowledge entries with metadata:

```typescript
{
  // Standard knowledge fields
  id: string,
  scopeType: string,
  scopeId: string,
  title: string,
  content: string, // LLM-generated summary

  // Summary-specific metadata
  metadata: {
    isSummary: true,
    hierarchyLevel: 1 | 2 | 3,
    memberIds: string[], // Entry/summary IDs
    memberCount: number, // Total entries represented
    cohesion: number, // Community cohesion score
    model: string, // LLM model used
    provider: string, // LLM provider
    processingTimeMs: number
  }
}
```

## Community Detection

Uses the Leiden algorithm for community detection:

1. **Build Similarity Graph**: Create edges between entries with similarity > threshold
2. **Run Leiden**: Detect communities using resolution parameter
3. **Filter Small Communities**: Merge or discard communities < minGroupSize
4. **Calculate Cohesion**: Measure average pairwise similarity within community

See `community-detection/types.ts` for full type definitions.

## Error Handling

The service validates:

- Provider is configured (not 'disabled')
- Scope parameters are valid
- Embeddings are available
- Minimum group size is met
- Maximum levels is not exceeded

Errors are logged with structured context for debugging.

## Performance Considerations

- **Embedding Cache**: Reuses existing embeddings when possible
- **Batch Processing**: Processes communities in parallel where safe
- **Incremental Builds**: Supports rebuilding only changed portions (TODO)
- **Memory Efficiency**: Uses streaming for large result sets (TODO)

## Future Enhancements

1. **Incremental Updates**: Only rebuild affected portions when entries change
2. **Custom Summarizers**: Support domain-specific summarization templates
3. **Interactive Refinement**: Allow users to adjust summaries
4. **Visualization**: Generate hierarchy visualizations
5. **Summary Quality Metrics**: Track and optimize summary quality
6. **Multi-modal Summaries**: Support code, images, diagrams

## Related Components

- **Community Detection**: `community-detection/types.ts`
- **Embedding Service**: `../embedding.service.ts`
- **Extraction Service**: `../extraction.service.ts`
- **Vector Service**: `../vector.service.ts`
- **Query Service**: `../query/`

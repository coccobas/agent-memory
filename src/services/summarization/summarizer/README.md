# LLM Summarizer

Hierarchical memory summarization with level-aware prompts for the Agent Memory system.

## Overview

The LLM Summarizer provides intelligent, context-aware summarization at four distinct hierarchy levels:

- **Level 0 (Chunk)**: Summarize individual memory entries while preserving technical details
- **Level 1 (Topic)**: Synthesize related entries into thematic summaries
- **Level 2 (Domain)**: Combine themes into comprehensive domain knowledge
- **Level 3 (Global)**: Create executive-level strategic summaries

Each level uses specialized prompts optimized for the appropriate granularity and focus.

## Features

- **Multi-Provider Support**: OpenAI, Anthropic, Ollama, or disabled (fallback)
- **Level-Aware Prompts**: Different prompts for each hierarchy level
- **Type-Safe**: Full TypeScript type coverage
- **Graceful Fallback**: Works without LLM by extracting key sentences
- **Batch Processing**: Efficient batch summarization support
- **Configurable**: Adjustable temperature, max tokens, and more

## Installation

The summarizer is part of the Agent Memory services. No additional installation required.

```typescript
import { LLMSummarizer } from './services/summarization/summarizer/index.js';
```

## Quick Start

### Basic Usage

```typescript
import { LLMSummarizer } from './services/summarization/summarizer/index.js';

// Create summarizer
const summarizer = new LLMSummarizer({
  provider: 'openai',
  openaiApiKey: process.env.AGENT_MEMORY_OPENAI_API_KEY,
  maxTokens: 1024,
  temperature: 0.3,
});

// Summarize entries
const result = await summarizer.summarize({
  items: [
    {
      id: 'kb-001',
      type: 'knowledge',
      title: 'Database Migration',
      content: 'Migrated from SQLite to PostgreSQL...',
      metadata: { tags: ['database', 'migration'] },
    },
  ],
  hierarchyLevel: 0,
  scopeContext: 'Backend Infrastructure',
});

console.log(result.title); // "Database Migration Summary"
console.log(result.content); // Concise summary
console.log(result.keyTerms); // ["postgresql", "migration", ...]
```

### Configuration Options

```typescript
interface SummarizerConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'disabled';
  model?: string; // Optional model override
  openaiApiKey?: string; // Required for OpenAI
  anthropicApiKey?: string; // Required for Anthropic
  ollamaBaseUrl?: string; // Ollama endpoint
  openaiBaseUrl?: string; // Custom OpenAI endpoint
  maxTokens?: number; // Default: 1024
  temperature?: number; // Default: 0.3
  enableBatching?: boolean; // Default: true
}
```

### Default Models by Provider

- **OpenAI**: `gpt-4o-mini` (fast, cost-effective)
- **Anthropic**: `claude-3-5-haiku-20241022` (optimized for summarization)
- **Ollama**: `llama3.2` (local LLM)

## Hierarchy Levels

### Level 0: Chunk (Individual Entries)

Summarizes individual memory entries while preserving all critical technical details.

```typescript
const result = await summarizer.summarize({
  items: [singleEntry],
  hierarchyLevel: 0,
  scopeContext: 'Project Context',
});
```

**Focus**: Technical precision, action items, exact terminology
**Output**: 3-5 sentences, 2-5 key terms

### Level 1: Topic (Thematic Summary)

Identifies common themes across related entries and creates a coherent narrative.

```typescript
const result = await summarizer.summarize({
  items: relatedEntries,
  hierarchyLevel: 1,
  scopeContext: 'Feature Area',
});
```

**Focus**: Patterns, relationships, thematic coherence
**Output**: 1-2 paragraphs, 5-8 key terms

### Level 2: Domain (Domain Knowledge)

Synthesizes themes into comprehensive domain-level architectural knowledge.

```typescript
const result = await summarizer.summarize({
  items: thematicSummaries,
  hierarchyLevel: 2,
  scopeContext: 'System Architecture',
  focusAreas: ['scalability', 'security'],
});
```

**Focus**: Architecture, patterns, design decisions
**Output**: 2-3 paragraphs, 8-12 key terms

### Level 3: Global (Executive Summary)

Creates strategic overview with key decisions and recommendations.

```typescript
const result = await summarizer.summarize({
  items: domainSummaries,
  hierarchyLevel: 3,
  scopeContext: 'Entire System',
  focusAreas: ['priorities', 'risks'],
});
```

**Focus**: Strategy, priorities, cross-domain insights
**Output**: 3-4 paragraphs (structured), 10-15 key terms

## Advanced Usage

### Batch Summarization

Process multiple summarization requests efficiently:

```typescript
const results = await summarizer.summarizeBatch([
  { items: chunk1, hierarchyLevel: 0 },
  { items: chunk2, hierarchyLevel: 0 },
  { items: chunk3, hierarchyLevel: 0 },
]);

console.log(results.results.length); // 3
console.log(results.totalProcessingTimeMs); // Total time
```

### Using Different Providers

#### OpenAI

```typescript
const summarizer = new LLMSummarizer({
  provider: 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o', // Override default
});
```

#### Anthropic

```typescript
const summarizer = new LLMSummarizer({
  provider: 'anthropic',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022', // More powerful
});
```

#### Ollama (Local)

```typescript
const summarizer = new LLMSummarizer({
  provider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  model: 'llama3.2',
});
```

#### Fallback Mode (No LLM)

```typescript
const summarizer = new LLMSummarizer({
  provider: 'disabled',
});
// Uses key sentence extraction as fallback
```

### Hierarchical Context

Pass parent summaries for context continuity:

```typescript
// Level 1 summary
const topicSummary = await summarizer.summarize({
  items: entries,
  hierarchyLevel: 1,
});

// Level 2 summary with parent context
const domainSummary = await summarizer.summarize({
  items: [
    {
      id: 'topic-001',
      type: 'summary',
      title: topicSummary.title,
      content: topicSummary.content,
      metadata: { keyTerms: topicSummary.keyTerms },
    },
    // ... more topics
  ],
  hierarchyLevel: 2,
  parentSummary: topicSummary.content,
});
```

### Focus Areas

Guide summarization with specific focus areas:

```typescript
const result = await summarizer.summarize({
  items: entries,
  hierarchyLevel: 2,
  focusAreas: ['security', 'performance', 'scalability'],
});
// Summary will emphasize these areas
```

## Response Format

All summarization results return:

```typescript
interface SummarizationResult {
  title: string; // Descriptive title
  content: string; // Summary content
  keyTerms: string[]; // Extracted key concepts
  confidence: number; // 0-1 confidence score
  model?: string; // Model used
  provider?: LLMProvider; // Provider used
  processingTimeMs?: number; // Processing time
}
```

## Best Practices

1. **Choose Appropriate Level**: Match hierarchy level to your use case
2. **Provide Context**: Use `scopeContext` for better results
3. **Pass Key Terms Up**: Include `keyTerms` in metadata for higher levels
4. **Handle Errors**: Fallback mode prevents failures
5. **Monitor Costs**: Use `gpt-4o-mini` or Anthropic Haiku for cost efficiency
6. **Batch When Possible**: More efficient than individual calls
7. **Adjust Temperature**: Lower (0.2-0.3) for factual, higher (0.5-0.7) for creative

## Integration with Agent Memory

The summarizer integrates with the hierarchical summarization system:

```typescript
import { LLMSummarizer } from './services/summarization/summarizer/index.js';
import { config } from './config/index.js';

// Create from global config
const summarizer = new LLMSummarizer({
  provider: config.extraction.provider, // Reuse extraction config
  openaiApiKey: config.extraction.openaiApiKey,
  anthropicApiKey: config.extraction.anthropicApiKey,
  ollamaBaseUrl: config.extraction.ollamaBaseUrl,
  model: config.extraction.openaiModel,
});
```

## Performance Considerations

- **Token Limits**: Default 1024 tokens. Increase for longer summaries.
- **Timeouts**: 120s timeout for LLM calls (configurable via retry utility)
- **Rate Limits**: Respect provider rate limits (use batch operations)
- **Caching**: Consider caching summaries at each level
- **Fallback**: Always available, no API dependency

## Error Handling

The summarizer includes comprehensive error handling:

```typescript
try {
  const result = await summarizer.summarize(request);
} catch (error) {
  // LLM error -> automatic fallback to key sentence extraction
  // Invalid request -> validation error
  // Network error -> retries with exponential backoff
}
```

## Security

- **Input Validation**: Model names, context length limits
- **API Key Protection**: Sensitive values not logged
- **SSRF Protection**: Validates Ollama URLs
- **Size Limits**: Max 100KB context, 10MB response

## Examples

See `example.ts` for comprehensive usage examples:

```bash
# Run examples (requires API keys)
npx tsx src/services/summarization/summarizer/example.ts
```

## Testing

```typescript
import { LLMSummarizer } from './llm-summarizer.js';

describe('LLMSummarizer', () => {
  it('should summarize at level 0', async () => {
    const summarizer = new LLMSummarizer({ provider: 'disabled' });
    const result = await summarizer.summarize({
      items: [{ id: '1', type: 'knowledge', title: 'Test', content: 'Test content' }],
      hierarchyLevel: 0,
    });
    expect(result.title).toBeDefined();
    expect(result.content).toBeDefined();
  });
});
```

## API Reference

### LLMSummarizer

#### Constructor

```typescript
new LLMSummarizer(config: SummarizerConfig)
```

#### Methods

**summarize(request: SummarizationRequest): Promise<SummarizationResult>**

- Summarize a group of items at a specific hierarchy level

**summarizeBatch(requests: SummarizationRequest[]): Promise<BatchSummarizationResult>**

- Batch process multiple summarization requests

**isAvailable(): boolean**

- Check if LLM provider is available (not disabled)

**getProvider(): LLMProvider**

- Get current provider name

## License

Part of the Agent Memory project. See project LICENSE file.

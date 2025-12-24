/**
 * OpenAI Fine-Tuning Dataset Exporter
 *
 * Export RL training data in OpenAI fine-tuning format.
 * Format: JSONL with {"messages": [...]} structure
 */

import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
  ExtractionState,
  RetrievalState,
  ConsolidationState,
  ExtractionAction,
  RetrievalAction,
  ConsolidationAction,
} from '../../types.js';
import type { Dataset } from '../dataset-builder.js';
import type {
  PolicyType,
  ExportResult,
  OpenAIMessage,
  OpenAITrainingExample,
  OpenAIFileMetadata,
} from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** OpenAI token limits for fine-tuning */
const TOKEN_LIMITS = {
  maxPromptTokens: 16000,
  maxCompletionTokens: 4000,
  maxTotalTokens: 20000,
};

/** Approximate tokens per character (rough estimate) */
const CHARS_PER_TOKEN = 4;

// =============================================================================
// OPENAI EXPORT
// =============================================================================

/**
 * Export dataset in OpenAI fine-tuning format
 *
 * Creates JSONL files compatible with OpenAI's fine-tuning API.
 * Each line contains a training example with system/user/assistant messages.
 *
 * @param dataset - Dataset to export
 * @param policy - Policy type
 * @param outputPath - Output directory
 */
export async function exportOpenAI(
  dataset: Dataset<any>,
  policy: PolicyType,
  outputPath: string
): Promise<ExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(outputPath, { recursive: true });

    const warnings: string[] = [];

    // Convert examples to OpenAI format with validation
    const { examples: trainExamples, warnings: trainWarnings } = convertDatasetToOpenAI(
      dataset.train,
      policy
    );
    const { examples: evalExamples, warnings: evalWarnings } = convertDatasetToOpenAI(
      dataset.eval,
      policy
    );

    warnings.push(...trainWarnings, ...evalWarnings);

    // Write training file
    const trainPath = `${outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainExamples.map((ex) => JSON.stringify(ex)).join('\n'));

    // Write evaluation file
    const evalPath = `${outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalExamples.map((ex) => JSON.stringify(ex)).join('\n'));

    // Create metadata file
    const metadata: OpenAIFileMetadata = {
      purpose: 'fine-tune',
      format: 'jsonl',
      examples: trainExamples.length + evalExamples.length,
      created_at: new Date().toISOString(),
    };

    const metadataPath = `${outputPath}/metadata.json`;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Create usage instructions
    const instructionsPath = `${outputPath}/USAGE.md`;
    await fs.writeFile(instructionsPath, generateUsageInstructions(policy, metadata));

    // Get file sizes
    const files = [trainPath, evalPath, metadataPath, instructionsPath];
    const fileSizes: Record<string, number> = {};
    for (const file of files) {
      const stat = await fs.stat(file);
      fileSizes[file] = stat.size;
    }

    return {
      success: true,
      format: 'openai',
      files,
      stats: {
        totalExamples: dataset.stats.totalExamples,
        trainExamples: trainExamples.length,
        evalExamples: evalExamples.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      format: 'openai',
      files: [],
      stats: {
        totalExamples: 0,
        trainExamples: 0,
        evalExamples: 0,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// FORMAT CONVERSION
// =============================================================================

/**
 * Convert dataset to OpenAI format with validation
 */
function convertDatasetToOpenAI(
  examples: any[],
  policy: PolicyType
): { examples: OpenAITrainingExample[]; warnings: string[] } {
  const converted: OpenAITrainingExample[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    if (!example) continue;

    const messages = createMessages(example, policy);

    // Validate token limits
    const validation = validateMessages(messages);
    if (!validation.valid) {
      warnings.push(`Example ${i}: ${validation.reason}`);
      continue;
    }

    converted.push({ messages });
  }

  return { examples: converted, warnings };
}

/**
 * Create message array for an example
 */
function createMessages(
  example: ExtractionTrainingExample | RetrievalTrainingExample | ConsolidationTrainingExample,
  policy: PolicyType
): OpenAIMessage[] {
  const systemMessage: OpenAIMessage = {
    role: 'system',
    content: getSystemPrompt(policy),
  };

  const userMessage: OpenAIMessage = {
    role: 'user',
    content: formatStateAsPrompt(example.state, policy),
  };

  const assistantMessage: OpenAIMessage = {
    role: 'assistant',
    content: formatActionAsResponse(example.action, policy, example.reward),
  };

  return [systemMessage, userMessage, assistantMessage];
}

// =============================================================================
// PROMPT FORMATTING
// =============================================================================

/**
 * Get system prompt for policy type
 */
function getSystemPrompt(policy: PolicyType): string {
  switch (policy) {
    case 'extraction':
      return `You are an AI agent that decides what information to extract and store from conversations. Based on the context, memory state, and content features, decide whether to store, skip, or defer extraction.`;

    case 'retrieval':
      return `You are an AI agent that decides when to retrieve information from memory. Based on the query and context, determine whether retrieval is needed and what to retrieve.`;

    case 'consolidation':
      return `You are an AI agent that manages memory consolidation. Based on group features and usage stats, decide how to consolidate, merge, or archive memory entries.`;

    default:
      return 'You are an AI agent that makes decisions based on the provided state.';
  }
}

/**
 * Format state as user prompt
 */
function formatStateAsPrompt(state: any, policy: PolicyType): string {
  switch (policy) {
    case 'extraction':
      return formatExtractionState(state as ExtractionState);

    case 'retrieval':
      return formatRetrievalState(state as RetrievalState);

    case 'consolidation':
      return formatConsolidationState(state as ConsolidationState);

    default:
      return JSON.stringify(state, null, 2);
  }
}

/**
 * Format extraction state
 */
function formatExtractionState(state: ExtractionState): string {
  return `Analyze the following context and decide what action to take:

**Context Information:**
- Turn: ${state.contextFeatures.turnNumber}
- Tokens: ${state.contextFeatures.tokenCount}
- Tool Calls: ${state.contextFeatures.toolCallCount}
- Has Error: ${state.contextFeatures.hasError}
- User Turns: ${state.contextFeatures.userTurnCount}
- Assistant Turns: ${state.contextFeatures.assistantTurnCount}

**Memory State:**
- Total Entries: ${state.memoryState.totalEntries}
- Recent Extractions: ${state.memoryState.recentExtractions}
- Similar Entry Exists: ${state.memoryState.similarEntryExists}
- Session Captures: ${state.memoryState.sessionCaptureCount}

**Content Features:**
- Has Decision: ${state.contentFeatures.hasDecision}
- Has Rule: ${state.contentFeatures.hasRule}
- Has Fact: ${state.contentFeatures.hasFact}
- Has Command: ${state.contentFeatures.hasCommand}
- Novelty Score: ${state.contentFeatures.noveltyScore.toFixed(3)}
- Complexity: ${state.contentFeatures.complexity.toFixed(3)}

What extraction action should be taken?`;
}

/**
 * Format retrieval state
 */
function formatRetrievalState(state: RetrievalState): string {
  return `Analyze the following query context and decide whether to retrieve from memory:

**Query Features:**
- Query Length: ${state.queryFeatures.queryLength}
- Has Keywords: ${state.queryFeatures.hasKeywords}
- Complexity: ${state.queryFeatures.queryComplexity.toFixed(3)}
- Category: ${state.queryFeatures.semanticCategory}

**Context:**
- Turn: ${state.contextFeatures.turnNumber}
- Conversation Depth: ${state.contextFeatures.conversationDepth}
- Recent Tool Calls: ${state.contextFeatures.recentToolCalls}
- Has Errors: ${state.contextFeatures.hasErrors}

**Memory Statistics:**
- Total Entries: ${state.memoryStats.totalEntries}
- Recent Retrievals: ${state.memoryStats.recentRetrievals}
- Average Success Rate: ${state.memoryStats.avgRetrievalSuccess.toFixed(3)}

Should memory retrieval be performed?`;
}

/**
 * Format consolidation state
 */
function formatConsolidationState(state: ConsolidationState): string {
  return `Analyze the following memory group and decide on consolidation action:

**Group Features:**
- Group Size: ${state.groupFeatures.groupSize}
- Average Similarity: ${state.groupFeatures.avgSimilarity.toFixed(3)}
- Min Similarity: ${state.groupFeatures.minSimilarity.toFixed(3)}
- Max Similarity: ${state.groupFeatures.maxSimilarity.toFixed(3)}
- Entry Types: ${state.groupFeatures.entryTypes.join(', ')}

**Usage Statistics:**
- Total Retrievals: ${state.usageStats.totalRetrievals}
- Average Retrieval Rank: ${state.usageStats.avgRetrievalRank.toFixed(3)}
- Success Rate: ${state.usageStats.successRate.toFixed(3)}
- Days Since Last Access: ${state.usageStats.lastAccessedDaysAgo}

**Scope Statistics:**
- Scope Type: ${state.scopeStats.scopeType}
- Total Entries in Scope: ${state.scopeStats.totalEntriesInScope}
- Duplicate Ratio: ${state.scopeStats.duplicateRatio.toFixed(3)}

What consolidation action should be taken?`;
}

/**
 * Format action as assistant response
 */
function formatActionAsResponse(action: any, policy: PolicyType, reward: number): string {
  const actionJson = JSON.stringify(action, null, 2);

  return `Based on the analysis, I recommend the following action:

\`\`\`json
${actionJson}
\`\`\`

**Expected Reward**: ${reward.toFixed(3)}`;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate messages against token limits
 */
function validateMessages(
  messages: OpenAIMessage[]
): { valid: boolean; reason?: string; estimatedTokens?: number } {
  // Estimate token counts
  let totalChars = 0;
  let promptChars = 0;
  let completionChars = 0;

  for (const msg of messages) {
    const chars = msg.content.length;
    totalChars += chars;

    if (msg.role === 'assistant') {
      completionChars += chars;
    } else {
      promptChars += chars;
    }
  }

  const estimatedPromptTokens = Math.ceil(promptChars / CHARS_PER_TOKEN);
  const estimatedCompletionTokens = Math.ceil(completionChars / CHARS_PER_TOKEN);
  const estimatedTotalTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

  // Check limits
  if (estimatedPromptTokens > TOKEN_LIMITS.maxPromptTokens) {
    return {
      valid: false,
      reason: `Prompt exceeds token limit (${estimatedPromptTokens} > ${TOKEN_LIMITS.maxPromptTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  if (estimatedCompletionTokens > TOKEN_LIMITS.maxCompletionTokens) {
    return {
      valid: false,
      reason: `Completion exceeds token limit (${estimatedCompletionTokens} > ${TOKEN_LIMITS.maxCompletionTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  if (estimatedTotalTokens > TOKEN_LIMITS.maxTotalTokens) {
    return {
      valid: false,
      reason: `Total tokens exceed limit (${estimatedTotalTokens} > ${TOKEN_LIMITS.maxTotalTokens})`,
      estimatedTokens: estimatedTotalTokens,
    };
  }

  return {
    valid: true,
    estimatedTokens: estimatedTotalTokens,
  };
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generate usage instructions
 */
function generateUsageInstructions(policy: PolicyType, metadata: OpenAIFileMetadata): string {
  return `# OpenAI Fine-Tuning Dataset

Dataset for fine-tuning OpenAI models on ${policy} policy decisions.

## Dataset Information

- **Purpose**: ${metadata.purpose}
- **Format**: ${metadata.format}
- **Total Examples**: ${metadata.examples}
- **Created**: ${metadata.created_at}

## Using with OpenAI API

### 1. Upload Training File

\`\`\`bash
openai api files.create -f train.jsonl -p fine-tune
\`\`\`

### 2. Create Fine-Tuning Job

\`\`\`bash
openai api fine_tuning.jobs.create \\
  -t file-abc123 \\
  -m gpt-3.5-turbo \\
  --suffix "${policy}-policy"
\`\`\`

### 3. Monitor Training

\`\`\`bash
openai api fine_tuning.jobs.get -i ftjob-abc123
\`\`\`

### 4. Use Fine-Tuned Model

\`\`\`python
import openai

response = openai.ChatCompletion.create(
  model="ft:gpt-3.5-turbo:custom-${policy}-policy",
  messages=[
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ]
)
\`\`\`

## File Format

Each line in the JSONL file contains a training example:

\`\`\`json
{
  "messages": [
    {"role": "system", "content": "System prompt..."},
    {"role": "user", "content": "User input..."},
    {"role": "assistant", "content": "Expected response..."}
  ]
}
\`\`\`

## Token Limits

- Max Prompt Tokens: ${TOKEN_LIMITS.maxPromptTokens}
- Max Completion Tokens: ${TOKEN_LIMITS.maxCompletionTokens}
- Max Total Tokens: ${TOKEN_LIMITS.maxTotalTokens}

Examples exceeding these limits are automatically filtered during export.

## Pricing

Check current fine-tuning prices at: https://openai.com/pricing

## Documentation

- Fine-tuning guide: https://platform.openai.com/docs/guides/fine-tuning
- API reference: https://platform.openai.com/docs/api-reference/fine-tuning
`;
}

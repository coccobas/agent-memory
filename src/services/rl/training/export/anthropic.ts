/**
 * Anthropic Fine-Tuning Dataset Exporter
 *
 * Export RL training data in Anthropic/Claude format.
 * Format: JSONL with prompt/completion pairs
 */

import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from '../../types.js';
import type { Dataset } from '../dataset-builder.js';
import type { PolicyType, ExportResult, AnthropicTrainingExample } from './types.js';

// =============================================================================
// ANTHROPIC EXPORT
// =============================================================================

/**
 * Export dataset in Anthropic format
 *
 * Creates JSONL files with prompt/completion pairs.
 * Compatible with Claude fine-tuning workflows.
 *
 * @param dataset - Dataset to export
 * @param policy - Policy type
 * @param outputPath - Output directory
 * @param includeMetadata - Include metadata in examples
 */
export async function exportAnthropic(
  dataset: Dataset<any>,
  policy: PolicyType,
  outputPath: string,
  includeMetadata = false
): Promise<ExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(outputPath, { recursive: true });

    // Convert examples to Anthropic format
    const trainExamples = dataset.train.map((ex) =>
      convertToAnthropicFormat(ex, policy, includeMetadata)
    );
    const evalExamples = dataset.eval.map((ex) =>
      convertToAnthropicFormat(ex, policy, includeMetadata)
    );

    // Write training file
    const trainPath = `${outputPath}/train.jsonl`;
    await fs.writeFile(trainPath, trainExamples.map((ex) => JSON.stringify(ex)).join('\n'));

    // Write evaluation file
    const evalPath = `${outputPath}/eval.jsonl`;
    await fs.writeFile(evalPath, evalExamples.map((ex) => JSON.stringify(ex)).join('\n'));

    // Create dataset info
    const infoPath = `${outputPath}/dataset_info.json`;
    const info = {
      policy,
      totalExamples: dataset.stats.totalExamples,
      trainExamples: trainExamples.length,
      evalExamples: evalExamples.length,
      dateRange: dataset.stats.dateRange,
      createdAt: new Date().toISOString(),
      format: 'anthropic_jsonl',
    };
    await fs.writeFile(infoPath, JSON.stringify(info, null, 2));

    // Create usage guide
    const guidePath = `${outputPath}/GUIDE.md`;
    await fs.writeFile(guidePath, generateGuide(policy, info));

    // Get file sizes
    const files = [trainPath, evalPath, infoPath, guidePath];
    const fileSizes: Record<string, number> = {};
    for (const file of files) {
      const stat = await fs.stat(file);
      fileSizes[file] = stat.size;
    }

    return {
      success: true,
      format: 'anthropic',
      files,
      stats: {
        totalExamples: dataset.stats.totalExamples,
        trainExamples: trainExamples.length,
        evalExamples: evalExamples.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'anthropic',
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
 * Convert training example to Anthropic format
 */
function convertToAnthropicFormat(
  example: ExtractionTrainingExample | RetrievalTrainingExample | ConsolidationTrainingExample,
  policy: PolicyType,
  includeMetadata: boolean
): AnthropicTrainingExample {
  // Import formatters from OpenAI exporter (reuse the prompts)
  const prompt = createPromptForPolicy(example.state, policy);
  const completion = createCompletionForPolicy(example.action, policy, example.reward);

  const base: AnthropicTrainingExample = {
    prompt,
    completion,
  };

  if (includeMetadata && example.metadata) {
    base.metadata = {
      ...example.metadata,
      reward: example.reward,
      policy,
    };
  }

  return base;
}

// =============================================================================
// PROMPT CREATION
// =============================================================================

/**
 * Create prompt for policy type
 */
function createPromptForPolicy(state: any, policy: PolicyType): string {
  const preamble = getPreamble(policy);
  const stateDescription = formatState(state, policy);

  return `${preamble}

${stateDescription}

Please analyze the situation and provide your decision in JSON format.`;
}

/**
 * Get preamble for policy
 */
function getPreamble(policy: PolicyType): string {
  switch (policy) {
    case 'extraction':
      return `Human: You are helping decide what information to extract and store from a conversation. I'll provide you with context about the conversation state, memory state, and content features. Based on this information, decide whether to store, skip, or defer the extraction.`;

    case 'retrieval':
      return `Human: You are helping decide whether to retrieve information from memory. I'll provide you with query features, context, and memory statistics. Based on this information, decide if retrieval is needed and what parameters to use.`;

    case 'consolidation':
      return `Human: You are helping manage memory consolidation. I'll provide you with information about a group of similar memory entries and their usage patterns. Based on this, decide what consolidation action to take.`;

    default:
      return 'Human: Please analyze the following state and provide a decision.';
  }
}

/**
 * Format state description
 */
function formatState(state: any, policy: PolicyType): string {
  switch (policy) {
    case 'extraction':
      return formatExtractionState(state);

    case 'retrieval':
      return formatRetrievalState(state);

    case 'consolidation':
      return formatConsolidationState(state);

    default:
      return JSON.stringify(state, null, 2);
  }
}

/**
 * Format extraction state
 */
function formatExtractionState(state: any): string {
  return `Current Context:
• Turn number: ${state.contextFeatures.turnNumber}
• Token count: ${state.contextFeatures.tokenCount}
• Tool calls: ${state.contextFeatures.toolCallCount}
• Has error: ${state.contextFeatures.hasError}
• User turns: ${state.contextFeatures.userTurnCount}
• Assistant turns: ${state.contextFeatures.assistantTurnCount}

Memory State:
• Total entries: ${state.memoryState.totalEntries}
• Recent extractions: ${state.memoryState.recentExtractions}
• Similar entry exists: ${state.memoryState.similarEntryExists}
• Session captures: ${state.memoryState.sessionCaptureCount}

Content Analysis:
• Contains decision: ${state.contentFeatures.hasDecision}
• Contains rule: ${state.contentFeatures.hasRule}
• Contains fact: ${state.contentFeatures.hasFact}
• Contains command: ${state.contentFeatures.hasCommand}
• Novelty score: ${state.contentFeatures.noveltyScore.toFixed(3)}
• Complexity: ${state.contentFeatures.complexity.toFixed(3)}`;
}

/**
 * Format retrieval state
 */
function formatRetrievalState(state: any): string {
  return `Query Information:
• Query length: ${state.queryFeatures.queryLength} characters
• Contains keywords: ${state.queryFeatures.hasKeywords}
• Query complexity: ${state.queryFeatures.queryComplexity.toFixed(3)}
• Semantic category: ${state.queryFeatures.semanticCategory}

Conversation Context:
• Turn number: ${state.contextFeatures.turnNumber}
• Conversation depth: ${state.contextFeatures.conversationDepth}
• Recent tool calls: ${state.contextFeatures.recentToolCalls}
• Has errors: ${state.contextFeatures.hasErrors}

Memory Statistics:
• Total entries: ${state.memoryStats.totalEntries}
• Recent retrievals: ${state.memoryStats.recentRetrievals}
• Average success rate: ${state.memoryStats.avgRetrievalSuccess.toFixed(3)}`;
}

/**
 * Format consolidation state
 */
function formatConsolidationState(state: any): string {
  return `Group Information:
• Number of entries: ${state.groupFeatures.groupSize}
• Average similarity: ${state.groupFeatures.avgSimilarity.toFixed(3)}
• Similarity range: ${state.groupFeatures.minSimilarity.toFixed(3)} - ${state.groupFeatures.maxSimilarity.toFixed(3)}
• Entry types: ${state.groupFeatures.entryTypes.join(', ') || 'none'}

Usage Patterns:
• Total retrievals: ${state.usageStats.totalRetrievals}
• Average retrieval rank: ${state.usageStats.avgRetrievalRank.toFixed(3)}
• Success rate: ${state.usageStats.successRate.toFixed(3)}
• Days since last access: ${state.usageStats.lastAccessedDaysAgo}

Scope Context:
• Scope type: ${state.scopeStats.scopeType}
• Total entries in scope: ${state.scopeStats.totalEntriesInScope}
• Duplicate ratio: ${state.scopeStats.duplicateRatio.toFixed(3)}`;
}

// =============================================================================
// COMPLETION CREATION
// =============================================================================

/**
 * Create completion for policy
 */
function createCompletionForPolicy(action: any, _policy: PolicyType, reward: number): string {
  const actionJson = JSON.stringify(action, null, 2);

  return `Assistant: Based on my analysis, here is my decision:

\`\`\`json
${actionJson}
\`\`\`

This decision is expected to achieve a reward of ${reward.toFixed(3)}, indicating ${getRewardInterpretation(reward)}.`;
}

/**
 * Interpret reward value
 */
function getRewardInterpretation(reward: number): string {
  if (reward >= 0.8) {
    return 'excellent outcome likelihood';
  } else if (reward >= 0.6) {
    return 'good outcome likelihood';
  } else if (reward >= 0.4) {
    return 'moderate outcome likelihood';
  } else if (reward >= 0.2) {
    return 'fair outcome likelihood';
  } else {
    return 'low outcome likelihood';
  }
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generate usage guide
 */
function generateGuide(policy: PolicyType, info: any): string {
  return `# Anthropic/Claude Fine-Tuning Dataset

This dataset contains training examples for the **${policy}** policy in prompt/completion format.

## Dataset Information

- **Policy Type**: ${policy}
- **Total Examples**: ${info.totalExamples}
- **Training Set**: ${info.trainExamples} examples
- **Evaluation Set**: ${info.evalExamples} examples
- **Date Range**: ${info.dateRange.start} to ${info.dateRange.end}
- **Created**: ${info.createdAt}

## File Format

The dataset uses JSONL format with each line containing:

\`\`\`json
{
  "prompt": "Human: [Task description and state information]",
  "completion": "Assistant: [Decision in JSON format]"
}
\`\`\`

## Example Entry

\`\`\`json
{
  "prompt": "Human: You are helping decide what information to extract...",
  "completion": "Assistant: Based on my analysis, here is my decision:\\n\\n\`\`\`json\\n{...}\\n\`\`\`"
}
\`\`\`

## Using the Dataset

### Option 1: Direct Claude API Usage

Use the examples as few-shot prompts:

\`\`\`python
import anthropic
import json

# Load examples
with open('train.jsonl') as f:
    examples = [json.loads(line) for line in f]

# Use as few-shot examples
client = anthropic.Anthropic(api_key="your-api-key")
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": examples[0]["prompt"]},
        {"role": "assistant", "content": examples[0]["completion"]},
        {"role": "user", "content": "Your actual query..."}
    ]
)
\`\`\`

### Option 2: Fine-Tuning (When Available)

Once Anthropic supports fine-tuning, this dataset is ready to use:

\`\`\`bash
# Upload dataset
anthropic datasets create --file train.jsonl --name "${policy}-policy"

# Start fine-tuning
anthropic finetune create \\
  --dataset "${policy}-policy" \\
  --model claude-3-sonnet \\
  --suffix "${policy}-v1"
\`\`\`

### Option 3: Evaluation & Analysis

Load the dataset for analysis:

\`\`\`python
import json
import pandas as pd

# Load examples
with open('train.jsonl') as f:
    data = [json.loads(line) for line in f]

# Convert to DataFrame for analysis
df = pd.DataFrame(data)

# Analyze patterns
print(f"Total examples: {len(df)}")
print(f"Average prompt length: {df['prompt'].str.len().mean():.0f} chars")
print(f"Average completion length: {df['completion'].str.len().mean():.0f} chars")
\`\`\`

## Dataset Structure

Each example teaches the model to:
1. Understand the current state (context, memory, features)
2. Make an appropriate decision (action)
3. Predict the expected outcome (reward)

## Quality Notes

- All examples include actual outcome rewards from production usage
- Examples are filtered for quality (minimum confidence thresholds)
- Train/eval split ensures no data leakage
- Metadata is preserved for traceability

## Integration

This format is also compatible with:
- Generic prompt/completion fine-tuning frameworks
- Instruction-tuning datasets
- Supervised learning pipelines

## Next Steps

1. Review example quality by sampling random entries
2. Analyze reward distribution to ensure balanced examples
3. Consider data augmentation for underrepresented scenarios
4. Monitor evaluation metrics during training

## Support

For questions about the dataset format or usage, refer to:
- Anthropic API documentation: https://docs.anthropic.com/
- Claude fine-tuning guide (when available)
`;
}

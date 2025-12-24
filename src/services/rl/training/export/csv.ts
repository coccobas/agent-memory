/**
 * CSV Dataset Exporter
 *
 * Export RL training data in CSV format for analysis and visualization.
 * Flattens nested state/action structures into tabular format.
 */

import type {
  ExtractionTrainingExample,
  RetrievalTrainingExample,
  ConsolidationTrainingExample,
} from '../../types.js';
import type { Dataset } from '../dataset-builder.js';
import type { PolicyType, ExportResult, CSVRow } from './types.js';

// =============================================================================
// CSV EXPORT
// =============================================================================

/**
 * Export dataset in CSV format
 *
 * Creates CSV files suitable for pandas, Excel, or data analysis tools.
 * Flattens nested structures into columns with dot notation.
 *
 * @param dataset - Dataset to export
 * @param policy - Policy type
 * @param outputPath - Output directory
 * @param includeMetadata - Include metadata columns
 */
export async function exportCSV(
  dataset: Dataset<any>,
  policy: PolicyType,
  outputPath: string,
  includeMetadata = true
): Promise<ExportResult> {
  const fs = await import('fs/promises');

  try {
    await fs.mkdir(outputPath, { recursive: true });

    // Convert examples to CSV rows
    const trainRows = dataset.train.map((ex) => flattenExample(ex, policy, includeMetadata));
    const evalRows = dataset.eval.map((ex) => flattenExample(ex, policy, includeMetadata));

    // Get column headers (all unique keys across all rows)
    const allColumns = getAllColumns([...trainRows, ...evalRows]);

    // Write training CSV
    const trainPath = `${outputPath}/train.csv`;
    await fs.writeFile(trainPath, formatAsCSV(trainRows, allColumns));

    // Write evaluation CSV
    const evalPath = `${outputPath}/eval.csv`;
    await fs.writeFile(evalPath, formatAsCSV(evalRows, allColumns));

    // Write combined dataset
    const combinedPath = `${outputPath}/combined.csv`;
    const combinedRows = [
      ...trainRows.map((row) => ({ ...row, split: 'train' })),
      ...evalRows.map((row) => ({ ...row, split: 'eval' })),
    ];
    const combinedColumns = ['split', ...allColumns];
    await fs.writeFile(combinedPath, formatAsCSV(combinedRows, combinedColumns));

    // Create data dictionary
    const dictPath = `${outputPath}/data_dictionary.md`;
    await fs.writeFile(dictPath, generateDataDictionary(policy, allColumns));

    // Create analysis notebook template
    const notebookPath = `${outputPath}/analysis_template.py`;
    await fs.writeFile(notebookPath, generateAnalysisTemplate(policy));

    // Get file sizes
    const files = [trainPath, evalPath, combinedPath, dictPath, notebookPath];
    const fileSizes: Record<string, number> = {};
    for (const file of files) {
      const stat = await fs.stat(file);
      fileSizes[file] = stat.size;
    }

    return {
      success: true,
      format: 'csv',
      files,
      stats: {
        totalExamples: dataset.stats.totalExamples,
        trainExamples: trainRows.length,
        evalExamples: evalRows.length,
        fileSizes,
        exportedAt: new Date().toISOString(),
        policyType: policy,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'csv',
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
// FLATTENING
// =============================================================================

/**
 * Flatten training example to CSV row
 */
function flattenExample(
  example: ExtractionTrainingExample | RetrievalTrainingExample | ConsolidationTrainingExample,
  _policy: PolicyType,
  includeMetadata: boolean
): CSVRow {
  const row: CSVRow = {};

  // Flatten state
  flattenObject(example.state, 'state', row);

  // Flatten action
  flattenObject(example.action, 'action', row);

  // Add reward
  row.reward = example.reward;

  // Add metadata if requested
  if (includeMetadata && example.metadata) {
    flattenObject(example.metadata, 'metadata', row);
  }

  return row;
}

/**
 * Recursively flatten object to dot notation
 */
function flattenObject(obj: any, prefix: string, result: CSVRow): void {
  for (const [key, value] of Object.entries(obj)) {
    const newKey = `${prefix}.${key}`;

    if (value === null || value === undefined) {
      result[newKey] = '';
    } else if (Array.isArray(value)) {
      // Convert arrays to comma-separated strings
      result[newKey] = value.join(',');
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      // Recursively flatten nested objects
      flattenObject(value, newKey, result);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[newKey] = value;
    } else {
      // Handle any other types by converting to string
      result[newKey] = String(value);
    }
  }
}

/**
 * Get all unique columns across all rows
 */
function getAllColumns(rows: CSVRow[]): string[] {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }

  // Sort columns logically
  const columnArray = Array.from(columns);
  columnArray.sort((a, b) => {
    // Reward comes first
    if (a === 'reward') return -1;
    if (b === 'reward') return 1;

    // Then state columns
    const aIsState = a.startsWith('state.');
    const bIsState = b.startsWith('state.');
    if (aIsState && !bIsState) return -1;
    if (!aIsState && bIsState) return 1;

    // Then action columns
    const aIsAction = a.startsWith('action.');
    const bIsAction = b.startsWith('action.');
    if (aIsAction && !bIsAction) return -1;
    if (!aIsAction && bIsAction) return 1;

    // Finally metadata columns
    return a.localeCompare(b);
  });

  return columnArray;
}

// =============================================================================
// CSV FORMATTING
// =============================================================================

/**
 * Format rows as CSV string
 */
function formatAsCSV(rows: CSVRow[], columns: string[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(columns.map(escapeCSVValue).join(','));

  // Data rows
  for (const row of rows) {
    const values = columns.map((col) => {
      const value = row[col];
      return escapeCSVValue(value !== undefined ? String(value) : '');
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Escape CSV value (handle quotes, commas, newlines)
 */
function escapeCSVValue(value: string | number | boolean): string {
  const str = String(value);

  // Check if value needs quoting
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

// =============================================================================
// DOCUMENTATION
// =============================================================================

/**
 * Generate data dictionary
 */
function generateDataDictionary(policy: PolicyType, columns: string[]): string {
  const stateColumns = columns.filter((c) => c.startsWith('state.'));
  const actionColumns = columns.filter((c) => c.startsWith('action.'));
  const metadataColumns = columns.filter((c) => c.startsWith('metadata.'));

  return `# Data Dictionary - ${policy.toUpperCase()} Policy Dataset

## Overview

This CSV dataset contains flattened training examples for the ${policy} policy.
Each row represents a single state-action-reward tuple.

## Column Structure

### Core Columns

| Column | Type | Description |
|--------|------|-------------|
| reward | float | Outcome reward/score (0-1 scale, higher is better) |

### State Columns (${stateColumns.length} total)

State features describe the environment when the decision was made:

${stateColumns.map((col) => `- \`${col}\`: ${getColumnDescription(col, policy)}`).join('\n')}

### Action Columns (${actionColumns.length} total)

Action columns describe the decision that was taken:

${actionColumns.map((col) => `- \`${col}\`: ${getColumnDescription(col, policy)}`).join('\n')}

${
  metadataColumns.length > 0
    ? `### Metadata Columns (${metadataColumns.length} total)

Additional context and tracking information:

${metadataColumns.map((col) => `- \`${col}\`: ${getColumnDescription(col, policy)}`).join('\n')}`
    : ''
}

## Data Types

- **Boolean columns**: \`true\`/\`false\` strings
- **Numeric columns**: Integer or float values
- **String columns**: Text values (quoted if contains commas)
- **Array columns**: Comma-separated values

## Missing Values

Missing or null values are represented as empty strings.

## Usage Examples

### Load in Python (pandas)

\`\`\`python
import pandas as pd

# Load combined dataset
df = pd.read_csv('combined.csv')

# Or load train/eval separately
train_df = pd.read_csv('train.csv')
eval_df = pd.read_csv('eval.csv')
\`\`\`

### Load in R

\`\`\`r
# Load combined dataset
df <- read.csv('combined.csv')

# Or load train/eval separately
train <- read.csv('train.csv')
eval <- read.csv('eval.csv')
\`\`\`

### Open in Excel

Simply double-click the CSV file or use File > Open in Excel.

## Analysis Suggestions

1. **Reward Distribution**: Plot histogram of \`reward\` column
2. **Feature Importance**: Correlation analysis between state features and reward
3. **Action Patterns**: Frequency analysis of action decisions
4. **Temporal Trends**: If metadata includes timestamps, analyze changes over time

See \`analysis_template.py\` for example analysis code.
`;
}

/**
 * Get description for column
 */
function getColumnDescription(column: string, _policy: PolicyType): string {
  // Extract the leaf name
  const parts = column.split('.');
  const leaf = parts[parts.length - 1];

  // Generic descriptions
  const descriptions: Record<string, string> = {
    // State features
    turnNumber: 'Turn number in the conversation',
    tokenCount: 'Number of tokens in context',
    toolCallCount: 'Number of tool calls made',
    hasError: 'Whether an error occurred',
    userTurnCount: 'Number of user turns',
    assistantTurnCount: 'Number of assistant turns',
    totalEntries: 'Total number of memory entries',
    recentExtractions: 'Number of recent extractions',
    similarEntryExists: 'Whether similar entry already exists',
    sessionCaptureCount: 'Number of session captures',
    hasDecision: 'Whether content contains a decision',
    hasRule: 'Whether content contains a rule',
    hasFact: 'Whether content contains a fact',
    hasCommand: 'Whether content contains a command',
    noveltyScore: 'Novelty score (0-1)',
    complexity: 'Complexity score (0-1)',
    queryLength: 'Length of the query',
    hasKeywords: 'Whether query has keywords',
    queryComplexity: 'Query complexity score (0-1)',
    semanticCategory: 'Semantic category of query',
    conversationDepth: 'Depth of conversation',
    recentToolCalls: 'Number of recent tool calls',
    hasErrors: 'Whether errors are present',
    recentRetrievals: 'Number of recent retrievals',
    avgRetrievalSuccess: 'Average retrieval success rate',
    groupSize: 'Size of the entry group',
    avgSimilarity: 'Average similarity in group',
    minSimilarity: 'Minimum similarity in group',
    maxSimilarity: 'Maximum similarity in group',
    entryTypes: 'Types of entries in group',
    totalRetrievals: 'Total number of retrievals',
    avgRetrievalRank: 'Average retrieval rank',
    successRate: 'Success rate',
    lastAccessedDaysAgo: 'Days since last access',
    scopeType: 'Type of scope',
    totalEntriesInScope: 'Total entries in scope',
    duplicateRatio: 'Ratio of duplicates',

    // Action features
    decision: 'Extraction decision (store/skip/defer)',
    entryType: 'Type of entry',
    priority: 'Priority level',
    shouldRetrieve: 'Whether to retrieve',
    scope: 'Retrieval scope',
    types: 'Types to retrieve',
    maxResults: 'Maximum results to retrieve',
    action: 'Consolidation action',
    targetEntries: 'Target entry IDs',
    mergeStrategy: 'Merge strategy',

    // Metadata
    sessionId: 'Session identifier',
    outcomeType: 'Type of outcome',
    decisionId: 'Decision identifier',
    entryIds: 'Entry identifiers',
  };

  return descriptions[leaf!] || 'Value for ' + column;
}

/**
 * Generate analysis template
 */
function generateAnalysisTemplate(policy: PolicyType): string {
  return `#!/usr/bin/env python3
"""
Analysis Template for ${policy.toUpperCase()} Policy Dataset

This script provides example analyses for the CSV dataset.
Modify and extend as needed for your specific analysis goals.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# =============================================================================
# LOAD DATA
# =============================================================================

def load_data():
    """Load the CSV datasets."""
    train_df = pd.read_csv('train.csv')
    eval_df = pd.read_csv('eval.csv')
    combined_df = pd.read_csv('combined.csv')

    print(f"Training examples: {len(train_df)}")
    print(f"Evaluation examples: {len(eval_df)}")
    print(f"Total examples: {len(combined_df)}")

    return train_df, eval_df, combined_df

# =============================================================================
# BASIC STATISTICS
# =============================================================================

def analyze_rewards(df):
    """Analyze reward distribution."""
    print("\\n=== Reward Statistics ===")
    print(df['reward'].describe())

    # Plot histogram
    plt.figure(figsize=(10, 6))
    plt.hist(df['reward'], bins=50, edgecolor='black')
    plt.xlabel('Reward')
    plt.ylabel('Frequency')
    plt.title('Reward Distribution')
    plt.grid(True, alpha=0.3)
    plt.savefig('reward_distribution.png', dpi=300, bbox_inches='tight')
    print("Saved: reward_distribution.png")

def analyze_features(df):
    """Analyze state features."""
    print("\\n=== Feature Statistics ===")

    # Get state columns
    state_cols = [col for col in df.columns if col.startswith('state.')]

    # Numeric features only
    numeric_cols = df[state_cols].select_dtypes(include=[np.number]).columns

    print(df[numeric_cols].describe())

def feature_importance(df):
    """Calculate feature importance via correlation."""
    print("\\n=== Feature-Reward Correlations ===")

    # Get numeric columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    numeric_cols = [col for col in numeric_cols if col != 'reward']

    # Calculate correlations
    correlations = df[numeric_cols].corrwith(df['reward']).sort_values(ascending=False)

    print(correlations.head(10))

    # Plot top correlations
    plt.figure(figsize=(10, 8))
    correlations.head(15).plot(kind='barh')
    plt.xlabel('Correlation with Reward')
    plt.title('Top 15 Feature Correlations')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('feature_importance.png', dpi=300, bbox_inches='tight')
    print("Saved: feature_importance.png")

# =============================================================================
# ACTION ANALYSIS
# =============================================================================

def analyze_actions(df):
    """Analyze action distributions."""
    print("\\n=== Action Analysis ===")

    # Get action columns
    action_cols = [col for col in df.columns if col.startswith('action.')]

    # Analyze categorical actions
    for col in action_cols:
        if df[col].dtype == 'object':
            print(f"\\n{col}:")
            print(df[col].value_counts())

            # Plot if reasonable number of categories
            if df[col].nunique() <= 10:
                plt.figure(figsize=(10, 6))
                df[col].value_counts().plot(kind='bar')
                plt.xlabel(col)
                plt.ylabel('Frequency')
                plt.title(f'Distribution of {col}')
                plt.xticks(rotation=45, ha='right')
                plt.grid(True, alpha=0.3)
                plt.tight_layout()
                plt.savefig(f'{col.replace(".", "_")}_distribution.png', dpi=300)
                print(f"Saved: {col.replace('.', '_')}_distribution.png")

# =============================================================================
# REWARD BY ACTION
# =============================================================================

def reward_by_action(df):
    """Analyze reward by action type."""
    print("\\n=== Reward by Action ===")

    # Find primary action column
    action_cols = [col for col in df.columns if col.startswith('action.')]
    categorical_actions = [col for col in action_cols if df[col].dtype == 'object']

    for col in categorical_actions[:3]:  # Limit to first 3
        print(f"\\n{col}:")
        print(df.groupby(col)['reward'].agg(['mean', 'std', 'count']))

# =============================================================================
# MAIN
# =============================================================================

def main():
    """Run all analyses."""
    print("Loading data...")
    train_df, eval_df, combined_df = load_data()

    print("\\nAnalyzing training set...")
    analyze_rewards(train_df)
    analyze_features(train_df)
    feature_importance(train_df)
    analyze_actions(train_df)
    reward_by_action(train_df)

    print("\\n=== Analysis Complete ===")
    print("Generated visualizations:")
    print("  - reward_distribution.png")
    print("  - feature_importance.png")
    print("  - action_*.png")

if __name__ == '__main__':
    main()
`;
}

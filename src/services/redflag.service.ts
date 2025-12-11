/**
 * Red-flag pattern detection service
 *
 * Detects problematic patterns in entries that might indicate issues:
 * - Malformed JSON
 * - Overly long reasoning
 * - Inconsistent outputs
 * - Other quality issues
 *
 * Red-flag patterns are stored as guidelines with category: 'red_flag'
 */

import { guidelineRepo } from '../db/repositories/guidelines.js';
import { knowledgeRepo } from '../db/repositories/knowledge.js';
import { toolRepo } from '../db/repositories/tools.js';
import type { EntryType } from '../db/schema.js';

export type RedFlagSeverity = 'low' | 'medium' | 'high';

export interface RedFlag {
  pattern: string;
  severity: RedFlagSeverity;
  description: string;
}

/**
 * Detect red flags in an entry
 *
 * @param entry - Entry to check
 * @returns Array of detected red flags
 */
export function detectRedFlags(entry: {
  type: EntryType;
  content: string;
  metadata?: Record<string, unknown>;
}): RedFlag[] {
  const flags: RedFlag[] = [];

  // Load red-flag patterns from guidelines
  const redFlagGuidelines = guidelineRepo.list(
    {
      category: 'red_flag',
      includeInactive: false,
    },
    { limit: 1000 }
  );

  // Check each pattern
  for (const guideline of redFlagGuidelines) {
    const version = guideline.currentVersion;
    if (!version) continue;

    const pattern = version.content;
    // Note: Guidelines don't have metadata field in schema, severity would need to be stored elsewhere
    // For now, default to 'medium' if not specified in rationale or examples
    const severity: RedFlagSeverity | undefined = undefined; // Can be enhanced later
    const description = version.rationale || guideline.name;

    // Simple pattern matching (can be enhanced with regex)
    if (entry.content.includes(pattern)) {
      flags.push({
        pattern,
        severity: severity || 'medium',
        description: description || 'Red flag detected',
      });
    }
  }

  // Built-in pattern checks
  // Check for malformed JSON
  if (entry.content.includes('{') || entry.content.includes('[')) {
    try {
      // Try to find JSON-like structures
      const jsonMatches = entry.content.match(/\{[^}]*\}|\[[^\]]*\]/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            JSON.parse(match);
          } catch {
            flags.push({
              pattern: 'malformed_json',
              severity: 'high',
              description: 'Potentially malformed JSON detected',
            });
            break;
          }
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check for overly long content (potential issues)
  if (entry.content.length > 10000) {
    flags.push({
      pattern: 'overly_long_content',
      severity: 'medium',
      description: 'Content is unusually long (>10k characters)',
    });
  }

  // Check for inconsistent formatting
  const lineCount = entry.content.split('\n').length;
  const avgLineLength = entry.content.length / lineCount;
  if (avgLineLength > 200 && lineCount > 10) {
    flags.push({
      pattern: 'inconsistent_formatting',
      severity: 'low',
      description: 'Potential formatting inconsistencies detected',
    });
  }

  return flags;
}

/**
 * Calculate a risk score (0-1) based on detected red flags
 *
 * @param entryId - Entry ID
 * @param entryType - Entry type
 * @returns Risk score from 0 (no risk) to 1 (high risk)
 */
export function scoreRedFlagRisk(entryId: string, entryType: EntryType): number {
  // Get entry content
  let content = '';
  let metadata: Record<string, unknown> | undefined;

  if (entryType === 'tool') {
    const tool = toolRepo.getById(entryId);
    if (tool) {
      content = tool.currentVersion?.description || '';
      // Tools don't have metadata field in schema
      metadata = undefined;
    }
  } else if (entryType === 'guideline') {
    const guideline = guidelineRepo.getById(entryId);
    if (guideline) {
      content = guideline.currentVersion?.content || '';
      // Guidelines don't have metadata field in schema
      metadata = undefined;
    }
  } else {
    const knowledge = knowledgeRepo.getById(entryId);
    if (knowledge) {
      content = knowledge.currentVersion?.content || '';
      // Knowledge doesn't have metadata field in schema
      metadata = undefined;
    }
  }

  if (!content) return 0;

  const flags = detectRedFlags({ type: entryType, content, metadata });

  // Calculate risk score based on severity
  let riskScore = 0;
  for (const flag of flags) {
    if (flag.severity === 'high') {
      riskScore += 0.4;
    } else if (flag.severity === 'medium') {
      riskScore += 0.2;
    } else {
      riskScore += 0.1;
    }
  }

  // Cap at 1.0
  return Math.min(riskScore, 1.0);
}

/**
 * Error correlation service for decorrelated error detection
 *
 * Analyzes audit log for error patterns and calculates correlation coefficients
 * between agents to detect low diversity (agents making similar errors).
 */

import type { DbClient } from '../db/connection.js';
import { auditLog } from '../db/schema.js';
import { eq, and, sql, isNotNull } from 'drizzle-orm';

export interface ErrorCorrelationParams {
  agentA: string;
  agentB: string;
  timeWindow?: {
    start: string;
    end: string;
  };
}

export interface ErrorCorrelationResult {
  correlation: number; // -1 to 1
  sharedErrors: number;
  totalTasks: number;
  recommendation: string;
}

export interface LowDiversityResult {
  agentPairs: Array<{ agentA: string; agentB: string; correlation: number }>;
  recommendations: string[];
}

/**
 * Calculate Pearson correlation coefficient between two agents' error patterns
 *
 * Returns correlation from -1 (perfectly anti-correlated) to 1 (perfectly correlated).
 * High positive correlation (>0.7) indicates agents are making similar errors.
 */
export function calculateErrorCorrelation(
  params: ErrorCorrelationParams,
  db: DbClient
): ErrorCorrelationResult {
  const { agentA, agentB, timeWindow } = params;

  // Build where conditions
  const conditions = [
    isNotNull(auditLog.agentId),
    sql`${auditLog.success} = 0`, // Only failed tasks
  ];

  if (timeWindow) {
    conditions.push(sql`${auditLog.createdAt} >= ${timeWindow.start}`);
    conditions.push(sql`${auditLog.createdAt} <= ${timeWindow.end}`);
  }

  // Get all tasks for both agents
  const agentAConditions = [...conditions, eq(auditLog.agentId, agentA)];
  const agentBConditions = [...conditions, eq(auditLog.agentId, agentB)];

  const agentATasks = db
    .select({
      entryId: auditLog.entryId,
      subtaskType: auditLog.subtaskType,
      errorMessage: auditLog.errorMessage,
    })
    .from(auditLog)
    .where(and(...agentAConditions))
    .all();

  const agentBTasks = db
    .select({
      entryId: auditLog.entryId,
      subtaskType: auditLog.subtaskType,
      errorMessage: auditLog.errorMessage,
    })
    .from(auditLog)
    .where(and(...agentBConditions))
    .all();

  // Create sets of failed task IDs/types for each agent
  const agentAFailed = new Set<string>();
  const agentBFailed = new Set<string>();

  for (const task of agentATasks) {
    const key = task.entryId || task.subtaskType || 'unknown';
    agentAFailed.add(key);
  }

  for (const task of agentBTasks) {
    const key = task.entryId || task.subtaskType || 'unknown';
    agentBFailed.add(key);
  }

  // Get all unique tasks (union of both sets)
  const allTasks = new Set([...agentAFailed, ...agentBFailed]);
  const totalTasks = allTasks.size;

  if (totalTasks === 0) {
    return {
      correlation: 0,
      sharedErrors: 0,
      totalTasks: 0,
      recommendation: 'No error data available for comparison',
    };
  }

  // Count shared errors (tasks that both agents failed)
  let sharedErrors = 0;
  for (const task of allTasks) {
    if (agentAFailed.has(task) && agentBFailed.has(task)) {
      sharedErrors++;
    }
  }

  // Calculate correlation using simplified Pearson correlation
  // For binary data (error/no error), we use a simplified approach:
  // correlation = (sharedErrors - expectedSharedErrors) / sqrt(variance)
  const agentAErrorRate = agentAFailed.size / totalTasks;
  const agentBErrorRate = agentBFailed.size / totalTasks;
  const expectedSharedErrors = totalTasks * agentAErrorRate * agentBErrorRate;

  // Simplified correlation calculation
  let correlation = 0;
  if (totalTasks > 1) {
    const variance =
      totalTasks *
      agentAErrorRate *
      agentBErrorRate *
      (1 - agentAErrorRate) *
      (1 - agentBErrorRate);
    if (variance > 0) {
      correlation = (sharedErrors - expectedSharedErrors) / Math.sqrt(variance);
      // Clamp to [-1, 1]
      correlation = Math.max(-1, Math.min(1, correlation));
    }
  }

  // Generate recommendation
  let recommendation: string;
  if (correlation > 0.7) {
    recommendation =
      'Agents are too similar - high error correlation suggests low diversity. Consider diversifying agent strategies or training data.';
  } else if (correlation > 0.4) {
    recommendation =
      'Moderate correlation - some diversity but agents share some error patterns. Monitor for improvement.';
  } else if (correlation < -0.3) {
    recommendation =
      'Agents are anti-correlated - good diversity but may indicate complementary strengths.';
  } else {
    recommendation = 'Good diversity - agents show independent error patterns.';
  }

  return {
    correlation,
    sharedErrors,
    totalTasks,
    recommendation,
  };
}

/**
 * Calculate correlation coefficient between two agents' error sets (in-memory).
 * Used by detectLowDiversity to avoid O(n²) database queries.
 */
function calculateCorrelationFromSets(
  agentAFailed: Set<string>,
  agentBFailed: Set<string>
): { correlation: number; sharedErrors: number; totalTasks: number; recommendation: string } {
  // Get all unique tasks (union of both sets)
  const allTasks = new Set([...agentAFailed, ...agentBFailed]);
  const totalTasks = allTasks.size;

  if (totalTasks === 0) {
    return {
      correlation: 0,
      sharedErrors: 0,
      totalTasks: 0,
      recommendation: 'No error data available for comparison',
    };
  }

  // Count shared errors (tasks that both agents failed)
  let sharedErrors = 0;
  for (const task of allTasks) {
    if (agentAFailed.has(task) && agentBFailed.has(task)) {
      sharedErrors++;
    }
  }

  // Calculate correlation using simplified Pearson correlation
  const agentAErrorRate = agentAFailed.size / totalTasks;
  const agentBErrorRate = agentBFailed.size / totalTasks;
  const expectedSharedErrors = totalTasks * agentAErrorRate * agentBErrorRate;

  let correlation = 0;
  if (totalTasks > 1) {
    const variance =
      totalTasks *
      agentAErrorRate *
      agentBErrorRate *
      (1 - agentAErrorRate) *
      (1 - agentBErrorRate);
    if (variance > 0) {
      correlation = (sharedErrors - expectedSharedErrors) / Math.sqrt(variance);
      correlation = Math.max(-1, Math.min(1, correlation));
    }
  }

  // Generate recommendation
  let recommendation: string;
  if (correlation > 0.7) {
    recommendation =
      'Agents are too similar - high error correlation suggests low diversity. Consider diversifying agent strategies or training data.';
  } else if (correlation > 0.4) {
    recommendation =
      'Moderate correlation - some diversity but agents share some error patterns. Monitor for improvement.';
  } else if (correlation < -0.3) {
    recommendation =
      'Agents are anti-correlated - good diversity but may indicate complementary strengths.';
  } else {
    recommendation = 'Good diversity - agents show independent error patterns.';
  }

  return { correlation, sharedErrors, totalTasks, recommendation };
}

/**
 * Detect low diversity across all agent pairs in a project
 *
 * Finds agent pairs with correlation > 0.7 and provides recommendations.
 *
 * Optimized: Pre-fetches all error data in a single query to avoid O(n²) database calls.
 */
export function detectLowDiversity(projectId: string, db: DbClient): LowDiversityResult {

  // Single query to get all error data for all agents in this project
  // This replaces O(n²) queries with O(1) query + O(n²) in-memory operations
  const allAgentErrors = db
    .select({
      agentId: auditLog.agentId,
      entryId: auditLog.entryId,
      subtaskType: auditLog.subtaskType,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.scopeType, 'project'),
        eq(auditLog.scopeId, projectId),
        sql`${auditLog.success} = 0`,
        isNotNull(auditLog.agentId)
      )
    )
    .all();

  // Build Map of agentId -> Set<taskKey> for O(1) lookups
  const agentFailedTasks = new Map<string, Set<string>>();
  for (const err of allAgentErrors) {
    if (!err.agentId) continue;
    const key = err.entryId || err.subtaskType || 'unknown';
    let taskSet = agentFailedTasks.get(err.agentId);
    if (!taskSet) {
      taskSet = new Set<string>();
      agentFailedTasks.set(err.agentId, taskSet);
    }
    taskSet.add(key);
  }

  const agentIds = Array.from(agentFailedTasks.keys());

  if (agentIds.length < 2) {
    return {
      agentPairs: [],
      recommendations: ['Need at least 2 agents with errors to calculate correlation'],
    };
  }

  // Calculate correlation for all pairs using pre-fetched data (no DB queries in loop)
  const agentPairs: Array<{ agentA: string; agentB: string; correlation: number }> = [];
  const recommendations: string[] = [];

  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      const agentA = agentIds[i];
      const agentB = agentIds[j];
      if (!agentA || !agentB) continue;

      const agentAFailed = agentFailedTasks.get(agentA) || new Set<string>();
      const agentBFailed = agentFailedTasks.get(agentB) || new Set<string>();

      // Calculate correlation in-memory using pre-fetched data
      const correlation = calculateCorrelationFromSets(agentAFailed, agentBFailed);
      agentPairs.push({
        agentA,
        agentB,
        correlation: correlation.correlation,
      });

      if (correlation.correlation > 0.7) {
        recommendations.push(
          `High correlation (${correlation.correlation.toFixed(2)}) between ${agentA} and ${agentB}: ${correlation.recommendation}`
        );
      }
    }
  }

  // Sort by correlation (descending)
  agentPairs.sort((a, b) => b.correlation - a.correlation);

  // Add general recommendations
  const highCorrelationCount = agentPairs.filter((p) => p.correlation > 0.7).length;
  if (highCorrelationCount > 0) {
    recommendations.push(
      `Found ${highCorrelationCount} agent pair(s) with high error correlation (>0.7). Consider:`
    );
    recommendations.push('- Diversifying agent training data or prompts');
    recommendations.push('- Using different model architectures or parameters');
    recommendations.push('- Implementing ensemble voting to leverage diversity');
  } else {
    recommendations.push('Good agent diversity - no high correlation pairs detected.');
  }

  return {
    agentPairs,
    recommendations,
  };
}

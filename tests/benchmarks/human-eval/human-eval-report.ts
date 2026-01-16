/**
 * Human Evaluation Report Generator
 *
 * Generates markdown and JSON reports from human evaluation sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  EvaluationSession,
  HumanEvaluationReport,
  DimensionScore,
  AgreementMetrics,
  LikertRating,
  EvaluableBenchmark,
} from './human-eval-types.js';
import { RATING_DIMENSIONS, RATING_LABELS } from './human-eval-types.js';

/**
 * Calculate standard deviation
 */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Calculate median
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate dimension scores from evaluations
 */
function calculateDimensionScores(
  evaluations: EvaluationSession['evaluations'],
  benchmarkType: EvaluableBenchmark
): DimensionScore[] {
  const dimensions = RATING_DIMENSIONS[benchmarkType];
  const scores: DimensionScore[] = [];

  for (const dim of dimensions) {
    const ratings: number[] = [];
    const distribution: Record<LikertRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const evalItem of evaluations) {
      const rating = (evalItem.ratings as Record<string, number>)[dim];
      if (rating !== undefined) {
        ratings.push(rating);
        distribution[rating as LikertRating]++;
      }
    }

    if (ratings.length > 0) {
      scores.push({
        dimension: dim,
        mean: ratings.reduce((a, b) => a + b, 0) / ratings.length,
        stdDev: stdDev(ratings),
        median: median(ratings),
        distribution,
        count: ratings.length,
      });
    }
  }

  return scores;
}

/**
 * Calculate inter-annotator agreement
 */
function calculateAgreement(sessions: EvaluationSession[]): AgreementMetrics | undefined {
  // Group evaluations by test case
  const byTestCase: Record<string, Array<Record<string, number>>> = {};

  for (const session of sessions) {
    for (const evalItem of session.evaluations) {
      if (!byTestCase[evalItem.testCaseId]) {
        byTestCase[evalItem.testCaseId] = [];
      }
      byTestCase[evalItem.testCaseId].push(evalItem.ratings as Record<string, number>);
    }
  }

  // Only calculate if we have multiple ratings per item
  const multiRatedItems = Object.entries(byTestCase).filter(([_, ratings]) => ratings.length > 1);
  if (multiRatedItems.length === 0) return undefined;

  const uniqueEvaluators = new Set(sessions.map((s) => s.evaluatorId));

  // Calculate percent agreement per dimension
  const dimensionAgreements: Record<string, number[]> = {};
  let totalAgreements = 0;
  let totalComparisons = 0;

  for (const [_, ratings] of multiRatedItems) {
    // Compare all pairs
    for (let i = 0; i < ratings.length; i++) {
      for (let j = i + 1; j < ratings.length; j++) {
        const r1 = ratings[i];
        const r2 = ratings[j];

        for (const dim of Object.keys(r1)) {
          if (!dimensionAgreements[dim]) dimensionAgreements[dim] = [];
          const agreed = r1[dim] === r2[dim] ? 1 : 0;
          dimensionAgreements[dim].push(agreed);
          if (agreed) totalAgreements++;
          totalComparisons++;
        }
      }
    }
  }

  const lowestAgreement = Object.entries(dimensionAgreements)
    .map(([dim, agreements]) => ({
      dimension: dim,
      agreement: agreements.reduce((a, b) => a + b, 0) / agreements.length,
    }))
    .sort((a, b) => a.agreement - b.agreement)
    .slice(0, 3);

  return {
    percentAgreement: totalComparisons > 0 ? (totalAgreements / totalComparisons) * 100 : 0,
    annotatorCount: uniqueEvaluators.size,
    lowestAgreement,
  };
}

/**
 * Generate report from sessions
 */
export function generateReport(sessions: EvaluationSession[]): HumanEvaluationReport {
  if (sessions.length === 0) {
    throw new Error('No sessions provided for report generation');
  }

  const benchmarkType = sessions[0].benchmarkType;
  const allEvaluations = sessions.flatMap((s) => s.evaluations);
  const uniqueTestCases = new Set(allEvaluations.map((e) => e.testCaseId));
  const uniqueEvaluators = new Set(sessions.map((s) => s.evaluatorId));

  // Overall scores
  const overallScores = calculateDimensionScores(allEvaluations, benchmarkType);

  // Group by test case for finding best/worst
  const byTestCase: Record<string, typeof allEvaluations> = {};
  for (const evalItem of allEvaluations) {
    if (!byTestCase[evalItem.testCaseId]) byTestCase[evalItem.testCaseId] = [];
    byTestCase[evalItem.testCaseId].push(evalItem);
  }

  // Calculate mean score per test case
  const testCaseScores = Object.entries(byTestCase).map(([id, evals]) => {
    const dimensions: Record<string, number> = {};
    let totalScore = 0;
    let count = 0;

    for (const dim of RATING_DIMENSIONS[benchmarkType]) {
      const dimRatings = evals
        .map((e) => (e.ratings as Record<string, number>)[dim])
        .filter((r) => r !== undefined);
      if (dimRatings.length > 0) {
        const mean = dimRatings.reduce((a, b) => a + b, 0) / dimRatings.length;
        dimensions[dim] = mean;
        totalScore += mean;
        count++;
      }
    }

    return {
      testCaseId: id,
      testCaseName: evals[0].testCaseName,
      meanScore: count > 0 ? totalScore / count : 0,
      dimensions,
    };
  });

  // Sort for best/worst
  testCaseScores.sort((a, b) => a.meanScore - b.meanScore);
  const lowestScoringCases = testCaseScores.slice(0, 5);
  const highestScoringCases = testCaseScores.slice(-5).reverse();

  // Average evaluation time
  const evalTimes = allEvaluations.map((e) => e.evaluationTimeSeconds);
  const avgEvaluationTimeSeconds =
    evalTimes.length > 0 ? evalTimes.reduce((a, b) => a + b, 0) / evalTimes.length : 0;

  // Inter-annotator agreement
  const agreement = calculateAgreement(sessions);

  return {
    generatedAt: new Date().toISOString(),
    benchmarkType,
    sessionIds: sessions.map((s) => s.id),
    totalEvaluations: allEvaluations.length,
    uniqueTestCases: uniqueTestCases.size,
    uniqueEvaluators: uniqueEvaluators.size,
    overallScores,
    byDifficulty: {}, // Would need difficulty info from original test cases
    byCategory: {}, // Would need category info from original test cases
    agreement,
    lowestScoringCases,
    highestScoringCases,
    avgEvaluationTimeSeconds,
  };
}

/**
 * Format report as markdown
 */
export function formatReportAsMarkdown(report: HumanEvaluationReport): string {
  const lines: string[] = [];

  lines.push(`# Human Evaluation Report: ${report.benchmarkType}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Evaluations | ${report.totalEvaluations} |`);
  lines.push(`| Unique Test Cases | ${report.uniqueTestCases} |`);
  lines.push(`| Unique Evaluators | ${report.uniqueEvaluators} |`);
  lines.push(`| Avg Evaluation Time | ${report.avgEvaluationTimeSeconds.toFixed(1)}s |`);
  lines.push('');

  lines.push('## Overall Scores');
  lines.push('');
  lines.push('| Dimension | Mean | Std Dev | Median | Count |');
  lines.push('|-----------|------|---------|--------|-------|');
  for (const score of report.overallScores) {
    lines.push(
      `| ${score.dimension} | ${score.mean.toFixed(2)} | ${score.stdDev.toFixed(2)} | ${score.median.toFixed(1)} | ${score.count} |`
    );
  }
  lines.push('');

  if (report.agreement) {
    lines.push('## Inter-Annotator Agreement');
    lines.push('');
    lines.push(`- **Annotators**: ${report.agreement.annotatorCount}`);
    lines.push(`- **Percent Agreement**: ${report.agreement.percentAgreement.toFixed(1)}%`);
    lines.push('');
    if (report.agreement.lowestAgreement.length > 0) {
      lines.push('### Dimensions with Lowest Agreement');
      lines.push('');
      for (const item of report.agreement.lowestAgreement) {
        lines.push(`- ${item.dimension}: ${(item.agreement * 100).toFixed(1)}%`);
      }
      lines.push('');
    }
  }

  lines.push('## Score Distribution');
  lines.push('');
  for (const score of report.overallScores) {
    lines.push(`### ${score.dimension}`);
    lines.push('');
    lines.push('```');
    for (let i = 5; i >= 1; i--) {
      const count = score.distribution[i as LikertRating];
      const bar = '█'.repeat(Math.round((count / score.count) * 20));
      const pct = ((count / score.count) * 100).toFixed(0);
      lines.push(`${i} ${RATING_LABELS[i as LikertRating].padEnd(12)} ${bar.padEnd(20)} ${pct}%`);
    }
    lines.push('```');
    lines.push('');
  }

  lines.push('## Lowest Scoring Cases');
  lines.push('');
  lines.push('These test cases need improvement:');
  lines.push('');
  for (const tc of report.lowestScoringCases) {
    lines.push(`- **${tc.testCaseId}**: ${tc.testCaseName} (avg: ${tc.meanScore.toFixed(2)})`);
  }
  lines.push('');

  lines.push('## Highest Scoring Cases');
  lines.push('');
  for (const tc of report.highestScoringCases) {
    lines.push(`- **${tc.testCaseId}**: ${tc.testCaseName} (avg: ${tc.meanScore.toFixed(2)})`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Load session from file
 */
export function loadSession(sessionId: string, outputDir: string): EvaluationSession {
  const sessionPath = path.join(outputDir, `session-${sessionId}.json`);
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Session not found: ${sessionPath}`);
  }
  return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
}

/**
 * List all sessions in output directory
 */
export function listSessions(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return [];
  const files = fs.readdirSync(outputDir);
  return files
    .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
    .map((f) => f.replace('session-', '').replace('.json', ''));
}

/**
 * Save report to files
 */
export function saveReport(
  report: HumanEvaluationReport,
  outputDir: string
): { json: string; markdown: string } {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `human-eval-report-${timestamp}.json`);
  const mdPath = path.join(outputDir, `human-eval-report-${timestamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, formatReportAsMarkdown(report));

  return { json: jsonPath, markdown: mdPath };
}

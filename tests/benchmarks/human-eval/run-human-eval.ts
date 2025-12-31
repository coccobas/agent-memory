#!/usr/bin/env npx tsx
/**
 * Human Evaluation CLI Entry Point
 *
 * Run with: npx tsx tests/benchmarks/human-eval/run-human-eval.ts [options]
 *
 * Examples:
 *   npx tsx run-human-eval.ts --benchmark summarization --limit 10
 *   npx tsx run-human-eval.ts --benchmark extraction --evaluator alice
 *   npx tsx run-human-eval.ts --resume abc123
 *   npx tsx run-human-eval.ts --report --session abc123
 *   npx tsx run-human-eval.ts --list-sessions
 */

import { Command } from 'commander';
import { runHumanEval, showRatingGuide } from './human-eval-runner.js';
import {
  generateReport,
  formatReportAsMarkdown,
  saveReport,
  loadSession,
  listSessions,
} from './human-eval-report.js';
import type { HumanEvalOptions, EvaluableBenchmark } from './human-eval-types.js';

const DEFAULT_OUTPUT_DIR = './tests/benchmarks/human-eval/results';

const program = new Command();

program
  .name('human-eval')
  .description('Human evaluation CLI for benchmark outputs')
  .version('1.0.0');

// Run evaluation command
program
  .command('run', { isDefault: true })
  .description('Run interactive human evaluation')
  .option('-b, --benchmark <type>', 'Benchmark type (extraction, summarization, query)', 'summarization')
  .option('-l, --limit <number>', 'Maximum items to evaluate', parseInt)
  .option('-c, --category <name>', 'Only evaluate items from this category')
  .option('-d, --difficulty <level>', 'Only evaluate items with this difficulty (easy, medium, hard)')
  .option('-s, --seed <number>', 'Random seed for reproducible item selection', parseInt)
  .option('-r, --resume <sessionId>', 'Resume an existing session')
  .option('-e, --evaluator <id>', 'Evaluator ID for tracking', 'anonymous')
  .option('-o, --output <dir>', 'Output directory for results', DEFAULT_OUTPUT_DIR)
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (opts) => {
    const options: HumanEvalOptions = {
      benchmark: opts.benchmark as EvaluableBenchmark,
      limit: opts.limit,
      category: opts.category,
      difficulty: opts.difficulty,
      seed: opts.seed,
      resumeSessionId: opts.resume,
      evaluatorId: opts.evaluator,
      outputDir: opts.output,
      verbose: opts.verbose,
    };

    try {
      await runHumanEval(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Generate report command
program
  .command('report')
  .description('Generate report from evaluation sessions')
  .option('-s, --session <ids...>', 'Session ID(s) to include')
  .option('-a, --all', 'Include all sessions')
  .option('-o, --output <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
  .action((opts) => {
    const outputDir = opts.output;

    try {
      let sessionIds: string[];

      if (opts.all) {
        sessionIds = listSessions(outputDir);
        if (sessionIds.length === 0) {
          console.log('No sessions found in', outputDir);
          return;
        }
      } else if (opts.session) {
        sessionIds = opts.session;
      } else {
        console.log('Specify --session <id> or --all');
        return;
      }

      console.log(`Loading ${sessionIds.length} session(s)...`);
      const sessions = sessionIds.map((id) => loadSession(id, outputDir));

      console.log('Generating report...');
      const report = generateReport(sessions);

      const { json, markdown } = saveReport(report, outputDir);

      console.log('\n📊 Report generated:');
      console.log(`  JSON: ${json}`);
      console.log(`  Markdown: ${markdown}`);

      // Print summary
      console.log('\n📈 Summary:');
      console.log(`  Evaluations: ${report.totalEvaluations}`);
      console.log(`  Test cases: ${report.uniqueTestCases}`);
      console.log(`  Evaluators: ${report.uniqueEvaluators}`);

      console.log('\n  Dimension Scores:');
      for (const score of report.overallScores) {
        console.log(`    ${score.dimension}: ${score.mean.toFixed(2)}/5 (n=${score.count})`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List sessions command
program
  .command('list')
  .description('List evaluation sessions')
  .option('-o, --output <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
  .action((opts) => {
    const sessionIds = listSessions(opts.output);

    if (sessionIds.length === 0) {
      console.log('No sessions found in', opts.output);
      return;
    }

    console.log('📁 Sessions:');
    for (const id of sessionIds) {
      try {
        const session = loadSession(id, opts.output);
        const status = session.status === 'completed' ? '✅' : '⏳';
        console.log(
          `  ${status} ${id} | ${session.benchmarkType} | ${session.completedItems}/${session.totalItems} | ${session.evaluatorId}`
        );
      } catch {
        console.log(`  ❓ ${id} (could not load)`);
      }
    }
  });

// Show guide command
program
  .command('guide')
  .description('Show rating guide')
  .action(() => {
    showRatingGuide();
  });

// Parse and execute
program.parse();

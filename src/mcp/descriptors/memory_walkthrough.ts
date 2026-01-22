import type { SimpleToolDescriptor } from './types.js';
import type {
  WalkthroughStepId,
  WalkthroughResult,
  WalkthroughAction,
} from '../../services/onboarding/walkthrough-types.js';
import { createWalkthroughService } from '../../services/onboarding/walkthrough.service.js';

const walkthroughService = createWalkthroughService();

function formatWalkthroughDisplay(result: Omit<WalkthroughResult, '_display'>): string {
  const { step, progress, stepNumber, totalSteps, isComplete } = result;
  const lines: string[] = [];

  const progressBar = STEP_IDS.map((id) => {
    if (progress.completedSteps.includes(id)) return '●';
    if (id === progress.currentStep) return '◉';
    return '○';
  }).join(' ');

  lines.push(`**${step.title}** (${stepNumber}/${totalSteps})`);
  lines.push(`Progress: ${progressBar}`);
  lines.push('');

  lines.push(step.explanation);
  lines.push('');

  if (step.concepts && step.concepts.length > 0) {
    lines.push(`**Key concepts:** ${step.concepts.join(', ')}`);
    lines.push('');
  }

  if (step.tryIt && step.tryIt.length > 0) {
    lines.push('**Try it yourself:**');
    for (const item of step.tryIt) {
      lines.push(`  → ${item.description}`);
      lines.push(`    \`${item.command}\` ${item.example ? `with ${item.example}` : ''}`);
    }
    lines.push('');
  }

  if (step.tips && step.tips.length > 0) {
    lines.push('**Tips:**');
    for (const tip of step.tips) {
      lines.push(`  💡 ${tip}`);
    }
    lines.push('');
  }

  if (step.nextPreview && !isComplete) {
    lines.push(`*${step.nextPreview}*`);
    lines.push('');
  }

  if (!isComplete) {
    lines.push('---');
    lines.push(
      'Use `memory_walkthrough` with action:"next" to continue, action:"prev" to go back.'
    );
  }

  const achievements: string[] = [];
  if (progress.hasStoredMemory) achievements.push('✓ Stored memory');
  if (progress.hasQueriedMemory) achievements.push('✓ Queried memory');
  if (progress.hasStartedSession) achievements.push('✓ Started session');

  if (achievements.length > 0) {
    lines.push('');
    lines.push(`**Your achievements:** ${achievements.join(' | ')}`);
  }

  return lines.join('\n');
}

const STEP_IDS: WalkthroughStepId[] = [
  'welcome',
  'project_setup',
  'first_memory',
  'querying',
  'sessions',
  'tips',
  'complete',
];

export const memoryWalkthroughDescriptor: SimpleToolDescriptor = {
  name: 'memory_walkthrough',
  visibility: 'core',
  description:
    'Interactive step-by-step tutorial for Agent Memory. ' +
    'Guides new users through concepts, setup, and first-time usage. ' +
    'Use action:"start" to begin or resume, action:"next" to advance.',
  params: {
    action: {
      type: 'string',
      enum: ['start', 'next', 'prev', 'goto', 'status', 'reset'],
      description:
        'Action to perform: start (begin/resume), next (advance), prev (go back), goto (jump to step), status (current state), reset (start over)',
    },
    step: {
      type: 'string',
      enum: [
        'welcome',
        'project_setup',
        'first_memory',
        'querying',
        'sessions',
        'tips',
        'complete',
      ],
      description: 'Step to jump to (only for action:"goto")',
    },
  },
  contextHandler: async (ctx, args) => {
    const action = ((args?.action as string) ?? 'start') as WalkthroughAction;
    const targetStep = args?.step as WalkthroughStepId | undefined;

    let projectId = 'default';
    if (ctx.services.contextDetection) {
      const detected = await ctx.services.contextDetection.detect();
      projectId = detected?.project?.id ?? 'default';
    }

    let progress = await walkthroughService.getProgress(projectId);

    switch (action) {
      case 'start':
        if (!progress) {
          progress = walkthroughService.createInitialProgress();
          progress.projectId = projectId;
          await walkthroughService.saveProgress(projectId, progress);
        }
        break;

      case 'next':
        if (!progress) {
          progress = walkthroughService.createInitialProgress();
          progress.projectId = projectId;
        }
        progress = walkthroughService.nextStep(progress);
        await walkthroughService.saveProgress(projectId, progress);
        break;

      case 'prev':
        if (!progress) {
          progress = walkthroughService.createInitialProgress();
          progress.projectId = projectId;
        }
        progress = walkthroughService.prevStep(progress);
        await walkthroughService.saveProgress(projectId, progress);
        break;

      case 'goto':
        if (!progress) {
          progress = walkthroughService.createInitialProgress();
          progress.projectId = projectId;
        }
        if (targetStep && STEP_IDS.includes(targetStep)) {
          progress = walkthroughService.gotoStep(progress, targetStep);
          await walkthroughService.saveProgress(projectId, progress);
        }
        break;

      case 'status':
        if (!progress) {
          return {
            started: false,
            message: 'Walkthrough not started. Use action:"start" to begin.',
            _display:
              'Walkthrough not started. Use `memory_walkthrough` with action:"start" to begin the tutorial.',
          };
        }
        break;

      case 'reset':
        progress = walkthroughService.createInitialProgress();
        progress.projectId = projectId;
        await walkthroughService.saveProgress(projectId, progress);
        break;
    }

    if (!progress) {
      progress = walkthroughService.createInitialProgress();
      progress.projectId = projectId;
      await walkthroughService.saveProgress(projectId, progress);
    }

    const step = walkthroughService.getStep(progress.currentStep);
    if (!step) {
      return {
        error: 'Step not found',
        _display: 'Error: Step not found. Try action:"reset" to restart.',
      };
    }

    const stepNumber = walkthroughService.getStepNumber(progress.currentStep);
    const totalSteps = walkthroughService.getTotalSteps();
    const isComplete = walkthroughService.isComplete(progress);

    const result: Omit<WalkthroughResult, '_display'> = {
      step,
      progress,
      stepNumber,
      totalSteps,
      isComplete,
    };

    return {
      ...result,
      _display: formatWalkthroughDisplay(result),
    };
  },
};

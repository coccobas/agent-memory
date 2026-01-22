/**
 * Walkthrough Onboarding Types
 *
 * Types for the interactive step-by-step walkthrough that guides
 * new users through agent memory concepts and first-time setup.
 */

/**
 * Available walkthrough steps
 */
export type WalkthroughStepId =
  | 'welcome'
  | 'project_setup'
  | 'first_memory'
  | 'querying'
  | 'sessions'
  | 'tips'
  | 'complete';

/**
 * Content for a single walkthrough step
 */
export interface WalkthroughStepContent {
  /** Step identifier */
  id: WalkthroughStepId;
  /** Step title */
  title: string;
  /** Main explanation text (markdown supported) */
  explanation: string;
  /** Key concepts introduced in this step */
  concepts?: string[];
  /** Example commands to try */
  tryIt?: Array<{
    description: string;
    command: string;
    example?: string;
  }>;
  /** Tips or best practices */
  tips?: string[];
  /** What happens next */
  nextPreview?: string;
}

/**
 * User's progress through the walkthrough
 */
export interface WalkthroughProgress {
  /** Current step */
  currentStep: WalkthroughStepId;
  /** Steps completed */
  completedSteps: WalkthroughStepId[];
  /** When walkthrough was started */
  startedAt: string;
  /** When last step was completed */
  lastActivityAt: string;
  /** Project ID (if set up) */
  projectId?: string;
  /** Whether user has stored at least one memory */
  hasStoredMemory: boolean;
  /** Whether user has queried memory */
  hasQueriedMemory: boolean;
  /** Whether user has started a session */
  hasStartedSession: boolean;
}

/**
 * Result from a walkthrough action
 */
export interface WalkthroughResult {
  /** Current step content */
  step: WalkthroughStepContent;
  /** User's progress */
  progress: WalkthroughProgress;
  /** Step number (1-indexed) */
  stepNumber: number;
  /** Total steps */
  totalSteps: number;
  /** Whether walkthrough is complete */
  isComplete: boolean;
  /** Formatted display output */
  _display: string;
}

/**
 * Actions available in walkthrough
 */
export type WalkthroughAction =
  | 'start' // Start or resume walkthrough
  | 'next' // Advance to next step
  | 'prev' // Go back to previous step
  | 'goto' // Jump to specific step
  | 'status' // Get current status
  | 'reset'; // Reset progress

/**
 * Walkthrough service interface
 */
export interface IWalkthroughService {
  /** Get all step definitions */
  getSteps(): WalkthroughStepContent[];

  /** Get a specific step */
  getStep(stepId: WalkthroughStepId): WalkthroughStepContent | null;

  /** Get current progress for a project */
  getProgress(projectId: string): Promise<WalkthroughProgress | null>;

  /** Save progress for a project */
  saveProgress(projectId: string, progress: WalkthroughProgress): Promise<void>;

  /** Advance to next step */
  nextStep(progress: WalkthroughProgress): WalkthroughProgress;

  /** Go to previous step */
  prevStep(progress: WalkthroughProgress): WalkthroughProgress;

  /** Jump to specific step */
  gotoStep(progress: WalkthroughProgress, stepId: WalkthroughStepId): WalkthroughProgress;

  /** Create initial progress */
  createInitialProgress(): WalkthroughProgress;

  /** Mark achievement (stored memory, queried, etc.) */
  markAchievement(
    progress: WalkthroughProgress,
    achievement: 'storedMemory' | 'queriedMemory' | 'startedSession'
  ): WalkthroughProgress;
}

/**
 * Dependencies for walkthrough service
 */
export interface WalkthroughDependencies {
  /** Knowledge repository for checking achievements */
  getKnowledgeCount?: (projectId: string) => Promise<number>;
  /** Guideline repository for checking achievements */
  getGuidelineCount?: (projectId: string) => Promise<number>;
  /** Session repository for checking achievements */
  getSessionCount?: (projectId: string) => Promise<number>;
}

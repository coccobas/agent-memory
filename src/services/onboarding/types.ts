/**
 * Onboarding Service Types
 *
 * Shared types for the onboarding wizard that helps new projects
 * auto-detect settings, import docs, and seed guidelines.
 */

/**
 * Detected project information from filesystem
 */
export interface DetectedProjectInfo {
  name: string;
  description?: string;
  version?: string;
  source: 'package.json' | 'git' | 'directory';
}

/**
 * Tech stack detection confidence level
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Detected tech stack item
 */
export interface TechStackItem {
  name: string;
  category: 'language' | 'framework' | 'runtime' | 'tool';
  confidence: number; // 0-1
  source: string; // Where it was detected (e.g., "package.json dependencies")
}

/**
 * Complete tech stack detection result
 */
export interface TechStackInfo {
  languages: TechStackItem[];
  frameworks: TechStackItem[];
  runtimes: TechStackItem[];
  tools: TechStackItem[];
}

/**
 * Scanned documentation file
 */
export interface ScannedDoc {
  path: string;
  filename: string;
  type: 'readme' | 'claude' | 'cursorrules' | 'contributing' | 'other';
  size: number;
  content?: string; // Only populated if readDoc is called
}

/**
 * Guideline template for seeding
 */
export interface GuidelineTemplate {
  name: string;
  content: string;
  category: string;
  priority: number;
  rationale?: string;
  examples?: {
    good?: string[];
    bad?: string[];
  };
  tags?: string[];
}

/**
 * Result from seeding guidelines
 */
export interface SeededResult {
  created: GuidelineTemplate[];
  skipped: Array<{ name: string; reason: string }>;
  errors: Array<{ name: string; error: string }>;
}

/**
 * Onboarding step result
 */
export interface OnboardingStepResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Complete onboarding result
 */
export interface OnboardingResult {
  success: boolean;
  project: {
    id?: string;
    name: string;
    created: boolean;
    existed: boolean;
  };
  techStack: TechStackInfo;
  importedDocs: Array<{
    path: string;
    entriesCreated: number;
    type: string;
  }>;
  seededGuidelines: Array<{
    name: string;
    category: string;
  }>;
  warnings: string[];
  nextSteps: string[];
  dryRun?: boolean;
}

/**
 * Onboarding options
 */
export interface OnboardingOptions {
  projectName?: string; // Override detected name
  importDocs?: boolean; // Import docs (default: true)
  seedGuidelines?: boolean; // Seed guidelines (default: true)
  skipSteps?: string[]; // Steps to skip: ['createProject', 'importDocs', 'seedGuidelines']
  dryRun?: boolean; // Preview without changes
}

/**
 * Valid onboarding steps
 */
export type OnboardingStep = 'detectProject' | 'createProject' | 'importDocs' | 'seedGuidelines';

/**
 * Service interfaces
 */
export interface IProjectDetectorService {
  detectProjectInfo(cwd: string): Promise<DetectedProjectInfo | null>;
}

export interface ITechStackDetectorService {
  detectTechStack(cwd: string): Promise<TechStackInfo>;
}

export interface IDocScannerService {
  scanForDocs(cwd: string): Promise<ScannedDoc[]>;
  readDoc(path: string, maxSizeBytes?: number): Promise<string | null>;
}

export interface IGuidelineSeederService {
  getGuidelinesForTechStack(techStack: TechStackInfo): GuidelineTemplate[];
  seedGuidelines(
    projectId: string,
    guidelines: GuidelineTemplate[],
    agentId: string
  ): Promise<SeededResult>;
}

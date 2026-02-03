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
  deepScanFindings?: DeepScanFinding[];
  deepScanDurationMs?: number;
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
export type OnboardingStep =
  | 'detectProject'
  | 'createProject'
  | 'importDocs'
  | 'seedGuidelines'
  | 'deepScan';

/**
 * Deep scan exploration area
 */
export type DeepScanArea = 'architecture' | 'database' | 'api' | 'testing' | 'documentation';

/**
 * Deep scan finding - a discovered fact about the codebase
 */
export interface DeepScanFinding {
  area: DeepScanArea;
  title: string;
  content: string;
  category: 'fact' | 'decision' | 'reference' | 'tool';
  confidence: number;
  source?: string;
  command?: string;
}

/**
 * Deep scan result
 */
export interface DeepScanResult {
  success: boolean;
  findings: DeepScanFinding[];
  areasScanned: DeepScanArea[];
  durationMs: number;
  errors: string[];
}

export type LlmCallFunction = (prompt: string) => Promise<unknown>;

/**
 * LLM enrichment areas that can be individually enabled
 */
export type LlmEnrichmentArea = 'code' | 'docs' | 'adr';

/**
 * Budget constraints for LLM enrichment
 */
export interface LlmEnrichmentBudgets {
  /** Maximum total LLM calls (default: 4) */
  maxCalls?: number;
  /** Maximum concurrent LLM calls (default: 2) */
  maxConcurrent?: number;
  /** Maximum input bytes per LLM call (default: 8000) */
  maxInputBytesPerCall?: number;
  /** Timeout per individual LLM call in ms (default: 30000) */
  perCallTimeoutMs?: number;
  /** Overall timeout for all LLM enrichment in ms (default: 60000) */
  overallTimeoutMs?: number;
}

/**
 * Full LLM enrichment configuration
 */
export interface LlmEnrichmentConfig {
  /** Master enable flag */
  enabled?: boolean;
  /** Which areas to enrich with LLM */
  areas?: {
    /** Analyze actual code files for patterns and architecture */
    code?: boolean;
    /** Analyze README and documentation for decisions */
    docs?: boolean;
    /** Deep analyze ADRs beyond regex parsing */
    adr?: boolean;
  };
  /** Budget constraints */
  budgets?: LlmEnrichmentBudgets;
}

/**
 * Normalize useLlm option to full config
 * Supports backward compatibility: boolean | LlmEnrichmentConfig
 */
export function normalizeLlmConfig(
  useLlm?: boolean | LlmEnrichmentConfig
): LlmEnrichmentConfig | null {
  if (!useLlm) return null;
  if (typeof useLlm === 'boolean') {
    return {
      enabled: true,
      areas: { code: true, docs: true, adr: true },
      budgets: {},
    };
  }
  return {
    enabled: useLlm.enabled ?? true,
    areas: {
      code: useLlm.areas?.code ?? true,
      docs: useLlm.areas?.docs ?? true,
      adr: useLlm.areas?.adr ?? true,
    },
    budgets: useLlm.budgets ?? {},
  };
}

/**
 * Default budget values
 */
export const DEFAULT_LLM_BUDGETS: Required<LlmEnrichmentBudgets> = {
  maxCalls: 4,
  maxConcurrent: 2,
  maxInputBytesPerCall: 8000,
  perCallTimeoutMs: 30000,
  overallTimeoutMs: 60000,
};

/**
 * Deep scan options
 */
export interface DeepScanOptions {
  areas?: DeepScanArea[]; // Which areas to scan (default: all)
  maxFindings?: number; // Max findings per area (default: 10)
  timeout?: number; // Timeout in ms (default: 120000)
  useLlm?: boolean | LlmEnrichmentConfig; // Enable LLM-assisted extraction (default: false)
  llmCallFn?: LlmCallFunction; // LLM call function (required when useLlm is enabled)
}

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

export interface IScriptExtractorService {
  extractScripts(packageJsonPath: string): Promise<DeepScanFinding[]>;
}

export interface IAdrParserService {
  parseAdr(adrPath: string): Promise<DeepScanFinding[]>;
  parseAdrDirectory(adrDir: string): Promise<DeepScanFinding[]>;
}

export interface IWorkflowExtractorService {
  extractWorkflows(contributingPath: string): Promise<DeepScanFinding[]>;
}

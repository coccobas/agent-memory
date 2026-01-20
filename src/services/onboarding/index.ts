/**
 * Onboarding Services
 *
 * Exports all onboarding-related services:
 * - ProjectDetector: Detects project info from filesystem
 * - TechStackDetector: Detects languages, frameworks, tools
 * - DocScanner: Finds and reads documentation files
 * - GuidelineSeeder: Seeds best-practice guidelines
 */

// Types
export * from './types.js';

// Services
export { ProjectDetectorService, createProjectDetectorService } from './project-detector.js';

export { TechStackDetectorService, createTechStackDetectorService } from './tech-stack-detector.js';

export { DocScannerService, createDocScannerService } from './doc-scanner.js';

export {
  GuidelineSeederService,
  createGuidelineSeederService,
  type GuidelineRepository,
} from './guideline-seeder.js';

// Templates
export {
  TYPESCRIPT_GUIDELINES,
  REACT_GUIDELINES,
  NODEJS_GUIDELINES,
  GENERAL_GUIDELINES,
  PYTHON_GUIDELINES,
  RUST_GUIDELINES,
  GO_GUIDELINES,
  GUIDELINE_MAP,
  getGuidelinesForTechStackNames,
} from './guideline-templates.js';

/**
 * memory_onboard tool descriptor
 *
 * Guided setup wizard for new projects that:
 * 1. Auto-detects project info from package.json/.git
 * 2. Creates project in memory system if needed
 * 3. Imports documentation (README, CLAUDE.md) as knowledge
 * 4. Seeds tech-stack-specific guidelines
 *
 * This reduces new project setup from manual multi-step process to one call.
 */

import type { SimpleToolDescriptor } from './types.js';
import type {
  OnboardingResult,
  TechStackInfo,
  ScannedDoc,
  DetectedProjectInfo,
} from '../../services/onboarding/types.js';
import type { ScopeType } from '../../db/schema.js';
import {
  createProjectDetectorService,
  createTechStackDetectorService,
  createDocScannerService,
  createGuidelineSeederService,
} from '../../services/onboarding/index.js';
import { formatOnboardMinto, type OnboardMintoInput } from '../../utils/minto-formatter.js';
import { getWorkingDirectoryAsync } from '../../utils/working-directory.js';

export const memoryOnboardDescriptor: SimpleToolDescriptor = {
  name: 'memory_onboard',
  visibility: 'core',
  description:
    'Guided setup wizard for new projects. Auto-detects project info, imports docs as knowledge, ' +
    'and seeds tech-stack-specific guidelines. Call with no params for full auto-detection, or ' +
    'specify options to customize the onboarding flow.',
  params: {
    projectName: {
      type: 'string',
      description: 'Override detected project name',
    },
    importDocs: {
      type: 'boolean',
      description: 'Import documentation files as knowledge entries (default: true)',
    },
    seedGuidelines: {
      type: 'boolean',
      description: 'Seed best-practice guidelines based on tech stack (default: true)',
    },
    skipSteps: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['createProject', 'importDocs', 'seedGuidelines'],
      },
      description: 'Steps to skip: createProject, importDocs, seedGuidelines',
    },
    dryRun: {
      type: 'boolean',
      description: 'Preview what would be done without making changes (default: false)',
    },
    mintoStyle: {
      type: 'boolean',
      description:
        'Use Minto Pyramid format (default: true). Set false for verbose dashboard output.',
    },
  },
  contextHandler: async (ctx, args) => {
    const { path: cwd } = await getWorkingDirectoryAsync();

    // Parse options
    const options = {
      projectName: args?.projectName as string | undefined,
      importDocs: (args?.importDocs as boolean) ?? true,
      seedGuidelines: (args?.seedGuidelines as boolean) ?? true,
      skipSteps: (args?.skipSteps as string[] | undefined) ?? [],
      dryRun: (args?.dryRun as boolean) ?? false,
      mintoStyle: (args?.mintoStyle as boolean) ?? true,
    };

    const skipSteps = new Set(options.skipSteps);
    const warnings: string[] = [];
    const nextSteps: string[] = [];

    // Initialize services
    const projectDetector = createProjectDetectorService();
    const techStackDetector = createTechStackDetectorService();
    const docScanner = createDocScannerService();

    let agentId = (args?.agentId as string | undefined) ?? 'claude-code';
    if (!agentId && ctx.services.contextDetection) {
      const detected = await ctx.services.contextDetection.detect();
      agentId = detected?.agentId?.value ?? 'claude-code';
    }

    // Step 1: Detect project info
    let detectedProject: DetectedProjectInfo | null = null;
    try {
      detectedProject = await projectDetector.detectProjectInfo(cwd);
    } catch (error) {
      warnings.push(
        `Failed to detect project info: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const projectName = options.projectName ?? detectedProject?.name ?? 'unnamed-project';

    // Step 2: Detect tech stack
    let techStack: TechStackInfo = {
      languages: [],
      frameworks: [],
      runtimes: [],
      tools: [],
    };

    try {
      techStack = await techStackDetector.detectTechStack(cwd);
    } catch (error) {
      warnings.push(
        `Failed to detect tech stack: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 3: Scan for docs
    let scannedDocs: ScannedDoc[] = [];
    if (options.importDocs && !skipSteps.has('importDocs')) {
      try {
        scannedDocs = await docScanner.scanForDocs(cwd);
      } catch (error) {
        warnings.push(
          `Failed to scan for docs: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Build result
    const result: OnboardingResult = {
      success: true,
      project: {
        id: undefined,
        name: projectName,
        created: false,
        existed: false,
      },
      techStack,
      importedDocs: [],
      seededGuidelines: [],
      warnings,
      nextSteps,
      dryRun: options.dryRun,
    };

    // If dry run, return preview without making changes
    if (options.dryRun) {
      // Preview what would be done
      if (!skipSteps.has('createProject')) {
        const existingProject = await ctx.repos.projects.findByPath(cwd);
        if (existingProject) {
          result.project.id = existingProject.id;
          result.project.existed = true;
        } else {
          result.project.created = true; // Would be created
        }
      }

      if (options.importDocs && !skipSteps.has('importDocs')) {
        for (const doc of scannedDocs) {
          result.importedDocs.push({
            path: doc.path,
            entriesCreated: 1, // Would create 1 entry per doc
            type: doc.type,
          });
        }
      }

      if (options.seedGuidelines && !skipSteps.has('seedGuidelines') && ctx.repos.guidelines) {
        const guidelineSeeder = createGuidelineSeederService({
          findByName: async () => null, // Assume none exist for preview
          bulkCreate: async () => [],
        });
        const guidelines = guidelineSeeder.getGuidelinesForTechStack(techStack);
        for (const g of guidelines) {
          result.seededGuidelines.push({
            name: g.name,
            category: g.category,
          });
        }
      }

      nextSteps.push('Run without dryRun:true to apply changes');

      const display = options.mintoStyle
        ? formatOnboardMinto(buildOnboardMintoInput(result))
        : formatOnboardingResult(result, true);

      return {
        ...result,
        _display: display,
      };
    }

    // Step 4: Create or find project
    let projectId: string | undefined;

    if (!skipSteps.has('createProject')) {
      try {
        // Check if project exists at this path
        const existingProject = await ctx.repos.projects.findByPath(cwd);

        if (existingProject) {
          projectId = existingProject.id;
          result.project.id = existingProject.id;
          result.project.existed = true;
        } else {
          // Create new project
          const newProject = await ctx.repos.projects.create({
            name: projectName,
            description: detectedProject?.description,
            rootPath: cwd,
          });
          projectId = newProject.id;
          result.project.id = newProject.id;
          result.project.created = true;

          // Grant permissions to agent
          const entryTypes = ['guideline', 'knowledge', 'tool'] as const;
          for (const entryType of entryTypes) {
            try {
              ctx.services.permission.grant({
                agentId,
                scopeType: 'project' as ScopeType,
                scopeId: projectId,
                entryType,
                permission: 'write',
              });
            } catch {
              // Non-fatal - permission grant failed
            }
          }
        }
      } catch (error) {
        warnings.push(
          `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      projectId = args?.projectId as string | undefined;
      if (!projectId && ctx.services.contextDetection) {
        const detected = await ctx.services.contextDetection.detect();
        projectId = detected?.project?.id;
      }
      result.project.id = projectId;
      if (projectId) {
        result.project.existed = true;
      }
    }

    // Step 5: Import documentation as knowledge
    if (options.importDocs && !skipSteps.has('importDocs') && projectId && ctx.repos.knowledge) {
      for (const doc of scannedDocs) {
        try {
          const content = await docScanner.readDoc(doc.path);
          if (content) {
            // Create knowledge entry for the doc
            const docTitle = getDocTitle(doc);
            await ctx.repos.knowledge.create({
              title: docTitle,
              content: content,
              category: 'reference',
              source: doc.path,
              scopeType: 'project' as ScopeType,
              scopeId: projectId,
              createdBy: agentId,
            });

            result.importedDocs.push({
              path: doc.path,
              entriesCreated: 1,
              type: doc.type,
            });
          }
        } catch (error) {
          warnings.push(
            `Failed to import ${doc.filename}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    // Step 6: Seed guidelines
    if (
      options.seedGuidelines &&
      !skipSteps.has('seedGuidelines') &&
      projectId &&
      ctx.repos.guidelines
    ) {
      try {
        const guidelineSeeder = createGuidelineSeederService({
          findByName: async (name: string, scopeType: ScopeType, scopeId: string) => {
            const guidelines = await ctx.repos.guidelines.list(
              { scopeType, scopeId },
              { limit: 1000 }
            );
            const found = guidelines.find((g) => g.name === name);
            return found ? { id: found.id } : null;
          },
          bulkCreate: async (entries) => {
            const results: Array<{ id: string; name: string }> = [];
            for (const entry of entries) {
              const created = await ctx.repos.guidelines.create(entry);
              results.push({ id: created.id, name: created.name });
            }
            return results;
          },
        });

        const guidelines = guidelineSeeder.getGuidelinesForTechStack(techStack);
        const seeded = await guidelineSeeder.seedGuidelines(projectId, guidelines, agentId);

        for (const g of seeded.created) {
          result.seededGuidelines.push({
            name: g.name,
            category: g.category,
          });
        }

        for (const s of seeded.skipped) {
          warnings.push(`Skipped guideline "${s.name}": ${s.reason}`);
        }

        for (const e of seeded.errors) {
          warnings.push(`Error seeding "${e.name}": ${e.error}`);
        }
      } catch (error) {
        warnings.push(
          `Failed to seed guidelines: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Add next steps suggestions
    if (result.project.created) {
      nextSteps.push(
        'Project created! Run memory_quickstart sessionName:"your task" to start working'
      );
    } else if (result.project.existed) {
      nextSteps.push('Run memory_quickstart sessionName:"your task" to continue working');
    }

    if (result.seededGuidelines.length > 0) {
      nextSteps.push(`Seeded ${result.seededGuidelines.length} guidelines`);
    }

    if (result.importedDocs.length > 0) {
      nextSteps.push(`Imported ${result.importedDocs.length} doc(s) as knowledge`);
    }

    if (techStack.languages.length === 0 && techStack.frameworks.length === 0) {
      nextSteps.push(
        'No tech stack detected. Add package.json, Cargo.toml, or other config files for tech-specific guidelines.'
      );
    }

    const display = options.mintoStyle
      ? formatOnboardMinto(buildOnboardMintoInput(result))
      : formatOnboardingResult(result, false);

    return {
      ...result,
      _display: display,
    };
  },
};

function buildOnboardMintoInput(result: OnboardingResult): OnboardMintoInput {
  return {
    dryRun: result.dryRun ?? false,
    project: result.project,
    techStack: result.techStack,
    importedDocs: result.importedDocs,
    seededGuidelines: result.seededGuidelines,
    warnings: result.warnings,
    nextSteps: result.nextSteps,
  };
}

/**
 * Get a descriptive title for a documentation file
 */
function getDocTitle(doc: ScannedDoc): string {
  switch (doc.type) {
    case 'readme':
      return 'Project README';
    case 'claude':
      return 'Claude Code Instructions (CLAUDE.md)';
    case 'cursorrules':
      return 'Cursor Rules (.cursorrules)';
    case 'contributing':
      return 'Contribution Guidelines';
    default:
      return `Documentation: ${doc.filename}`;
  }
}

/**
 * Format the onboarding result for terminal display
 */
function formatOnboardingResult(result: OnboardingResult, isDryRun: boolean): string {
  const lines: string[] = [];

  if (isDryRun) {
    lines.push('🔍 **Onboarding Preview (dry run)**\n');
  } else {
    lines.push('✅ **Onboarding Complete**\n');
  }

  // Project
  lines.push('**Project:**');
  if (result.project.created) {
    lines.push(`  ${isDryRun ? 'Would create' : 'Created'}: ${result.project.name}`);
  } else if (result.project.existed) {
    lines.push(`  Using existing: ${result.project.name}`);
  }
  if (result.project.id) {
    lines.push(`  ID: ${result.project.id}`);
  }

  // Tech Stack
  if (
    result.techStack.languages.length > 0 ||
    result.techStack.frameworks.length > 0 ||
    result.techStack.runtimes.length > 0
  ) {
    lines.push('\n**Detected Tech Stack:**');
    if (result.techStack.languages.length > 0) {
      lines.push(`  Languages: ${result.techStack.languages.map((l) => l.name).join(', ')}`);
    }
    if (result.techStack.frameworks.length > 0) {
      lines.push(`  Frameworks: ${result.techStack.frameworks.map((f) => f.name).join(', ')}`);
    }
    if (result.techStack.runtimes.length > 0) {
      lines.push(`  Runtimes: ${result.techStack.runtimes.map((r) => r.name).join(', ')}`);
    }
  }

  // Docs
  if (result.importedDocs.length > 0) {
    lines.push(
      `\n**${isDryRun ? 'Would import' : 'Imported'} Docs:** ${result.importedDocs.length}`
    );
    for (const doc of result.importedDocs) {
      lines.push(`  - ${doc.type}: ${doc.path.split('/').pop()}`);
    }
  }

  // Guidelines
  if (result.seededGuidelines.length > 0) {
    lines.push(
      `\n**${isDryRun ? 'Would seed' : 'Seeded'} Guidelines:** ${result.seededGuidelines.length}`
    );
    // Group by category
    const byCategory = new Map<string, string[]>();
    for (const g of result.seededGuidelines) {
      const list = byCategory.get(g.category) || [];
      list.push(g.name);
      byCategory.set(g.category, list);
    }
    for (const [category, names] of byCategory) {
      lines.push(`  ${category}: ${names.length} guideline(s)`);
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('\n⚠️ **Warnings:**');
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  // Next Steps
  if (result.nextSteps.length > 0) {
    lines.push('\n**Next Steps:**');
    for (const step of result.nextSteps) {
      lines.push(`  → ${step}`);
    }
  }

  return lines.join('\n');
}

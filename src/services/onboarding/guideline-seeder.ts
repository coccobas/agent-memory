/**
 * Guideline Seeder Service
 *
 * Seeds best-practice guidelines based on detected tech stack.
 * Uses bulk operations for efficiency.
 */

import type {
  TechStackInfo,
  GuidelineTemplate,
  SeededResult,
  IGuidelineSeederService,
} from './types.js';
import { getGuidelinesForTechStackNames } from './guideline-templates.js';

import type { ScopeType } from '../../db/schema.js';

/**
 * Minimal repository interface needed for seeding
 */
export interface GuidelineRepository {
  findByName(name: string, scopeType: ScopeType, scopeId: string): Promise<{ id: string } | null>;
  bulkCreate(
    entries: Array<{
      name: string;
      content: string;
      category?: string;
      priority?: number;
      rationale?: string;
      examples?: { good?: string[]; bad?: string[] };
      scopeType: ScopeType;
      scopeId: string;
      createdBy?: string;
    }>
  ): Promise<Array<{ id: string; name: string }>>;
}

/**
 * Guideline Seeder Service implementation
 */
export class GuidelineSeederService implements IGuidelineSeederService {
  constructor(private readonly guidelineRepo: GuidelineRepository) {}

  /**
   * Get guideline templates appropriate for the detected tech stack
   */
  getGuidelinesForTechStack(techStack: TechStackInfo): GuidelineTemplate[] {
    // Collect all tech stack names
    const names: string[] = [
      ...techStack.languages.map((l) => l.name),
      ...techStack.frameworks.map((f) => f.name),
      ...techStack.runtimes.map((r) => r.name),
      ...techStack.tools.map((t) => t.name),
    ];

    return getGuidelinesForTechStackNames(names);
  }

  /**
   * Seed guidelines into the project
   *
   * @param projectId Target project ID
   * @param guidelines Guidelines to seed
   * @param agentId Agent performing the seeding
   * @returns Result with created, skipped, and error counts
   */
  async seedGuidelines(
    projectId: string,
    guidelines: GuidelineTemplate[],
    agentId: string
  ): Promise<SeededResult> {
    const result: SeededResult = {
      created: [],
      skipped: [],
      errors: [],
    };

    if (guidelines.length === 0) {
      return result;
    }

    // Check which guidelines already exist
    const toCreate: GuidelineTemplate[] = [];

    for (const guideline of guidelines) {
      try {
        const existing = await this.guidelineRepo.findByName(guideline.name, 'project', projectId);

        if (existing) {
          result.skipped.push({
            name: guideline.name,
            reason: 'guideline with this name already exists',
          });
        } else {
          toCreate.push(guideline);
        }
      } catch (error) {
        result.errors.push({
          name: guideline.name,
          error: `Failed to check existence: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Bulk create new guidelines
    if (toCreate.length > 0) {
      try {
        const entries = toCreate.map((g) => ({
          name: g.name,
          content: g.content,
          category: g.category,
          priority: g.priority,
          rationale: g.rationale,
          examples: g.examples,
          scopeType: 'project' as ScopeType,
          scopeId: projectId,
          createdBy: agentId,
        }));

        await this.guidelineRepo.bulkCreate(entries);

        // Add to created list
        result.created = toCreate;
      } catch (error) {
        // If bulk create fails, add all to errors
        for (const g of toCreate) {
          result.errors.push({
            name: g.name,
            error: `Bulk create failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }

    return result;
  }
}

/**
 * Create a guideline seeder service instance
 */
export function createGuidelineSeederService(
  guidelineRepo: GuidelineRepository
): IGuidelineSeederService {
  return new GuidelineSeederService(guidelineRepo);
}

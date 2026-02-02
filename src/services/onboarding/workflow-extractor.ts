/**
 * Workflow Extractor Service
 *
 * Extracts actionable workflow knowledge from CONTRIBUTING.md:
 * - Branch Strategy
 * - Pull Request Process
 * - Commit Conventions
 */

import { existsSync, readFileSync } from 'node:fs';
import type { DeepScanFinding, IWorkflowExtractorService } from './types.js';

interface WorkflowSection {
  title: string;
  content: string;
  confidence: number;
}

export class WorkflowExtractorService implements IWorkflowExtractorService {
  async extractWorkflows(contributingPath: string): Promise<DeepScanFinding[]> {
    if (!existsSync(contributingPath)) {
      return [];
    }

    try {
      const content = readFileSync(contributingPath, 'utf-8');
      if (!content || content.trim().length === 0) {
        return [];
      }

      const sections = this.parseSections(content);
      return sections.map((section) => this.toDeepScanFinding(section));
    } catch {
      return [];
    }
  }

  private parseSections(content: string): WorkflowSection[] {
    const sections: WorkflowSection[] = [];

    const branchStrategy = this.extractBranchStrategy(content);
    if (branchStrategy) {
      sections.push(branchStrategy);
    }

    const prProcess = this.extractPRProcess(content);
    if (prProcess) {
      sections.push(prProcess);
    }

    const commitMessages = this.extractCommitMessages(content);
    if (commitMessages) {
      sections.push(commitMessages);
    }

    return sections;
  }

  private extractBranchStrategy(content: string): WorkflowSection | null {
    const branchStrategyMatch = content.match(
      /##\s+Branch\s+Strategy\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i
    );

    if (!branchStrategyMatch?.[1]) {
      return null;
    }

    const sectionContent = branchStrategyMatch[1].trim();
    const summary = this.summarizeBranchStrategy(sectionContent);

    return {
      title: 'Branch Strategy',
      content: summary,
      confidence: 0.9,
    };
  }

  private summarizeBranchStrategy(content: string): string {
    const lines: string[] = [];

    const mainBranch = content.match(/\*\*main\*\*:\s*([^\n]+)/i);
    if (mainBranch?.[1]) {
      lines.push(`main: ${mainBranch[1].trim()}`);
    }

    const developBranch = content.match(/\*\*develop\*\*:\s*([^\n]+)/i);
    if (developBranch?.[1]) {
      lines.push(`develop: ${developBranch[1].trim()}`);
    }

    const featureBranch = content.match(/\*\*feature\/\*\*:\s*([^\n]+)/i);
    if (featureBranch?.[1]) {
      lines.push(`feature/*: ${featureBranch[1].trim()}`);
    }

    const bugfixBranch = content.match(/\*\*bugfix\/\*\*:\s*([^\n]+)/i);
    if (bugfixBranch?.[1]) {
      lines.push(`bugfix/*: ${bugfixBranch[1].trim()}`);
    }

    const hotfixBranch = content.match(/\*\*hotfix\/\*\*:\s*([^\n]+)/i);
    if (hotfixBranch?.[1]) {
      lines.push(`hotfix/*: ${hotfixBranch[1].trim()}`);
    }

    const namingSection = content.match(/###\s+Branch\s+Naming\s*\n([\s\S]*?)(?=\n##|\n###|$)/i);
    if (namingSection?.[1]) {
      const examples = namingSection[1].match(/`([^`]+)`/g);
      if (examples && examples.length > 0) {
        lines.push('');
        lines.push('Naming conventions:');
        examples.slice(0, 3).forEach((example) => {
          lines.push(`  ${example.replace(/`/g, '')}`);
        });
      }
    }

    return lines.length > 0 ? lines.join('\n') : content.slice(0, 500);
  }

  private extractPRProcess(content: string): WorkflowSection | null {
    const prProcessMatch = content.match(
      /##\s+Pull\s+Request\s+Process\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i
    );

    if (!prProcessMatch?.[1]) {
      return null;
    }

    const sectionContent = prProcessMatch[1].trim();
    const summary = this.summarizePRProcess(sectionContent);

    return {
      title: 'Pull Request Process',
      content: summary,
      confidence: 0.9,
    };
  }

  private summarizePRProcess(content: string): string {
    const steps: string[] = [];

    const numberedSteps = content.match(/^\d+\.\s+(.+)$/gm);
    if (numberedSteps && numberedSteps.length > 0) {
      steps.push('PR Workflow:');
      numberedSteps.forEach((step) => {
        const cleanStep = step.replace(/^\d+\.\s+/, '').trim();
        steps.push(`  ${cleanStep}`);
      });
    }

    const prTitleFormat = content.match(
      /###\s+PR\s+Title\s+Format\s*\n([\s\S]*?)(?=\n##|\n###|$)/i
    );
    if (prTitleFormat?.[1]) {
      const formatExample = prTitleFormat[1].match(/\[type\]:\s*([^\n]+)/i);
      if (formatExample?.[0]) {
        steps.push('');
        steps.push(`PR Title Format: ${formatExample[0].trim()}`);
      }

      const types = prTitleFormat[1].match(/Types:\s*([^\n]+)/i);
      if (types?.[0]) {
        steps.push(`  ${types[0].trim()}`);
      }
    }

    return steps.length > 0 ? steps.join('\n') : content.slice(0, 500);
  }

  private extractCommitMessages(content: string): WorkflowSection | null {
    const commitMessagesMatch = content.match(
      /##\s+Commit\s+Messages?\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i
    );

    if (!commitMessagesMatch?.[1]) {
      return null;
    }

    const sectionContent = commitMessagesMatch[1].trim();
    const summary = this.summarizeCommitMessages(sectionContent);

    return {
      title: 'Commit Message Conventions',
      content: summary,
      confidence: 0.85,
    };
  }

  private summarizeCommitMessages(content: string): string {
    const lines: string[] = [];

    if (content.toLowerCase().includes('conventional commits')) {
      lines.push('Follow conventional commits format');
    }

    const formatMatch = content.match(/```\s*\n(type\(scope\):\s+subject[\s\S]*?)\n```/i);
    if (formatMatch?.[1]) {
      lines.push('');
      lines.push('Format:');
      const formatLines = formatMatch[1].trim().split('\n');
      formatLines.forEach((line) => {
        if (line.trim()) {
          lines.push(`  ${line.trim()}`);
        }
      });
    }

    const exampleMatch = content.match(/Example:\s*\n```\s*\n([\s\S]*?)\n```/i);
    if (exampleMatch?.[1]) {
      const exampleLines = exampleMatch[1].trim().split('\n');
      const firstLine = exampleLines[0];
      if (firstLine) {
        lines.push('');
        lines.push(`Example: ${firstLine.trim()}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : content.slice(0, 500);
  }

  private toDeepScanFinding(section: WorkflowSection): DeepScanFinding {
    return {
      area: 'documentation',
      title: section.title,
      content: section.content,
      category: 'reference',
      confidence: section.confidence,
      source: 'CONTRIBUTING.md',
    };
  }
}

export function createWorkflowExtractorService(): IWorkflowExtractorService {
  return new WorkflowExtractorService();
}

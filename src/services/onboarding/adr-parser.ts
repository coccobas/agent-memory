import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DeepScanFinding, IAdrParserService } from './types.js';

const ACCEPTED_STATUSES = ['accepted'];

export class AdrParserService implements IAdrParserService {
  async parseAdr(adrPath: string): Promise<DeepScanFinding[]> {
    if (!existsSync(adrPath)) {
      return [];
    }

    try {
      const content = readFileSync(adrPath, 'utf-8');
      const title = this.extractTitle(content);
      const status = this.extractStatus(content);

      if (!title || !status || !this.isAcceptedStatus(status)) {
        return [];
      }

      const decision = this.extractDecision(content);
      const rationale = this.extractRationale(content);

      if (!decision) {
        return [];
      }

      const formattedContent = this.formatContent(decision, rationale);

      return [
        {
          area: 'documentation',
          title,
          content: formattedContent,
          category: 'decision',
          confidence: 0.9,
          source: basename(adrPath),
        },
      ];
    } catch {
      return [];
    }
  }

  async parseAdrDirectory(adrDir: string): Promise<DeepScanFinding[]> {
    if (!existsSync(adrDir)) {
      return [];
    }

    try {
      const files = readdirSync(adrDir);
      const adrFiles = files.filter((file) => {
        const fullPath = join(adrDir, file);
        return file.endsWith('.md') && statSync(fullPath).isFile();
      });

      const allFindings: DeepScanFinding[] = [];

      for (const file of adrFiles) {
        const fullPath = join(adrDir, file);
        const findings = await this.parseAdr(fullPath);
        allFindings.push(...findings);
      }

      return allFindings;
    } catch {
      return [];
    }
  }

  private extractTitle(content: string): string | null {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch?.[1]?.trim() ?? null;
  }

  private extractStatus(content: string): string | null {
    const statusMatch = content.match(/##\s+Status\s*\n+(.+?)(?=\n\n|##|$)/s);
    if (!statusMatch?.[1]) return null;

    const statusLine = statusMatch[1].trim().split('\n')[0];
    return statusLine?.toLowerCase() ?? null;
  }

  private isAcceptedStatus(status: string): boolean {
    return ACCEPTED_STATUSES.includes(status.toLowerCase());
  }

  private extractDecision(content: string): string | null {
    const decisionMatch = content.match(/##\s+Decision\s*\n+(.+?)(?=\n##|$)/s);
    return decisionMatch?.[1]?.trim() ?? null;
  }

  private extractRationale(content: string): string | null {
    const contextMatch = content.match(/##\s+Context\s*\n+(.+?)(?=\n\n|##|$)/s);
    if (!contextMatch?.[1]) return null;

    const firstParagraph = contextMatch[1].trim().split('\n\n')[0];
    return firstParagraph?.trim() ?? null;
  }

  private formatContent(decision: string, rationale: string | null): string {
    let formatted = `Decision: ${decision}`;

    if (rationale) {
      formatted += `\n\nRationale: ${rationale}`;
    }

    return formatted;
  }
}

export function createAdrParserService(): IAdrParserService {
  return new AdrParserService();
}

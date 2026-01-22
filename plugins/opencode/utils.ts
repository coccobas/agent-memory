export interface ErrorContext {
  tool: string;
  message: string;
  timestamp: number;
  eventId?: string;
}

export const MAX_ERROR_HISTORY = 5;
export const ERROR_RECOVERY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function getToolInput(input: unknown, output: unknown): unknown {
  const i = input as Record<string, unknown>;
  const o = output as Record<string, unknown>;
  return o?.args ?? i?.args ?? i?.input ?? i?.toolInput ?? i?.tool_input ?? undefined;
}

export function getToolResponse(output: unknown): unknown {
  const o = output as Record<string, unknown>;
  return o?.result ?? o?.output ?? o?.data ?? output;
}

export function formatCommandResponse(command: string, response: string): string {
  return `\`${command}\`\n\n\`\`\`\n${response}\n\`\`\``;
}

export function isTaskCompletion(text: string): boolean {
  const completionPatterns = [
    /\b(thanks|thank you|that'?s? (it|all|perfect|great)|done|works?( now)?|fixed|solved)\b/i,
    /\b(looks? good|awesome|excellent|perfect)\b/i,
    /^(ok|okay|great|nice|cool)\.?$/i,
  ];
  return completionPatterns.some((p) => p.test(text.trim()));
}

export function isMemoryTrigger(text: string): boolean {
  const triggerPatterns = [
    /\b(always|never|must|should)\s+(use|do|have|be|avoid)\b/i,
    /\b(we decided|we chose|the standard is)\b/i,
    /\b(remember that|note that)\b/i,
    /\bimportant:/i,
  ];
  return triggerPatterns.some((p) => p.test(text));
}

export function parseAmCommand(text: string): { command: string; args: string } | null {
  if (!text.toLowerCase().startsWith('!am')) return null;
  const parts = text.trim().split(/\s+/);
  const command = parts[1]?.toLowerCase() || 'help';
  const args = parts.slice(2).join(' ');
  return { command, args };
}

export class ErrorTracker {
  private errors: ErrorContext[] = [];
  private maxHistory: number;
  private recoveryWindowMs: number;

  constructor(maxHistory = MAX_ERROR_HISTORY, recoveryWindowMs = ERROR_RECOVERY_WINDOW_MS) {
    this.maxHistory = maxHistory;
    this.recoveryWindowMs = recoveryWindowMs;
  }

  track(tool: string, message: string, eventId?: string): void {
    this.errors.push({ tool, message, timestamp: Date.now(), eventId });
    if (this.errors.length > this.maxHistory) {
      this.errors.shift();
    }
  }

  checkRecovery(tool: string): ErrorContext | undefined {
    const now = Date.now();
    const recentError = this.errors.find(
      (e) => e.tool === tool && now - e.timestamp < this.recoveryWindowMs
    );
    if (recentError) {
      const idx = this.errors.indexOf(recentError);
      if (idx > -1) this.errors.splice(idx, 1);
    }
    return recentError;
  }

  clear(): void {
    this.errors = [];
  }

  get count(): number {
    return this.errors.length;
  }
}

export interface ExtractionSuggestion {
  hash: string;
  type: string;
  title: string;
  content: string;
}

export class SuggestionManager {
  private suggestions: ExtractionSuggestion[] = [];

  add(suggestions: ExtractionSuggestion[]): void {
    this.suggestions = [...suggestions];
  }

  findByHash(hashPrefix: string): ExtractionSuggestion | undefined {
    return this.suggestions.find((s) => s.hash.startsWith(hashPrefix));
  }

  findByIndex(index: number): ExtractionSuggestion | undefined {
    return this.suggestions[index - 1];
  }

  findByTarget(target: string): ExtractionSuggestion | undefined {
    const num = parseInt(target, 10);
    if (!isNaN(num) && num > 0 && num <= this.suggestions.length) {
      return this.findByIndex(num);
    }
    return this.findByHash(target);
  }

  remove(hash: string): ExtractionSuggestion | undefined {
    const idx = this.suggestions.findIndex((s) => s.hash === hash);
    if (idx === -1) return undefined;
    return this.suggestions.splice(idx, 1)[0];
  }

  removeByIndices(indices: number[]): ExtractionSuggestion[] {
    const sorted = Array.from(new Set(indices)).sort((a, b) => b - a);
    const removed: ExtractionSuggestion[] = [];
    for (const idx of sorted) {
      if (idx > 0 && idx <= this.suggestions.length) {
        const item = this.suggestions.splice(idx - 1, 1)[0];
        if (item) removed.unshift(item);
      }
    }
    return removed;
  }

  getAll(): ExtractionSuggestion[] {
    return [...this.suggestions];
  }

  clear(): number {
    const count = this.suggestions.length;
    this.suggestions = [];
    return count;
  }

  get count(): number {
    return this.suggestions.length;
  }
}

export function parseSelectionTarget(
  target: string,
  maxIndex: number
):
  | { type: 'all' }
  | { type: 'indices'; indices: number[] }
  | { type: 'hash'; hash: string }
  | { type: 'invalid'; reason: string } {
  const t = target.trim().toLowerCase();

  if (t === 'all') {
    return { type: 'all' };
  }

  if (/^[\d,\-\s]+$/.test(t)) {
    const indices: number[] = [];
    const parts = t
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const start = parseInt(startStr ?? '', 10);
        const end = parseInt(endStr ?? '', 10);

        if (isNaN(start) || isNaN(end)) {
          return { type: 'invalid', reason: `Invalid range: ${part}` };
        }
        if (start > end) {
          return { type: 'invalid', reason: `Invalid range (start > end): ${part}` };
        }
        if (start < 1 || end > maxIndex) {
          return { type: 'invalid', reason: `Range out of bounds (1-${maxIndex}): ${part}` };
        }

        for (let i = start; i <= end; i++) {
          indices.push(i);
        }
      } else {
        const num = parseInt(part, 10);
        if (isNaN(num)) {
          return { type: 'invalid', reason: `Invalid number: ${part}` };
        }
        if (num < 1 || num > maxIndex) {
          return { type: 'invalid', reason: `Index out of bounds (1-${maxIndex}): ${num}` };
        }
        indices.push(num);
      }
    }

    const unique = Array.from(new Set(indices)).sort((a, b) => a - b);
    return { type: 'indices', indices: unique };
  }

  return { type: 'hash', hash: t };
}

export function formatSuggestionsList(
  suggestions: ExtractionSuggestion[],
  options: { showContent?: boolean; maxContentLength?: number } = {}
): string {
  const { showContent = false, maxContentLength = 60 } = options;

  if (suggestions.length === 0) {
    return 'No pending suggestions.';
  }

  const lines: string[] = [];
  lines.push(`📋 ${suggestions.length} suggestion(s):\n`);

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    if (!s) continue;
    const typeIcon = s.type === 'guideline' ? '📏' : s.type === 'knowledge' ? '💡' : '🔧';
    lines.push(`  ${i + 1}. ${typeIcon} [${s.type}] ${s.title}`);

    if (showContent && s.content) {
      const truncated =
        s.content.length > maxContentLength
          ? s.content.slice(0, maxContentLength) + '...'
          : s.content;
      lines.push(`     ${truncated}`);
    }
  }

  lines.push('');
  lines.push('Actions:');
  lines.push('  !am approve <n>     Approve item #n');
  lines.push('  !am approve 1-3     Approve items 1 through 3');
  lines.push('  !am approve 1,3,5   Approve items 1, 3, and 5');
  lines.push('  !am approve all     Approve all');
  lines.push('  !am reject <n|all>  Reject item(s)');

  return lines.join('\n');
}

export interface ReviewCandidate {
  shortId?: string;
  id?: string;
  type?: string;
  name?: string;
  content?: string;
}

export function formatReviewList(
  candidates: ReviewCandidate[],
  options: { showContent?: boolean; maxContentLength?: number } = {}
): string {
  const { showContent = false, maxContentLength = 60 } = options;

  if (candidates.length === 0) {
    return 'No pending review candidates.';
  }

  const lines: string[] = [];
  lines.push(`📋 ${candidates.length} candidate(s) for review:\n`);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) continue;
    const typeIcon = c.type === 'guideline' ? '📏' : c.type === 'knowledge' ? '💡' : '🔧';
    const idDisplay = c.shortId ?? c.id?.slice(0, 8) ?? '???';
    lines.push(`  ${i + 1}. ${typeIcon} [${c.type}] ${c.name} (${idDisplay})`);

    if (showContent && c.content) {
      const truncated =
        c.content.length > maxContentLength
          ? c.content.slice(0, maxContentLength) + '...'
          : c.content;
      lines.push(`     ${truncated}`);
    }
  }

  lines.push('');
  lines.push('Actions:');
  lines.push('  !am review show <n>    Show full content');
  lines.push('  !am review approve <n> Approve (promote to project)');
  lines.push('  !am review reject <n>  Reject (deactivate)');
  lines.push('  !am review skip <n>    Skip (leave for later)');

  return lines.join('\n');
}

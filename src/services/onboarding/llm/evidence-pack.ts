import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, basename, relative, extname } from 'node:path';

export interface CodeSnippet {
  path: string;
  relativePath: string;
  purpose: string;
  content: string;
  truncated: boolean;
}

export interface DocSnippet {
  path: string;
  filename: string;
  type: 'readme' | 'architecture' | 'contributing' | 'other';
  content: string;
  truncated: boolean;
}

export interface AdrSnippet {
  path: string;
  filename: string;
  title: string;
  content: string;
  truncated: boolean;
}

export interface EvidencePack {
  code: CodeSnippet[];
  docs: DocSnippet[];
  adrs: AdrSnippet[];
}

const MAX_SNIPPET_BYTES = 3000;
const MAX_CODE_FILES = 8;
const MAX_DOC_FILES = 4;
const MAX_ADR_FILES = 5;

export function buildEvidencePack(
  cwd: string,
  detectedPatterns: string[],
  maxBytesPerSnippet = MAX_SNIPPET_BYTES
): EvidencePack {
  return {
    code: selectCodeSnippets(cwd, detectedPatterns, maxBytesPerSnippet),
    docs: selectDocSnippets(cwd, maxBytesPerSnippet),
    adrs: selectAdrSnippets(cwd, maxBytesPerSnippet),
  };
}

function selectCodeSnippets(
  cwd: string,
  detectedPatterns: string[],
  maxBytes: number
): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];
  const srcDir = join(cwd, 'src');

  if (!existsSync(srcDir)) return snippets;

  const entryFile = findFirstExisting(cwd, ['src/index.ts', 'src/main.ts', 'index.ts']);
  if (entryFile) {
    snippets.push(readCodeSnippet(cwd, entryFile, 'entrypoint', maxBytes));
  }

  const wiringFiles = [
    'src/core/context.ts',
    'src/core/factory.ts',
    'src/app.ts',
    'src/container.ts',
    'src/di.ts',
  ];
  const wiringFile = findFirstExisting(cwd, wiringFiles);
  if (wiringFile) {
    snippets.push(readCodeSnippet(cwd, wiringFile, 'dependency-wiring', maxBytes));
  }

  const patternExamples = selectPatternExamples(cwd, detectedPatterns, maxBytes);
  snippets.push(...patternExamples);

  const configFiles = ['src/config/index.ts', 'src/config.ts'];
  const configFile = findFirstExisting(cwd, configFiles);
  if (configFile && snippets.length < MAX_CODE_FILES) {
    snippets.push(readCodeSnippet(cwd, configFile, 'configuration', maxBytes));
  }

  return snippets.slice(0, MAX_CODE_FILES);
}

function selectPatternExamples(cwd: string, patterns: string[], maxBytes: number): CodeSnippet[] {
  const examples: CodeSnippet[] = [];
  const srcDir = join(cwd, 'src');

  const patternDirs: Record<string, string[]> = {
    'Repository Pattern': ['db/repositories', 'repositories'],
    'Handler Pattern': ['mcp/handlers', 'handlers', 'api/handlers'],
    'Service Layer': ['services'],
    'Factory Pattern': ['core/factory', 'factories'],
    'Adapter Pattern': ['adapters'],
  };

  for (const pattern of patterns) {
    if (examples.length >= 4) break;

    const dirs = patternDirs[pattern];
    if (!dirs) continue;

    for (const dir of dirs) {
      const fullDir = join(srcDir, dir);
      if (!existsSync(fullDir)) continue;

      const files = findTsFiles(fullDir, 1);
      const exampleFile = files.find(
        (f) => !f.includes('index.') && !f.includes('.test.') && !f.includes('.spec.')
      );

      if (exampleFile) {
        const purpose = `${pattern.toLowerCase().replace(' pattern', '').replace(' layer', '')} implementation`;
        examples.push(readCodeSnippet(cwd, exampleFile, purpose, maxBytes));
        break;
      }
    }
  }

  return examples;
}

function selectDocSnippets(cwd: string, maxBytes: number): DocSnippet[] {
  const snippets: DocSnippet[] = [];

  const readmePath = join(cwd, 'README.md');
  if (existsSync(readmePath)) {
    snippets.push(readDocSnippet(readmePath, 'readme', maxBytes));
  }

  const archDocs = [
    'ARCHITECTURE.md',
    'docs/ARCHITECTURE.md',
    'docs/architecture.md',
    'docs/index.md',
    'docs/overview.md',
  ];

  for (const doc of archDocs) {
    if (snippets.length >= MAX_DOC_FILES) break;
    const docPath = join(cwd, doc);
    if (existsSync(docPath)) {
      snippets.push(readDocSnippet(docPath, 'architecture', maxBytes));
    }
  }

  const contributingPath = join(cwd, 'CONTRIBUTING.md');
  if (existsSync(contributingPath) && snippets.length < MAX_DOC_FILES) {
    snippets.push(readDocSnippet(contributingPath, 'contributing', maxBytes));
  }

  return snippets;
}

function selectAdrSnippets(cwd: string, maxBytes: number): AdrSnippet[] {
  const snippets: AdrSnippet[] = [];

  const adrDirs = ['docs/adr', 'docs/decisions', 'adr', 'decisions'];

  for (const dir of adrDirs) {
    const adrDir = join(cwd, dir);
    if (!existsSync(adrDir)) continue;

    const adrFiles = readdirSync(adrDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .slice(0, MAX_ADR_FILES);

    for (const file of adrFiles) {
      const adrPath = join(adrDir, file);
      snippets.push(readAdrSnippet(adrPath, maxBytes));
    }

    break;
  }

  return snippets;
}

function readCodeSnippet(
  cwd: string,
  filePath: string,
  purpose: string,
  maxBytes: number
): CodeSnippet {
  const content = safeReadFile(filePath, maxBytes);
  return {
    path: filePath,
    relativePath: relative(cwd, filePath),
    purpose,
    content: content.text,
    truncated: content.truncated,
  };
}

function readDocSnippet(filePath: string, type: DocSnippet['type'], maxBytes: number): DocSnippet {
  const content = safeReadFile(filePath, maxBytes);
  return {
    path: filePath,
    filename: basename(filePath),
    type,
    content: content.text,
    truncated: content.truncated,
  };
}

function readAdrSnippet(filePath: string, maxBytes: number): AdrSnippet {
  const content = safeReadFile(filePath, maxBytes);
  const title = extractAdrTitle(content.text, basename(filePath));

  return {
    path: filePath,
    filename: basename(filePath),
    title,
    content: content.text,
    truncated: content.truncated,
  };
}

function extractAdrTitle(content: string, filename: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  return filename.replace(/\.md$/, '').replace(/^\d+-/, '');
}

function safeReadFile(filePath: string, maxBytes: number): { text: string; truncated: boolean } {
  try {
    const stats = statSync(filePath);
    const truncated = stats.size > maxBytes;

    const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
    const fd = openSync(filePath, 'r');
    readSync(fd, buffer, 0, buffer.length, 0);
    closeSync(fd);

    let text = buffer.toString('utf-8');

    if (truncated) {
      const lastNewline = text.lastIndexOf('\n');
      if (lastNewline > maxBytes * 0.8) {
        text = text.substring(0, lastNewline);
      }
      text += '\n\n[... truncated ...]';
    }

    return { text, truncated };
  } catch {
    return { text: '', truncated: false };
  }
}

function findFirstExisting(cwd: string, relativePaths: string[]): string | null {
  for (const rel of relativePaths) {
    const full = join(cwd, rel);
    if (existsSync(full)) return full;
  }
  return null;
}

function findTsFiles(dir: string, maxDepth: number): string[] {
  const files: string[] = [];

  function scan(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;

        const fullPath = join(currentDir, entry);
        const stats = statSync(fullPath);

        if (stats.isFile() && extname(entry) === '.ts') {
          files.push(fullPath);
        } else if (stats.isDirectory()) {
          scan(fullPath, depth + 1);
        }
      }
    } catch {
      /* empty */
    }
  }

  scan(dir, 0);
  return files;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatEvidencePackStats(pack: EvidencePack): string {
  const codeBytes = pack.code.reduce((sum, s) => sum + s.content.length, 0);
  const docBytes = pack.docs.reduce((sum, s) => sum + s.content.length, 0);
  const adrBytes = pack.adrs.reduce((sum, s) => sum + s.content.length, 0);

  return [
    `Code: ${pack.code.length} files (${Math.round(codeBytes / 1024)}KB)`,
    `Docs: ${pack.docs.length} files (${Math.round(docBytes / 1024)}KB)`,
    `ADRs: ${pack.adrs.length} files (${Math.round(adrBytes / 1024)}KB)`,
  ].join(', ');
}

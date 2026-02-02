/**
 * Deep Scanner Service
 *
 * Performs exhaustive codebase analysis by exploring:
 * - Architecture patterns (entry points, modules, design patterns)
 * - Database/storage layer (schema, ORM, repositories)
 * - API surface (endpoints, handlers, tools)
 * - Testing patterns (framework, fixtures, coverage)
 * - Documentation (all markdown files, ADRs, inline docs)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import type {
  DeepScanArea,
  DeepScanFinding,
  DeepScanResult,
  DeepScanOptions,
  LlmCallFunction,
} from './types.js';
import { ScriptExtractorService } from './script-extractor.js';
import { AdrParserService } from './adr-parser.js';
import { WorkflowExtractorService } from './workflow-extractor.js';
import { LlmExtractorService, type LlmCallFn } from './llm-extractor.js';
import type { CodebaseContext } from '../extraction/prompts.js';

interface LlmOptions {
  useLlm: boolean;
  llmCallFn?: LlmCallFunction;
}

const DEFAULT_OPTIONS: DeepScanOptions = {
  areas: ['architecture', 'database', 'api', 'testing', 'documentation'],
  maxFindings: 10,
  timeout: 120000,
  useLlm: false,
  llmCallFn: undefined,
};

interface FileInfo {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface IDeepScannerService {
  scan(cwd: string, options?: DeepScanOptions): Promise<DeepScanResult>;
}

export class DeepScannerService implements IDeepScannerService {
  private scriptExtractor = new ScriptExtractorService();
  private adrParser = new AdrParserService();
  private workflowExtractor = new WorkflowExtractorService();
  private seenFindings = new Set<string>();

  async scan(cwd: string, options?: DeepScanOptions): Promise<DeepScanResult> {
    this.seenFindings.clear();
    const opts = {
      areas: options?.areas ?? DEFAULT_OPTIONS.areas!,
      maxFindings: options?.maxFindings ?? DEFAULT_OPTIONS.maxFindings!,
      timeout: options?.timeout ?? DEFAULT_OPTIONS.timeout!,
      useLlm: options?.useLlm ?? false,
      llmCallFn: options?.llmCallFn,
    };
    const startTime = Date.now();
    const findings: DeepScanFinding[] = [];
    const errors: string[] = [];
    const areasScanned: DeepScanArea[] = [];

    for (const area of opts.areas) {
      try {
        areasScanned.push(area);
        const areaFindings = await this.scanArea(cwd, area, opts.maxFindings, opts);
        findings.push(...areaFindings);
      } catch (error) {
        errors.push(`${area}: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (Date.now() - startTime > opts.timeout) {
        errors.push('Scan timeout reached');
        break;
      }
    }

    return {
      success: errors.length === 0,
      findings,
      areasScanned,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  private async scanArea(
    cwd: string,
    area: DeepScanArea,
    maxFindings: number,
    llmOpts: LlmOptions
  ): Promise<DeepScanFinding[]> {
    switch (area) {
      case 'architecture':
        return this.scanArchitecture(cwd, maxFindings, llmOpts);
      case 'database':
        return this.scanDatabase(cwd, maxFindings);
      case 'api':
        return this.scanApi(cwd, maxFindings);
      case 'testing':
        return this.scanTesting(cwd, maxFindings);
      case 'documentation':
        return this.scanDocumentation(cwd, maxFindings);
      default:
        return [];
    }
  }

  private async scanArchitecture(
    cwd: string,
    maxFindings: number,
    llmOpts: LlmOptions
  ): Promise<DeepScanFinding[]> {
    const findings: DeepScanFinding[] = [];

    const entryPoints = this.findFiles(cwd, [
      'src/index.ts',
      'src/main.ts',
      'src/cli.ts',
      'index.ts',
      'main.ts',
    ]);
    const firstEntry = entryPoints[0];
    if (firstEntry) {
      findings.push({
        area: 'architecture',
        title: 'Entry Points',
        content: `Found ${entryPoints.length} entry point(s): ${entryPoints.map((f) => relative(cwd, f.path)).join(', ')}`,
        category: 'fact',
        confidence: 0.9,
        source: firstEntry.path,
      });
    }

    const srcDir = join(cwd, 'src');
    if (existsSync(srcDir)) {
      const topLevelDirs = this.getDirectories(srcDir);
      if (topLevelDirs.length > 0) {
        findings.push({
          area: 'architecture',
          title: 'Module Structure',
          content: `Source organized into ${topLevelDirs.length} modules: ${topLevelDirs.join(', ')}`,
          category: 'fact',
          confidence: 0.85,
          source: srcDir,
        });
      }
    }

    const coreDir = join(cwd, 'src/core');
    if (existsSync(coreDir)) {
      const coreFiles = this.getFilesRecursive(coreDir, ['.ts']);
      findings.push({
        area: 'architecture',
        title: 'Core Abstractions',
        content: `Core module contains ${coreFiles.length} files defining base abstractions`,
        category: 'fact',
        confidence: 0.8,
        source: coreDir,
      });
    }

    const moduleBoundaries = this.detectModuleBoundaries(cwd);
    if (moduleBoundaries) {
      findings.push({
        area: 'architecture',
        title: 'Module Boundaries',
        content: moduleBoundaries,
        category: 'decision',
        confidence: 0.85,
        source: srcDir,
      });
    }

    const patterns = this.detectDesignPatterns(cwd);
    if (patterns.length > 0) {
      findings.push({
        area: 'architecture',
        title: 'Design Patterns',
        content: `Detected patterns: ${patterns.join(', ')}`,
        category: 'decision',
        confidence: 0.75,
      });

      if (llmOpts.useLlm && llmOpts.llmCallFn) {
        const llmFindings = await this.extractWithLlm(cwd, patterns, llmOpts.llmCallFn);
        if (llmFindings.length > 0) {
          findings.push(...llmFindings);
        } else {
          const patternGuides = this.generatePatternGuides(patterns);
          findings.push(...patternGuides);
        }
      } else {
        const patternGuides = this.generatePatternGuides(patterns);
        findings.push(...patternGuides);
      }
    }

    const packageJsonPath = join(cwd, 'package.json');
    const scriptFindings = await this.scriptExtractor.extractScripts(packageJsonPath);
    findings.push(...scriptFindings);

    const templateDirs = this.findDirectories(cwd, ['templates', 'examples', 'boilerplate']);
    if (templateDirs.length > 0) {
      const dirNames = templateDirs.map((dir) => basename(dir)).join(', ');
      findings.push({
        area: 'architecture',
        title: 'Template Directories',
        content: `Template directories found: ${dirNames}. To add new patterns, copy from these template directories.`,
        category: 'reference',
        confidence: 0.9,
        source: templateDirs[0],
      });
    }

    const templateFiles = this.getFilesRecursive(cwd, []).filter((f) =>
      /\.(template|example)\./.test(f.name)
    );
    if (templateFiles.length > 0) {
      const fileNames = templateFiles
        .slice(0, 5)
        .map((f) => basename(f.path))
        .join(', ');
      const firstFile = templateFiles[0];
      if (firstFile) {
        findings.push({
          area: 'architecture',
          title: 'Template Files',
          content: `Template files found: ${fileNames}. Use these as reference implementations when adding new components.`,
          category: 'reference',
          confidence: 0.85,
          source: firstFile.path,
        });
      }
    }

    const namingConvention = this.detectNamingConventions(cwd);
    if (namingConvention) {
      findings.push(namingConvention);
    }

    const importPatterns = this.analyzeImportPatterns(cwd);
    if (importPatterns) {
      findings.push(importPatterns);
    }

    return this.deduplicateFindings(findings).slice(0, maxFindings);
  }

  private async extractWithLlm(
    cwd: string,
    detectedPatterns: string[],
    llmCallFn: LlmCallFunction
  ): Promise<DeepScanFinding[]> {
    try {
      const topPatterns = detectedPatterns.slice(0, 5);

      const srcDir = join(cwd, 'src');
      const modules = existsSync(srcDir) ? this.getDirectories(srcDir) : [];

      const namingConvention = this.detectNamingConventions(cwd);
      const conventions = namingConvention ? [namingConvention.content] : [];

      const context: CodebaseContext = {
        modules,
        patterns: topPatterns,
        conventions,
      };

      const extractor = new LlmExtractorService({
        llmCall: llmCallFn as unknown as LlmCallFn,
        maxTokens: 2000,
      });
      const result = await extractor.extractContributionPatterns(context);

      if (result.success) {
        return result.findings;
      }

      return [];
    } catch {
      return [];
    }
  }

  private async scanDatabase(cwd: string, maxFindings: number): Promise<DeepScanFinding[]> {
    const findings: DeepScanFinding[] = [];

    // Detect ORM/database from config files
    const drizzleConfig = this.findFiles(cwd, ['drizzle.config.ts', 'drizzle.config.js']);
    const prismaSchema = this.findFiles(cwd, ['prisma/schema.prisma']);
    const typeormConfig = this.findFiles(cwd, ['ormconfig.ts', 'ormconfig.js', 'ormconfig.json']);

    const drizzleFirst = drizzleConfig[0];
    const prismaFirst = prismaSchema[0];
    const typeormFirst = typeormConfig[0];

    if (drizzleFirst) {
      findings.push({
        area: 'database',
        title: 'ORM: Drizzle',
        content: 'Project uses Drizzle ORM for database access',
        category: 'fact',
        confidence: 0.95,
        source: drizzleFirst.path,
      });
    } else if (prismaFirst) {
      findings.push({
        area: 'database',
        title: 'ORM: Prisma',
        content: 'Project uses Prisma ORM for database access',
        category: 'fact',
        confidence: 0.95,
        source: prismaFirst.path,
      });
    } else if (typeormFirst) {
      findings.push({
        area: 'database',
        title: 'ORM: TypeORM',
        content: 'Project uses TypeORM for database access',
        category: 'fact',
        confidence: 0.95,
        source: typeormFirst.path,
      });
    }

    // Find schema files
    const schemaDir = join(cwd, 'src/db/schema');
    if (existsSync(schemaDir)) {
      const schemaFiles = this.getFilesRecursive(schemaDir, ['.ts']);
      findings.push({
        area: 'database',
        title: 'Schema Structure',
        content: `Found ${schemaFiles.length} schema files in src/db/schema/`,
        category: 'fact',
        confidence: 0.9,
        source: schemaDir,
      });
    }

    // Find repositories
    const repoDir = join(cwd, 'src/db/repositories');
    if (existsSync(repoDir)) {
      const repoFiles = this.getFilesRecursive(repoDir, ['.ts']);
      findings.push({
        area: 'database',
        title: 'Repository Pattern',
        content: `Found ${repoFiles.length} repository files implementing data access layer`,
        category: 'fact',
        confidence: 0.9,
        source: repoDir,
      });
    }

    // Find migrations
    const migrationsDir = this.findDirectories(cwd, ['migrations', 'drizzle', 'prisma/migrations']);
    const migrationsFirst = migrationsDir[0];
    if (migrationsFirst) {
      findings.push({
        area: 'database',
        title: 'Migrations',
        content: `Database migrations found in ${relative(cwd, migrationsFirst)}`,
        category: 'fact',
        confidence: 0.85,
        source: migrationsFirst,
      });
    }

    return findings.slice(0, maxFindings);
  }

  private async scanApi(cwd: string, maxFindings: number): Promise<DeepScanFinding[]> {
    const findings: DeepScanFinding[] = [];

    // MCP descriptors
    const descriptorsDir = join(cwd, 'src/mcp/descriptors');
    if (existsSync(descriptorsDir)) {
      const descriptorFiles = this.getFilesRecursive(descriptorsDir, ['.ts']).filter(
        (f) => !f.name.includes('index') && !f.name.includes('types')
      );
      findings.push({
        area: 'api',
        title: 'MCP Tools',
        content: `Found ${descriptorFiles.length} MCP tool descriptors in src/mcp/descriptors/`,
        category: 'fact',
        confidence: 0.95,
        source: descriptorsDir,
      });
    }

    // MCP handlers
    const handlersDir = join(cwd, 'src/mcp/handlers');
    if (existsSync(handlersDir)) {
      const handlerFiles = this.getFilesRecursive(handlersDir, ['.ts']).filter(
        (f) => f.name.includes('handler') || f.name.includes('.handler.')
      );
      findings.push({
        area: 'api',
        title: 'MCP Handlers',
        content: `Found ${handlerFiles.length} MCP handler files`,
        category: 'fact',
        confidence: 0.9,
        source: handlersDir,
      });
    }

    // REST API routes
    const routesDir = join(cwd, 'src/restapi/routes');
    if (existsSync(routesDir)) {
      const routeFiles = this.getFilesRecursive(routesDir, ['.ts']);
      findings.push({
        area: 'api',
        title: 'REST API Routes',
        content: `Found ${routeFiles.length} REST API route files`,
        category: 'fact',
        confidence: 0.9,
        source: routesDir,
      });
    }

    // Services
    const servicesDir = join(cwd, 'src/services');
    if (existsSync(servicesDir)) {
      const serviceDirs = this.getDirectories(servicesDir);
      findings.push({
        area: 'api',
        title: 'Service Modules',
        content: `Found ${serviceDirs.length} service modules: ${serviceDirs.slice(0, 10).join(', ')}${serviceDirs.length > 10 ? '...' : ''}`,
        category: 'fact',
        confidence: 0.85,
        source: servicesDir,
      });
    }

    return findings.slice(0, maxFindings);
  }

  private async scanTesting(cwd: string, maxFindings: number): Promise<DeepScanFinding[]> {
    const findings: DeepScanFinding[] = [];

    // Detect test framework
    const vitestConfig = this.findFiles(cwd, ['vitest.config.ts', 'vitest.config.js']);
    const jestConfig = this.findFiles(cwd, [
      'jest.config.ts',
      'jest.config.js',
      'jest.config.json',
    ]);

    const vitestFirst = vitestConfig[0];
    const jestFirst = jestConfig[0];

    if (vitestFirst) {
      findings.push({
        area: 'testing',
        title: 'Test Framework: Vitest',
        content: 'Project uses Vitest for testing',
        category: 'fact',
        confidence: 0.95,
        source: vitestFirst.path,
      });
    } else if (jestFirst) {
      findings.push({
        area: 'testing',
        title: 'Test Framework: Jest',
        content: 'Project uses Jest for testing',
        category: 'fact',
        confidence: 0.95,
        source: jestFirst.path,
      });
    }

    // Find test directories
    const testDirs = ['tests', 'test', '__tests__', 'src/__tests__'];
    for (const dir of testDirs) {
      const testDir = join(cwd, dir);
      if (existsSync(testDir)) {
        const testFiles = this.getFilesRecursive(testDir, ['.ts', '.tsx', '.js', '.jsx']).filter(
          (f) => f.name.includes('.test.') || f.name.includes('.spec.')
        );

        const subdirs = this.getDirectories(testDir);
        findings.push({
          area: 'testing',
          title: 'Test Organization',
          content: `Found ${testFiles.length} test files in ${dir}/ organized into: ${subdirs.join(', ') || 'flat structure'}`,
          category: 'fact',
          confidence: 0.9,
          source: testDir,
        });
        break;
      }
    }

    // Find test fixtures/helpers
    const fixturesDir = join(cwd, 'tests/fixtures');
    if (existsSync(fixturesDir)) {
      const fixtureFiles = this.getFilesRecursive(fixturesDir, ['.ts']);
      findings.push({
        area: 'testing',
        title: 'Test Fixtures',
        content: `Found ${fixtureFiles.length} fixture/helper files in tests/fixtures/`,
        category: 'fact',
        confidence: 0.85,
        source: fixturesDir,
      });
    }

    return findings.slice(0, maxFindings);
  }

  private async scanDocumentation(cwd: string, maxFindings: number): Promise<DeepScanFinding[]> {
    const findings: DeepScanFinding[] = [];

    // Find all markdown files
    const allMdFiles = this.getFilesRecursive(cwd, ['.md']).filter(
      (f) => !f.path.includes('node_modules') && !f.path.includes('.git')
    );

    if (allMdFiles.length > 0) {
      findings.push({
        area: 'documentation',
        title: 'Documentation Files',
        content: `Found ${allMdFiles.length} markdown documentation files`,
        category: 'fact',
        confidence: 0.95,
      });
    }

    // Find ADRs
    const adrDir = join(cwd, 'docs/adr');
    if (existsSync(adrDir)) {
      const adrFiles = this.getFilesRecursive(adrDir, ['.md']);
      findings.push({
        area: 'documentation',
        title: 'Architecture Decision Records',
        content: `Found ${adrFiles.length} ADRs documenting design decisions`,
        category: 'fact',
        confidence: 0.95,
        source: adrDir,
      });
    }

    // Find docs structure
    const docsDir = join(cwd, 'docs');
    if (existsSync(docsDir)) {
      const docsDirs = this.getDirectories(docsDir);
      findings.push({
        area: 'documentation',
        title: 'Documentation Structure',
        content: `Documentation organized into: ${docsDirs.join(', ') || 'flat structure'}`,
        category: 'fact',
        confidence: 0.85,
        source: docsDir,
      });
    }

    // Find rules/guidelines
    const rulesDir = join(cwd, 'rules');
    if (existsSync(rulesDir)) {
      const ruleFiles = this.getFilesRecursive(rulesDir, ['.md']);
      findings.push({
        area: 'documentation',
        title: 'Rules/Guidelines',
        content: `Found ${ruleFiles.length} rule files for AI assistant guidance`,
        category: 'fact',
        confidence: 0.9,
        source: rulesDir,
      });
    }

    const adrFindings = await this.adrParser.parseAdrDirectory(adrDir);
    findings.push(...adrFindings);

    const contributingPath = join(cwd, 'CONTRIBUTING.md');
    const workflowFindings = await this.workflowExtractor.extractWorkflows(contributingPath);
    findings.push(...workflowFindings);

    return this.deduplicateFindings(findings).slice(0, maxFindings);
  }

  private findFiles(cwd: string, relativePaths: string[]): FileInfo[] {
    const found: FileInfo[] = [];
    for (const relativePath of relativePaths) {
      const fullPath = join(cwd, relativePath);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          if (stats.isFile()) {
            found.push({
              path: fullPath,
              name: basename(fullPath),
              size: stats.size,
              ext: extname(fullPath),
            });
          }
        } catch {
          // Skip inaccessible files
        }
      }
    }
    return found;
  }

  private findDirectories(cwd: string, relativePaths: string[]): string[] {
    const found: string[] = [];
    for (const relativePath of relativePaths) {
      const fullPath = join(cwd, relativePath);
      if (existsSync(fullPath)) {
        try {
          const stats = statSync(fullPath);
          if (stats.isDirectory()) {
            found.push(fullPath);
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    }
    return found;
  }

  private getDirectories(dir: string): string[] {
    try {
      return readdirSync(dir)
        .filter((name) => {
          try {
            return statSync(join(dir, name)).isDirectory();
          } catch {
            return false;
          }
        })
        .filter((name) => !name.startsWith('.'));
    } catch {
      return [];
    }
  }

  private getFilesRecursive(dir: string, extensions: string[], maxDepth = 5): FileInfo[] {
    const files: FileInfo[] = [];

    const scan = (currentDir: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const entries = readdirSync(currentDir);
        for (const entry of entries) {
          if (entry.startsWith('.') || entry === 'node_modules') continue;

          const fullPath = join(currentDir, entry);
          try {
            const stats = statSync(fullPath);
            if (stats.isDirectory()) {
              scan(fullPath, depth + 1);
            } else if (stats.isFile()) {
              const ext = extname(entry);
              if (extensions.includes(ext)) {
                files.push({
                  path: fullPath,
                  name: entry,
                  size: stats.size,
                  ext,
                });
              }
            }
          } catch {
            // Skip inaccessible entries
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    scan(dir, 0);
    return files;
  }

  private generateFindingHash(finding: DeepScanFinding): string {
    return `${finding.area}:${finding.title}:${finding.content.slice(0, 100)}`;
  }

  private deduplicateFindings(findings: DeepScanFinding[]): DeepScanFinding[] {
    const unique: DeepScanFinding[] = [];
    for (const finding of findings) {
      const hash = this.generateFindingHash(finding);
      if (!this.seenFindings.has(hash)) {
        this.seenFindings.add(hash);
        unique.push(finding);
      }
    }
    return unique;
  }

  private detectModuleBoundaries(cwd: string): string | null {
    const srcDir = join(cwd, 'src');
    if (!existsSync(srcDir)) return null;

    const topLevelDirs = this.getDirectories(srcDir);
    if (topLevelDirs.length === 0) return null;

    const layers: string[] = [];
    const descriptions: string[] = [];

    const hasHandlers = topLevelDirs.some((d) => d.toLowerCase().includes('handler'));
    const hasServices = topLevelDirs.some((d) => d.toLowerCase().includes('service'));
    const hasRepositories = topLevelDirs.some(
      (d) => d.toLowerCase().includes('repositor') || d.toLowerCase().includes('db')
    );
    const hasMcp = topLevelDirs.some((d) => d.toLowerCase() === 'mcp');
    const hasRestApi = topLevelDirs.some((d) => d.toLowerCase().includes('restapi'));

    if (hasHandlers || hasMcp || hasRestApi) {
      if (hasMcp) {
        layers.push('MCP handlers');
        descriptions.push('MCP handlers expose tools to AI agents');
      }
      if (hasRestApi) {
        layers.push('REST API routes');
        descriptions.push('REST API routes handle HTTP requests');
      }
      if (hasHandlers && !hasMcp && !hasRestApi) {
        layers.push('handlers');
        descriptions.push('Handlers process incoming requests');
      }
    }

    if (hasServices) {
      layers.push('services');
      descriptions.push('Services contain business logic');
    }

    if (hasRepositories) {
      layers.push('repositories');
      descriptions.push('Repositories handle data access');
    }

    if (layers.length === 0) return null;

    let content = `Layered architecture detected: ${layers.join(' → ')}. `;
    content += descriptions.join('. ') + '.';

    if (layers.length >= 2) {
      if (hasHandlers || hasMcp || hasRestApi) {
        const handlerLayer = hasMcp ? 'MCP handlers' : hasRestApi ? 'REST routes' : 'Handlers';
        if (hasServices) {
          content += ` ${handlerLayer} call services for business logic.`;
        }
        if (hasRepositories && hasServices) {
          content += ' Services use repositories for data access.';
        } else if (hasRepositories) {
          content += ` ${handlerLayer} use repositories for data access.`;
        }
      }
    }

    return content;
  }

  private generatePatternGuides(patterns: string[]): DeepScanFinding[] {
    const guides: DeepScanFinding[] = [];

    for (const pattern of patterns) {
      const guide = this.createPatternGuide(pattern);
      if (guide) {
        guides.push(guide);
      }
    }

    return guides;
  }

  private createPatternGuide(pattern: string): DeepScanFinding | null {
    const patternGuides: Record<string, { title: string; steps: string[]; confidence: number }> = {
      'Repository Pattern': {
        title: 'How to add new Repository',
        steps: [
          'Create interface in src/core/interfaces/repositories/',
          'Implement repository in src/db/repositories/',
          'Export from src/db/repositories/index.ts',
        ],
        confidence: 0.8,
      },
      'Handler Pattern': {
        title: 'How to add new Handler',
        steps: [
          'Create descriptor in src/mcp/descriptors/',
          'Create handler in src/mcp/handlers/',
          'Register in src/mcp/handlers/index.ts',
        ],
        confidence: 0.8,
      },
      'Service Layer': {
        title: 'How to add new Service',
        steps: [
          'Create interface in src/services/',
          'Implement service class in src/services/',
          'Export from src/services/index.ts',
        ],
        confidence: 0.8,
      },
      'Factory Pattern': {
        title: 'How to add new Factory',
        steps: [
          'Create factory function with create* naming',
          'Accept configuration parameters',
          'Return configured instance',
        ],
        confidence: 0.75,
      },
      'Adapter Pattern': {
        title: 'How to add new Adapter',
        steps: [
          'Define target interface',
          'Create adapter class implementing interface',
          'Wrap external dependency in adapter',
        ],
        confidence: 0.75,
      },
      'Strategy Pattern': {
        title: 'How to add new Strategy',
        steps: [
          'Define strategy interface',
          'Implement concrete strategy',
          'Register strategy in strategy map',
        ],
        confidence: 0.75,
      },
      'Dependency Injection': {
        title: 'How to add new Dependency',
        steps: [
          'Define interface for dependency',
          'Register in DI container',
          'Inject via constructor parameters',
        ],
        confidence: 0.75,
      },
      'Pipeline Pattern': {
        title: 'How to add new Pipeline Stage',
        steps: [
          'Create stage function with consistent signature',
          'Add stage to pipeline configuration',
          'Handle errors and pass context',
        ],
        confidence: 0.75,
      },
      'Decorator Pattern': {
        title: 'How to add new Decorator',
        steps: [
          'Create decorator function wrapping target',
          'Preserve original interface',
          'Add enhanced behavior',
        ],
        confidence: 0.75,
      },
      'Observer/Event Pattern': {
        title: 'How to add new Observer',
        steps: [
          'Define event type',
          'Create handler function',
          'Register handler with event emitter',
        ],
        confidence: 0.75,
      },
    };

    const guideConfig = patternGuides[pattern];
    if (!guideConfig) return null;

    const steps = guideConfig.steps.map((step, idx) => `${idx + 1}) ${step}`).join('\n');
    const content = `To add new ${guideConfig.title.replace('How to add new ', '')}:\n${steps}`;

    return {
      area: 'architecture',
      title: guideConfig.title,
      content,
      category: 'reference',
      confidence: guideConfig.confidence,
      source: 'pattern detection',
    };
  }

  private detectDesignPatterns(cwd: string): string[] {
    const patterns: string[] = [];
    const srcDir = join(cwd, 'src');

    if (!existsSync(srcDir)) return patterns;

    const allFiles = this.getFilesRecursive(srcDir, ['.ts']);
    const fileNames = allFiles.map((f) => f.name.toLowerCase());

    if (fileNames.some((n) => n.includes('repository') || n.includes('.repo.'))) {
      patterns.push('Repository Pattern');
    }
    if (fileNames.some((n) => n.includes('factory'))) {
      patterns.push('Factory Pattern');
    }
    if (fileNames.some((n) => n.includes('adapter'))) {
      patterns.push('Adapter Pattern');
    }
    if (fileNames.some((n) => n.includes('strategy') || n.includes('strategies'))) {
      patterns.push('Strategy Pattern');
    }
    if (fileNames.some((n) => n.includes('handler'))) {
      patterns.push('Handler Pattern');
    }
    if (fileNames.some((n) => n.includes('service'))) {
      patterns.push('Service Layer');
    }
    if (fileNames.some((n) => n.includes('container') || n.includes('di'))) {
      patterns.push('Dependency Injection');
    }
    if (fileNames.some((n) => n.includes('pipeline'))) {
      patterns.push('Pipeline Pattern');
    }
    if (fileNames.some((n) => n.includes('decorator'))) {
      patterns.push('Decorator Pattern');
    }
    if (fileNames.some((n) => n.includes('observer') || n.includes('event'))) {
      patterns.push('Observer/Event Pattern');
    }

    return patterns;
  }

  private detectNamingConventions(cwd: string): DeepScanFinding | null {
    const srcDir = join(cwd, 'src');
    if (!existsSync(srcDir)) return null;

    const conventions: string[] = [];
    const allFiles = this.getFilesRecursive(srcDir, ['.ts']);

    const repositoryFiles = allFiles.filter((f) => /\.repository\.ts$/.test(f.name));
    if (repositoryFiles.length > 0) {
      conventions.push('Repositories: {entity}.repository.ts');
    }

    const handlerFiles = allFiles.filter((f) => /\.handler\.ts$/.test(f.name));
    if (handlerFiles.length > 0) {
      conventions.push('Handlers: {entity}.handler.ts');
    }

    const serviceFiles = allFiles.filter((f) => /\.service\.ts$/.test(f.name));
    if (serviceFiles.length > 0) {
      conventions.push('Services: {entity}.service.ts');
    }

    if (conventions.length === 0) return null;

    return {
      area: 'architecture',
      title: 'Naming Conventions',
      content: `File naming conventions detected:\n${conventions.map((c) => `- ${c}`).join('\n')}`,
      category: 'reference',
      confidence: 0.85,
      source: srcDir,
    };
  }

  private analyzeImportPatterns(cwd: string): DeepScanFinding | null {
    const srcDir = join(cwd, 'src');
    if (!existsSync(srcDir)) return null;

    const topLevelDirs = this.getDirectories(srcDir);
    if (topLevelDirs.length === 0) return null;

    const importMap = new Map<string, Set<string>>();

    for (const dir of topLevelDirs) {
      const indexPath = join(srcDir, dir, 'index.ts');
      if (!existsSync(indexPath)) continue;

      try {
        const content = readFileSync(indexPath, 'utf-8');
        const imports = this.extractCrossModuleImports(content, dir, topLevelDirs);
        if (imports.size > 0) {
          importMap.set(dir, imports);
        }
      } catch {
        continue;
      }
    }

    if (importMap.size === 0) return null;

    const importDirections: string[] = [];
    importMap.forEach((targets, source) => {
      targets.forEach((target) => {
        importDirections.push(`${source}/ → ${target}/`);
      });
    });

    const uniqueDirections = [...new Set(importDirections)];
    if (uniqueDirections.length === 0) return null;

    const content = `Module import patterns detected from index.ts files:\n${uniqueDirections.map((d) => `- ${d}`).join('\n')}`;

    return {
      area: 'architecture',
      title: 'Import Patterns',
      content,
      category: 'decision',
      confidence: 0.85,
      source: srcDir,
    };
  }

  private extractCrossModuleImports(
    content: string,
    currentModule: string,
    allModules: string[]
  ): Set<string> {
    const crossModuleImports = new Set<string>();
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath) continue;

      for (const module of allModules) {
        if (module === currentModule) continue;

        if (
          importPath.includes(`../${module}/`) ||
          importPath.includes(`../../${module}/`) ||
          importPath.startsWith(`@/${module}/`) ||
          importPath === `../${module}` ||
          importPath === `../../${module}`
        ) {
          crossModuleImports.add(module);
        }
      }
    }

    return crossModuleImports;
  }
}

export function createDeepScannerService(): IDeepScannerService {
  return new DeepScannerService();
}

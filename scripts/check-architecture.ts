import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

type Finding = {
  file: string;
  message: string;
};

const REPO_ROOT = process.cwd();
const SRC_DIR = path.join(REPO_ROOT, 'src');

// Legacy allowlist to avoid forcing a repo-wide refactor in one PR.
// Do not add new entries unless explicitly approved; prefer migrating code to Runtime/AppContext wiring.
const ALLOWED_GET_SERVICE_EXPORTS = new Set<string>([
  'src/services/capture/index.ts',
  'src/services/capture/triggers.ts',
  'src/services/feedback/index.ts',
  'src/services/librarian/index.ts',
  'src/services/memory-injection.service.ts',
  'src/services/query-rewrite/query-rewrite.service.ts',
  'src/services/rl/index.ts',
]);

// Legacy global event bus usage (must not spread).
// Prefer `context.adapters.event` (or runtime-owned event adapter) instead of importing `getEventBus()`.
const ALLOWED_GET_EVENT_BUS_USAGE = new Set<string>([
  'src/utils/events.ts',
  'src/core/adapters/local-event.adapter.ts',
]);

type V2Module = 'contracts' | 'kernel' | 'write' | 'read' | 'indexing' | 'adapters' | 'mcp';

const V2_ALLOWED_DEPENDENCIES: Record<V2Module, ReadonlySet<V2Module>> = {
  contracts: new Set(),
  kernel: new Set(),
  write: new Set(['contracts', 'kernel']),
  read: new Set(['contracts', 'kernel']),
  indexing: new Set(['contracts', 'kernel']),
  adapters: new Set(['contracts', 'kernel', 'write', 'read', 'indexing']),
  mcp: new Set(['contracts', 'kernel', 'write', 'read', 'indexing']),
};

function isV2Module(value: string): value is V2Module {
  return (
    value === 'contracts' ||
    value === 'kernel' ||
    value === 'write' ||
    value === 'read' ||
    value === 'indexing' ||
    value === 'adapters' ||
    value === 'mcp'
  );
}

function getV2ModuleFromRelativePath(relPath: string): V2Module | null {
  const parts = relPath.split('/');
  if (parts[0] !== 'src' || parts[1] !== 'v2') return null;
  const module = parts[2];
  if (!module || !isV2Module(module)) return null;
  return module;
}

function normalizeImportTarget(fromFile: string, specifier: string): string {
  const fromDir = path.dirname(path.join(REPO_ROOT, fromFile));
  const targetAbsolute = path.resolve(fromDir, specifier);
  const relative = path.relative(REPO_ROOT, targetAbsolute).split(path.sep).join('/');
  return relative.replace(/\.(ts|js)$/, '');
}

function isCrossModulePublicImport(specifier: string, targetModule: V2Module): boolean {
  const patternA = new RegExp(String.raw`^\.\.\/${targetModule}(\/index(\.js)?)?$`);
  const patternB = new RegExp(String.raw`^(\.\.\/)+${targetModule}(\/index(\.js)?)?$`);
  return patternA.test(specifier) || patternB.test(specifier);
}

function toRepoRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

async function listFilesRecursive(dirPath: string): Promise<string[]> {
  const dirents = await readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const dirent of dirents) {
    const fullPath = path.join(dirPath, dirent.name);
    if (dirent.isDirectory()) {
      results.push(...(await listFilesRecursive(fullPath)));
      continue;
    }

    if (!dirent.isFile()) continue;
    if (!dirent.name.endsWith('.ts')) continue;
    if (dirent.name.endsWith('.d.ts')) continue;
    results.push(fullPath);
  }

  return results;
}

async function main(): Promise<void> {
  const findings: Finding[] = [];

  const files = await listFilesRecursive(SRC_DIR);

  for (const file of files) {
    const rel = toRepoRelative(file);
    const content = await readFile(file, 'utf8');

    if (/\brequire\s*\(/.test(content)) {
      findings.push({
        file: rel,
        message:
          'Disallowed sync require(): use ESM imports (or async import()) to avoid hidden deps and circular-dependency hacks.',
      });
    }

    const usesGetEventBus = /\bgetEventBus\b/.test(content);
    if (usesGetEventBus && !ALLOWED_GET_EVENT_BUS_USAGE.has(rel)) {
      findings.push({
        file: rel,
        message:
          'Disallowed `getEventBus()` usage: event propagation must be injected (prefer `context.adapters.event`).',
      });
    }

    const exportsGetService = /export\s+function\s+get[A-Za-z0-9]+Service\s*\(/.test(content);
    if (exportsGetService && !ALLOWED_GET_SERVICE_EXPORTS.has(rel)) {
      findings.push({
        file: rel,
        message:
          'Disallowed new `export function get*Service()` singleton accessor. Add the service to Runtime/AppContext wiring instead (legacy allowlist exists).',
      });
    }

    // V2 modular dependency checks
    const currentV2Module = getV2ModuleFromRelativePath(rel);
    if (currentV2Module) {
      const importRegex = /from\s+['"]([^'"]+)['"]/g;
      for (const match of content.matchAll(importRegex)) {
        const specifier = match[1];
        if (!specifier || !specifier.startsWith('.')) continue;

        const normalizedTarget = normalizeImportTarget(rel, specifier);
        const targetV2Module = getV2ModuleFromRelativePath(normalizedTarget);
        if (!targetV2Module) continue;

        if (targetV2Module === currentV2Module) continue;

        const allowedDependencies = V2_ALLOWED_DEPENDENCIES[currentV2Module];
        if (!allowedDependencies.has(targetV2Module)) {
          findings.push({
            file: rel,
            message: `V2 boundary violation: module '${currentV2Module}' may not import '${targetV2Module}'`,
          });
          continue;
        }

        if (!isCrossModulePublicImport(specifier, targetV2Module)) {
          findings.push({
            file: rel,
            message: `V2 public surface violation: cross-module imports must go through '${targetV2Module}/index.ts'`,
          });
        }
      }
    }
  }

  if (findings.length === 0) {
    // eslint-disable-next-line no-console
    console.log('architecture: ok');
    return;
  }

  // eslint-disable-next-line no-console
  console.error('architecture: failed\n');
  for (const finding of findings) {
    // eslint-disable-next-line no-console
    console.error(`- ${finding.file}: ${finding.message}`);
  }
  // eslint-disable-next-line no-console
  console.error(`\nTotal: ${findings.length} issue(s)`);
  process.exitCode = 1;
}

await main();

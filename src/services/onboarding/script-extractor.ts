/**
 * Script Extractor Service
 *
 * Extracts npm scripts from package.json with allowlist filtering
 */

import { existsSync, readFileSync } from 'node:fs';
import type { DeepScanFinding, IScriptExtractorService } from './types.js';

const SCRIPT_ALLOWLIST = ['build', 'test', 'start', 'dev', 'lint', 'typecheck', 'format'];

const SCRIPT_ACTION_MAP: Record<string, string> = {
  build: 'build the project',
  test: 'run tests',
  start: 'start the application',
  dev: 'run in development mode',
  lint: 'lint the code',
  typecheck: 'check types',
  format: 'format the code',
};

interface PackageJson {
  scripts?: Record<string, string>;
}

export class ScriptExtractorService implements IScriptExtractorService {
  async extractScripts(packageJsonPath: string): Promise<DeepScanFinding[]> {
    if (!existsSync(packageJsonPath)) {
      return [];
    }

    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content) as PackageJson;

      if (!packageJson.scripts) {
        return [];
      }

      const findings: DeepScanFinding[] = [];

      for (const scriptName of SCRIPT_ALLOWLIST) {
        if (scriptName in packageJson.scripts) {
          const action = SCRIPT_ACTION_MAP[scriptName];
          const command = `npm run ${scriptName}`;

          findings.push({
            area: 'testing',
            title: command,
            content: `To ${action}: \`${command}\``,
            category: 'tool',
            confidence: 0.9,
            source: 'package.json scripts',
            command,
          });
        }
      }

      return findings;
    } catch {
      return [];
    }
  }
}

export function createScriptExtractorService(): IScriptExtractorService {
  return new ScriptExtractorService();
}

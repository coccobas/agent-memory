/**
 * Centralized version module
 * Reads version from package.json - single source of truth
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

interface PackageJson {
  version: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
) as PackageJson;

export const VERSION: string = packageJson.version;

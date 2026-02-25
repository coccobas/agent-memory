/**
 * CLI Main Program (v2)
 *
 * Minimal CLI — the MCP server is the primary interface.
 * This file is kept for backward compatibility but only provides
 * version and help output.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
const VERSION: string = packageJson.version;

/**
 * Run the CLI program
 */
export async function runCli(argv: string[]): Promise<void> {
  const command = (argv[0] || '').toLowerCase();

  if (command === '--version' || command === '-V') {
    console.log(VERSION);
    return;
  }

  // Default: help
  console.log(`agent-memory v${VERSION}`);
  console.log('');
  console.log('The v1 CLI commands have been removed.');
  console.log('Use the MCP server interface (7 tools) instead:');
  console.log('  memory_quickstart, memory, memory_remember,');
  console.log('  memory_write, memory_query, memory_session, memory_projector');
  console.log('');
  console.log('To start the MCP server:');
  console.log('  agent-memory');
}

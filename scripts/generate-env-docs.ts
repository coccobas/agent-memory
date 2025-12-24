#!/usr/bin/env tsx
/**
 * Generate environment variables documentation from the config registry.
 *
 * This keeps docs/reference/env-vars.md in sync with src/config/registry/*.
 *
 * Usage:
 *   npm run docs:generate:env
 *   npm run docs:check:env
 */

import fs from 'node:fs';
import path from 'node:path';
import { configRegistry, getAllEnvVars } from '../src/config/registry/index.js';

const START_MARKER = '<!-- AUTO-GENERATED:ENV-VARS-START -->';
const END_MARKER = '<!-- AUTO-GENERATED:ENV-VARS-END -->';

interface EnvVarInfo {
  envKey: string;
  description: string;
  defaultValue: unknown;
  type: string;
  sensitive: boolean;
  section: string;
}

function formatDefaultValue(value: unknown, sensitive: boolean): string {
  if (sensitive) return '(hidden)';
  if (value === undefined) return '—';
  if (value === '') return '(empty)';
  if (typeof value === 'string') return `\`${value}\``;
  if (typeof value === 'boolean') return value ? '`true`' : '`false`';
  if (typeof value === 'number') return `\`${value}\``;
  return String(value);
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function generateEnvVarTable(envVars: EnvVarInfo[]): string {
  const lines: string[] = [];

  // Group by section
  const sections = new Map<string, EnvVarInfo[]>();
  for (const envVar of envVars) {
    const sectionVars = sections.get(envVar.section) || [];
    sectionVars.push(envVar);
    sections.set(envVar.section, sectionVars);
  }

  // Generate tables per section
  for (const [sectionName, sectionVars] of sections) {
    const sectionTitle = sectionName === '(top-level)' ? 'General' : sectionName;
    lines.push(`### ${sectionTitle.charAt(0).toUpperCase() + sectionTitle.slice(1)}`);
    lines.push('');
    lines.push('| Variable | Default | Description |');
    lines.push('|----------|---------|-------------|');

    for (const v of sectionVars) {
      // Skip internal options with empty envKey
      if (!v.envKey) continue;

      const defaultStr = formatDefaultValue(v.defaultValue, v.sensitive);
      const descStr = escapeTableCell(truncate(v.description, 120));
      lines.push(`| \`${v.envKey}\` | ${defaultStr} | ${descStr} |`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

function generateMarkdown(): string {
  const envVars = getAllEnvVars(configRegistry);
  return generateEnvVarTable(envVars);
}

function replaceBetweenMarkers(source: string, replacement: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Missing or invalid markers in docs file. Expected ${START_MARKER} ... ${END_MARKER}`
    );
  }

  const before = source.slice(0, start + START_MARKER.length);
  const after = source.slice(end);

  const trimmedReplacement = replacement.trimEnd();
  return `${before}\n\n${trimmedReplacement}\n\n${after}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const outPath = path.resolve(process.cwd(), 'docs/reference/env-vars.md');

  // Check if file exists, create with markers if not
  if (!fs.existsSync(outPath)) {
    const initial = `# Environment Variables Reference

This document lists all environment variables supported by Agent Memory.

${START_MARKER}

${END_MARKER}
`;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, initial, 'utf8');
    process.stdout.write(`Created ${outPath}\n`);
  }

  const current = fs.readFileSync(outPath, 'utf8');
  const generated = generateMarkdown();
  const next = replaceBetweenMarkers(current, generated);

  if (checkOnly) {
    if (next !== current) {
      process.stderr.write(
        'docs/reference/env-vars.md is out of date. Run `npm run docs:generate:env`.\n'
      );
      process.exit(1);
    }
    process.stdout.write('docs/reference/env-vars.md is up to date.\n');
    return;
  }

  fs.writeFileSync(outPath, next, 'utf8');
  process.stdout.write('Updated docs/reference/env-vars.md\n');
}

main();

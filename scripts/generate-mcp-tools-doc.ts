#!/usr/bin/env tsx
/**
 * Generate MCP tools documentation from the authoritative MCP tool schema.
 *
 * This keeps docs/reference/mcp-tools.md in sync with src/mcp/server.ts.
 *
 * Usage:
 *   npm run docs:generate:mcp-tools
 *   npm run docs:check:mcp-tools
 */

import fs from 'node:fs';
import path from 'node:path';
import { TOOLS } from '../src/mcp/server.ts';

const START_MARKER = '<!-- AUTO-GENERATED:MCP-TOOLS-START -->';
const END_MARKER = '<!-- AUTO-GENERATED:MCP-TOOLS-END -->';

type JsonSchema = Record<string, unknown>;

function toLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function describeSchemaType(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return 'unknown';
  const obj = schema as JsonSchema;

  if (Array.isArray(obj.oneOf)) {
    return (obj.oneOf as unknown[]).map(describeSchemaType).join(' or ');
  }
  if (Array.isArray(obj.anyOf)) {
    return (obj.anyOf as unknown[]).map(describeSchemaType).join(' or ');
  }

  const type = typeof obj.type === 'string' ? obj.type : undefined;
  const enumValues = Array.isArray(obj.enum) ? (obj.enum as unknown[]) : null;
  const items = obj.items;

  if (type === 'array') return `array<${describeSchemaType(items)}>`;
  if (type) {
    if (enumValues && enumValues.length > 0) {
      const formatted = enumValues.map((v) => `\`${String(v)}\``).join(', ');
      return `${type} (${formatted})`;
    }
    return type;
  }

  if (enumValues && enumValues.length > 0) {
    const formatted = enumValues.map((v) => `\`${String(v)}\``).join(', ');
    return `enum (${formatted})`;
  }

  return 'object';
}

function safeInline(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function getString(obj: JsonSchema, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getObject(obj: JsonSchema, key: string): JsonSchema | undefined {
  const v = obj[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : undefined;
}

function getArray(obj: JsonSchema, key: string): unknown[] | undefined {
  const v = obj[key];
  return Array.isArray(v) ? v : undefined;
}

function generateToolMarkdown(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): string {
  const schema =
    tool.inputSchema && typeof tool.inputSchema === 'object'
      ? (tool.inputSchema as JsonSchema)
      : null;
  const props = schema ? getObject(schema, 'properties') : undefined;
  const required = schema ? (getArray(schema, 'required') ?? []) : [];
  const requiredSet = new Set(required.map((v) => String(v)));

  const actionSchema = props ? getObject(props, 'action') : undefined;
  const actions = actionSchema ? (getArray(actionSchema, 'enum') ?? []) : [];
  const actionsInline = actions.length ? actions.map((a) => `\`${String(a)}\``).join(', ') : '—';

  const description = tool.description ? truncate(safeInline(tool.description), 180) : '';

  const lines: string[] = [];
  lines.push(`### \`${tool.name}\``);
  lines.push('');
  if (description) lines.push(description);
  lines.push('');
  lines.push(`- Actions: ${actionsInline}`);

  if (!props) {
    lines.push('- Parameters: (no schema available)');
    lines.push('');
    return lines.join('\n');
  }

  const keys = Object.keys(props).filter((k) => k !== 'action');
  if (keys.length === 0) {
    lines.push('- Parameters: (none)');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('| Parameter | Type | Required | Description |');
  lines.push('|---|---|---:|---|');

  for (const key of keys.sort()) {
    const paramSchema = getObject(props, key) ?? (props[key] as unknown);
    const typeStr = escapeTableCell(describeSchemaType(paramSchema));
    const desc = (() => {
      if (paramSchema && typeof paramSchema === 'object') {
        const d = getString(paramSchema as JsonSchema, 'description');
        return d ? truncate(safeInline(d), 180) : '';
      }
      return '';
    })();
    const req = requiredSet.has(key) ? 'yes' : '';
    lines.push(`| \`${key}\` | ${typeStr} | ${req} | ${escapeTableCell(desc)} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function generateMarkdown(): string {
  const toolsSorted = [...TOOLS].sort((a, b) => a.name.localeCompare(b.name));

  const indexLines: string[] = [];
  indexLines.push('### Tool Index');
  indexLines.push('');
  indexLines.push('| Tool | Purpose | Actions |');
  indexLines.push('|---|---|---|');

  for (const t of toolsSorted) {
    const schema =
      t.inputSchema && typeof t.inputSchema === 'object' ? (t.inputSchema as JsonSchema) : null;
    const props = schema ? getObject(schema, 'properties') : undefined;
    const actionSchema = props ? getObject(props, 'action') : undefined;
    const actions = actionSchema ? (getArray(actionSchema, 'enum') ?? []) : [];
    const actionsInline = actions.length ? actions.map((a) => `\`${String(a)}\``).join(', ') : '—';
    const purpose = t.description ? truncate(safeInline(t.description), 80) : '';
    indexLines.push(
      `| \`${t.name}\` | ${escapeTableCell(purpose)} | ${escapeTableCell(actionsInline)} |`
    );
  }

  const sections = toolsSorted.map((t) => generateToolMarkdown(t)).join('\n');
  return [indexLines.join('\n'), sections].join('\n');
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

  const outPath = path.resolve(process.cwd(), 'docs/reference/mcp-tools.md');
  const current = fs.readFileSync(outPath, 'utf8');
  const generated = generateMarkdown();
  const next = replaceBetweenMarkers(current, generated);

  if (checkOnly) {
    if (next !== current) {
      // Keep output short; diff is handled by git.
      process.stderr.write(
        'docs/reference/mcp-tools.md is out of date. Run `npm run docs:generate:mcp-tools`.\n'
      );
      process.exit(1);
    }
    process.stdout.write('docs/reference/mcp-tools.md is up to date.\n');
    return;
  }

  fs.writeFileSync(outPath, next, 'utf8');
  process.stdout.write('Updated docs/reference/mcp-tools.md\n');
}

main();

#!/usr/bin/env tsx
/**
 * Generate rules/auto-memory-reference.md from MCP tool descriptors.
 *
 * This ensures the rules documentation stays in sync with actual tool definitions.
 *
 * Usage:
 *   npm run generate:rules
 *   npx tsx scripts/generate-rules-reference.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  allDescriptors,
  type AnyToolDescriptor,
  isActionBasedDescriptor,
  type ParamSchema,
  type ParamSchemas,
} from '../src/mcp/descriptors/index.js';

// =============================================================================
// TYPES
// =============================================================================

interface ToolDoc {
  name: string;
  description: string;
  visibility: string;
  actions: string[];
  params: ParamDoc[];
  notes: string[];
}

interface ParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enumValues?: string[];
  forActions?: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

function formatType(schema: ParamSchema): string {
  let type = schema.type;

  if (schema.enum && schema.enum.length > 0) {
    if (schema.enum.length <= 4) {
      return schema.enum.map((v) => `\`${v}\``).join(' | ');
    }
    return `${type} (enum)`;
  }

  if (schema.type === 'array' && schema.items) {
    const itemType = 'type' in schema.items ? (schema.items as { type: string }).type : 'object';
    return `${itemType}[]`;
  }

  return type;
}

function extractToolDoc(descriptor: AnyToolDescriptor): ToolDoc {
  const doc: ToolDoc = {
    name: descriptor.name,
    description: truncate(descriptor.description, 200),
    visibility: (descriptor as { visibility?: string }).visibility ?? 'standard',
    actions: [],
    params: [],
    notes: [],
  };

  if (!isActionBasedDescriptor(descriptor)) {
    // Simple tool
    if (descriptor.params) {
      for (const [name, schema] of Object.entries(descriptor.params)) {
        doc.params.push({
          name,
          type: formatType(schema),
          required: descriptor.required?.includes(name) ?? false,
          description: schema.description ?? '',
          enumValues: schema.enum ? [...schema.enum] : undefined,
        });
      }
    }
    return doc;
  }

  // Action-based tool
  doc.actions = Object.keys(descriptor.actions);

  // Collect all params with their action associations
  const paramActions: Map<string, Set<string>> = new Map();
  const paramSchemas: Map<string, ParamSchema> = new Map();

  // Common params apply to all actions
  if (descriptor.commonParams) {
    for (const [name, schema] of Object.entries(descriptor.commonParams)) {
      paramSchemas.set(name, schema);
      paramActions.set(name, new Set(doc.actions));
    }
  }

  // Action-specific params
  for (const [actionName, actionDef] of Object.entries(descriptor.actions)) {
    if (actionDef.params) {
      for (const [name, schema] of Object.entries(actionDef.params)) {
        if (!paramSchemas.has(name)) {
          paramSchemas.set(name, schema);
          paramActions.set(name, new Set());
        }
        paramActions.get(name)!.add(actionName);
      }
    }
  }

  // Build param docs
  for (const [name, schema] of paramSchemas) {
    const actions = paramActions.get(name)!;
    const isGlobal = actions.size === doc.actions.length;

    doc.params.push({
      name,
      type: formatType(schema),
      required: descriptor.required?.includes(name) ?? false,
      description: schema.description ?? '',
      enumValues: schema.enum ? [...schema.enum] : undefined,
      forActions: isGlobal ? undefined : [...actions],
    });
  }

  return doc;
}

function truncate(text: string, maxLen: number): string {
  // Get first line/sentence
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 1) + '…';
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// =============================================================================
// GENERATORS
// =============================================================================

function generateToolSection(doc: ToolDoc): string {
  const lines: string[] = [];

  lines.push(`### ${doc.name}`);
  lines.push('');
  lines.push(doc.description);
  lines.push('');

  if (doc.actions.length > 0) {
    lines.push(`**Actions:** ${doc.actions.map((a) => `\`${a}\``).join(', ')}`);
    lines.push('');
  }

  if (doc.params.length > 0) {
    lines.push('| Parameter | Type | Required | Description |');
    lines.push('|-----------|------|:--------:|-------------|');

    // Sort: required first, then alphabetical
    const sortedParams = [...doc.params].sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const param of sortedParams) {
      const req = param.required ? '✓' : '';
      const desc = escapeMarkdown(truncate(param.description, 100));
      const actionNote =
        param.forActions && param.forActions.length < doc.actions.length
          ? ` (${param.forActions.join(', ')})`
          : '';
      lines.push(`| \`${param.name}\` | ${param.type} | ${req} | ${desc}${actionNote} |`);
    }
    lines.push('');
  } else {
    lines.push('No parameters required.');
    lines.push('');
  }

  // Add enum notes for params with many values
  for (const param of doc.params) {
    if (param.enumValues && param.enumValues.length > 4) {
      lines.push(`**${param.name} values:** ${param.enumValues.map((v) => `\`${v}\``).join(', ')}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateCategorySection(category: string, tools: ToolDoc[]): string {
  const lines: string[] = [];
  lines.push(`## ${category}`);
  lines.push('');

  for (const tool of tools) {
    lines.push(generateToolSection(tool));
  }

  return lines.join('\n');
}

function categorizeTools(docs: ToolDoc[]): Map<string, ToolDoc[]> {
  const categories = new Map<string, ToolDoc[]>();

  const categoryMap: Record<string, string> = {
    // Core workflow
    memory: 'Core Workflow',
    memory_quickstart: 'Core Workflow',
    memory_remember: 'Core Workflow',
    memory_status: 'Core Workflow',

    // Entry management
    memory_guideline: 'Entry Management',
    memory_knowledge: 'Entry Management',
    memory_tool: 'Entry Management',
    memory_evidence: 'Entry Management',

    // Querying
    memory_query: 'Querying & Search',
    memory_discover: 'Querying & Search',

    // Scope management
    memory_org: 'Scope Management',
    memory_project: 'Scope Management',
    memory_session: 'Scope Management',

    // Organization
    memory_tag: 'Organization',
    memory_relation: 'Organization',

    // Tasks & Episodes
    memory_task: 'Tasks & Episodes',
    memory_decomposition: 'Tasks & Episodes',
    memory_episode: 'Tasks & Episodes',

    // Learning & Experience
    memory_experience: 'Learning & Experience',
    memory_librarian: 'Learning & Experience',
    memory_review: 'Learning & Experience',

    // Extraction & Observation
    memory_observe: 'Extraction & Observation',
    memory_extraction_approve: 'Extraction & Observation',

    // Maintenance
    memory_consolidate: 'Maintenance',
    memory_forget: 'Maintenance',
    memory_ops: 'Maintenance',

    // Multi-Agent
    memory_file_lock: 'Multi-Agent Coordination',
    memory_voting: 'Multi-Agent Coordination',
    memory_conflict: 'Multi-Agent Coordination',

    // Analytics & Feedback
    memory_analytics: 'Analytics & Feedback',
    memory_feedback: 'Analytics & Feedback',
    memory_conversation: 'Analytics & Feedback',

    // Knowledge Graph
    graph_node: 'Knowledge Graph',
    graph_edge: 'Knowledge Graph',
    memory_graph_status: 'Knowledge Graph',

    // Advanced
    memory_latent: 'Advanced Features',
    memory_summarize: 'Advanced Features',
    memory_context: 'Advanced Features',

    // System
    memory_health: 'System & Admin',
    memory_init: 'System & Admin',
    memory_backup: 'System & Admin',
    memory_export: 'System & Admin',
    memory_import: 'System & Admin',
    memory_permission: 'System & Admin',
    memory_verify: 'System & Admin',
    memory_hook: 'System & Admin',
    memory_onboard: 'System & Admin',

    // Experimental
    memory_rl: 'Experimental (ML/Training)',
    memory_lora: 'Experimental (ML/Training)',
  };

  for (const doc of docs) {
    const category = categoryMap[doc.name] ?? 'Other';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(doc);
  }

  return categories;
}

function generateReference(): string {
  const docs = allDescriptors.map(extractToolDoc);
  const categories = categorizeTools(docs);

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('description: Agent Memory tool parameters - consult when needing parameter details');
  lines.push('globs: []');
  lines.push('alwaysApply: false');
  lines.push('---');
  lines.push('');

  // Header
  lines.push('# Agent Memory Parameter Reference');
  lines.push('');
  lines.push(`> Auto-generated from ${docs.length} MCP tool descriptors.`);
  lines.push('> Do not edit manually - run \`npm run generate:rules\` to update.');
  lines.push('');

  // Quick index
  lines.push('## Quick Index');
  lines.push('');
  lines.push('| Tool | Actions | Visibility |');
  lines.push('|------|---------|------------|');

  for (const doc of docs.sort((a, b) => a.name.localeCompare(b.name))) {
    const actions =
      doc.actions.length > 0
        ? doc.actions.length > 5
          ? `${doc.actions.length} actions`
          : doc.actions.map((a) => `\`${a}\``).join(', ')
        : '—';
    lines.push(`| [\`${doc.name}\`](#${doc.name}) | ${actions} | ${doc.visibility} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Category sections
  const categoryOrder = [
    'Core Workflow',
    'Entry Management',
    'Querying & Search',
    'Scope Management',
    'Organization',
    'Tasks & Episodes',
    'Learning & Experience',
    'Extraction & Observation',
    'Maintenance',
    'Multi-Agent Coordination',
    'Analytics & Feedback',
    'Knowledge Graph',
    'Advanced Features',
    'System & Admin',
    'Experimental (ML/Training)',
    'Other',
  ];

  for (const category of categoryOrder) {
    const tools = categories.get(category);
    if (tools && tools.length > 0) {
      lines.push(generateCategorySection(category, tools));
    }
  }

  // Footer
  lines.push('## Scope Types');
  lines.push('');
  lines.push('| Type | scopeId Required | Use Case |');
  lines.push('|------|:----------------:|----------|');
  lines.push('| `global` | No | Universal standards |');
  lines.push('| `org` | Yes | Team-wide standards |');
  lines.push('| `project` | Yes | Project-specific (default) |');
  lines.push('| `session` | Yes | Temporary/experimental |');
  lines.push('');
  lines.push('---');
  lines.push('');

  const now = new Date().toISOString().split('T')[0];
  lines.push(`@version "2.0.0"`);
  lines.push(`@last_updated "${now}"`);
  lines.push(`@tool_count ${docs.length}`);
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  const outPath = path.resolve(process.cwd(), 'rules/auto-memory-reference.md');

  console.log(`Generating rules reference from ${allDescriptors.length} descriptors...`);

  const content = generateReference();
  fs.writeFileSync(outPath, content, 'utf8');

  console.log(`✓ Updated ${outPath}`);
  console.log(`  ${allDescriptors.length} tools documented`);
}

main();

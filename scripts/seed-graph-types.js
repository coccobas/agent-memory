#!/usr/bin/env node
/**
 * Script to seed built-in graph types directly into the database
 */

import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Support AGENT_MEMORY_DATA_DIR or default to ./data/
const dataDir = process.env.AGENT_MEMORY_DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir.replace(/^~/, process.env.HOME), 'memory.db');
console.log('Using database:', dbPath);
const db = new Database(dbPath);

function generateId() {
  return crypto.randomBytes(12).toString('base64url');
}

function now() {
  return new Date().toISOString();
}

const timestamp = now();

// Node types from builtin-types.ts
const nodeTypes = [
  {
    name: 'entity',
    description: 'Base type for all entities in the graph',
    schema: {
      type: 'object',
      properties: { description: { type: 'string' }, metadata: { type: 'object' } },
    },
  },
  {
    name: 'tool',
    description: 'Reusable tool pattern or command',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        category: { type: 'string' },
        parameters: { type: 'object' },
        examples: { type: 'array' },
        constraints: { type: 'string' },
      },
    },
  },
  {
    name: 'guideline',
    description: 'Coding or behavioral rule',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        category: { type: 'string' },
        priority: { type: 'number' },
        rationale: { type: 'string' },
        examples: { type: 'object' },
      },
      required: ['content'],
    },
  },
  {
    name: 'knowledge',
    description: 'Fact, decision, or context to remember',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        category: { type: 'string' },
        source: { type: 'string' },
        confidence: { type: 'number' },
        validFrom: { type: 'string' },
        validUntil: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'experience',
    description: 'Learned pattern from past interactions',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        scenario: { type: 'string' },
        outcome: { type: 'string' },
        level: { type: 'string' },
        applicability: { type: 'string' },
        contraindications: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['content'],
    },
  },
  {
    name: 'code_entity',
    description: 'Base type for code-related entities',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        language: { type: 'string' },
        lineStart: { type: 'number' },
        lineEnd: { type: 'number' },
        signature: { type: 'string' },
      },
    },
  },
  {
    name: 'file',
    description: 'Source code file',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        language: { type: 'string' },
        size: { type: 'number' },
        hash: { type: 'string' },
        lastModified: { type: 'string' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'function',
    description: 'Function or method definition',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        language: { type: 'string' },
        signature: { type: 'string' },
        parameters: { type: 'array' },
        returnType: { type: 'string' },
        isAsync: { type: 'boolean' },
        isExported: { type: 'boolean' },
        complexity: { type: 'number' },
      },
      required: ['signature'],
    },
  },
  {
    name: 'class',
    description: 'Class or type definition',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        language: { type: 'string' },
        isAbstract: { type: 'boolean' },
        isExported: { type: 'boolean' },
        interfaces: { type: 'array' },
        superclass: { type: 'string' },
      },
    },
  },
  {
    name: 'module',
    description: 'Module or package',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        packageName: { type: 'string' },
        version: { type: 'string' },
        entryPoint: { type: 'string' },
        exports: { type: 'array' },
      },
    },
  },
  {
    name: 'interface',
    description: 'Interface or type definition',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        language: { type: 'string' },
        properties: { type: 'array' },
        methods: { type: 'array' },
        extends: { type: 'array' },
      },
    },
  },
  {
    name: 'api_endpoint',
    description: 'API endpoint definition',
    parent: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        path: { type: 'string' },
        requestSchema: { type: 'object' },
        responseSchema: { type: 'object' },
        authentication: { type: 'string' },
        rateLimit: { type: 'number' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'hardware_entity',
    description: 'Base type for hardware-related entities',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        manufacturer: { type: 'string' },
        model: { type: 'string' },
        serialNumber: { type: 'string' },
        location: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
  {
    name: 'sensor',
    description: 'Physical sensor device',
    parent: 'hardware_entity',
    schema: {
      type: 'object',
      properties: {
        sensorType: { type: 'string' },
        unit: { type: 'string' },
        minValue: { type: 'number' },
        maxValue: { type: 'number' },
        accuracy: { type: 'number' },
        samplingRate: { type: 'number' },
        calibrationDate: { type: 'string' },
      },
      required: ['sensorType', 'unit'],
    },
  },
  {
    name: 'measurement',
    description: 'Recorded measurement or data point',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: { type: 'string' },
        timestamp: { type: 'string' },
        quality: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['value', 'unit'],
    },
  },
  {
    name: 'weather_station',
    description: 'Weather monitoring station',
    parent: 'hardware_entity',
    schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        elevation: { type: 'number' },
        timezone: { type: 'string' },
        capabilities: { type: 'array' },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'telemetry',
    description: 'Telemetry data stream or event',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        eventType: { type: 'string' },
        timestamp: { type: 'string' },
        payload: { type: 'object' },
        severity: { type: 'string' },
        correlationId: { type: 'string' },
      },
      required: ['eventType'],
    },
  },
  {
    name: 'architecture_decision',
    description: 'Architecture Decision Record (ADR)',
    parent: 'knowledge',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        status: { type: 'string' },
        context: { type: 'string' },
        decision: { type: 'string' },
        consequences: { type: 'array' },
        alternatives: { type: 'array' },
      },
      required: ['content', 'status', 'decision'],
    },
  },
  {
    name: 'component',
    description: 'System component or service',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        componentType: { type: 'string' },
        version: { type: 'string' },
        repository: { type: 'string' },
        owner: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['componentType'],
    },
  },
  {
    name: 'dependency',
    description: 'External dependency or package',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        packageName: { type: 'string' },
        version: { type: 'string' },
        registry: { type: 'string' },
        license: { type: 'string' },
        securityAdvisories: { type: 'array' },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'task',
    description: 'Work item or task',
    parent: 'entity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        priority: { type: 'string' },
        assignee: { type: 'string' },
        dueDate: { type: 'string' },
        estimate: { type: 'number' },
        tags: { type: 'array' },
      },
    },
  },
];

// Edge types
const edgeTypes = [
  { name: 'related_to', description: 'Generic bidirectional relationship', isDirected: false },
  {
    name: 'depends_on',
    description: 'Source depends on target',
    inverseName: 'dependency_of',
    schema: {
      type: 'object',
      properties: { dependencyType: { type: 'string' }, versionConstraint: { type: 'string' } },
    },
  },
  {
    name: 'imports',
    description: 'Source imports/uses target',
    inverseName: 'imported_by',
    sourceConstraints: ['file', 'module', 'function', 'class'],
    targetConstraints: ['file', 'module', 'function', 'class', 'interface'],
  },
  {
    name: 'contains',
    description: 'Source contains target (parent-child)',
    inverseName: 'contained_in',
    schema: { type: 'object', properties: { order: { type: 'number' } } },
  },
  {
    name: 'calls',
    description: 'Source calls/invokes target',
    inverseName: 'called_by',
    sourceConstraints: ['function', 'class', 'api_endpoint'],
    targetConstraints: ['function', 'class', 'api_endpoint'],
    schema: {
      type: 'object',
      properties: { callCount: { type: 'number' }, isAsync: { type: 'boolean' } },
    },
  },
  {
    name: 'implements',
    description: 'Source implements target interface',
    inverseName: 'implemented_by',
    sourceConstraints: ['class'],
    targetConstraints: ['interface'],
  },
  {
    name: 'extends',
    description: 'Source extends/inherits from target',
    inverseName: 'extended_by',
    sourceConstraints: ['class', 'interface'],
    targetConstraints: ['class', 'interface'],
  },
  {
    name: 'measures',
    description: 'Source sensor measures target metric',
    inverseName: 'measured_by',
    sourceConstraints: ['sensor', 'weather_station'],
  },
  { name: 'controls', description: 'Source controls/manages target', inverseName: 'controlled_by' },
  {
    name: 'located_at',
    description: 'Source is located at target location',
    inverseName: 'location_of',
  },
  {
    name: 'applies_to',
    description: 'Source applies to target (guideline → code)',
    inverseName: 'governed_by',
    sourceConstraints: ['guideline', 'knowledge'],
  },
  {
    name: 'supersedes',
    description: 'Source supersedes/replaces target',
    inverseName: 'superseded_by',
    sourceConstraints: ['architecture_decision', 'knowledge'],
    targetConstraints: ['architecture_decision', 'knowledge'],
  },
  { name: 'conflicts_with', description: 'Source conflicts with target', isDirected: false },
  {
    name: 'parent_of',
    description: 'Source is parent task of target',
    inverseName: 'child_of',
    sourceConstraints: ['task'],
    targetConstraints: ['task'],
  },
  {
    name: 'blocks',
    description: 'Source blocks target',
    inverseName: 'blocked_by',
    sourceConstraints: ['task'],
    targetConstraints: ['task'],
  },
  {
    name: 'triggered',
    description: 'Source triggered target event',
    inverseName: 'triggered_by',
    schema: {
      type: 'object',
      properties: { timestamp: { type: 'string' }, trigger: { type: 'string' } },
    },
  },
  { name: 'follows', description: 'Source follows target in sequence', inverseName: 'precedes' },
];

// Insert node types
const insertNodeType = db.prepare(`
  INSERT OR IGNORE INTO node_types (id, name, schema, description, is_builtin, created_at, created_by)
  VALUES (?, ?, ?, ?, 1, ?, 'system')
`);

const updateParent = db.prepare(`
  UPDATE node_types SET parent_type_id = ? WHERE name = ?
`);

const idMap = {};

console.log('Seeding node types...');
for (const t of nodeTypes) {
  const id = generateId();
  idMap[t.name] = id;
  insertNodeType.run(id, t.name, JSON.stringify(t.schema), t.description, timestamp);
}

// Update parent references
for (const t of nodeTypes) {
  if (t.parent && idMap[t.parent]) {
    updateParent.run(idMap[t.parent], t.name);
  }
}
console.log(`Seeded ${nodeTypes.length} node types`);

// Insert edge types
const insertEdgeType = db.prepare(`
  INSERT OR IGNORE INTO edge_types (id, name, schema, description, is_directed, inverse_name, source_constraints, target_constraints, is_builtin, created_at, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'system')
`);

console.log('Seeding edge types...');
for (const t of edgeTypes) {
  const id = generateId();
  insertEdgeType.run(
    id,
    t.name,
    t.schema ? JSON.stringify(t.schema) : null,
    t.description,
    t.isDirected !== false ? 1 : 0,
    t.inverseName || null,
    t.sourceConstraints ? JSON.stringify(t.sourceConstraints) : null,
    t.targetConstraints ? JSON.stringify(t.targetConstraints) : null,
    timestamp
  );
}
console.log(`Seeded ${edgeTypes.length} edge types`);

db.close();
console.log('Done!');

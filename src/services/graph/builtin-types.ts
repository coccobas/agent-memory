/**
 * Built-in Node and Edge Type Definitions
 *
 * These types are seeded into the type registry on first startup.
 * They provide compatibility with existing memory types and common
 * code/technical entity patterns.
 */

/**
 * Built-in node type definition
 */
export interface BuiltinNodeTypeDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  parentTypeName?: string;
}

/**
 * Built-in edge type definition
 */
export interface BuiltinEdgeTypeDef {
  name: string;
  description: string;
  schema?: Record<string, unknown>;
  isDirected?: boolean;
  inverseName?: string;
  sourceConstraints?: string[];
  targetConstraints?: string[];
}

// =============================================================================
// BUILT-IN NODE TYPES
// =============================================================================

export const BUILTIN_NODE_TYPES: BuiltinNodeTypeDef[] = [
  // ---------------------------------------------------------------------------
  // Base Types (Abstract parents for inheritance)
  // ---------------------------------------------------------------------------
  {
    name: 'entity',
    description: 'Base type for all entities in the graph',
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        metadata: { type: 'object' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Memory Types (Compatibility with existing system)
  // ---------------------------------------------------------------------------
  {
    name: 'tool',
    description: 'Reusable tool pattern or command',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        category: { type: 'string' }, // mcp, cli, function, api
        parameters: { type: 'object' },
        examples: { type: 'array' },
        constraints: { type: 'string' },
      },
    },
  },
  {
    name: 'guideline',
    description: 'Coding or behavioral rule',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        category: { type: 'string' }, // code_style, security, workflow
        priority: { type: 'number' },
        rationale: { type: 'string' },
        examples: { type: 'object' }, // { good: [], bad: [] }
      },
      required: ['content'],
    },
  },
  {
    name: 'knowledge',
    description: 'Fact, decision, or context to remember',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        category: { type: 'string' }, // decision, fact, context, reference
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
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        scenario: { type: 'string' },
        outcome: { type: 'string' },
        level: { type: 'string' }, // case, strategy
        applicability: { type: 'string' },
        contraindications: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['content'],
    },
  },

  // ---------------------------------------------------------------------------
  // Code Entity Types
  // ---------------------------------------------------------------------------
  {
    name: 'code_entity',
    description: 'Base type for code-related entities',
    parentTypeName: 'entity',
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
    parentTypeName: 'code_entity',
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
    parentTypeName: 'code_entity',
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
    parentTypeName: 'code_entity',
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
    parentTypeName: 'code_entity',
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
    parentTypeName: 'code_entity',
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
    parentTypeName: 'code_entity',
    schema: {
      type: 'object',
      properties: {
        method: { type: 'string' }, // GET, POST, PUT, DELETE
        path: { type: 'string' },
        requestSchema: { type: 'object' },
        responseSchema: { type: 'object' },
        authentication: { type: 'string' },
        rateLimit: { type: 'number' },
      },
      required: ['method', 'path'],
    },
  },

  // ---------------------------------------------------------------------------
  // Technical/Engineering Types
  // ---------------------------------------------------------------------------
  {
    name: 'hardware_entity',
    description: 'Base type for hardware-related entities',
    parentTypeName: 'entity',
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
    parentTypeName: 'hardware_entity',
    schema: {
      type: 'object',
      properties: {
        sensorType: { type: 'string' }, // temperature, humidity, pressure
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
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: { type: 'string' },
        timestamp: { type: 'string' },
        quality: { type: 'string' }, // good, suspect, bad
        source: { type: 'string' },
      },
      required: ['value', 'unit'],
    },
  },
  {
    name: 'weather_station',
    description: 'Weather monitoring station',
    parentTypeName: 'hardware_entity',
    schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        elevation: { type: 'number' },
        timezone: { type: 'string' },
        capabilities: { type: 'array' }, // temperature, wind, precipitation
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'telemetry',
    description: 'Telemetry data stream or event',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        eventType: { type: 'string' },
        timestamp: { type: 'string' },
        payload: { type: 'object' },
        severity: { type: 'string' }, // info, warning, error, critical
        correlationId: { type: 'string' },
      },
      required: ['eventType'],
    },
  },

  // ---------------------------------------------------------------------------
  // Architecture/Planning Types
  // ---------------------------------------------------------------------------
  {
    name: 'architecture_decision',
    description: 'Architecture Decision Record (ADR)',
    parentTypeName: 'knowledge',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        status: { type: 'string' }, // proposed, accepted, deprecated, superseded
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
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        componentType: { type: 'string' }, // service, library, database, cache
        version: { type: 'string' },
        repository: { type: 'string' },
        owner: { type: 'string' },
        status: { type: 'string' }, // active, deprecated, planned
      },
      required: ['componentType'],
    },
  },
  {
    name: 'dependency',
    description: 'External dependency or package',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        packageName: { type: 'string' },
        version: { type: 'string' },
        registry: { type: 'string' }, // npm, pypi, maven
        license: { type: 'string' },
        securityAdvisories: { type: 'array' },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'task',
    description: 'Work item or task',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' }, // pending, in_progress, completed, blocked
        priority: { type: 'string' }, // low, medium, high, critical
        assignee: { type: 'string' },
        dueDate: { type: 'string' },
        estimate: { type: 'number' },
        tags: { type: 'array' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Episode Type (Temporal Activity Grouping)
  // ---------------------------------------------------------------------------
  {
    name: 'episode',
    description: 'Bounded temporal activity grouping',
    parentTypeName: 'entity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' }, // planned, active, completed, failed, cancelled
        outcomeType: { type: 'string' }, // success, partial, failure, abandoned
        triggerType: { type: 'string' },
        startedAt: { type: 'string' },
        endedAt: { type: 'string' },
        durationMs: { type: 'number' },
        depth: { type: 'number' },
      },
    },
  },
];

// =============================================================================
// BUILT-IN EDGE TYPES
// =============================================================================

export const BUILTIN_EDGE_TYPES: BuiltinEdgeTypeDef[] = [
  // ---------------------------------------------------------------------------
  // Generic Relations
  // ---------------------------------------------------------------------------
  {
    name: 'related_to',
    description: 'Generic bidirectional relationship',
    isDirected: false,
  },

  // ---------------------------------------------------------------------------
  // Dependency Relations
  // ---------------------------------------------------------------------------
  {
    name: 'depends_on',
    description: 'Source depends on target',
    inverseName: 'dependency_of',
    schema: {
      type: 'object',
      properties: {
        dependencyType: { type: 'string' }, // runtime, dev, peer, optional
        versionConstraint: { type: 'string' },
      },
    },
  },
  {
    name: 'imports',
    description: 'Source imports/uses target',
    inverseName: 'imported_by',
    sourceConstraints: ['file', 'module', 'function', 'class'],
    targetConstraints: ['file', 'module', 'function', 'class', 'interface'],
  },

  // ---------------------------------------------------------------------------
  // Code Structure Relations
  // ---------------------------------------------------------------------------
  {
    name: 'contains',
    description: 'Source contains target (parent-child)',
    inverseName: 'contained_in',
    schema: {
      type: 'object',
      properties: {
        order: { type: 'number' }, // Position within parent
      },
    },
  },
  {
    name: 'calls',
    description: 'Source calls/invokes target',
    inverseName: 'called_by',
    sourceConstraints: ['function', 'class', 'api_endpoint'],
    targetConstraints: ['function', 'class', 'api_endpoint'],
    schema: {
      type: 'object',
      properties: {
        callCount: { type: 'number' },
        isAsync: { type: 'boolean' },
      },
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

  // ---------------------------------------------------------------------------
  // Hardware/Sensor Relations
  // ---------------------------------------------------------------------------
  {
    name: 'measures',
    description: 'Source sensor measures target metric',
    inverseName: 'measured_by',
    sourceConstraints: ['sensor', 'weather_station'],
  },
  {
    name: 'controls',
    description: 'Source controls/manages target',
    inverseName: 'controlled_by',
  },
  {
    name: 'located_at',
    description: 'Source is located at target location',
    inverseName: 'location_of',
  },

  // ---------------------------------------------------------------------------
  // Architecture/Planning Relations
  // ---------------------------------------------------------------------------
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
  {
    name: 'conflicts_with',
    description: 'Source conflicts with target',
    isDirected: false,
  },

  // ---------------------------------------------------------------------------
  // Task/Workflow Relations
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Temporal Relations
  // ---------------------------------------------------------------------------
  {
    name: 'triggered',
    description: 'Source triggered target event',
    inverseName: 'triggered_by',
    schema: {
      type: 'object',
      properties: {
        timestamp: { type: 'string' },
        trigger: { type: 'string' },
      },
    },
  },
  {
    name: 'follows',
    description: 'Source follows target in sequence',
    inverseName: 'precedes',
  },

  // ---------------------------------------------------------------------------
  // Episode Relations
  // ---------------------------------------------------------------------------
  {
    name: 'episode_contains',
    description: 'Episode contains/groups this entity',
    inverseName: 'within_episode',
    sourceConstraints: ['episode'],
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string' }, // 'created', 'modified', 'referenced', 'triggered'
        addedAt: { type: 'string' },
      },
    },
  },
  {
    name: 'caused_by',
    description: 'Source episode was caused by target episode',
    inverseName: 'caused',
    sourceConstraints: ['episode'],
    targetConstraints: ['episode'],
  },
  {
    name: 'continued_from',
    description: 'Source episode continues work from target episode',
    inverseName: 'continued_by',
    sourceConstraints: ['episode'],
    targetConstraints: ['episode'],
  },
];

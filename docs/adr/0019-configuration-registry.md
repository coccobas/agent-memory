# ADR-0019: Configuration Registry System

## Status

Accepted

## Context

Agent Memory has 100+ configuration options spanning database, caching, embedding, scoring, rate limiting, and more. The original approach used scattered `process.env` reads with inline defaults, leading to:

- No single source of truth for available options
- Inconsistent parsing (some used `parseInt`, others `Number()`)
- No validation (invalid values discovered at runtime)
- Documentation drift (README didn't match actual defaults)
- Difficult to discover available configuration

We needed a system that:

- Declares all options in one place
- Validates configuration at startup
- Provides type-safe access
- Enables auto-generation of documentation
- Supports modular organization

## Decision

Implement a declarative configuration registry where each option declares its environment variable, default value, schema, and parser.

### Registry Structure

```typescript
interface ConfigOptionMeta<T> {
  envKey: string; // AGENT_MEMORY_*
  defaultValue: T; // Fallback if not set
  schema: ZodSchema<T>; // Validation schema
  parser: (value: string) => T; // String → typed value
  description?: string; // For documentation
  secret?: boolean; // Redact in logs
}

// Registry is a nested object matching config shape
const registry = {
  database: {
    type: defineOption({
      envKey: 'AGENT_MEMORY_DB_TYPE',
      defaultValue: 'sqlite',
      schema: z.enum(['sqlite', 'postgresql']),
      parser: (v) => v as 'sqlite' | 'postgresql',
    }),
    // ... more options
  },
  embedding: {
    enabled: defineOption({
      envKey: 'AGENT_MEMORY_EMBEDDING_ENABLED',
      defaultValue: true,
      schema: z.boolean(),
      parser: parseBoolean,
    }),
    // ... more options
  },
};
```

### Modular Sections

Configuration is organized into sections, each in its own file:

```
src/config/registry/
├── index.ts              # Registry assembler
├── types.ts              # ConfigOptionMeta interface
├── parsers.ts            # Reusable parsers
└── sections/
    ├── database.ts       # Database options
    ├── embedding.ts      # Embedding options
    ├── cache.ts          # Cache options
    ├── scoring.ts        # Scoring weights
    ├── rate-limit.ts     # Rate limiting
    ├── extraction.ts     # Entity extraction
    └── ...               # 30+ sections
```

### Standard Parsers

```typescript
// src/config/registry/parsers.ts
export const parseBoolean = (v: string) => v === 'true' || v === '1';
export const parseInt = (v: string) => Number.parseInt(v, 10);
export const parseFloat = (v: string) => Number.parseFloat(v);
export const parsePath = (v: string) => path.resolve(v);
export const parseArray = (v: string) => v.split(',').map((s) => s.trim());
export const parseJson = <T>(v: string) => JSON.parse(v) as T;
```

### Config Loading

```typescript
function loadConfig(): Config {
  const config = {};

  for (const [section, options] of Object.entries(registry)) {
    config[section] = {};
    for (const [key, meta] of Object.entries(options)) {
      const envValue = process.env[meta.envKey];
      const rawValue = envValue ?? meta.defaultValue;
      const parsed = typeof rawValue === 'string' ? meta.parser(rawValue) : rawValue;

      // Validate with Zod
      const result = meta.schema.safeParse(parsed);
      if (!result.success) {
        throw new ConfigError(`Invalid ${meta.envKey}: ${result.error}`);
      }

      config[section][key] = result.data;
    }
  }

  return config as Config;
}
```

### Documentation Generation

The registry enables automatic documentation:

```typescript
function generateEnvDocs(): string {
  let docs = '# Environment Variables\n\n';

  for (const [section, options] of Object.entries(registry)) {
    docs += `## ${section}\n\n`;
    for (const [key, meta] of Object.entries(options)) {
      docs += `### ${meta.envKey}\n`;
      docs += `- Default: \`${meta.defaultValue}\`\n`;
      docs += `- ${meta.description}\n\n`;
    }
  }

  return docs;
}
```

## Consequences

**Positive:**

- Single source of truth for all configuration
- Startup validation catches misconfigurations immediately
- Full TypeScript inference from schemas
- Auto-generated documentation stays in sync
- Easy to add new options (just add to section)
- Secrets can be marked and redacted in logs
- Parsers are reusable and tested

**Negative:**

- Initial setup overhead (defining all options)
- Registry must be updated when adding options (easy to forget)
- Zod dependency for validation
- Slightly more complex than raw `process.env` reads

## References

- Code locations:
  - `src/config/registry/index.ts` - Registry assembler
  - `src/config/registry/sections/` - All section definitions
  - `src/config/registry/parsers.ts` - Standard parsers
  - `src/config/registry/types.ts` - Type definitions
  - `src/config/index.ts` - Config loading and access
- Related ADRs: None
- Principles: P3 (Zero-Config to Start, Deep Config to Scale), S4 (Documentation Lives with Code)

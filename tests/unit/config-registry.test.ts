/**
 * Config Registry Unit Tests
 *
 * Tests for the registry-driven configuration system:
 * - Parser functions (parseBoolean, parseInt_, parseNumber, etc.)
 * - Schema builder (buildConfigSchema, buildSectionSchema)
 * - Config builder (buildConfigFromRegistry)
 * - Environment variable handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';

// Import parsers
import {
  parseBoolean,
  parseNumber,
  parseInt_,
  parsePort,
  parseString,
  expandTilde,
  getDataDir,
  resolveDataPath,
  getEmbeddingProvider,
  getExtractionProvider,
} from '../../src/config/registry/parsers.js';

// Import schema builder
import {
  buildSectionSchema,
  buildConfigSchema,
  validateConfig,
  formatZodErrors,
  getZodTypeString,
  getAllEnvVars,
  buildConfigFromRegistry,
} from '../../src/config/registry/schema-builder.js';

// Import types
import type {
  ConfigRegistry,
  ConfigSectionMeta,
  ConfigOptionMeta,
} from '../../src/config/registry/types.js';

// =============================================================================
// PARSER TESTS
// =============================================================================

describe('config parsers', () => {
  describe('parseBoolean', () => {
    it('should return default for undefined', () => {
      expect(parseBoolean(undefined, true)).toBe(true);
      expect(parseBoolean(undefined, false)).toBe(false);
    });

    it('should return default for empty string', () => {
      expect(parseBoolean('', true)).toBe(true);
      expect(parseBoolean('', false)).toBe(false);
    });

    it('should parse "1" as true', () => {
      expect(parseBoolean('1', false)).toBe(true);
    });

    it('should parse "true" as true (case insensitive)', () => {
      expect(parseBoolean('true', false)).toBe(true);
      expect(parseBoolean('TRUE', false)).toBe(true);
      expect(parseBoolean('True', false)).toBe(true);
    });

    it('should parse other values as false', () => {
      expect(parseBoolean('0', true)).toBe(false);
      expect(parseBoolean('false', true)).toBe(false);
      expect(parseBoolean('no', true)).toBe(false);
      expect(parseBoolean('anything', true)).toBe(false);
    });
  });

  describe('parseNumber', () => {
    it('should return default for undefined', () => {
      expect(parseNumber(undefined, 42.5)).toBe(42.5);
    });

    it('should return default for empty string', () => {
      expect(parseNumber('', 42.5)).toBe(42.5);
    });

    it('should parse valid floating point numbers', () => {
      expect(parseNumber('3.14', 0)).toBe(3.14);
      expect(parseNumber('0.5', 0)).toBe(0.5);
      expect(parseNumber('-1.5', 0)).toBe(-1.5);
    });

    it('should parse integers as numbers', () => {
      expect(parseNumber('42', 0)).toBe(42);
      expect(parseNumber('-10', 0)).toBe(-10);
    });

    it('should return default for invalid numbers', () => {
      expect(parseNumber('not-a-number', 42.5)).toBe(42.5);
      expect(parseNumber('abc123', 42.5)).toBe(42.5);
    });

    it('should handle edge cases', () => {
      expect(parseNumber('0', 42)).toBe(0);
      expect(parseNumber('Infinity', 0)).toBe(Infinity);
      expect(parseNumber('-Infinity', 0)).toBe(-Infinity);
    });
  });

  describe('parseInt_', () => {
    it('should return default for undefined', () => {
      expect(parseInt_(undefined, 42)).toBe(42);
    });

    it('should return default for empty string', () => {
      expect(parseInt_('', 42)).toBe(42);
    });

    it('should parse valid integers', () => {
      expect(parseInt_('10', 0)).toBe(10);
      expect(parseInt_('-5', 0)).toBe(-5);
      expect(parseInt_('0', 42)).toBe(0);
    });

    it('should truncate floating point numbers', () => {
      expect(parseInt_('3.14', 0)).toBe(3);
      expect(parseInt_('9.99', 0)).toBe(9);
    });

    it('should return default for invalid integers', () => {
      expect(parseInt_('not-a-number', 42)).toBe(42);
      expect(parseInt_('abc', 42)).toBe(42);
    });
  });

  describe('parsePort', () => {
    it('should return fallback for undefined/empty', () => {
      expect(parsePort(undefined, 3000)).toBe(3000);
      expect(parsePort('', 3000)).toBe(3000);
    });

    it('should parse valid port numbers', () => {
      expect(parsePort('8080', 3000)).toBe(8080);
      expect(parsePort('443', 3000)).toBe(443);
      expect(parsePort('1', 3000)).toBe(1);
      expect(parsePort('65535', 3000)).toBe(65535);
    });

    it('should return fallback for invalid ports', () => {
      expect(parsePort('0', 3000)).toBe(3000);
      expect(parsePort('-1', 3000)).toBe(3000);
      expect(parsePort('65536', 3000)).toBe(3000);
      expect(parsePort('100000', 3000)).toBe(3000);
    });

    it('should return fallback for non-integer ports', () => {
      expect(parsePort('3.14', 3000)).toBe(3000);
      expect(parsePort('abc', 3000)).toBe(3000);
    });
  });

  describe('parseString', () => {
    it('should return default for undefined', () => {
      expect(parseString(undefined, 'default')).toBe('default');
    });

    it('should return default for empty string', () => {
      expect(parseString('', 'default')).toBe('default');
    });

    it('should lowercase and return value', () => {
      expect(parseString('DEBUG', 'info')).toBe('debug');
      expect(parseString('Info', 'debug')).toBe('info');
    });

    it('should validate against allowed values', () => {
      const allowed = ['debug', 'info', 'warn', 'error'] as const;
      expect(parseString('debug', 'info', allowed)).toBe('debug');
      expect(parseString('invalid', 'info', allowed)).toBe('info');
    });
  });

  describe('expandTilde', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should expand ~ to home directory', () => {
      process.env.HOME = '/home/user';
      expect(expandTilde('~/data')).toBe('/home/user/data');
    });

    it('should expand standalone ~', () => {
      process.env.HOME = '/home/user';
      expect(expandTilde('~')).toBe('/home/user');
    });

    it('should not expand ~ in middle of path', () => {
      process.env.HOME = '/home/user';
      expect(expandTilde('/some/~/path')).toBe('/some/~/path');
    });

    it('should use USERPROFILE if HOME is not set (Windows)', () => {
      delete process.env.HOME;
      process.env.USERPROFILE = 'C:\\Users\\user';
      expect(expandTilde('~/data')).toBe('C:\\Users\\user/data');
    });

    it('should return original path if no home env var', () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      expect(expandTilde('~/data')).toBe('/data');
    });
  });

  describe('getDataDir', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use AGENT_MEMORY_DATA_DIR if set', () => {
      process.env.AGENT_MEMORY_DATA_DIR = '/custom/data';
      expect(getDataDir()).toBe('/custom/data');
    });

    it('should expand tilde in AGENT_MEMORY_DATA_DIR', () => {
      process.env.HOME = '/home/user';
      process.env.AGENT_MEMORY_DATA_DIR = '~/my-data';
      expect(getDataDir()).toBe('/home/user/my-data');
    });

    it('should return default data path when env not set', () => {
      delete process.env.AGENT_MEMORY_DATA_DIR;
      const result = getDataDir();
      expect(result).toContain('data');
    });
  });

  describe('resolveDataPath', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use specific env var if provided', () => {
      const result = resolveDataPath('/specific/path/db.sqlite', 'memory.db');
      expect(result).toBe('/specific/path/db.sqlite');
    });

    it('should expand tilde in specific env var', () => {
      process.env.HOME = '/home/user';
      const result = resolveDataPath('~/db.sqlite', 'memory.db');
      expect(result).toBe('/home/user/db.sqlite');
    });

    it('should resolve relative path using data dir', () => {
      delete process.env.AGENT_MEMORY_DATA_DIR;
      const result = resolveDataPath(undefined, 'memory.db');
      expect(result).toContain('memory.db');
    });
  });

  describe('getEmbeddingProvider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.AGENT_MEMORY_EMBEDDING_PROVIDER;
      delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return "disabled" if explicitly set', () => {
      process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = 'disabled';
      expect(getEmbeddingProvider()).toBe('disabled');
    });

    it('should return "local" if explicitly set', () => {
      process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = 'local';
      expect(getEmbeddingProvider()).toBe('local');
    });

    it('should return "openai" if explicitly set', () => {
      process.env.AGENT_MEMORY_EMBEDDING_PROVIDER = 'openai';
      expect(getEmbeddingProvider()).toBe('openai');
    });

    it('should return "openai" if API key is present (default)', () => {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'sk-test-key';
      expect(getEmbeddingProvider()).toBe('openai');
    });

    it('should return "local" if no API key (default)', () => {
      expect(getEmbeddingProvider()).toBe('local');
    });
  });

  describe('getExtractionProvider', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.AGENT_MEMORY_EXTRACTION_PROVIDER;
      delete process.env.AGENT_MEMORY_OPENAI_API_KEY;
      delete process.env.AGENT_MEMORY_ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return "disabled" if explicitly set', () => {
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'disabled';
      expect(getExtractionProvider()).toBe('disabled');
    });

    it('should return "ollama" if explicitly set', () => {
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'ollama';
      expect(getExtractionProvider()).toBe('ollama');
    });

    it('should return "anthropic" if explicitly set', () => {
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'anthropic';
      expect(getExtractionProvider()).toBe('anthropic');
    });

    it('should return "openai" if explicitly set', () => {
      process.env.AGENT_MEMORY_EXTRACTION_PROVIDER = 'openai';
      expect(getExtractionProvider()).toBe('openai');
    });

    it('should prefer OpenAI key over Anthropic (default)', () => {
      process.env.AGENT_MEMORY_OPENAI_API_KEY = 'sk-test';
      process.env.AGENT_MEMORY_ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(getExtractionProvider()).toBe('openai');
    });

    it('should use Anthropic if only Anthropic key present', () => {
      process.env.AGENT_MEMORY_ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(getExtractionProvider()).toBe('anthropic');
    });

    it('should return "disabled" if no API keys', () => {
      expect(getExtractionProvider()).toBe('disabled');
    });
  });
});

// =============================================================================
// SCHEMA BUILDER TESTS
// =============================================================================

describe('schema builder', () => {
  describe('buildSectionSchema', () => {
    it('should build a Zod object schema from section metadata', () => {
      const section: ConfigSectionMeta = {
        description: 'Test section',
        options: {
          enabled: {
            envKey: 'TEST_ENABLED',
            defaultValue: false,
            description: 'Enable feature',
            schema: z.boolean(),
          },
          count: {
            envKey: 'TEST_COUNT',
            defaultValue: 10,
            description: 'Count value',
            schema: z.number(),
          },
        },
      };

      const schema = buildSectionSchema(section);

      // Valid data should pass
      expect(() => schema.parse({ enabled: true, count: 5 })).not.toThrow();

      // Invalid data should fail
      expect(() => schema.parse({ enabled: 'not-bool', count: 5 })).toThrow();
    });
  });

  describe('buildConfigSchema', () => {
    it('should build complete schema from registry', () => {
      const registry: ConfigRegistry = {
        topLevel: {
          mode: {
            envKey: 'APP_MODE',
            defaultValue: 'development',
            description: 'Application mode',
            schema: z.enum(['development', 'production']),
          },
        },
        sections: {
          database: {
            description: 'Database settings',
            options: {
              path: {
                envKey: 'DB_PATH',
                defaultValue: 'memory.db',
                description: 'Database path',
                schema: z.string(),
              },
            },
          },
        },
      };

      const schema = buildConfigSchema(registry);

      // Valid config
      const validConfig = {
        mode: 'development',
        database: { path: '/data/test.db' },
      };
      expect(() => schema.parse(validConfig)).not.toThrow();
    });
  });

  describe('validateConfig', () => {
    it('should return validated config on success', () => {
      const schema = z.object({
        value: z.number().min(0).max(100),
      });

      const result = validateConfig({ value: 50 }, schema);
      expect(result.value).toBe(50);
    });

    it('should throw on validation failure (strict mode)', () => {
      const schema = z.object({
        value: z.number().min(0).max(100),
      });

      expect(() => validateConfig({ value: 150 }, schema)).toThrow(
        /Configuration validation failed/
      );
    });

    it('should warn but continue in non-strict mode', () => {
      const schema = z.object({
        value: z.number().min(0).max(100),
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = validateConfig({ value: 150 }, schema, { strict: false });
      expect(result.value).toBe(150);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('formatZodErrors', () => {
    it('should format errors with path and message', () => {
      const schema = z.object({
        database: z.object({
          port: z.number().min(1).max(65535),
        }),
      });

      const result = schema.safeParse({ database: { port: 99999 } });
      if (!result.success) {
        const errors = formatZodErrors(result.error);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain('database.port');
      }
    });
  });

  describe('getZodTypeString', () => {
    it('should return "string" for ZodString', () => {
      expect(getZodTypeString(z.string())).toBe('string');
    });

    it('should return "number" for ZodNumber', () => {
      expect(getZodTypeString(z.number())).toBe('number');
    });

    it('should return "boolean" for ZodBoolean', () => {
      expect(getZodTypeString(z.boolean())).toBe('boolean');
    });

    it('should return enum type or values for ZodEnum', () => {
      const result = getZodTypeString(z.enum(['a', 'b', 'c']));
      // Depending on Zod version, may return 'enum' or formatted values
      expect(result === 'enum' || result.includes('a')).toBe(true);
    });

    it('should handle optional types', () => {
      const result = getZodTypeString(z.string().optional());
      expect(result).toContain('optional');
    });
  });

  describe('getAllEnvVars', () => {
    it('should extract all env vars from registry', () => {
      const registry: ConfigRegistry = {
        topLevel: {
          mode: {
            envKey: 'APP_MODE',
            defaultValue: 'dev',
            description: 'Mode',
            schema: z.string(),
          },
        },
        sections: {
          db: {
            description: 'Database',
            options: {
              path: {
                envKey: 'DB_PATH',
                defaultValue: 'data.db',
                description: 'Path',
                schema: z.string(),
              },
              secret: {
                envKey: 'DB_SECRET',
                defaultValue: '',
                description: 'Secret',
                schema: z.string(),
                sensitive: true,
              },
            },
          },
        },
      };

      const envVars = getAllEnvVars(registry);

      expect(envVars).toHaveLength(3);
      expect(envVars.map((e) => e.envKey)).toContain('APP_MODE');
      expect(envVars.map((e) => e.envKey)).toContain('DB_PATH');
      expect(envVars.map((e) => e.envKey)).toContain('DB_SECRET');

      const secretVar = envVars.find((e) => e.envKey === 'DB_SECRET');
      expect(secretVar?.sensitive).toBe(true);
    });
  });
});

// =============================================================================
// CONFIG FROM REGISTRY TESTS
// =============================================================================

describe('buildConfigFromRegistry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should build config with default values', () => {
    const registry: ConfigRegistry = {
      topLevel: {
        debug: {
          envKey: 'TEST_DEBUG',
          defaultValue: false,
          description: 'Debug mode',
          schema: z.boolean(),
          parse: 'boolean',
        },
      },
      sections: {
        server: {
          description: 'Server settings',
          options: {
            port: {
              envKey: 'TEST_PORT',
              defaultValue: 3000,
              description: 'Server port',
              schema: z.number(),
              parse: 'int',
            },
            host: {
              envKey: 'TEST_HOST',
              defaultValue: 'localhost',
              description: 'Server host',
              schema: z.string(),
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);

    expect(config.debug).toBe(false);
    expect((config.server as Record<string, unknown>).port).toBe(3000);
    expect((config.server as Record<string, unknown>).host).toBe('localhost');
  });

  it('should parse env vars with correct types', () => {
    process.env.TEST_DEBUG = 'true';
    process.env.TEST_PORT = '8080';
    process.env.TEST_HOST = 'example.com';

    const registry: ConfigRegistry = {
      topLevel: {
        debug: {
          envKey: 'TEST_DEBUG',
          defaultValue: false,
          description: 'Debug mode',
          schema: z.boolean(),
          parse: 'boolean',
        },
      },
      sections: {
        server: {
          description: 'Server settings',
          options: {
            port: {
              envKey: 'TEST_PORT',
              defaultValue: 3000,
              description: 'Server port',
              schema: z.number(),
              parse: 'int',
            },
            host: {
              envKey: 'TEST_HOST',
              defaultValue: 'localhost',
              description: 'Server host',
              schema: z.string(),
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);

    expect(config.debug).toBe(true);
    expect((config.server as Record<string, unknown>).port).toBe(8080);
    expect((config.server as Record<string, unknown>).host).toBe('example.com');
  });

  it('should use default for invalid env values', () => {
    process.env.TEST_PORT = 'not-a-number';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        server: {
          description: 'Server',
          options: {
            port: {
              envKey: 'TEST_PORT',
              defaultValue: 3000,
              description: 'Port',
              schema: z.number(),
              parse: 'int',
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.server as Record<string, unknown>).port).toBe(3000);
  });

  it('should handle number parser (floating point)', () => {
    process.env.TEST_THRESHOLD = '0.85';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        settings: {
          description: 'Settings',
          options: {
            threshold: {
              envKey: 'TEST_THRESHOLD',
              defaultValue: 0.5,
              description: 'Threshold',
              schema: z.number(),
              parse: 'number',
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.settings as Record<string, unknown>).threshold).toBe(0.85);
  });

  it('should handle port parser with validation', () => {
    process.env.TEST_PORT_VALID = '8080';
    process.env.TEST_PORT_INVALID = '99999';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        ports: {
          description: 'Ports',
          options: {
            valid: {
              envKey: 'TEST_PORT_VALID',
              defaultValue: 3000,
              description: 'Valid port',
              schema: z.number(),
              parse: 'port',
            },
            invalid: {
              envKey: 'TEST_PORT_INVALID',
              defaultValue: 3000,
              description: 'Invalid port',
              schema: z.number(),
              parse: 'port',
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.ports as Record<string, unknown>).valid).toBe(8080);
    expect((config.ports as Record<string, unknown>).invalid).toBe(3000); // Falls back to default
  });

  it('should handle string parser with allowed values', () => {
    process.env.TEST_LEVEL = 'DEBUG';
    process.env.TEST_LEVEL_INVALID = 'INVALID';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        logging: {
          description: 'Logging',
          options: {
            level: {
              envKey: 'TEST_LEVEL',
              defaultValue: 'info' as const,
              description: 'Log level',
              schema: z.enum(['debug', 'info', 'warn', 'error']),
              parse: 'string',
              allowedValues: ['debug', 'info', 'warn', 'error'] as const,
            },
            invalidLevel: {
              envKey: 'TEST_LEVEL_INVALID',
              defaultValue: 'info' as const,
              description: 'Invalid level',
              schema: z.enum(['debug', 'info', 'warn', 'error']),
              parse: 'string',
              allowedValues: ['debug', 'info', 'warn', 'error'] as const,
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.logging as Record<string, unknown>).level).toBe('debug');
    expect((config.logging as Record<string, unknown>).invalidLevel).toBe('info'); // Falls back
  });

  it('should handle custom parser function', () => {
    process.env.TEST_CUSTOM = 'a,b,c';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        custom: {
          description: 'Custom',
          options: {
            list: {
              envKey: 'TEST_CUSTOM',
              defaultValue: [] as string[],
              description: 'List',
              schema: z.array(z.string()),
              parse: (value: string | undefined, defaultValue: string[]) => {
                if (!value) return defaultValue;
                return value.split(',').map((s) => s.trim().toUpperCase());
              },
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.custom as Record<string, unknown>).list).toEqual(['A', 'B', 'C']);
  });

  it('should infer parser from schema type', () => {
    process.env.TEST_BOOL = 'true';
    process.env.TEST_NUM = '42';
    process.env.TEST_STR = 'hello';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        inferred: {
          description: 'Inferred types',
          options: {
            boolVal: {
              envKey: 'TEST_BOOL',
              defaultValue: false,
              description: 'Boolean',
              schema: z.boolean(),
              // No parse specified - should infer from schema
            },
            numVal: {
              envKey: 'TEST_NUM',
              defaultValue: 0,
              description: 'Number',
              schema: z.number(),
              // No parse specified - should infer from schema
            },
            strVal: {
              envKey: 'TEST_STR',
              defaultValue: '',
              description: 'String',
              schema: z.string(),
              // No parse specified - should infer from schema
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    const inferred = config.inferred as Record<string, unknown>;

    expect(inferred.boolVal).toBe(true);
    expect(inferred.numVal).toBe(42);
    expect(inferred.strVal).toBe('hello');
  });

  it('should handle path parser', () => {
    process.env.HOME = '/home/user';
    process.env.TEST_PATH = '~/data/db.sqlite';

    const registry: ConfigRegistry = {
      topLevel: {},
      sections: {
        paths: {
          description: 'Paths',
          options: {
            dbPath: {
              envKey: 'TEST_PATH',
              defaultValue: 'memory.db',
              description: 'Database path',
              schema: z.string(),
              parse: 'path',
            },
          },
        },
      },
    };

    const config = buildConfigFromRegistry(registry);
    expect((config.paths as Record<string, unknown>).dbPath).toBe('/home/user/data/db.sqlite');
  });
});

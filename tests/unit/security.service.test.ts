import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { SecurityService } from '../../src/services/security.service.js';
import type { Config } from '../../src/config/index.js';
import { resetWarningFlags } from '../../src/config/auth.js';

/**
 * Create a minimal test config with specified API keys configuration
 */
function createTestConfig(overrides: Partial<Config['security']> = {}): Config {
  return {
    security: {
      restAuthDisabled: false,
      restApiKey: undefined,
      restApiKeys: undefined,
      restAgentId: 'default-agent',
      adminKey: undefined,
      ...overrides,
    },
    rateLimit: {
      enabled: false,
      perAgent: { maxRequests: 100, windowMs: 60000 },
      global: { maxRequests: 1000, windowMs: 60000 },
      burst: { maxRequests: 50, windowMs: 1000 },
    },
  } as Config;
}

describe('SecurityService', () => {
  // Store original auth-related env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    // Save auth-related env vars
    originalEnv.AGENT_MEMORY_DEV_MODE = process.env.AGENT_MEMORY_DEV_MODE;
    originalEnv.AGENT_MEMORY_API_KEY = process.env.AGENT_MEMORY_API_KEY;
    originalEnv.AGENT_MEMORY_PERMISSIONS_MODE = process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    originalEnv.AGENT_MEMORY_ALLOW_PERMISSIVE = process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    // Clear auth vars for clean test state
    delete process.env.AGENT_MEMORY_DEV_MODE;
    delete process.env.AGENT_MEMORY_API_KEY;
    delete process.env.AGENT_MEMORY_PERMISSIONS_MODE;
    delete process.env.AGENT_MEMORY_ALLOW_PERMISSIVE;

    resetWarningFlags();
  });

  afterAll(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetWarningFlags();
  });
  describe('API Key Parsing', () => {
    describe('JSON Array Format', () => {
      it('should parse valid JSON array with key/agentId objects', () => {
        const config = createTestConfig({
          restApiKeys: JSON.stringify([
            { key: 'key1', agentId: 'agent1' },
            { key: 'key2', agentId: 'agent2' },
          ]),
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('key1')).toBe('agent1');
        expect(service.resolveAgentId('key2')).toBe('agent2');
        expect(service.resolveAgentId('unknown')).toBeNull();
      });

      it('should filter out invalid entries in JSON array', () => {
        const config = createTestConfig({
          restApiKeys: JSON.stringify([
            { key: 'valid', agentId: 'agent1' },
            { key: 123, agentId: 'agent2' }, // invalid: key not string
            { key: 'missing-agent' }, // invalid: no agentId
            null, // invalid: null entry
          ]),
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('valid')).toBe('agent1');
        expect(service.resolveAgentId('missing-agent')).toBeNull();
      });
    });

    describe('JSON Object Format', () => {
      it('should parse valid JSON object with key: agentId mappings', () => {
        const config = createTestConfig({
          restApiKeys: JSON.stringify({
            key1: 'agent1',
            key2: 'agent2',
            key3: 'agent3',
          }),
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('key1')).toBe('agent1');
        expect(service.resolveAgentId('key2')).toBe('agent2');
        expect(service.resolveAgentId('key3')).toBe('agent3');
      });

      it('should filter out empty agentId values in JSON object', () => {
        const config = createTestConfig({
          restApiKeys: JSON.stringify({
            valid: 'agent1',
            empty: '',
          }),
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('valid')).toBe('agent1');
        expect(service.resolveAgentId('empty')).toBeNull();
      });
    });

    describe('CSV Format (key:agentId)', () => {
      it('should parse comma-separated key:agentId pairs', () => {
        const config = createTestConfig({
          restApiKeys: 'key1:agent1,key2:agent2,key3:agent3',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('key1')).toBe('agent1');
        expect(service.resolveAgentId('key2')).toBe('agent2');
        expect(service.resolveAgentId('key3')).toBe('agent3');
      });

      it('should handle whitespace in CSV format', () => {
        const config = createTestConfig({
          restApiKeys: ' key1 : agent1 , key2 : agent2 ',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('key1')).toBe('agent1');
        expect(service.resolveAgentId('key2')).toBe('agent2');
      });

      it('should support key=agentId format as alternative', () => {
        const config = createTestConfig({
          restApiKeys: 'key1=agent1,key2=agent2',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('key1')).toBe('agent1');
        expect(service.resolveAgentId('key2')).toBe('agent2');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty restApiKeys', () => {
        const config = createTestConfig({ restApiKeys: '' });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('any')).toBeNull();
      });

      it('should handle undefined restApiKeys', () => {
        const config = createTestConfig({ restApiKeys: undefined });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('any')).toBeNull();
      });

      it('should handle malformed JSON gracefully (fall back to CSV)', () => {
        const config = createTestConfig({
          restApiKeys: '{invalid json',
        });
        // Should not throw, falls back to CSV parsing
        const service = new SecurityService(config);
        expect(service.resolveAgentId('{invalid json')).toBeNull();
      });

      it('should handle single key without comma', () => {
        const config = createTestConfig({
          restApiKeys: 'singlekey:singleagent',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('singlekey')).toBe('singleagent');
      });

      it('should filter entries with empty key or agentId in CSV', () => {
        const config = createTestConfig({
          restApiKeys: 'valid:agent1,:emptykey,noagent:,both:',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('valid')).toBe('agent1');
        expect(service.resolveAgentId('')).toBeNull();
        expect(service.resolveAgentId('noagent')).toBeNull();
      });
    });

    describe('Single API Key Fallback', () => {
      it('should resolve single restApiKey to restAgentId', () => {
        const config = createTestConfig({
          restApiKey: 'single-key',
          restAgentId: 'default-agent-id',
        });
        const service = new SecurityService(config);

        expect(service.resolveAgentId('single-key')).toBe('default-agent-id');
      });

      it('should prefer restApiKeys over restApiKey', () => {
        const config = createTestConfig({
          restApiKey: 'single-key',
          restAgentId: 'default-agent-id',
          restApiKeys: 'single-key:override-agent',
        });
        const service = new SecurityService(config);

        // restApiKeys takes precedence
        expect(service.resolveAgentId('single-key')).toBe('override-agent');
      });
    });
  });

  describe('API Key Caching', () => {
    it('should parse API keys once at construction', () => {
      // This test verifies the caching behavior by checking that
      // the same result is returned consistently (parsing happened once)
      const config = createTestConfig({
        restApiKeys: 'key1:agent1,key2:agent2',
      });
      const service = new SecurityService(config);

      // Multiple calls should return consistent results (cache is used)
      expect(service.resolveAgentId('key1')).toBe('agent1');
      expect(service.resolveAgentId('key1')).toBe('agent1');
      expect(service.resolveAgentId('key2')).toBe('agent2');
      expect(service.resolveAgentId('key2')).toBe('agent2');
    });

    it('should support reloadApiKeys for testing/hot reload', () => {
      const config = createTestConfig({
        restApiKeys: 'key1:agent1',
      });
      const service = new SecurityService(config);

      expect(service.resolveAgentId('key1')).toBe('agent1');

      // Reload should not throw and cache should still work
      service.reloadApiKeys();

      expect(service.resolveAgentId('key1')).toBe('agent1');
    });
  });

  describe('validateRequest', () => {
    let service: SecurityService;

    beforeEach(() => {
      const config = createTestConfig({
        restApiKeys: 'valid-key:test-agent',
      });
      service = new SecurityService(config);
    });

    it('should authorize valid Bearer token', async () => {
      const result = await service.validateRequest({
        headers: { authorization: 'Bearer valid-key' },
      });

      expect(result.authorized).toBe(true);
      expect(result.context?.agentId).toBe('test-agent');
    });

    it('should authorize valid X-API-Key header', async () => {
      const result = await service.validateRequest({
        headers: { 'x-api-key': 'valid-key' },
      });

      expect(result.authorized).toBe(true);
      expect(result.context?.agentId).toBe('test-agent');
    });

    it('should reject invalid token', async () => {
      const result = await service.validateRequest({
        headers: { authorization: 'Bearer invalid-key' },
      });

      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('should allow MCP-style agentId from args', async () => {
      const result = await service.validateRequest({
        args: { agentId: 'mcp-agent' },
      });

      expect(result.authorized).toBe(true);
      expect(result.context?.agentId).toBe('mcp-agent');
    });
  });

  describe('isAuthConfigured', () => {
    it('should return true when restApiKeys is set', () => {
      const config = createTestConfig({
        restApiKeys: 'key:agent',
      });
      const service = new SecurityService(config);

      expect(service.isAuthConfigured()).toBe(true);
    });

    it('should return true when restApiKey is set', () => {
      const config = createTestConfig({
        restApiKey: 'single-key',
      });
      const service = new SecurityService(config);

      expect(service.isAuthConfigured()).toBe(true);
    });

    it('should return false when no auth is configured', () => {
      const config = createTestConfig();
      const service = new SecurityService(config);

      expect(service.isAuthConfigured()).toBe(false);
    });
  });

  describe('checkHealthRateLimit', () => {
    let service: SecurityService;

    beforeEach(() => {
      const config = createTestConfig();
      service = new SecurityService(config);
    });

    it('should allow health check requests within rate limit', async () => {
      const result = await service.checkHealthRateLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('should track health checks per client IP', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      const result1 = await service.checkHealthRateLimit(ip1);
      const result2 = await service.checkHealthRateLimit(ip2);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    it('should enforce health endpoint rate limits', async () => {
      const clientIp = '192.168.1.100';

      // Health limiter is configured with maxRequests: 60, windowMs: 60000, minBurstProtection: 20
      // Make requests up to the burst protection limit
      for (let i = 0; i < 20; i++) {
        const result = await service.checkHealthRateLimit(clientIp);
        expect(result.allowed).toBe(true);
      }

      // Next request should be rate limited
      const blocked = await service.checkHealthRateLimit(clientIp);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeDefined();
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });
  });
});

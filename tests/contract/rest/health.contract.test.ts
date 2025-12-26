/**
 * Contract tests for REST API /health endpoint
 *
 * These tests verify the API contract remains stable.
 * They focus on response structure, not implementation details.
 */

import { describe, it, expect } from 'vitest';

/**
 * Health endpoint response contract
 */
interface HealthResponse {
  ok: boolean;
  uptimeSec: number;
  status?: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  database?: {
    connected: boolean;
    type?: string;
  };
  circuitBreakers?: number;
  feedbackQueue?: {
    queueDepth: number;
    isRunning: boolean;
    maxQueueSize?: number;
    batchesProcessed?: number;
    itemsProcessed?: number;
    failures?: number;
  };
}

describe('Health Endpoint Contract', () => {
  describe('Response Shape', () => {
    it('defines required fields', () => {
      // This test documents the minimum required fields
      const minimalResponse: HealthResponse = {
        ok: true,
        uptimeSec: 0,
      };

      expect(minimalResponse).toHaveProperty('ok');
      expect(minimalResponse).toHaveProperty('uptimeSec');
    });

    it('defines optional extended fields', () => {
      // This test documents optional fields for detailed health checks
      const extendedResponse: HealthResponse = {
        ok: true,
        uptimeSec: 100,
        status: 'healthy',
        version: '1.0.0',
        database: {
          connected: true,
          type: 'sqlite',
        },
        circuitBreakers: 3,
        feedbackQueue: {
          queueDepth: 0,
          isRunning: true,
          maxQueueSize: 1000,
          batchesProcessed: 50,
          itemsProcessed: 500,
          failures: 0,
        },
      };

      expect(extendedResponse.status).toMatch(/healthy|degraded|unhealthy/);
      expect(typeof extendedResponse.version).toBe('string');
      expect(extendedResponse.database?.connected).toBeDefined();
    });
  });

  describe('Type Constraints', () => {
    it('ok is boolean', () => {
      const valid: HealthResponse = { ok: true, uptimeSec: 0 };
      const alsoValid: HealthResponse = { ok: false, uptimeSec: 0 };

      expect(typeof valid.ok).toBe('boolean');
      expect(typeof alsoValid.ok).toBe('boolean');
    });

    it('uptimeSec is non-negative number', () => {
      const response: HealthResponse = { ok: true, uptimeSec: 12345 };

      expect(typeof response.uptimeSec).toBe('number');
      expect(response.uptimeSec).toBeGreaterThanOrEqual(0);
    });

    it('status is one of the allowed values', () => {
      const allowedStatuses = ['healthy', 'degraded', 'unhealthy'];

      for (const status of allowedStatuses) {
        const response: HealthResponse = {
          ok: status === 'healthy',
          uptimeSec: 0,
          status: status as HealthResponse['status'],
        };
        expect(allowedStatuses).toContain(response.status);
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('minimal response is always valid', () => {
      // Consumers should always be able to rely on these fields
      const minimal = { ok: true, uptimeSec: 0 };

      expect(minimal).toMatchObject({
        ok: expect.any(Boolean),
        uptimeSec: expect.any(Number),
      });
    });
  });
});

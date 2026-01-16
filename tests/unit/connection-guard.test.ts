/**
 * Unit tests for ConnectionGuard
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionGuard } from '../../src/utils/connection-guard.js';

describe('ConnectionGuard', () => {
  let guard: ConnectionGuard;

  beforeEach(() => {
    guard = new ConnectionGuard();
  });

  describe('initial state', () => {
    it('should start disconnected', () => {
      expect(guard.connected).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await guard.connect(async () => {
        // Connection logic
      });

      expect(guard.connected).toBe(true);
    });

    it('should not reconnect if already connected', async () => {
      let callCount = 0;
      const doConnect = async () => {
        callCount++;
      };

      await guard.connect(doConnect);
      await guard.connect(doConnect);
      await guard.connect(doConnect);

      expect(callCount).toBe(1);
      expect(guard.connected).toBe(true);
    });

    it('should handle concurrent connection attempts', async () => {
      let callCount = 0;
      const doConnect = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      };

      // Start multiple concurrent connections
      const promises = [
        guard.connect(doConnect),
        guard.connect(doConnect),
        guard.connect(doConnect),
      ];

      await Promise.all(promises);

      // Only one actual connection should have happened
      expect(callCount).toBe(1);
      expect(guard.connected).toBe(true);
    });

    it('should propagate errors to all waiters', async () => {
      const error = new Error('Connection failed');
      let callCount = 0;

      const doConnect = async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw error;
      };

      const promises = [guard.connect(doConnect), guard.connect(doConnect)];

      await expect(Promise.all(promises)).rejects.toThrow('Connection failed');
      expect(callCount).toBe(1);
      expect(guard.connected).toBe(false);
    });

    it('should allow retry after failed connection', async () => {
      let attempt = 0;

      const doConnect = async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error('First attempt fails');
        }
      };

      // First attempt fails
      await expect(guard.connect(doConnect)).rejects.toThrow('First attempt fails');
      expect(guard.connected).toBe(false);

      // Second attempt succeeds
      await guard.connect(doConnect);
      expect(guard.connected).toBe(true);
    });

    it('should clear promise after successful connection', async () => {
      await guard.connect(async () => {});

      // Verify state is clean for subsequent operations
      expect(guard.connected).toBe(true);
    });

    it('should handle async errors correctly', async () => {
      const doConnect = async () => {
        await Promise.reject(new Error('Async error'));
      };

      await expect(guard.connect(doConnect)).rejects.toThrow('Async error');
      expect(guard.connected).toBe(false);
    });
  });

  describe('setDisconnected', () => {
    it('should set connected to false', async () => {
      await guard.connect(async () => {});
      expect(guard.connected).toBe(true);

      guard.setDisconnected();
      expect(guard.connected).toBe(false);
    });

    it('should allow reconnection after disconnect', async () => {
      let callCount = 0;
      const doConnect = async () => {
        callCount++;
      };

      await guard.connect(doConnect);
      expect(callCount).toBe(1);

      guard.setDisconnected();

      await guard.connect(doConnect);
      expect(callCount).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      await guard.connect(async () => {});
      expect(guard.connected).toBe(true);

      guard.reset();
      expect(guard.connected).toBe(false);
    });

    it('should allow fresh connection after reset', async () => {
      let callCount = 0;
      const doConnect = async () => {
        callCount++;
      };

      await guard.connect(doConnect);
      guard.reset();
      await guard.connect(doConnect);

      expect(callCount).toBe(2);
    });

    it('should clear pending promise on reset', async () => {
      let started = false;
      let completed = false;

      const doConnect = async () => {
        started = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        completed = true;
      };

      // Start connection but don't await
      const promise = guard.connect(doConnect);

      // Wait for connection to start
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(started).toBe(true);

      // Reset during connection
      guard.reset();
      expect(guard.connected).toBe(false);

      // Original promise should still complete
      await promise;
      expect(completed).toBe(true);
    });
  });

  describe('connected getter', () => {
    it('should return current connection state', async () => {
      expect(guard.connected).toBe(false);

      await guard.connect(async () => {});
      expect(guard.connected).toBe(true);

      guard.setDisconnected();
      expect(guard.connected).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty connect function', async () => {
      await guard.connect(async () => {});
      expect(guard.connected).toBe(true);
    });

    it('should handle sync-like async function', async () => {
      await guard.connect(async () => Promise.resolve());
      expect(guard.connected).toBe(true);
    });

    it('should handle very fast connections', async () => {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 100; i++) {
        promises.push(guard.connect(async () => {}));
      }

      await Promise.all(promises);
      expect(guard.connected).toBe(true);
    });
  });
});

/**
 * Tests for server diagnostics utility
 *
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  checkStaleCode,
  getServerDiagnostics,
  type ServerDiagnostics,
  type StaleCodeInfo,
} from '../../src/utils/server-diagnostics.js';

// Mock fs/promises
vi.mock('fs/promises');

describe('Server Diagnostics', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.uptime mock if any
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkStaleCode', () => {
    it('should detect stale code when dist was modified after process start', async () => {
      // Process started 1 hour ago
      const processStartTime = Date.now() - 60 * 60 * 1000;
      // dist/cli.js was modified 30 minutes ago (after process start)
      const distModifiedTime = Date.now() - 30 * 60 * 1000;

      // Mock process.uptime to return 1 hour (3600 seconds)
      vi.spyOn(process, 'uptime').mockReturnValue(3600);

      // Mock fs.stat to return the dist modification time
      mockFs.stat.mockResolvedValue({
        mtime: new Date(distModifiedTime),
      } as fs.Stats);

      const result = await checkStaleCode();

      expect(result.isStale).toBe(true);
      expect(result.processStartedAt).toBeDefined();
      expect(result.distModifiedAt).toBeDefined();
      expect(result.message).toContain('stale');
    });

    it('should NOT detect stale code when process started after dist modification', async () => {
      // dist/cli.js was modified 2 hours ago
      const distModifiedTime = Date.now() - 2 * 60 * 60 * 1000;
      // Process started 1 hour ago (after dist was modified)

      // Mock process.uptime to return 1 hour (3600 seconds)
      vi.spyOn(process, 'uptime').mockReturnValue(3600);

      // Mock fs.stat to return the dist modification time
      mockFs.stat.mockResolvedValue({
        mtime: new Date(distModifiedTime),
      } as fs.Stats);

      const result = await checkStaleCode();

      expect(result.isStale).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it('should handle missing dist/cli.js gracefully', async () => {
      vi.spyOn(process, 'uptime').mockReturnValue(3600);

      mockFs.stat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await checkStaleCode();

      // Should not crash, just return not stale with an error indicator
      expect(result.isStale).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use custom dist path when provided', async () => {
      const customPath = '/custom/path/to/entry.js';
      vi.spyOn(process, 'uptime').mockReturnValue(3600);

      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      } as fs.Stats);

      await checkStaleCode(customPath);

      expect(mockFs.stat).toHaveBeenCalledWith(customPath);
    });

    it('should include time difference in message when stale', async () => {
      // Process started 2 hours ago
      vi.spyOn(process, 'uptime').mockReturnValue(7200);
      // dist modified 1 hour ago
      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 60 * 60 * 1000),
      } as fs.Stats);

      const result = await checkStaleCode();

      expect(result.isStale).toBe(true);
      expect(result.message).toMatch(/1 hour|60 min/i);
    });
  });

  describe('getServerDiagnostics', () => {
    it('should return comprehensive diagnostics object', async () => {
      vi.spyOn(process, 'uptime').mockReturnValue(3600);
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100MB
        heapTotal: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
        rss: 300 * 1024 * 1024,
      });

      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      } as fs.Stats);

      const diagnostics = await getServerDiagnostics();

      expect(diagnostics).toMatchObject({
        processId: expect.any(Number),
        uptimeSeconds: 3600,
        uptimeFormatted: expect.any(String),
        memoryUsageMB: expect.any(Number),
        staleCode: expect.objectContaining({
          isStale: expect.any(Boolean),
        }),
      });
    });

    it('should format uptime as human-readable string', async () => {
      // 2 hours, 30 minutes, 45 seconds
      vi.spyOn(process, 'uptime').mockReturnValue(2 * 3600 + 30 * 60 + 45);

      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      } as fs.Stats);

      const diagnostics = await getServerDiagnostics();

      expect(diagnostics.uptimeFormatted).toMatch(/2h 30m/);
    });
  });

  describe('edge cases', () => {
    it('should handle very short process uptime', async () => {
      // Process just started (1 second ago)
      vi.spyOn(process, 'uptime').mockReturnValue(1);

      mockFs.stat.mockResolvedValue({
        mtime: new Date(Date.now() - 60 * 1000), // dist modified 1 min ago
      } as fs.Stats);

      const result = await checkStaleCode();

      // Even with short uptime, if dist was modified before process start, not stale
      expect(result.isStale).toBe(false);
    });

    it('should handle dist modified at exact same time as process start', async () => {
      const now = Date.now();
      vi.spyOn(process, 'uptime').mockReturnValue(60); // 60 seconds ago

      // dist modified exactly when process started (60 seconds ago)
      mockFs.stat.mockResolvedValue({
        mtime: new Date(now - 60 * 1000),
      } as fs.Stats);

      const result = await checkStaleCode();

      // Same time = not stale (process loaded the current code)
      expect(result.isStale).toBe(false);
    });
  });
});

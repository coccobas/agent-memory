import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

function runWorker(dbPath: string, dataDir: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolvePromise) => {
    const worker = resolve(process.cwd(), 'tests/fixtures/db-init-worker.ts');
    const child = spawn(process.execPath, ['--import', 'tsx', worker, dbPath], {
      env: {
        ...process.env,
        AGENT_MEMORY_DATA_DIR: dataDir,
        AGENT_MEMORY_DB_BUSY_TIMEOUT_MS: '5000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
    });

    child.on('close', (code) => resolvePromise({ code, out }));
  });
}

describe('Database init concurrency', () => {
  it('allows two processes to initialize the same DB concurrently', async () => {
    const baseDir = resolve(process.cwd(), 'data/test', `concurrent-init-${Date.now()}`);
    mkdirSync(baseDir, { recursive: true });
    const dbPath = resolve(baseDir, 'memory.db');

    const [a, b] = await Promise.all([runWorker(dbPath, baseDir), runWorker(dbPath, baseDir)]);

    try {
      expect(a.code, a.out).toBe(0);
      expect(b.code, b.out).toBe(0);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  }, 30000);
});

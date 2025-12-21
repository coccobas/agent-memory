import { copyFile, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function createBackup(filePath: string): Promise<string> {
  const timestamp = Date.now();
  const backupPath = `${filePath}.backup.${timestamp}`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

export async function cleanupBackups(filePath: string, keepCount: number = 3): Promise<void> {
  try {
    const dir = dirname(filePath);
    const baseName = basename(filePath);
    const entries = await readdir(dir);

    const backups = entries
      .filter((entry) => entry.startsWith(`${baseName}.backup.`))
      .map((entry) => {
        const match = entry.match(/\.backup\.(\d+)$/);
        return {
          name: entry,
          timestamp: match && match[1] ? parseInt(match[1], 10) : 0,
          path: join(dir, entry),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    for (let i = keepCount; i < backups.length; i++) {
      const backup = backups[i];
      if (backup) {
        await unlink(backup.path);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

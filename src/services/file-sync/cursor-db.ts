import { readdir, readFile } from 'node:fs/promises';
import { copyFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import Database from 'better-sqlite3';

import { extractContentFromMdc } from './markdown.js';

export function getCursorDatabasePath(): string {
  const homeDir = homedir();

  if (platform() === 'darwin') {
    return join(
      homeDir,
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    );
  }
  if (platform() === 'win32') {
    const appData = process.env.APPDATA || join(homeDir, 'AppData', 'Roaming');
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return join(homeDir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

export async function syncToCursorInternalDatabase(
  rulesDir: string,
  options: { backup?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    const mdcFiles: string[] = [];
    try {
      const entries = await readdir(rulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && extname(entry.name) === '.mdc') {
          mdcFiles.push(join(rulesDir, entry.name));
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Cannot read directory ${rulesDir}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (mdcFiles.length === 0) {
      return {
        success: false,
        message: `No .mdc files found in ${rulesDir}`,
      };
    }

    const dbPath = getCursorDatabasePath();

    if (!existsSync(dbPath)) {
      return {
        success: false,
        message: `Cursor database not found at ${dbPath}. Make sure Cursor is installed.`,
      };
    }

    const rulesContents: string[] = [];
    for (const filePath of mdcFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const extractedContent = extractContentFromMdc(content);
        if (extractedContent) {
          rulesContents.push(extractedContent);
        }
      } catch {
        continue;
      }
    }

    if (rulesContents.length === 0) {
      return {
        success: false,
        message: 'No valid content found in .mdc files',
      };
    }

    const combinedRules = rulesContents.join('\n\n---\n\n');

    if (options.backup) {
      const backupPath = `${dbPath}.backup.${Date.now()}`;
      copyFileSync(dbPath, backupPath);
    }

    const db = new Database(dbPath);

    try {
      db.prepare(
        `INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('aicontext.personalContext', ?)`
      ).run(combinedRules);

      db.close();

      return {
        success: true,
        message: `Successfully updated Cursor user rules with ${rulesContents.length} rule(s). Restart Cursor to see changes.`,
      };
    } catch (dbError) {
      db.close();
      throw dbError;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to update Cursor database: ${errorMsg}. Make sure Cursor is closed.`,
    };
  }
}

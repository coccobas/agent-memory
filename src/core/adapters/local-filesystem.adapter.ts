/**
 * Local FileSystem Adapter Implementation
 *
 * Wraps Node.js fs operations for the IFileSystemAdapter interface.
 * Uses async fs/promises to avoid blocking the event loop.
 */

import { access, readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import type { IFileSystemAdapter, FileStat } from './filesystem.adapter.js';

export class LocalFileSystemAdapter implements IFileSystemAdapter {
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return readFile(path, encoding);
  }

  async readDir(path: string): Promise<string[]> {
    return readdir(path);
  }

  async stat(path: string): Promise<FileStat> {
    const s = await stat(path);
    return {
      isDirectory: () => s.isDirectory(),
      mtime: s.mtime,
      size: s.size,
    };
  }

  async writeFile(
    path: string,
    content: string,
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    await writeFile(path, content, encoding);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await mkdir(path, options);
  }

  resolve(...paths: string[]): string {
    return resolve(...paths);
  }

  join(...paths: string[]): string {
    return join(...paths);
  }

  basename(path: string): string {
    return basename(path);
  }

  dirname(path: string): string {
    return dirname(path);
  }
}

/**
 * Factory function for creating a local filesystem adapter.
 */
export function createLocalFileSystemAdapter(): IFileSystemAdapter {
  return new LocalFileSystemAdapter();
}

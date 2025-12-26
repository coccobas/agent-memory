/**
 * Local FileSystem Adapter Implementation
 *
 * Wraps Node.js fs operations for the IFileSystemAdapter interface.
 * Provides async methods for testability while using sync operations internally
 * (suitable for CLI/server where blocking is acceptable).
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import type { IFileSystemAdapter, FileStat } from './filesystem.adapter.js';

export class LocalFileSystemAdapter implements IFileSystemAdapter {
  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    return readFileSync(path, encoding);
  }

  async readDir(path: string): Promise<string[]> {
    return readdirSync(path);
  }

  async stat(path: string): Promise<FileStat> {
    const s = statSync(path);
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
    writeFileSync(path, content, encoding);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    mkdirSync(path, options);
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

/**
 * FileSystem Adapter Interface
 *
 * Abstracts file system operations for testability and future cloud storage support.
 * Provides async wrappers around Node.js fs operations.
 */

export interface FileStat {
  isDirectory(): boolean;
  mtime?: Date;
  size?: number;
}

/**
 * File system adapter interface for abstracting I/O operations.
 * All methods are async to support both local and remote implementations.
 */
export interface IFileSystemAdapter {
  // Read operations
  exists(path: string): Promise<boolean>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  readDir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;

  // Write operations
  writeFile(path: string, content: string, encoding?: BufferEncoding): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  // Path operations (synchronous - pure string manipulation)
  resolve(...paths: string[]): string;
  join(...paths: string[]): string;
  basename(path: string): string;
  dirname(path: string): string;
}

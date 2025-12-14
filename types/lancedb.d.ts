/**
 * Type declarations for @lancedb/lancedb
 *
 * LanceDB is a vector database for AI applications
 * These types provide compile-time safety for LanceDB operations
 */

declare module '@lancedb/lancedb' {
  /**
   * LanceDB connection interface
   */
  export interface Connection {
    /**
     * Get list of table names in the database
     */
    tableNames(): Promise<string[]>;

    /**
     * Open an existing table
     */
    openTable(name: string): Promise<Table>;

    /**
     * Create a new table with initial data
     */
    createTable(name: string, data: unknown[]): Promise<Table>;
  }

  /**
   * LanceDB table interface
   */
  export interface Table {
    /**
     * Create a vector search query
     */
    search(vector: number[]): Query;

    /**
     * Add records to the table
     */
    add(data: unknown[]): Promise<void>;

    /**
     * Count total rows in the table
     */
    countRows(): Promise<number>;

    /**
     * Delete records matching a filter predicate
     * Uses SQL-like syntax: "field = 'value' AND other_field = 'value'"
     */
    delete(filter: string): Promise<void>;

    /**
     * Get table schema
     */
    schema(): Promise<unknown>;
  }

  /**
   * Vector search query builder
   */
  export interface Query {
    /**
     * Filter results by SQL-like predicate
     */
    filter(expression: string): this;

    /**
     * Limit number of results
     */
    limit(n: number): this;

    /**
     * Set distance metric for search
     */
    metricType(metric: 'l2' | 'cosine' | 'dot'): this;

    /**
     * Execute the query and return results
     */
    toArray(): Promise<unknown[]>;
  }

  /**
   * Connect to a LanceDB database
   * @param path - Path to database directory
   */
  export function connect(path: string): Promise<Connection>;
}

import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for PostgreSQL
 *
 * Usage:
 *   npx drizzle-kit generate --config drizzle.config.pg.ts
 *   npx drizzle-kit migrate --config drizzle.config.pg.ts
 *
 * Environment variables:
 *   AGENT_MEMORY_PG_HOST - PostgreSQL host (default: localhost)
 *   AGENT_MEMORY_PG_PORT - PostgreSQL port (default: 5432)
 *   AGENT_MEMORY_PG_DATABASE - Database name (default: agent_memory)
 *   AGENT_MEMORY_PG_USER - Database user (default: postgres)
 *   AGENT_MEMORY_PG_PASSWORD - Database password
 */
export default defineConfig({
  schema: './src/db/schema/postgresql/index.ts',
  out: './src/db/migrations/postgresql',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.AGENT_MEMORY_PG_HOST || 'localhost',
    port: parseInt(process.env.AGENT_MEMORY_PG_PORT || '5432', 10),
    database: process.env.AGENT_MEMORY_PG_DATABASE || 'agent_memory',
    user: process.env.AGENT_MEMORY_PG_USER || 'postgres',
    password: process.env.AGENT_MEMORY_PG_PASSWORD || '',
  },
  verbose: true,
  strict: true,
});

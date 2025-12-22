import Fastify, { type FastifyInstance } from 'fastify';

import { createComponentLogger } from '../utils/logger.js';
import type { AppContext } from '../core/context.js';
import type { DatabaseDeps } from '../core/types.js';
import type { Repositories } from '../core/interfaces/repositories.js';
import { createAppContext } from '../core/factory.js';
import { buildConfig, config } from '../config/index.js';
import { mapError } from '../utils/error-mapper.js';
import { registerContext, getRuntime } from '../core/container.js';
import { registerV1Routes } from './routes/v1.js';
import { createDependencies } from '../services/query/index.js';
import { SecurityService } from '../services/security.service.js';
import { getDb, getSqlite, getPreparedStatement } from '../db/connection.js';
// Repository factory imports
import {
  createTagRepository,
  createEntryTagRepository,
  createEntryRelationRepository,
} from '../db/repositories/tags.js';
import {
  createOrganizationRepository,
  createProjectRepository,
  createSessionRepository,
} from '../db/repositories/scopes.js';
import { createFileLockRepository } from '../db/repositories/file_locks.js';
import { createGuidelineRepository } from '../db/repositories/guidelines.js';
import { createKnowledgeRepository } from '../db/repositories/knowledge.js';
import { createToolRepository } from '../db/repositories/tools.js';
import { createConversationRepository } from '../db/repositories/conversations.js';

// Extend Fastify request to include authenticated agent ID
declare module 'fastify' {
  interface FastifyRequest {
    agentId?: string;
  }
}

const restLogger = createComponentLogger('restapi');

/**
 * Create a default AppContext from the container.
 * Used when createServer() is called without a context (e.g., in tests).
 * Requires the container to be initialized first via createAppContext().
 */
function createDefaultContext(): AppContext {
  const localConfig = buildConfig();
  const logger = createComponentLogger('app');
  const runtime = getRuntime();
  const queryLogger = createComponentLogger('query-pipeline');
  const queryDeps = createDependencies({
    getDb: () => getDb(),
    getPreparedStatement,
    cache: runtime.queryCache.cache,
    perfLog: localConfig.logging.performance,
    logger: queryLogger,
  });
  const security = new SecurityService(localConfig);

  // Create database dependencies for repository injection
  const db = getDb() as unknown as AppContext['db'];
  const sqlite = getSqlite();
  const dbDeps: DatabaseDeps = { db, sqlite };

  // Create all repositories with injected dependencies
  const tagRepo = createTagRepository(dbDeps);
  const repos: Repositories = {
    tags: tagRepo,
    entryTags: createEntryTagRepository(dbDeps, tagRepo),
    entryRelations: createEntryRelationRepository(dbDeps),
    organizations: createOrganizationRepository(dbDeps),
    projects: createProjectRepository(dbDeps),
    sessions: createSessionRepository(dbDeps),
    fileLocks: createFileLockRepository(dbDeps),
    guidelines: createGuidelineRepository(dbDeps),
    knowledge: createKnowledgeRepository(dbDeps),
    tools: createToolRepository(dbDeps),
    conversations: createConversationRepository(dbDeps),
  };

  return {
    config: localConfig,
    db,
    sqlite,
    logger,
    queryDeps,
    security,
    runtime,
    repos,
  };
}

export function createServer(context?: AppContext): FastifyInstance {
  const effectiveContext = context ?? createDefaultContext();
  const app = Fastify({
    // Fastify v5 expects a config object here; we keep Fastify logging off and rely on our own logger.
    logger: false,
    disableRequestLogging: true,
    bodyLimit: 1024 * 1024, // 1 MiB
    connectionTimeout: 30000, // 30 second connection timeout
    requestTimeout: 60000, // 60 second request timeout to prevent resource exhaustion
  });

  app.addHook('preHandler', async (request, reply) => {
    const url = request.raw.url || request.url;
    if (typeof url === 'string' && url.startsWith('/health')) {
      return;
    }

    // Use centralized Security Service
    // We pass the headers directly. Fastify headers are IncomingHttpHeaders (Record<string, string | string[] | undefined>)
    // which matches our interface.
    const result = effectiveContext.security.validateRequest({
      headers: request.headers
    });

    if (!result.authorized) {
      const code =
        result.statusCode === 429
          ? 'RATE_LIMIT_EXCEEDED'
          : result.statusCode === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'UNAUTHORIZED';
      if (result.retryAfterMs) {
        reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      }
      await reply.status(result.statusCode || 401).send({
        error: result.error,
        retryAfterMs: result.retryAfterMs,
        code,
      });
      return;
    }

    // Attach derived identity for downstream handlers
    if (result.context?.agentId) {
      request.agentId = result.context.agentId;
    }
  });

  app.get('/health', () => {
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  // Register Routes
  registerV1Routes(app, effectiveContext);

  app.setErrorHandler((error, _request, reply) => {
    restLogger.error({ error }, 'REST API request failed');
    
    // Use centralized Error Mapper
    const mapped = mapError(error);
    
    // If it's a server error in production, hide details
    const safeMessage = (mapped.statusCode >= 500 && process.env.NODE_ENV === 'production')
      ? 'Internal Server Error'
      : mapped.message;

    void reply.status(mapped.statusCode).send({ 
      error: safeMessage,
      code: mapped.code,
      details: mapped.details 
    });
  });

  return app;
}

export async function runServer(): Promise<void> {
  if (!config.rest.enabled) {
    restLogger.info('REST API disabled. Set AGENT_MEMORY_REST_ENABLED=true to enable.');
    return;
  }

  const host = config.rest.host;
  const port = config.rest.port;

  // Initialize AppContext
  const context = await createAppContext(config);

  // Register with container for services that use getDb()/getSqlite()
  registerContext(context);

  const app = createServer(context);
  await app.listen({ host, port });
  restLogger.info({ host, port }, 'REST API listening');
}

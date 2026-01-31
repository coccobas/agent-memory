import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { QueryController } from '../controllers/query.controller.js';
import { ContextController } from '../controllers/context.controller.js';
import { registerToolRoutes } from './tools.js';
import { registerJobsSSERoutes } from './jobs-sse.js';
import { generateOpenAPISpec, type OpenAPISpec } from '../openapi/generator.js';

// Cache the OpenAPI spec (generated once on startup)
let cachedSpec: OpenAPISpec | null = null;

export async function registerV1Routes(app: FastifyInstance, context: AppContext) {
  const queryController = new QueryController(context);
  const contextController = new ContextController(context);

  app.post('/v1/query', (req, rep) => queryController.handleQuery(req, rep));
  app.post('/v1/context', (req, rep) => contextController.handleContext(req, rep));

  // OpenAPI specification endpoint with caching
  app.get('/v1/openapi.json', async (_req, reply) => {
    if (!cachedSpec) {
      cachedSpec = generateOpenAPISpec();
    }
    void reply.header('Content-Type', 'application/json');
    return reply.send(cachedSpec);
  });

  await registerToolRoutes(app, context);
  await registerJobsSSERoutes(app);
}

import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { QueryController } from '../controllers/query.controller.js';
import { ContextController } from '../controllers/context.controller.js';

export async function registerV1Routes(app: FastifyInstance, context: AppContext) {
  const queryController = new QueryController(context);
  const contextController = new ContextController(context);

  app.post('/v1/query', (req, rep) => queryController.handleQuery(req, rep));
  app.post('/v1/context', (req, rep) => contextController.handleContext(req, rep));
}

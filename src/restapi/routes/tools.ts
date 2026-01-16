import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { ToolsController } from '../controllers/tools.controller.js';
import { validateToolRequest } from '../middleware/tool-validator.js';

/**
 * Register tool execution routes
 *
 * Routes:
 * - GET /v1/tools - List all available MCP tools
 * - POST /v1/tools/:tool - Execute a tool by name
 */
export async function registerToolRoutes(app: FastifyInstance, context: AppContext) {
  const toolsController = new ToolsController(context);

  // List all available tools
  app.get('/v1/tools', (req, rep) => toolsController.listTools(req, rep));

  // Execute a tool by name with validation
  app.post('/v1/tools/:tool', {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Fastify preHandler supports async functions
    preHandler: validateToolRequest,
    handler: (req, rep) => toolsController.executeTool(req, rep),
  });
}

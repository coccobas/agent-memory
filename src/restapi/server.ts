import Fastify, { type FastifyInstance } from 'fastify';

import { createComponentLogger } from '../utils/logger.js';
import { executeMemoryQuery, executeMemoryQueryAsync } from '../services/query.service.js';
import { logAction } from '../services/audit.service.js';
import { autoLinkContextFromQuery } from '../services/conversation.service.js';
import { formatTimestamps } from '../utils/timestamp-formatter.js';
import {
  getOptionalParam,
  getRequiredParam,
  isArray,
  isBoolean,
  isEntryType,
  isNumber,
  isObject,
  isRelationType,
  isScopeType,
  isString,
} from '../utils/type-guards.js';

const restLogger = createComponentLogger('restapi');

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65536) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

export function createServer(): FastifyInstance {
  const app = Fastify({
    // Fastify v5 expects a config object here; we keep Fastify logging off and rely on our own logger.
    logger: false,
    disableRequestLogging: true,
  });

  app.get('/health', async () => {
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  app.post('/v1/query', async (request, reply) => {
    const body = request.body as unknown;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    const agentId = getOptionalParam(body, 'agentId', isString);
    const conversationId = getOptionalParam(body, 'conversationId', isString);
    const messageId = getOptionalParam(body, 'messageId', isString);
    const autoLinkContext = getOptionalParam(body, 'autoLinkContext', isBoolean);

    function isValidScope(
      v: unknown
    ): v is { type: 'global' | 'org' | 'project' | 'session'; id?: string; inherit?: boolean } {
      if (!isObject(v)) return false;
      const obj = v;
      return (
        isScopeType(obj.type) &&
        (obj.id === undefined || isString(obj.id)) &&
        (obj.inherit === undefined || isBoolean(obj.inherit))
      );
    }

    function isTraversalDirection(v: unknown): v is 'forward' | 'backward' | 'both' {
      return v === 'forward' || v === 'backward' || v === 'both';
    }

    const queryParamsWithoutAgent = {
      types: getOptionalParam(body, 'types', isArray) as
        | Array<'tools' | 'guidelines' | 'knowledge'>
        | undefined,
      scope: getOptionalParam(body, 'scope', isValidScope),
      search: getOptionalParam(body, 'search', isString),
      tags: getOptionalParam(body, 'tags', isObject),
      relatedTo: (() => {
        const relatedToParam = getOptionalParam(body, 'relatedTo', isObject);
        if (!relatedToParam) return undefined;
        const type = getOptionalParam(relatedToParam, 'type', isEntryType);
        const id = getOptionalParam(relatedToParam, 'id', isString);
        const relation = getOptionalParam(relatedToParam, 'relation', isRelationType);
        const depth = getOptionalParam(relatedToParam, 'depth', isNumber);
        const direction = getOptionalParam(relatedToParam, 'direction', isTraversalDirection);
        const maxResults = getOptionalParam(relatedToParam, 'maxResults', isNumber);
        if (type && id) {
          return { type, id, relation, depth, direction, maxResults };
        }
        return undefined;
      })(),
      followRelations: getOptionalParam(body, 'followRelations', isBoolean),
      limit: getOptionalParam(body, 'limit', isNumber),
      compact: getOptionalParam(body, 'compact', isBoolean),
      semanticSearch: getOptionalParam(body, 'semanticSearch', isBoolean),
      semanticThreshold: getOptionalParam(body, 'semanticThreshold', isNumber),
    };

    const useAsync =
      queryParamsWithoutAgent.semanticSearch !== false && queryParamsWithoutAgent.search;

    const result = useAsync
      ? await executeMemoryQueryAsync(queryParamsWithoutAgent)
      : executeMemoryQuery(queryParamsWithoutAgent);

    if (conversationId && autoLinkContext !== false) {
      try {
        autoLinkContextFromQuery(conversationId, messageId, result);
      } catch {
        // ignore auto-link errors
      }
    }

    logAction({
      agentId,
      action: 'query',
      queryParams: queryParamsWithoutAgent,
      resultCount: result.results.length,
    });

    return formatTimestamps({
      results: result.results,
      meta: result.meta,
    });
  });

  app.post('/v1/context', async (request, reply) => {
    const body = request.body as unknown;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    const scopeType = getRequiredParam(body, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(body, 'scopeId', isString);
    const inherit = getOptionalParam(body, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(body, 'compact', isBoolean) ?? false;
    const limitPerType = getOptionalParam(body, 'limitPerType', isNumber);

    const result = executeMemoryQuery({
      types: ['tools', 'guidelines', 'knowledge'],
      scope: {
        type: scopeType,
        id: scopeId,
        inherit,
      },
      compact,
      limit: limitPerType,
    });

    const tools = result.results.filter((r) => r.type === 'tool');
    const guidelines = result.results.filter((r) => r.type === 'guideline');
    const knowledge = result.results.filter((r) => r.type === 'knowledge');

    return formatTimestamps({
      scope: {
        type: scopeType,
        id: scopeId ?? null,
      },
      tools,
      guidelines,
      knowledge,
      meta: result.meta,
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    restLogger.error({ error }, 'REST API request failed');
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? ((error as { statusCode: number }).statusCode as number)
        : undefined;
    const isBadRequest =
      message.includes('is required') ||
      message.includes('invalid type') ||
      message.includes('Request body must be an object');

    const status =
      statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : isBadRequest ? 400 : 500;

    void reply.status(status).send({ error: message });
  });

  return app;
}

export async function runServer(): Promise<void> {
  const host = process.env.AGENT_MEMORY_REST_HOST || '127.0.0.1';
  const port = parsePort(process.env.AGENT_MEMORY_REST_PORT, 8787);

  const app = createServer();
  await app.listen({ host, port });
  restLogger.info({ host, port }, 'REST API listening');
}

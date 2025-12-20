import Fastify, { type FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

import { createComponentLogger } from '../utils/logger.js';
import { executeMemoryQuery, executeMemoryQueryAsync } from '../services/query.service.js';
import { logAction } from '../services/audit.service.js';
import { autoLinkContextFromQuery } from '../services/conversation.service.js';
import { formatTimestamps } from '../utils/timestamp-formatter.js';
import { checkPermission } from '../services/permission.service.js';
import { checkRateLimits } from '../utils/rate-limiter.js';
import type { EntryType } from '../db/schema.js';
import {
  getOptionalParam,
  getRequiredParam,
  isArrayOfStrings,
  isBoolean,
  isEntryType,
  isNumber,
  isObject,
  isRelationType,
  isScopeType,
  isString,
} from '../utils/type-guards.js';

const restLogger = createComponentLogger('restapi');

const queryTypeToEntryType: Record<'tools' | 'guidelines' | 'knowledge', EntryType> = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
};

type RestAuthMapping = { key: string; agentId: string };

function isQueryType(value: unknown): value is 'tools' | 'guidelines' | 'knowledge' {
  return value === 'tools' || value === 'guidelines' || value === 'knowledge';
}

function isQueryTypesArray(value: unknown): value is Array<'tools' | 'guidelines' | 'knowledge'> {
  return isArrayOfStrings(value) && value.every(isQueryType);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed >= 65536) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseApiKeyMappings(): RestAuthMapping[] {
  const raw = process.env.AGENT_MEMORY_REST_API_KEYS;
  if (!raw) return [];

  // Prefer JSON for clarity:
  // - [{"key":"...","agentId":"agent-1"}]
  // - {"key1":"agent-1","key2":"agent-2"}
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const mappings: RestAuthMapping[] = [];
      for (const item of parsed) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as { key?: unknown }).key === 'string' &&
          typeof (item as { agentId?: unknown }).agentId === 'string'
        ) {
          mappings.push({ key: (item as { key: string }).key, agentId: (item as { agentId: string }).agentId });
        }
      }
      return mappings;
    }
    if (parsed && typeof parsed === 'object') {
      const mappings: RestAuthMapping[] = [];
      for (const [key, agentId] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof agentId === 'string' && agentId.length > 0) {
          mappings.push({ key, agentId });
        }
      }
      return mappings;
    }
  } catch {
    // fall through to simple parsing
  }

  // Fallback: comma-separated list of "key:agentId" or "key=agentId"
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const sep = p.includes('=') ? '=' : ':';
      const [key, agentId] = p.split(sep);
      return { key: (key ?? '').trim(), agentId: (agentId ?? '').trim() };
    })
    .filter((m) => m.key.length > 0 && m.agentId.length > 0);
}

function resolveAgentIdFromToken(token: string): string | null {
  const mappings = parseApiKeyMappings();
  if (mappings.length > 0) {
    for (const m of mappings) {
      if (safeEqual(token, m.key)) return m.agentId;
    }
    return null;
  }

  const singleKey = process.env.AGENT_MEMORY_REST_API_KEY;
  if (!singleKey) return null;
  if (!safeEqual(token, singleKey)) return null;

  // Bind identity to the credential. If not configured, default to a fixed service identity.
  return process.env.AGENT_MEMORY_REST_AGENT_ID || 'rest-api';
}

function isRestAuthConfigured(): boolean {
  return Boolean(
    (process.env.AGENT_MEMORY_REST_API_KEYS && process.env.AGENT_MEMORY_REST_API_KEYS.length > 0) ||
      (process.env.AGENT_MEMORY_REST_API_KEY && process.env.AGENT_MEMORY_REST_API_KEY.length > 0)
  );
}

export function createServer(): FastifyInstance {
  const app = Fastify({
    // Fastify v5 expects a config object here; we keep Fastify logging off and rely on our own logger.
    logger: false,
    disableRequestLogging: true,
    bodyLimit: 1024 * 1024, // 1 MiB
    connectionTimeout: 30000, // 30 second connection timeout
    requestTimeout: 60000, // 60 second request timeout to prevent resource exhaustion
  });

  app.addHook('preHandler', async (request, reply) => {
    const authDisabled = process.env.AGENT_MEMORY_REST_AUTH_DISABLED === 'true';
    const url = request.raw.url || request.url;
    if ((typeof url === 'string' && url.startsWith('/health')) || authDisabled) {
      return;
    }

    if (!isRestAuthConfigured()) {
      restLogger.error('REST auth not configured. Set AGENT_MEMORY_REST_API_KEY or AGENT_MEMORY_REST_API_KEYS.');
      await reply.status(503).send({ error: 'REST auth not configured' });
      return;
    }

    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers['x-api-key'];
    const bearerPrefix = 'Bearer ';
    const token =
      typeof authHeader === 'string' && authHeader.startsWith(bearerPrefix)
        ? authHeader.slice(bearerPrefix.length)
        : typeof apiKeyHeader === 'string'
          ? apiKeyHeader
          : undefined;

    if (!token) {
      await reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const agentId = resolveAgentIdFromToken(token);
    if (!agentId) {
      await reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    // Rate limiting (global + per-agent)
    const rateLimitResult = checkRateLimits(agentId);
    if (!rateLimitResult.allowed) {
      if (rateLimitResult.retryAfterMs !== undefined) {
        reply.header('Retry-After', String(Math.ceil(rateLimitResult.retryAfterMs / 1000)));
      }
      await reply.status(429).send({
        error: rateLimitResult.reason ?? 'Rate limit exceeded',
        retryAfterMs: rateLimitResult.retryAfterMs,
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    // Attach derived identity for downstream handlers (do not trust body-supplied agentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (request as any).agentId = agentId;
  });

  app.get('/health', () => {
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
    };
  });

  app.post('/v1/query', async (request, reply) => {
    const body = request.body;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentId = (request as any).agentId as string | undefined;
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

    const requestedTypes = getOptionalParam(body, 'types', isQueryTypesArray);
    const scope = getOptionalParam(body, 'scope', isValidScope);

    const queryParamsWithoutAgent = {
      types: requestedTypes,
      scope,
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

    if (!agentId) return reply.status(401).send({ error: 'Unauthorized' });

    const scopeType = scope?.type ?? 'global';
    const scopeId = scope?.id;
    const typesToCheck = requestedTypes ?? ['tools', 'guidelines', 'knowledge'];
    const deniedTypes = typesToCheck.filter(
      (type) =>
        !checkPermission(agentId, 'read', queryTypeToEntryType[type], null, scopeType, scopeId)
    );

    if (requestedTypes && deniedTypes.length > 0) {
      return reply
        .status(403)
        .send({ error: `Permission denied for types: ${deniedTypes.join(', ')}` });
    }

    const allowedTypes = typesToCheck.filter((type) => !deniedTypes.includes(type));
    if (!requestedTypes) {
      if (allowedTypes.length === 0) {
        return reply.status(403).send({ error: 'Permission denied' });
      }
      queryParamsWithoutAgent.types = allowedTypes;
    }

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
    const body = request.body;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    const scopeType = getRequiredParam(body, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(body, 'scopeId', isString);
    const inherit = getOptionalParam(body, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(body, 'compact', isBoolean) ?? false;
    const limitPerType = getOptionalParam(body, 'limitPerType', isNumber);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentId = (request as any).agentId as string | undefined;
    if (!agentId) return reply.status(401).send({ error: 'Unauthorized' });

    const allowedTypes = (['tools', 'guidelines', 'knowledge'] as const).filter((type) =>
      checkPermission(agentId, 'read', queryTypeToEntryType[type], null, scopeType, scopeId)
    );

    if (allowedTypes.length === 0) {
      return reply.status(403).send({ error: 'Permission denied' });
    }

    const result = executeMemoryQuery({
      types: allowedTypes,
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
        ? (error as { statusCode: number }).statusCode
        : undefined;
    const isBadRequest =
      message.includes('is required') ||
      message.includes('invalid type') ||
      message.includes('Request body must be an object');

    const status =
      statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : isBadRequest ? 400 : 500;

    const safeMessage =
      status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message;
    void reply.status(status).send({ error: safeMessage });
  });

  return app;
}

export async function runServer(): Promise<void> {
  const restEnabled = process.env.AGENT_MEMORY_REST_ENABLED === 'true';
  if (!restEnabled) {
    restLogger.info('REST API disabled. Set AGENT_MEMORY_REST_ENABLED=true to enable.');
    return;
  }

  const host = process.env.AGENT_MEMORY_REST_HOST || '127.0.0.1';
  const port = parsePort(process.env.AGENT_MEMORY_REST_PORT, 8787);

  const app = createServer();
  await app.listen({ host, port });
  restLogger.info({ host, port }, 'REST API listening');
}

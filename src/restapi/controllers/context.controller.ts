import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { executeQueryPipeline } from '../../services/query/index.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import {
  getOptionalParam,
  getRequiredParam,
  isBoolean,
  isNumber,
  isObject,
  isScopeType,
  isString,
} from '../../utils/type-guards.js';
import type { EntryType } from '../../db/schema.js';

const queryTypeToEntryType: Record<'tools' | 'guidelines' | 'knowledge', EntryType> = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
};

export class ContextController {
  constructor(private context: AppContext) {}

  async handleContext(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    const scopeType = getRequiredParam(body, 'scopeType', isScopeType);
    const scopeId = getOptionalParam(body, 'scopeId', isString);
    const inherit = getOptionalParam(body, 'inherit', isBoolean) ?? true;
    const compact = getOptionalParam(body, 'compact', isBoolean) ?? false;
    const limitPerType = getOptionalParam(body, 'limitPerType', isNumber);

    const agentId = request.agentId;
    if (!agentId) return reply.status(401).send({ error: 'Unauthorized' });

    const allowedTypes = (['tools', 'guidelines', 'knowledge'] as const).filter((type) =>
      this.context.services!.permission.check(
        agentId,
        'read',
        queryTypeToEntryType[type],
        null,
        scopeType,
        scopeId
      )
    );

    if (allowedTypes.length === 0) {
      return reply.status(403).send({ error: 'Permission denied' });
    }

    // Execute query using the modular pipeline
    const queryParams = {
      types: allowedTypes,
      scope: {
        type: scopeType,
        id: scopeId,
        inherit,
      },
      compact,
      limit: limitPerType,
    };

    const result = await executeQueryPipeline(queryParams, this.context.queryDeps);

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
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { executeQueryPipeline } from '../../services/query/index.js';
import { logAction } from '../../services/audit.service.js';
import { createConversationService } from '../../services/conversation.service.js';
import { formatTimestamps } from '../../utils/timestamp-formatter.js';
import { parseQueryBody, type QueryType } from '../query-params.js';
import { isObject } from '../../utils/type-guards.js';
import type { EntryType } from '../../db/schema.js';

const queryTypeToEntryType: Record<'tools' | 'guidelines' | 'knowledge', EntryType> = {
  tools: 'tool',
  guidelines: 'guideline',
  knowledge: 'knowledge',
};

export class QueryController {
  constructor(private context: AppContext) {}

  async handleQuery(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body;
    if (!isObject(body)) {
      return reply.status(400).send({ error: 'Request body must be an object' });
    }

    const agentId = request.agentId;
    // Auth check is handled by security service pre-handler, but double check identity presence
    if (!agentId) return reply.status(401).send({ error: 'Unauthorized' });

    const {
      conversationId,
      messageId,
      autoLinkContext,
      requestedTypes,
      scope,
      queryParamsWithoutAgent,
    } = parseQueryBody(body);

    const scopeType = scope?.type ?? 'global';
    const scopeId = scope?.id;
    const typesToCheck: QueryType[] = requestedTypes ?? ['tools', 'guidelines', 'knowledge'];

    // Permission Check
    const deniedTypes = typesToCheck.filter(
      (type) =>
        !this.context.services!.permission.check(
          agentId,
          'read',
          queryTypeToEntryType[type],
          null,
          scopeType,
          scopeId
        )
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

    // Execute query using the modular pipeline
    const result = await executeQueryPipeline(queryParamsWithoutAgent, this.context.queryDeps);

    if (conversationId && autoLinkContext !== false) {
      try {
        const conversationService = createConversationService(this.context.repos.conversations);
        conversationService.autoLinkContextFromQuery(conversationId, messageId, result);
      } catch {
        // ignore auto-link errors
      }
    }

    logAction(
      {
        agentId,
        action: 'query',
        queryParams: queryParamsWithoutAgent,
        resultCount: result.results.length,
      },
      this.context.db
    );

    return formatTimestamps({
      results: result.results,
      meta: result.meta,
    });
  }
}

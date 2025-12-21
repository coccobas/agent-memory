import {
  getOptionalParam,
  isArrayOfStrings,
  isBoolean,
  isEntryType,
  isNumber,
  isObject,
  isRelationType,
  isScopeType,
  isString,
} from '../utils/type-guards.js';
import type { EntryType, RelationType } from '../db/schema.js';

export type QueryType = 'tools' | 'guidelines' | 'knowledge';

function isQueryType(value: unknown): value is QueryType {
  return value === 'tools' || value === 'guidelines' || value === 'knowledge';
}

function isQueryTypesArray(value: unknown): value is QueryType[] {
  return isArrayOfStrings(value) && value.every(isQueryType);
}

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

export function parseQueryBody(body: Record<string, unknown>): {
  conversationId?: string;
  messageId?: string;
  autoLinkContext?: boolean;
  requestedTypes?: QueryType[];
  scope?: { type: 'global' | 'org' | 'project' | 'session'; id?: string; inherit?: boolean };
  queryParamsWithoutAgent: {
    types?: QueryType[];
    scope?: { type: 'global' | 'org' | 'project' | 'session'; id?: string; inherit?: boolean };
    search?: string;
    tags?: Record<string, unknown>;
    relatedTo?: {
      type: EntryType;
      id: string;
      relation?: RelationType;
      depth?: number;
      direction?: 'forward' | 'backward' | 'both';
      maxResults?: number;
    };
    followRelations?: boolean;
    limit?: number;
    compact?: boolean;
    semanticSearch?: boolean;
    semanticThreshold?: number;
  };
} {
  const conversationId = getOptionalParam(body, 'conversationId', isString);
  const messageId = getOptionalParam(body, 'messageId', isString);
  const autoLinkContext = getOptionalParam(body, 'autoLinkContext', isBoolean);

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

  return {
    conversationId,
    messageId,
    autoLinkContext,
    requestedTypes,
    scope,
    queryParamsWithoutAgent,
  };
}

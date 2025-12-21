import { timingSafeEqual } from 'node:crypto';

type RestAuthMapping = { key: string; agentId: string };

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
          mappings.push({
            key: (item as { key: string }).key,
            agentId: (item as { agentId: string }).agentId,
          });
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

export function resolveAgentIdFromToken(token: string): string | null {
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

export function isRestAuthConfigured(): boolean {
  return Boolean(
    (process.env.AGENT_MEMORY_REST_API_KEYS && process.env.AGENT_MEMORY_REST_API_KEYS.length > 0) ||
      (process.env.AGENT_MEMORY_REST_API_KEY && process.env.AGENT_MEMORY_REST_API_KEY.length > 0)
  );
}


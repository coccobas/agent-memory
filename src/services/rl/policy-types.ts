export const POLICY_TYPES = ['extraction', 'retrieval', 'consolidation'] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

export function isPolicyType(value: unknown): value is PolicyType {
  return typeof value === 'string' && POLICY_TYPES.includes(value as PolicyType);
}

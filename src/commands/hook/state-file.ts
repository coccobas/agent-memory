import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function getAgentMemoryStatePath(baseDir = process.cwd()): string {
  return resolve(baseDir, '.claude', 'hooks', '.agent-memory-state.json');
}

export function loadState(statePath: string): Record<string, unknown> {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveState(statePath: string, state: Record<string, unknown>): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const existing = loadState(statePath);
  const merged = { ...existing, ...state };
  writeFileSync(statePath, JSON.stringify(merged, null, 2));
}

export function setReviewSuspended(sessionId: string, suspended: boolean): void {
  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);
  state[`review:suspended:${sessionId}`] = suspended;
  saveState(statePath, state);
}

export function isReviewSuspended(sessionId: string): boolean {
  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);
  return state[`review:suspended:${sessionId}`] === true;
}

export function hasWarnedReview(sessionId: string): boolean {
  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);
  return state[`review:warned:${sessionId}`] === true;
}

export function setWarnedReview(sessionId: string): void {
  const statePath = getAgentMemoryStatePath();
  const state = loadState(statePath);
  state[`review:warned:${sessionId}`] = true;
  saveState(statePath, state);
}


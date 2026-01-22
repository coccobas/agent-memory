import type { WhatHappenedResult } from '../services/episode/index.js';
import type { QuickstartDisplayData } from './terminal-formatter.js';

/**
 * Build a resume summary from the whatHappened result.
 */
export function buildResumeSummary(
  summary: WhatHappenedResult
): NonNullable<QuickstartDisplayData['resumeSummary']> {
  const episode = summary.episode;

  // Calculate duration if episode has started
  let duration: string | undefined;
  if (episode.startedAt) {
    const startTime = new Date(episode.startedAt).getTime();
    const now = Date.now();
    const durationMs = now - startTime;
    duration = formatDuration(durationMs);
  }

  // Transform timeline events to key events
  const keyEvents: Array<{
    type: 'checkpoint' | 'decision' | 'error' | 'started' | 'completed';
    message: string;
    timestamp?: string;
  }> = [];

  for (const entry of summary.timeline) {
    if (entry.type === 'episode_start') {
      keyEvents.push({
        type: 'started',
        message: entry.description ?? `Started: ${entry.name}`,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === 'event') {
      // Map event types to our display types
      const eventType = mapEventType(entry.name);
      keyEvents.push({
        type: eventType,
        message: entry.description ?? entry.name,
        timestamp: entry.timestamp,
      });
    } else if (entry.type === 'episode_end') {
      keyEvents.push({
        type: 'completed',
        message: entry.description ?? `Completed: ${entry.name}`,
        timestamp: entry.timestamp,
      });
    }
  }

  // Transform linked entities
  const linkedEntities: Array<{
    type: 'guideline' | 'knowledge' | 'tool' | 'experience';
    title: string;
  }> = [];

  for (const entity of summary.linkedEntities) {
    const entityType = entity.entryType as 'guideline' | 'knowledge' | 'tool' | 'experience';
    if (['guideline', 'knowledge', 'tool', 'experience'].includes(entityType)) {
      linkedEntities.push({
        type: entityType,
        title: entity.role ? `${entity.role}: ${entity.entryId}` : entity.entryId,
      });
    }
  }

  // Build status from episode outcome (if available) or recent events
  let status:
    | {
        issue?: string;
        rootCause?: string;
        findings?: string[];
      }
    | undefined;

  // Look for structured status in episode metadata or events
  const decisionEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('decision')
  );
  const checkpointEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('checkpoint')
  );
  const errorEvents = summary.timeline.filter(
    (e) => e.type === 'event' && e.name?.toLowerCase().includes('error')
  );

  // Extract findings from checkpoint/decision events
  const findings = [
    ...checkpointEvents.slice(-3).map((e) => e.description ?? e.name),
    ...decisionEvents.slice(-2).map((e) => e.description ?? e.name),
  ].filter(Boolean);

  // Extract issue from error events
  const issue = errorEvents.length > 0 ? errorEvents[0]?.description : undefined;

  if (findings.length > 0 || issue) {
    status = {
      issue,
      findings: findings.length > 0 ? findings : undefined,
    };
  }

  return {
    episodeName: episode.name,
    duration,
    keyEvents,
    linkedEntities: linkedEntities.length > 0 ? linkedEntities : undefined,
    status,
  };
}

/**
 * Map event name to display type.
 */
function mapEventType(
  eventName: string
): 'checkpoint' | 'decision' | 'error' | 'started' | 'completed' {
  const lower = eventName.toLowerCase();
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  if (lower.includes('decision') || lower.includes('chose') || lower.includes('decided')) {
    return 'decision';
  }
  if (lower.includes('start') || lower.includes('begin')) return 'started';
  if (lower.includes('complete') || lower.includes('done') || lower.includes('finish')) {
    return 'completed';
  }
  return 'checkpoint';
}

/**
 * Format duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

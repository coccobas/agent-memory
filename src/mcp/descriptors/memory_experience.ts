/**
 * memory_experience tool descriptor
 *
 * Manages experiential memory - learned patterns from past interactions.
 * Experiences operate at two abstraction levels:
 * - Case: Concrete examples with full trajectories
 * - Strategy: Abstracted patterns and insights
 *
 * Promoting to 'skill' creates a linked memory_tool entry.
 */

import type { ToolDescriptor } from './types.js';
import { experienceHandlers } from '../handlers/experiences.handler.js';

export const memoryExperienceDescriptor: ToolDescriptor = {
  name: 'memory_experience',
  visibility: 'advanced',
  description: `Manage experiential memory - learned patterns from past interactions.

Actions: add, update, get, list, history, deactivate, delete, bulk_add, bulk_update, bulk_delete, promote, record_outcome, add_step, get_trajectory, record_case, capture_from_transcript, learn

Experience Levels:
- case: Concrete examples with full trajectories (default)
- strategy: Abstracted patterns and insights
- skill: Promotes to memory_tool entry (via promote action)

**Quick Start (recommended):**
\`\`\`
{"action":"learn","text":"Fixed API timeouts by increasing the timeout config"}
\`\`\`
The learn action parses natural language and auto-extracts title, scenario, and outcome.

Workflow:
1. Record a case after solving a problem: {"action":"add","title":"Fixed auth bug","content":"Discovered token expiry issue...","scenario":"Build was failing","outcome":"success","steps":[{"action":"Read error log","observation":"Token expired"}]}
2. After observing patterns, promote to strategy: {"action":"promote","id":"exp_123","toLevel":"strategy","pattern":"When auth fails, check token lifecycle"}
3. When strategy is reliable, promote to skill: {"action":"promote","id":"exp_456","toLevel":"skill","toolName":"check-token-expiry"}
4. Record outcomes to improve confidence: {"action":"record_outcome","id":"exp_123","success":true}

Capture Actions:
- learn: **Low-friction** - parse natural language like "Fixed X by doing Y" (recommended)
- record_case: Explicitly record a case with title, scenario, outcome, and optional trajectory
- capture_from_transcript: Extract experiences from a conversation transcript using LLM

Example: {"action":"learn","text":"Discovered the auth token expires after 1 hour when debugging login failures"}`,
  commonParams: {
    // Learn action param (low-friction)
    text: {
      type: 'string',
      description: 'Natural language text for learn action (e.g., "Fixed X by doing Y")',
    },
    id: { type: 'string', description: 'Experience ID' },
    title: { type: 'string', description: 'Experience title' },
    scopeType: {
      type: 'string',
      enum: ['global', 'org', 'project', 'session'],
      description: 'Scope level',
    },
    scopeId: { type: 'string', description: 'Scope ID (required for non-global scopes)' },
    level: {
      type: 'string',
      enum: ['case', 'strategy'],
      description: 'Experience abstraction level (default: case)',
    },
    category: {
      type: 'string',
      description: 'Category (e.g., debugging, refactoring, api-design)',
    },
    content: { type: 'string', description: 'Main learning/insight text' },
    // Case-level fields
    scenario: { type: 'string', description: 'What triggered this (context)' },
    outcome: { type: 'string', description: 'Result: success/failure + details' },
    // Strategy-level fields
    pattern: { type: 'string', description: 'Abstracted pattern description' },
    applicability: { type: 'string', description: 'When to apply this' },
    contraindications: { type: 'string', description: 'When NOT to apply' },
    // Common
    confidence: { type: 'number', description: 'Confidence 0-1 (based on success rate)' },
    source: {
      type: 'string',
      enum: ['observation', 'reflection', 'user', 'promotion'],
      description: 'How this experience was created',
    },
    // Trajectory steps
    steps: {
      type: 'array',
      description: 'Trajectory steps for case-level experiences',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'What was done' },
          observation: { type: 'string', description: 'What was observed' },
          reasoning: { type: 'string', description: 'Why this action' },
          toolUsed: { type: 'string', description: 'Tool/command if applicable' },
          success: { type: 'boolean', description: 'Whether step succeeded' },
          timestamp: { type: 'string', description: 'When step occurred' },
          durationMs: { type: 'number', description: 'Duration in milliseconds' },
        },
        required: ['action'],
      },
    },
    // Promote action params
    toLevel: {
      type: 'string',
      enum: ['strategy', 'skill'],
      description: 'Target level for promotion',
    },
    toolName: { type: 'string', description: 'Tool name (required for skill promotion)' },
    toolDescription: { type: 'string', description: 'Tool description (skill promotion)' },
    toolCategory: {
      type: 'string',
      enum: ['mcp', 'cli', 'function', 'api'],
      description: 'Tool category (skill promotion)',
    },
    toolParameters: { type: 'object', description: 'Tool parameters schema (skill promotion)' },
    reason: { type: 'string', description: 'Reason for promotion' },
    // Record outcome params
    success: { type: 'boolean', description: 'Whether the experience helped' },
    feedback: { type: 'string', description: 'Feedback on the outcome' },
    // Standard params
    createdBy: { type: 'string', description: 'Creator identifier' },
    changeReason: { type: 'string', description: 'Reason for update' },
    updatedBy: { type: 'string', description: 'Updater identifier' },
    inherit: { type: 'boolean', description: 'Search parent scopes (default true)' },
    includeInactive: { type: 'boolean', description: 'Include inactive entries' },
    limit: { type: 'number', description: 'Max results to return' },
    offset: { type: 'number', description: 'Skip N results' },
  },
  actions: {
    // Standard CRUD
    add: { contextHandler: experienceHandlers.add },
    update: { contextHandler: experienceHandlers.update },
    get: { contextHandler: experienceHandlers.get },
    list: { contextHandler: experienceHandlers.list },
    history: { contextHandler: experienceHandlers.history },
    deactivate: { contextHandler: experienceHandlers.deactivate },
    delete: { contextHandler: experienceHandlers.delete },
    bulk_add: { contextHandler: experienceHandlers.bulk_add },
    bulk_update: { contextHandler: experienceHandlers.bulk_update },
    bulk_delete: { contextHandler: experienceHandlers.bulk_delete },
    // Experience-specific
    promote: { contextHandler: experienceHandlers.promote },
    record_outcome: { contextHandler: experienceHandlers.record_outcome },
    add_step: { contextHandler: experienceHandlers.add_step },
    get_trajectory: { contextHandler: experienceHandlers.get_trajectory },
    // Capture actions
    record_case: { contextHandler: experienceHandlers.record_case },
    capture_from_transcript: { contextHandler: experienceHandlers.capture_from_transcript },
    // Low-friction actions
    learn: { contextHandler: experienceHandlers.learn },
  },
};

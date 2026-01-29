import type { ToolDescriptor } from './types.js';
import { hookLearningHandlers } from '../handlers/hook-learning.handler.js';

export const memoryCaptureDescriptor: ToolDescriptor = {
  name: 'memory_capture',
  visibility: 'advanced',
  description: `Capture learning events from IDE hooks for automatic memory creation.

Actions:
- block_start: Called when user sends a message (creates task if work-like)
- block_end: Called when assistant completes response (updates task, extracts learnings)
- conversation: Parse message for triggers and auto-create entries
- episode: Capture episode events as knowledge/experiences
- status: Get capture service status

This tool enables automatic memory capture from IDE hooks:
1. Conversation messages are parsed for triggers (rules, decisions, commands)
2. Block boundaries track tasks for work detection
3. Episode events capture decisions and milestones

Example: {"action":"conversation","sessionId":"sess-123","role":"user","message":"We always use TypeScript strict mode"}
Example: {"action":"block_start","sessionId":"sess-123","userMessage":"Fix the auth bug","messageId":"msg-1"}
Example: {"action":"block_end","sessionId":"sess-123","messageId":"msg-1","assistantMessage":"Fixed","success":true}`,
  commonParams: {
    sessionId: { type: 'string', description: 'Session ID' },
    projectId: { type: 'string', description: 'Project ID (optional)' },
  },
  actions: {
    block_start: {
      params: {
        userMessage: { type: 'string', description: 'User message text' },
        messageId: { type: 'string', description: 'Unique message ID' },
      },
      required: ['sessionId', 'userMessage', 'messageId'],
      contextHandler: (ctx, params) => hookLearningHandlers.block_start(ctx, params),
    },
    block_end: {
      params: {
        messageId: { type: 'string', description: 'Message ID from block_start' },
        assistantMessage: { type: 'string', description: 'Assistant response text' },
        success: { type: 'boolean', description: 'Whether the block completed successfully' },
      },
      required: ['sessionId', 'messageId', 'assistantMessage'],
      contextHandler: (ctx, params) => hookLearningHandlers.block_end(ctx, params),
    },
    conversation: {
      params: {
        role: {
          type: 'string',
          enum: ['user', 'assistant'],
          description: 'Message role',
        },
        message: { type: 'string', description: 'Message content' },
      },
      required: ['sessionId', 'role', 'message'],
      contextHandler: (ctx, params) => hookLearningHandlers.conversation(ctx, params),
    },
    episode: {
      params: {
        episodeId: { type: 'string', description: 'Episode ID' },
        eventType: {
          type: 'string',
          enum: ['started', 'checkpoint', 'decision', 'error', 'completed'],
          description: 'Episode event type',
        },
        message: { type: 'string', description: 'Event message' },
      },
      required: ['sessionId', 'episodeId', 'eventType', 'message'],
      contextHandler: (ctx, params) => hookLearningHandlers.episode(ctx, params),
    },
    status: {
      contextHandler: (ctx, params) => hookLearningHandlers.status(ctx, params),
    },
  },
};

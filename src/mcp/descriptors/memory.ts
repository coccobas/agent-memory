/**
 * Unified Memory Tool Descriptor
 *
 * Single natural language interface to all memory operations.
 * Auto-detects intent and routes to appropriate handlers.
 *
 * This is the simplified "10x easier" tool that accepts natural language.
 */

import type { SimpleToolDescriptor } from './types.js';
import type { AppContext } from '../../core/context.js';
import { createUnifiedMemoryService } from '../../services/unified-memory/index.js';

// Create singleton service instance
let unifiedMemoryService: ReturnType<typeof createUnifiedMemoryService> | undefined;

function getService() {
  if (!unifiedMemoryService) {
    unifiedMemoryService = createUnifiedMemoryService({
      confidenceThreshold: 0.6,
      autoExecuteThreshold: 0.75,
    });
  }
  return unifiedMemoryService;
}

export const memoryDescriptor: SimpleToolDescriptor = {
  name: 'memory',
  visibility: 'core',
  description:
    'Natural language interface to memory. Store: "Remember X", Retrieve: "What about X?", Session: "Start/end task"',
  params: {
    text: { type: 'string', description: 'Natural language request' },
    projectId: { type: 'string' },
    sessionId: { type: 'string' },
    agentId: { type: 'string' },
    analyzeOnly: { type: 'boolean' },
  },
  required: ['text'],
  contextHandler: async (context: AppContext, params: Record<string, unknown>) => {
    const text = params.text as string;
    const projectId = params.projectId as string | undefined;
    const sessionId = params.sessionId as string | undefined;
    const agentId = params.agentId as string | undefined;
    const analyzeOnly = params.analyzeOnly as boolean | undefined;

    const service = getService();

    // If analyze only, just return intent detection
    if (analyzeOnly) {
      const intent = service.analyze(text);
      return {
        analyzed: true,
        intent: intent.intent,
        confidence: intent.confidence,
        entryType: intent.entryType,
        category: intent.category,
        title: intent.title,
        content: intent.content,
        query: intent.query,
        sessionName: intent.sessionName,
        message: `Detected intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}% confidence)`,
      };
    }

    // Get detected context if available
    const detectedContext = context.services.contextDetection
      ? await context.services.contextDetection.detect()
      : undefined;

    // Process the request
    const result = await service.process(
      {
        text,
        context: detectedContext,
        projectId,
        sessionId,
        agentId,
      },
      context
    );

    return result;
  },
};

import type { SimpleToolDescriptor } from '../types.js';
import { handleV2Memory } from '../../../v2/mcp/unified-handler.js';

export const memoryDescriptor: SimpleToolDescriptor = {
  name: 'memory',
  visibility: 'core',
  description: `Natural language interface to ALL memory operations. One tool to rule them all.

**Storage & Retrieval:**
- "Remember that we use TypeScript strict mode"
- "What do we know about authentication?"
- "Find guidelines about testing"

**Sessions:**
- "Start session for fixing auth bug"
- "End session" / "Done working"

**Listing:**
- "List all guidelines"
- "Show my recent sessions"`,
  params: {
    text: { type: 'string', description: 'Natural language request' },
    projectId: { type: 'string' },
    sessionId: { type: 'string' },
    agentId: { type: 'string' },
    analyzeOnly: { type: 'boolean', description: 'Just detect intent without executing' },
  },
  required: ['text'],
  contextHandler: (context, params) => handleV2Memory(context, params),
};

import type { SimpleToolDescriptor } from '../types.js';
import { handleV2MemoryQuickstart } from '../../../v2/mcp/quickstart-handler.js';

export const memoryQuickstartDescriptor: SimpleToolDescriptor = {
  name: 'memory_quickstart',
  visibility: 'core',
  description:
    'One-call setup for memory context. Auto-detects project from cwd. ' +
    'Loads hierarchical context in a single call. Topics are assigned ' +
    'automatically when conversations end.',
  params: {
    projectId: { type: 'string', description: 'Override auto-detected project' },
    rootPath: { type: 'string', description: 'Project root path (auto-detected from cwd)' },
    agentId: { type: 'string', description: 'Agent identifier (default: claude-code)' },
    verbose: {
      type: 'boolean',
      description: 'Return full entries instead of hierarchical summary (default: false)',
    },
    limitPerType: { type: 'number', description: 'Max entries to load (default: 200)' },
  },
  contextHandler: (context, params) => handleV2MemoryQuickstart(context, params),
};

/**
 * memory_hook tool descriptor
 */

import type { ToolDescriptor } from './types.js';
import { hooksHandlers } from '../handlers/hooks.handler.js';

export const memoryHookDescriptor: ToolDescriptor = {
  name: 'memory_hook',
  visibility: 'system',
  description: `Generate and manage IDE verification hooks.

Actions:
- generate: Generate hook files without installing (returns content and instructions)
- install: Generate and install hooks to the filesystem
- status: Check if hooks are installed for a project
- uninstall: Remove installed hooks

Supported IDEs: claude (Claude Code), cursor (Cursor), vscode (VS Code)`,
  required: ['ide', 'projectPath'],
  commonParams: {
    ide: {
      type: 'string',
      enum: ['claude', 'cursor', 'vscode'],
      description: 'Target IDE',
    },
    projectPath: {
      type: 'string',
      description: 'Absolute path to the project directory',
    },
    projectId: {
      type: 'string',
      description: 'Project ID for loading guidelines (optional)',
    },
    sessionId: {
      type: 'string',
      description: 'Session ID for loading guidelines (optional)',
    },
  },
  actions: {
    generate: { contextHandler: (ctx, params) => hooksHandlers.generate(ctx, params) },
    install: { contextHandler: (ctx, params) => hooksHandlers.install(ctx, params) },
    status: { handler: (params) => hooksHandlers.status(params) },
    uninstall: { handler: (params) => hooksHandlers.uninstall(params) },
  },
};

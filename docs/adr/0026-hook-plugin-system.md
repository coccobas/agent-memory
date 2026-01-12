# ADR-0026: Hook/Plugin System

## Status

Accepted

## Context

Agent Memory has extension points where external services need to integrate:
- Embedding generation (OpenAI, local models, custom providers)
- Entity extraction (custom NLP pipelines)
- Summarization (different LLM providers)
- IDE hooks (Claude Code, Cursor, VS Code)

Hardcoding these integrations creates tight coupling and limits extensibility. We needed:
- Registration points for external implementations
- Lifecycle management for plugins
- Discovery mechanism for available hooks
- Consistent interface across extension types

## Decision

Provide a hook/plugin system with registration points, lifecycle callbacks, and MCP-based discovery.

### Hook Types

```typescript
// src/services/hooks/types.ts
interface HookDefinition {
  name: string;
  description: string;
  trigger: HookTrigger;
  schema: ZodSchema;  // Input validation
}

type HookTrigger =
  | 'pre_tool_use'      // Before MCP tool execution
  | 'post_tool_use'     // After MCP tool execution
  | 'session_start'     // When session begins
  | 'session_end'       // When session ends
  | 'entry_created'     // When entry is added
  | 'entry_updated'     // When entry is modified
  | 'embedding_needed'  // When embedding should be generated
  | 'extraction_needed' // When entities should be extracted
```

### Hook Registration

```typescript
// src/services/hooks/registry.ts
class HookRegistry {
  private hooks: Map<HookTrigger, HookHandler[]> = new Map();

  register(trigger: HookTrigger, handler: HookHandler): () => void {
    const handlers = this.hooks.get(trigger) ?? [];
    handlers.push(handler);
    this.hooks.set(trigger, handlers);

    // Return unregister function
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  async execute(trigger: HookTrigger, context: HookContext): Promise<HookResult> {
    const handlers = this.hooks.get(trigger) ?? [];
    let result: HookResult = { proceed: true };

    for (const handler of handlers) {
      result = await handler(context, result);
      if (!result.proceed) break;  // Hook blocked execution
    }

    return result;
  }
}
```

### Embedding Pipeline Registration

```typescript
// src/db/repositories/embedding-hooks.ts
export function registerEmbeddingPipeline(
  repository: GuidelineRepository | KnowledgeRepository | ToolRepository,
  embeddingService: IEmbeddingService,
): void {
  // Hook into entry creation/update
  repository.on('afterCreate', async (entry) => {
    await embeddingService.queueEmbedding({
      entryType: repository.entityType,
      entryId: entry.id,
      content: entry.content,
    });
  });

  repository.on('afterUpdate', async (entry) => {
    await embeddingService.queueEmbedding({
      entryType: repository.entityType,
      entryId: entry.id,
      content: entry.content,
    });
  });
}
```

### IDE Hook Generation

```typescript
// src/services/hook-generator.service.ts
class HookGeneratorService {
  async generateHookScript(
    ide: 'claude' | 'cursor' | 'vscode',
    hookType: 'pre_tool_use' | 'session_end' | 'user_prompt_submit',
    config: HookConfig,
  ): Promise<string> {
    const template = this.getTemplate(ide, hookType);
    return this.renderTemplate(template, config);
  }

  private getTemplate(ide: string, hookType: string): string {
    // IDE-specific shell scripts or JSON configs
    const templates = {
      claude: {
        pre_tool_use: `#!/bin/bash\nnpx agent-memory hook pre-tool-use "$@"`,
        session_end: `#!/bin/bash\nnpx agent-memory hook session-end "$@"`,
      },
      cursor: {
        // Cursor-specific format
      },
    };
    return templates[ide][hookType];
  }
}
```

### MCP Hook Descriptor

```typescript
// src/mcp/descriptors/memory_hook.ts
export const memoryHookDescriptor = createDescriptor({
  name: 'memory_hook',
  description: 'Manage IDE hooks for memory integration',
  actions: {
    install: {
      description: 'Install hooks for an IDE',
      params: z.object({
        ide: z.enum(['claude', 'cursor', 'vscode']),
        projectPath: z.string(),
        hooks: z.array(z.enum(['pre_tool_use', 'session_end', 'user_prompt_submit'])),
      }),
    },
    uninstall: {
      description: 'Remove installed hooks',
      params: z.object({
        ide: z.enum(['claude', 'cursor', 'vscode']),
        projectPath: z.string(),
      }),
    },
    list: {
      description: 'List installed hooks',
      params: z.object({
        projectPath: z.string().optional(),
      }),
    },
  },
});
```

### Extension Interface

```typescript
// Third-party plugins implement this interface
interface AgentMemoryPlugin {
  name: string;
  version: string;

  // Lifecycle
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;

  // Hook registration
  registerHooks(registry: HookRegistry): void;
}

// Example: Custom embedding provider
class OllamaEmbeddingPlugin implements AgentMemoryPlugin {
  name = 'ollama-embeddings';
  version = '1.0.0';

  async initialize(context: PluginContext) {
    this.client = new OllamaClient(context.config.ollamaUrl);
  }

  registerHooks(registry: HookRegistry) {
    registry.register('embedding_needed', async (ctx) => {
      const embedding = await this.client.embed(ctx.content);
      return { proceed: true, embedding };
    });
  }

  async shutdown() {
    await this.client.close();
  }
}
```

## Consequences

**Positive:**
- Clear extension points for third-party integrations
- Repositories decoupled from embedding/extraction services
- IDE hooks are generated, not hardcoded
- Plugin lifecycle is managed (init/shutdown)
- MCP tool for hook management

**Negative:**
- Hook execution adds overhead to operations
- Plugin errors can affect core functionality
- Hook ordering can be complex with multiple plugins
- Discovery mechanism needed for available plugins

## References

- Code locations:
  - `src/services/hooks/registry.ts` - Hook registry
  - `src/services/hook-generator.service.ts` - IDE hook generation
  - `src/mcp/descriptors/memory_hook.ts` - MCP hook tool
  - `src/db/repositories/embedding-hooks.ts` - Embedding hook registration
  - `src/commands/hook/` - CLI hook commands
- Related ADRs: ADR-0012 (MCP Descriptor System)
- Principles: A3 (Layered Enhancement), P5 (Local-First, Cloud-Optional)

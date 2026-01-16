# Example Workflows

This directory contains example workflows and practical guides for using Agent Memory in real-world scenarios.

## Available Workflows

### For Users

- **[Onboarding a Project](./onboard-project.json)** - Set up memory for a new project
- **[Handling Conflicts](./handle-conflict.json)** - Resolve concurrent write conflicts
- **[Common Tasks](./common-tasks.md)** - Frequent operations and recipes
- **[Debugging](./debugging.md)** - Troubleshooting and debugging workflows

### For Developers

- **[Development Guide](../../docs/contributing/development.md)** - Setting up a development environment
- **[Contributing](../../docs/contributing/CONTRIBUTING.md)** - How to contribute to the project

## Quick Examples

### Creating a Project with Guidelines

```json
{
  "workflow": "New Project Setup",
  "steps": [
    {
      "tool": "memory_org",
      "action": "create",
      "arguments": {
        "action": "create",
        "name": "My Organization"
      }
    },
    {
      "tool": "memory_project",
      "action": "create",
      "arguments": {
        "action": "create",
        "orgId": "<org-id-from-step-1>",
        "name": "My Project",
        "description": "A new project for AI development",
        "rootPath": "/path/to/project"
      }
    },
    {
      "tool": "memory_guideline",
      "action": "add",
      "arguments": {
        "action": "add",
        "scopeType": "project",
        "scopeId": "<project-id-from-step-2>",
        "name": "code_style_python",
        "category": "code_style",
        "priority": 80,
        "content": "Use Black for formatting, follow PEP 8, use type hints",
        "rationale": "Consistent code style improves readability and maintainability"
      }
    }
  ]
}
```

### Searching Across Memory

```json
{
  "tool": "memory_query",
  "action": "search",
  "arguments": {
    "action": "search",
    "types": ["tools", "guidelines", "knowledge"],
    "scope": {
      "type": "project",
      "id": "my-project-id",
      "inherit": true
    },
    "tags": {
      "include": ["python"]
    },
    "search": "error handling",
    "limit": 20
  }
}
```

### Getting Full Context for a Session

```json
{
  "tool": "memory_query",
  "action": "context",
  "arguments": {
    "action": "context",
    "scopeType": "session",
    "scopeId": "my-session-id",
    "inherit": true,
    "limit": 10
  }
}
```

## Workflow Patterns

### Pattern 1: Starting a New Feature

1. **Start a session** to track your work
2. **Query relevant guidelines** for the feature area
3. **Record decisions** as knowledge entries during development
4. **End session** when complete, promoting important entries to project scope

### Pattern 2: Multi-Agent Coordination

1. **Check file locks** before editing files
2. **Checkout locks** for files you're working on
3. **Complete your work** while holding the lock
4. **Checkin locks** when done to release files

### Pattern 3: Knowledge Capture

1. **Create knowledge entries** for important decisions
2. **Tag entries** appropriately (language, domain, category)
3. **Link related entries** using relations
4. **Query later** to retrieve context when needed

## Integration Examples

### Using with Claude Desktop

Add to your `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "command": "node",
      "args": ["/path/to/agent-memory/dist/cli.js", "mcp"]
    }
  }
}
```

Then in Claude Desktop, you can use commands like:

```
Store this guideline: Always use async/await instead of .then()
```

Claude will use the `memory_guideline` tool to store the guideline.

### Using Programmatically

```typescript
import { createAppContext } from 'agent-memory';
import { createServer } from 'agent-memory/mcp/server';

// Create application context first
const context = await createAppContext(config);

// Create the MCP server with the context
const server = await createServer(context);
// Use the MCP server in your application
```

## Tips and Best Practices

### Organizing Memory

- **Use hierarchical scoping** - Global for universal rules, project for project-specific
- **Tag consistently** - Use predefined tags when possible
- **Link related entries** - Create relations to build a knowledge graph
- **Set priorities** - Higher priority guidelines are shown first

### Performance

- **Use compact mode** when you only need IDs and names
- **Limit result sets** - Default is 20, max is 100
- **Enable caching** - Global scope queries are cached by default
- **Use specific scopes** - Narrower scopes return faster

### Conflict Resolution

- **Review conflicts regularly** using `memory_conflict` list
- **Resolve conflicts promptly** to keep history clean
- **Document resolution** - Explain why you chose one version over another

### Session Management

- **Use descriptive names** - "refactor-auth-module" not "session-1"
- **Set clear purposes** - Helps future queries find relevant entries
- **End sessions properly** - Mark as completed or discarded
- **Review session entries** before ending to promote important ones

## Troubleshooting

### Common Issues

**Database locked error:**

- Close other connections to the database
- Kill zombie processes: `ps aux | grep node | grep agent-memory`

**Conflicts not detecting:**

- Ensure updates happen within 5 seconds for conflict detection
- Check that both updates have the same base version

**Slow queries:**

- Enable performance logging: `AGENT_MEMORY_PERF=1`
- Check your scope sizes - large scopes take longer
- Use more specific filters (tags, categories)

**Memory not found:**

- Check scope inheritance - set `inherit: true` to search parent scopes
- Verify the scope IDs are correct
- Check if entries are active (not deactivated)

## More Examples

Browse the JSON workflow files in this directory for complete, working examples:

- `onboard-project.json` - Complete project onboarding
- `handle-conflict.json` - Conflict detection and resolution

## Need Help?

- Check the [MCP Tools Reference](../../docs/reference/mcp-tools.md) for tool details
- See [Getting Started](../../docs/getting-started.md) for basics
- Read [Architecture](../../docs/concepts/architecture.md) for system design
- Ask in issues with the `question` label
